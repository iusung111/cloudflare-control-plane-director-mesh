import type {
  ClaimOperatorRequestInput,
  OperatorRequestRecord,
  OperatorRequestStatus,
  UpdateOperatorRequestStatusInput,
} from "../../../contracts/src";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";
import { ControlPlaneError } from "../../../shared/src/control-plane-error";

export class OperatorRequestLifecycleService {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async queue(requestId: string): Promise<OperatorRequestRecord> {
    const request = await this.requireRequest(requestId);
    return this.save({
      ...request,
      status: "queued_for_orchestrator",
    });
  }

  async claim(input: ClaimOperatorRequestInput): Promise<OperatorRequestRecord> {
    const request = await this.requireRequest(input.requestId);
    if (!["queued_for_orchestrator", "planning", "awaiting_approval", "browser_action_pending"].includes(request.status)) {
      throw new ControlPlaneError(409, "operator_request_claim_not_allowed");
    }

    return this.save({
      ...request,
      status: "claimed",
      claimOwner: input.owner,
      claimHeartbeatAt: this.now().toISOString(),
      lastError: undefined,
    });
  }

  async heartbeat(requestId: string, owner: string): Promise<OperatorRequestRecord> {
    const request = await this.requireRequest(requestId);
    if (request.claimOwner && request.claimOwner !== owner) {
      throw new ControlPlaneError(409, "operator_request_claim_owner_mismatch");
    }

    return this.save({
      ...request,
      claimOwner: owner,
      claimHeartbeatAt: this.now().toISOString(),
    });
  }

  async updateStatus(input: UpdateOperatorRequestStatusInput): Promise<OperatorRequestRecord> {
    const request = await this.requireRequest(input.requestId);
    if (input.owner && request.claimOwner && request.claimOwner !== input.owner) {
      throw new ControlPlaneError(409, "operator_request_claim_owner_mismatch");
    }

    const next = this.withStatus(request, input.status, input.resultSummary, input.lastError);
    return this.save(next);
  }

  private withStatus(
    request: OperatorRequestRecord,
    status: Exclude<OperatorRequestStatus, "received" | "queued_for_orchestrator" | "claimed">,
    resultSummary?: string,
    lastError?: string,
  ): OperatorRequestRecord {
    const now = this.now().toISOString();
    const terminal = status === "completed" || status === "failed" || status === "cancelled";
    return {
      ...request,
      status,
      resultSummary: resultSummary ?? request.resultSummary,
      lastError,
      claimHeartbeatAt: request.claimOwner ? now : request.claimHeartbeatAt,
      completedAt: terminal ? now : request.completedAt,
      updatedAt: now,
    };
  }

  private async save(request: OperatorRequestRecord): Promise<OperatorRequestRecord> {
    const now = this.now().toISOString();
    const next = {
      ...request,
      updatedAt: request.updatedAt === now ? request.updatedAt : now,
    };
    await this.store.putOperatorRequest(next);
    return next;
  }

  private async requireRequest(requestId: string): Promise<OperatorRequestRecord> {
    const request = await this.store.getOperatorRequest(requestId);
    if (!request) {
      throw new ControlPlaneError(404, "operator_request_not_found");
    }
    return request;
  }
}
