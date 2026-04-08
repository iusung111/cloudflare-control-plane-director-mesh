import type { CommandAction } from "./command";
import type { ResourceScope } from "./resource";

export interface ScopedApprovalRecord {
  approvalId: string;
  actorId: string;
  action: CommandAction;
  resource: ResourceScope;
  reason?: string;
  createdAt: string;
  expiresAt: string;
}
