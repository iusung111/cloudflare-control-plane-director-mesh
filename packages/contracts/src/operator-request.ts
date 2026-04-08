export type OperatorRequestQueue = "llm" | "browser" | "approval";
export type OperatorRequestSource = "console" | "api" | "chatgpt_app" | "orchestrator";
export type OperatorRequestStatus =
  | "received"
  | "queued_for_orchestrator"
  | "claimed"
  | "planning"
  | "awaiting_approval"
  | "browser_action_pending"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

export interface OperatorRequestRecord {
  requestId: string;
  actorId: string;
  source: OperatorRequestSource;
  queue: OperatorRequestQueue;
  locale: string;
  title: string;
  prompt: string;
  missionId?: string;
  relatedCommandId?: string;
  targetUrl?: string;
  selector?: string;
  expectedText?: string;
  status: OperatorRequestStatus;
  claimOwner?: string;
  claimHeartbeatAt?: string;
  resultSummary?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface SubmitOperatorRequestInput {
  requestId: string;
  actorId: string;
  source?: OperatorRequestSource;
  queue: OperatorRequestQueue;
  locale?: string;
  title: string;
  prompt: string;
  missionId?: string;
  relatedCommandId?: string;
  targetUrl?: string;
  selector?: string;
  expectedText?: string;
}

export interface ClaimOperatorRequestInput {
  requestId: string;
  owner: string;
}

export interface UpdateOperatorRequestStatusInput {
  requestId: string;
  status: Exclude<OperatorRequestStatus, "received" | "queued_for_orchestrator" | "claimed">;
  owner?: string;
  resultSummary?: string;
  lastError?: string;
}
