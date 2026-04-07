export type AuthorityLevel =
  | "P0_USER"
  | "P1_SAFETY"
  | "P2_CONTROL_PLANE"
  | "P3_QUALITY"
  | "P4_POD"
  | "P5_WORKER";

export type CommandStatus =
  | "received"
  | "rejected"
  | "queued"
  | "emitted"
  | "completed";

export type SessionRole = "delivery" | "reliability" | "reviewer";

export type LeaseStatus = "active" | "expired" | "revoked" | "released";

export type QueueType =
  | "task"
  | "review"
  | "proposal"
  | "conflict"
  | "deploy";

export type QueuePriority = "P0" | "P1" | "P2" | "P3" | "P4" | "P5";

export type CommandAction =
  | "github_write"
  | "github_branch_create"
  | "github_pr_create"
  | "verify_run"
  | "browser_check"
  | "deploy_mirror"
  | "deploy_live"
  | "template_mutation";

export type EffectType = CommandAction | "rollback";

export interface ResourceScope {
  repo: string;
  branch?: string;
  path?: string;
}

export interface MissionEvent {
  eventId: string;
  commandId: string;
  type: "COMMAND_RECEIVED" | "COMMAND_REJECTED" | "COMMAND_QUEUED" | "COMMAND_EMITTED" | "COMMAND_COMPLETED";
  status: CommandStatus;
  reason?: string;
  resource: ResourceScope;
  payload?: any;
  createdAt: string;
}

export interface Session {
  sessionId: string;
  role: SessionRole;
  templateVersion: string;
  createdAt: string;
  expiresAt: string;
}

export interface Lease {
  leaseId: string;
  sessionId: string;
  resource: ResourceScope;
  status: LeaseStatus;
  createdAt: string;
  expiresAt: string;
}

export interface QueueItem {
  itemId: string;
  queue: QueueType;
  priority: QueuePriority;
  blocking: boolean;
  createdAt: string;
  payload: unknown;
}

export interface CommandRequest {
  commandId: string;
  dedupKey: string;
  conflictKey: string;
  authority: AuthorityLevel;
  sessionId: string;
  leaseId: string;
  resource: ResourceScope;
  action: CommandAction;
  payload: unknown;
}

export interface DerivedState {
  commandId: string;
  status: CommandStatus;
  lastEventId: string;
  nextAction: "none" | "emit_side_effect" | "escalate" | "queue";
}
