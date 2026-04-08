import type {
  CommandRecord,
  CommandRequest,
  CommandResponse,
  CommandStatus,
  MissionEventType,
} from "../../../contracts/src";
import { evaluateGuardrail } from "../../../domain/src/commands/guardrail.policy";
import { makeCommandEvent } from "../../../domain/src/commands/command-event";
import { makeConflictKey } from "../../../domain/src/resources/resource-scope";
import { isLeaseUsable, isSessionUsable } from "../../../domain/src/sessions/session.policy";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";
import { ControlPlaneError } from "../../../shared/src/control-plane-error";
import { createCommandRecord, updateCommandRecord } from "./command-record";

export class SubmitCommandService {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    request: CommandRequest,
    options?: { skipDedup?: boolean; persistDedup?: boolean },
  ): Promise<CommandResponse> {
    assertCommand(request);
    const currentTime = this.now();
    const conflictKey = makeConflictKey(request.resource);
    const existingCommand = await this.store.getCommand(request.commandId);
    const baseRecord = existingCommand
      ? {
          ...existingCommand,
          dedupKey: request.dedupKey,
          sessionId: request.sessionId,
          leaseId: request.leaseId,
          action: request.action,
          resource: request.resource,
          conflictKey,
          payload: request.payload,
        }
      : createCommandRecord(request, conflictKey, currentTime);

    if (request.conflictKey && request.conflictKey !== conflictKey) {
      return this.singleEventResponse(baseRecord, request, "COMMAND_REJECTED", "rejected", currentTime, "invalid_request_conflict_key");
    }

    const [session, lease, leases, duplicate] = await Promise.all([
      this.store.getSession(request.sessionId),
      this.store.getLease(request.leaseId),
      this.store.listLeases(),
      options?.skipDedup ? Promise.resolve(false) : this.store.hasDedup(request.dedupKey),
    ]);
    const approvals = await this.store.listScopedApprovals();

    if (!isSessionUsable(session, currentTime)) {
      return this.singleEventResponse(baseRecord, request, "COMMAND_REJECTED", "rejected", currentTime, "invalid_session");
    }

    if (!lease || lease.sessionId !== request.sessionId || !isLeaseUsable(lease, request.resource, currentTime)) {
      return this.singleEventResponse(baseRecord, request, "COMMAND_REJECTED", "rejected", currentTime, "invalid_lease");
    }

    if (duplicate) {
      return this.singleEventResponse(baseRecord, request, "COMMAND_REJECTED", "rejected", currentTime, "duplicate_command");
    }

    const decision = evaluateGuardrail(request, leases, approvals);
    if (!decision.allowed) {
      const status = decision.outcome === "queue" ? "queued" : "rejected";
      const type = decision.outcome === "queue" ? "COMMAND_QUEUED" : "COMMAND_REJECTED";
      const response = await this.singleEventResponse(baseRecord, request, type, status, currentTime, decision.reason);
      if (options?.persistDedup !== false) {
        await this.store.saveDedup(request.dedupKey, request.commandId);
      }
      return response;
    }

    const emitted = makeCommandEvent({
      request,
      type: "COMMAND_EMITTED",
      status: "emitted",
      conflictKey,
      now: currentTime,
    });
    const completed = makeCommandEvent({
      request,
      type: "COMMAND_COMPLETED",
      status: "completed",
      conflictKey,
      now: currentTime,
      reason: "executed_inline",
    });

    await this.store.putCommand(updateCommandRecord(baseRecord, "emitted", currentTime));
    await this.store.appendEvent(emitted);

    if (options?.persistDedup !== false) {
      await this.store.saveDedup(request.dedupKey, request.commandId);
    }

    await this.store.appendEvent(completed);
    await this.store.putCommand(updateCommandRecord(baseRecord, "completed", currentTime, "executed_inline"));

    return {
      commandId: request.commandId,
      conflictKey,
      status: completed.status,
      events: [emitted, completed],
    };
  }

  private async singleEventResponse(
    baseRecord: CommandRecord,
    request: CommandRequest,
    type: MissionEventType,
    status: CommandStatus,
    now: Date,
    reason?: string,
  ): Promise<CommandResponse> {
    const event = makeCommandEvent({
      request,
      type,
      status,
      conflictKey: baseRecord.conflictKey,
      now,
      reason,
    });

    await this.store.appendEvent(event);
    await this.store.putCommand(updateCommandRecord(baseRecord, status, now, reason));

    return {
      commandId: request.commandId,
      conflictKey: baseRecord.conflictKey,
      status,
      events: [event],
    };
  }
}

function assertCommand(request: CommandRequest): void {
  if (!request.commandId || !request.dedupKey || !request.sessionId || !request.leaseId) {
    throw new ControlPlaneError(400, "invalid_command_envelope");
  }

  if (!request.resource?.repo || !request.action) {
    throw new ControlPlaneError(400, "invalid_command_resource");
  }
}
