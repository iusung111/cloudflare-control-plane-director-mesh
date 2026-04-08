import type { CommandRecord, QualitySignal, QualitySummary, ReleaseGateSummary, WorkerRecord } from "../../../contracts/src";

export function projectQualitySummary(input: {
  now: string;
  commands: CommandRecord[];
  workers: WorkerRecord[];
  activeMissions: number;
  releaseGate: ReleaseGateSummary;
}): QualitySummary {
  const openAlerts = input.commands.filter((command) => ["queued", "rejected", "failed", "cancelled"].includes(command.status)).length;
  const queuedCommands = input.commands.filter((command) => command.status === "queued").length;
  const failedCommands = input.commands.filter((command) => command.status === "failed").length;
  const blockedWorkers = input.workers.filter((worker) => worker.status === "blocked" || worker.status === "failed").length;
  const waitingApprovalWorkers = input.workers.filter((worker) => worker.status === "waiting_approval").length;

  const signals: QualitySignal[] = [
    releaseGateSignal(input.releaseGate.status),
    numericSignal("failed_commands", failedCommands, "failed command"),
    numericSignal("open_alerts", openAlerts, "open alert"),
    numericSignal("queued_commands", queuedCommands, "queued command"),
    numericSignal("blocked_workers", blockedWorkers, "blocked worker"),
    numericSignal("waiting_approval_workers", waitingApprovalWorkers, "approval-waiting worker"),
    {
      code: "active_missions",
      status: input.activeMissions > 0 ? "pass" : "warn",
      summary: input.activeMissions > 0 ? `${input.activeMissions} active mission(s) tracked` : "No active missions are currently tracked",
      metric: input.activeMissions,
    },
  ];

  return {
    generatedAt: input.now,
    status: signals.some((signal) => signal.status === "fail")
      ? "blocked"
      : signals.some((signal) => signal.status === "warn")
      ? "attention"
      : "healthy",
    releaseGateStatus: input.releaseGate.status,
    metrics: {
      activeMissions: input.activeMissions,
      openAlerts,
      queuedCommands,
      failedCommands,
      blockedWorkers,
      waitingApprovalWorkers,
    },
    signals,
  };
}

function releaseGateSignal(status: ReleaseGateSummary["status"]): QualitySignal {
  return {
    code: "release_gate",
    status: status === "blocked" ? "fail" : "pass",
    summary: status === "blocked" ? "Release gate is blocked" : "Release gate is open",
    metric: status,
  };
}

function numericSignal(
  code: Extract<QualitySignal["code"], "failed_commands" | "open_alerts" | "queued_commands" | "blocked_workers" | "waiting_approval_workers">,
  metric: number,
  label: string,
): QualitySignal {
  return {
    code,
    status: metric > 0 ? "warn" : "pass",
    summary: metric > 0 ? `${metric} ${label}${metric === 1 ? "" : "s"} require attention` : `No ${label}s need attention`,
    metric,
  };
}
