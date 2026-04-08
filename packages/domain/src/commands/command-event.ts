import type {
  CommandRequest,
  CommandStatus,
  MissionEvent,
  MissionEventType,
} from "../../../contracts/src";

export function makeCommandEvent(input: {
  request: CommandRequest;
  type: MissionEventType;
  status: CommandStatus;
  conflictKey: string;
  now: Date;
  reason?: string;
  payload?: Record<string, unknown>;
}): MissionEvent {
  return {
    eventId: `${input.request.commandId}:${input.status}:${input.now.getTime()}`,
    commandId: input.request.commandId,
    sessionId: input.request.sessionId,
    leaseId: input.request.leaseId,
    type: input.type,
    status: input.status,
    action: input.request.action,
    resource: input.request.resource,
    reason: input.reason,
    payload: { ...input.request.payload, conflictKey: input.conflictKey, ...input.payload },
    createdAt: input.now.toISOString(),
  };
}
