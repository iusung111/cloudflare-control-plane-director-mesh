import type { ResourceScope } from "./resource";

export type CommandAction =
  | "github_write"
  | "github_branch_create"
  | "github_pr_create"
  | "verify_run"
  | "browser_check"
  | "deploy_mirror"
  | "deploy_live"
  | "template_mutation";

export type CommandStatus =
  | "received"
  | "rejected"
  | "queued"
  | "emitted"
  | "completed"
  | "failed"
  | "cancelled";

export type MissionEventType =
  | "COMMAND_RECEIVED"
  | "COMMAND_REJECTED"
  | "COMMAND_QUEUED"
  | "COMMAND_EMITTED"
  | "COMMAND_COMPLETED"
  | "COMMAND_FAILED"
  | "COMMAND_CANCELLED";

export interface CommandRequest {
  commandId: string;
  dedupKey: string;
  sessionId: string;
  leaseId: string;
  resource: ResourceScope;
  action: CommandAction;
  conflictKey?: string;
  payload: Record<string, unknown> & { explicitLive?: boolean };
}

export interface MissionEvent {
  eventId: string;
  commandId: string;
  sessionId: string;
  leaseId: string;
  type: MissionEventType;
  status: CommandStatus;
  action: CommandAction;
  resource: ResourceScope;
  reason?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface CommandResponse {
  commandId: string;
  conflictKey: string;
  status: CommandStatus;
  events: MissionEvent[];
}

export interface CommandRecord {
  commandId: string;
  dedupKey: string;
  sessionId: string;
  leaseId: string;
  action: CommandAction;
  resource: ResourceScope;
  conflictKey: string;
  payload: Record<string, unknown> & { explicitLive?: boolean };
  status: CommandStatus;
  latestReason?: string;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
}
