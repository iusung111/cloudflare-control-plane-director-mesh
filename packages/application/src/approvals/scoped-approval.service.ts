import type { ScopedApprovalRecord } from "../../../contracts/src";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";
import { ControlPlaneError } from "../../../shared/src/control-plane-error";

export class ScopedApprovalService {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  list(): Promise<ScopedApprovalRecord[]> {
    return this.store.listScopedApprovals();
  }

  async create(input: {
    approvalId: string;
    actorId: string;
    action: ScopedApprovalRecord["action"];
    resource: ScopedApprovalRecord["resource"];
    reason?: string;
    ttlMinutes?: number;
  }): Promise<ScopedApprovalRecord> {
    const now = this.now();
    const approval: ScopedApprovalRecord = {
      approvalId: input.approvalId,
      actorId: input.actorId,
      action: input.action,
      resource: input.resource,
      reason: input.reason,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + (input.ttlMinutes ?? 60) * 60_000).toISOString(),
    };

    await this.store.putScopedApproval(approval);
    return approval;
  }

  async delete(approvalId: string): Promise<void> {
    const approvals = await this.store.listScopedApprovals();
    if (!approvals.some((approval) => approval.approvalId === approvalId)) {
      throw new ControlPlaneError(404, "scoped_approval_not_found");
    }

    await this.store.deleteScopedApproval(approvalId);
  }
}
