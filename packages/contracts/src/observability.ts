export interface ObservabilityMetric {
  code: string;
  value: number;
  unit: "count" | "ms";
  summary: string;
  status: "pass" | "warn" | "fail";
}

export interface ObservabilityAlert {
  code: "repeated_failure_fingerprint" | "release_gate_blocked" | "queue_lag" | "live_room_degraded";
  status: "pass" | "warn" | "fail";
  summary: string;
  metric: number;
}

export interface ObservabilitySummary {
  generatedAt: string;
  logFields: string[];
  metrics: {
    commandLatencyMs: number;
    projectionLatencyMs: number;
    queueLagMs: number;
    retryCount: number;
    deadLetterCount: number;
    activeWorkers: number;
    blockedWorkers: number;
    approvalWaitDurationMs: number;
    browserQaDurationMs: number;
  };
  signals: ObservabilityMetric[];
  alerts: ObservabilityAlert[];
}
