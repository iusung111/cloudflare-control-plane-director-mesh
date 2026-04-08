import type { ReleaseGateStatus } from "./release";

export type QualityStatus = "healthy" | "attention" | "blocked";
export type QualitySignalCode =
  | "release_gate"
  | "failed_commands"
  | "open_alerts"
  | "queued_commands"
  | "blocked_workers"
  | "waiting_approval_workers"
  | "active_missions";

export interface QualitySignal {
  code: QualitySignalCode;
  status: "pass" | "warn" | "fail";
  summary: string;
  metric: number | string;
}

export interface QualityMetrics {
  activeMissions: number;
  openAlerts: number;
  queuedCommands: number;
  failedCommands: number;
  blockedWorkers: number;
  waitingApprovalWorkers: number;
}

export interface QualitySummary {
  generatedAt: string;
  status: QualityStatus;
  releaseGateStatus: ReleaseGateStatus;
  metrics: QualityMetrics;
  signals: QualitySignal[];
}
