import type {
  CommandRecord,
  MissionRecord,
  ObservabilityAlert,
  ObservabilityMetric,
  ObservabilitySummary,
  OperatorRequestRecord,
  WorkerRecord,
} from "../../../contracts/src";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";
import { GetReleaseGateService } from "../release/get-release-gate.service";

const LOG_FIELDS = [
  "traceId",
  "requestId",
  "missionId",
  "workerId",
  "actorId",
  "commandId",
  "queueMessageId",
  "outcome",
  "retryCount",
];

export class GetObservabilitySummaryService {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly releaseGate: GetReleaseGateService,
  ) {}

  async execute(now = new Date()): Promise<ObservabilitySummary> {
    const [commands, missions, requests, releaseGate] = await Promise.all([
      this.store.listCommands(),
      this.store.listMissions(),
      this.store.listOperatorRequests(),
      this.releaseGate.execute(now),
    ]);
    const activeMissions = missions.filter((mission) => mission.status === "active" || mission.status === "blocked");
    const workers = (await Promise.all(activeMissions.map((mission) => this.store.listWorkers(mission.missionId)))).flat();

    const metrics = {
      commandLatencyMs: averageDuration(commands, (command) => isTerminalCommand(command.status)),
      projectionLatencyMs: projectionLatency(activeMissions, workers),
      queueLagMs: queueLag(now, commands, requests),
      retryCount: commands.reduce((total, command) => total + Math.max(0, command.attemptCount - 1), 0),
      deadLetterCount: commands.filter((command) => command.status === "failed").length,
      activeWorkers: workers.filter((worker) => worker.status === "created" || worker.status === "running" || worker.status === "retrying").length,
      blockedWorkers: workers.filter((worker) => worker.status === "blocked" || worker.status === "waiting_approval").length,
      approvalWaitDurationMs: workerWaitDuration(now, workers, ["waiting_approval"]),
      browserQaDurationMs: averageDuration(commands.filter((command) => command.action === "browser_check" || command.action === "verify_run"), (command) => isTerminalCommand(command.status)),
    };

    return {
      generatedAt: now.toISOString(),
      logFields: LOG_FIELDS,
      metrics,
      signals: [
        metric("command_latency", metrics.commandLatencyMs, "ms", 2_000, 10_000),
        metric("projection_latency", metrics.projectionLatencyMs, "ms", 1_000, 5_000),
        metric("queue_lag", metrics.queueLagMs, "ms", 30_000, 180_000),
        metric("retry_count", metrics.retryCount, "count", 3, 10),
        metric("dead_letter_count", metrics.deadLetterCount, "count", 1, 5),
        metric("active_workers", metrics.activeWorkers, "count", 25, 60, "inverse"),
        metric("blocked_workers", metrics.blockedWorkers, "count", 1, 3),
        metric("approval_wait_duration", metrics.approvalWaitDurationMs, "ms", 60_000, 300_000),
        metric("browser_qa_duration", metrics.browserQaDurationMs, "ms", 5_000, 20_000),
      ],
      alerts: buildAlerts(metrics, commands, workers, releaseGate.status === "blocked"),
    };
  }
}

function buildAlerts(
  metrics: ObservabilitySummary["metrics"],
  commands: CommandRecord[],
  workers: WorkerRecord[],
  releaseBlocked: boolean,
): ObservabilityAlert[] {
  const failureFingerprint = largestFailureFingerprint(commands);
  return [
    {
      code: "repeated_failure_fingerprint",
      status: failureFingerprint >= 3 ? "fail" : failureFingerprint >= 2 ? "warn" : "pass",
      summary: failureFingerprint >= 3 ? `${failureFingerprint} commands share the same failure fingerprint` : "No repeated failure fingerprint spike",
      metric: failureFingerprint,
    },
    {
      code: "release_gate_blocked",
      status: releaseBlocked ? "fail" : "pass",
      summary: releaseBlocked ? "Release gate is currently blocked" : "Release gate is not blocked",
      metric: releaseBlocked ? 1 : 0,
    },
    {
      code: "queue_lag",
      status: metrics.queueLagMs >= 180_000 ? "fail" : metrics.queueLagMs >= 30_000 ? "warn" : "pass",
      summary: metrics.queueLagMs >= 180_000 ? "Queue lag breached the fail threshold" : "Queue lag is within the configured threshold",
      metric: metrics.queueLagMs,
    },
    {
      code: "live_room_degraded",
      status: degradedWorkers(workers) >= 3 ? "fail" : degradedWorkers(workers) >= 1 ? "warn" : "pass",
      summary: degradedWorkers(workers) >= 1 ? `${degradedWorkers(workers)} workers show stale heartbeat timing` : "Mission live rooms are healthy",
      metric: degradedWorkers(workers),
    },
  ];
}

function degradedWorkers(workers: WorkerRecord[]): number {
  const now = Date.now();
  return workers.filter((worker) =>
    ["created", "running", "retrying"].includes(worker.status) &&
    now - Date.parse(worker.lastHeartbeatAt) > 120_000,
  ).length;
}

function largestFailureFingerprint(commands: CommandRecord[]): number {
  const counts = new Map<string, number>();
  for (const command of commands) {
    if (command.status !== "failed" || !command.latestReason) {
      continue;
    }
    counts.set(command.latestReason, (counts.get(command.latestReason) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

function metric(
  code: string,
  value: number,
  unit: "count" | "ms",
  warnAt: number,
  failAt: number,
  mode: "normal" | "inverse" = "normal",
): ObservabilityMetric {
  const normalized = mode === "inverse" ? -value : value;
  const warn = mode === "inverse" ? -warnAt : warnAt;
  const fail = mode === "inverse" ? -failAt : failAt;
  const status = normalized >= fail ? "fail" : normalized >= warn ? "warn" : "pass";
  return {
    code,
    value,
    unit,
    status,
    summary: `${code} is ${value}${unit}`,
  };
}

function projectionLatency(missions: MissionRecord[], workers: WorkerRecord[]): number {
  if (!missions.length || !workers.length) {
    return 0;
  }

  return Math.max(0, ...missions.map((mission) => {
    const latestWorker = workers
      .filter((worker) => worker.missionId === mission.missionId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    if (!latestWorker) {
      return 0;
    }
    return Math.max(0, Date.parse(mission.updatedAt) - Date.parse(latestWorker.updatedAt));
  }));
}

function queueLag(now: Date, commands: CommandRecord[], requests: OperatorRequestRecord[]): number {
  const queuedTimes = [
    ...commands.filter((command) => command.status === "queued").map((command) => Date.parse(command.createdAt)),
    ...requests.filter((request) => request.status === "queued_for_orchestrator").map((request) => Date.parse(request.createdAt)),
  ];
  if (!queuedTimes.length) {
    return 0;
  }
  return Math.max(0, now.getTime() - Math.min(...queuedTimes));
}

function workerWaitDuration(now: Date, workers: WorkerRecord[], statuses: WorkerRecord["status"][]): number {
  const values = workers
    .filter((worker) => statuses.includes(worker.status))
    .map((worker) => Math.max(0, now.getTime() - Date.parse(worker.updatedAt)));
  return values.length ? Math.max(...values) : 0;
}

function averageDuration(
  commands: CommandRecord[],
  include: (command: CommandRecord) => boolean,
): number {
  const values = commands
    .filter(include)
    .map((command) => Math.max(0, Date.parse(command.updatedAt) - Date.parse(command.createdAt)));
  if (!values.length) {
    return 0;
  }
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function isTerminalCommand(status: CommandRecord["status"]): boolean {
  return ["completed", "failed", "rejected", "cancelled"].includes(status);
}
