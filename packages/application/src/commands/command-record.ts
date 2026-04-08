import type {
  CommandRecord,
  CommandRequest,
  CommandStatus,
} from "../../../contracts/src";

export function createCommandRecord(
  request: CommandRequest,
  conflictKey: string,
  now: Date,
): CommandRecord {
  return {
    commandId: request.commandId,
    dedupKey: request.dedupKey,
    sessionId: request.sessionId,
    leaseId: request.leaseId,
    action: request.action,
    resource: request.resource,
    conflictKey,
    payload: request.payload,
    status: "received",
    attemptCount: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function updateCommandRecord(
  record: CommandRecord,
  status: CommandStatus,
  now: Date,
  reason?: string,
  result?: Record<string, unknown>,
): CommandRecord {
  return {
    ...record,
    status,
    latestReason: reason,
    result: result ?? record.result,
    attemptCount: shouldBumpAttempt(status) ? record.attemptCount + 1 : record.attemptCount,
    updatedAt: now.toISOString(),
  };
}

export function toCommandRequest(record: CommandRecord): CommandRequest {
  return {
    commandId: record.commandId,
    dedupKey: record.dedupKey,
    sessionId: record.sessionId,
    leaseId: record.leaseId,
    resource: record.resource,
    action: record.action,
    conflictKey: record.conflictKey,
    payload: record.payload,
  };
}

function shouldBumpAttempt(status: CommandStatus): boolean {
  return ["queued", "rejected", "completed", "failed"].includes(status);
}
