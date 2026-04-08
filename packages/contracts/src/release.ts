export type ReleaseGateStatus = "open" | "blocked";
export type ReleaseGateCheckStatus = "pass" | "warn" | "fail";

export interface ReleaseGateCheck {
  code: "open_alerts" | "queued_commands" | "blocked_workers" | "yolo_mode";
  status: ReleaseGateCheckStatus;
  summary: string;
  metric: number | boolean;
}

export interface ReleaseGateMetrics {
  openAlerts: number;
  queuedCommands: number;
  blockedWorkers: number;
  waitingApprovalWorkers: number;
  activeMissions: number;
  yoloEnabled: boolean;
}

export interface ReleaseGateSummary {
  generatedAt: string;
  status: ReleaseGateStatus;
  blockedReasons: string[];
  checks: ReleaseGateCheck[];
  metrics: ReleaseGateMetrics;
}
