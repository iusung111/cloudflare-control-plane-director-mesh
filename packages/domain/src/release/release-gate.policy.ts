import type { ReleaseGateCheck, ReleaseGateSummary } from "../../../contracts/src";

export interface ReleaseGateFacts {
  generatedAt: string;
  openAlerts: number;
  queuedCommands: number;
  blockedWorkers: number;
  waitingApprovalWorkers: number;
  activeMissions: number;
  yoloEnabled: boolean;
}

export function evaluateReleaseGate(facts: ReleaseGateFacts): ReleaseGateSummary {
  const checks: ReleaseGateCheck[] = [
    numericCheck("open_alerts", facts.openAlerts, "open alert"),
    numericCheck("queued_commands", facts.queuedCommands, "queued command"),
    numericCheck("blocked_workers", facts.blockedWorkers + facts.waitingApprovalWorkers, "blocked or approval-waiting worker"),
    {
      code: "yolo_mode",
      status: facts.yoloEnabled ? "warn" : "pass",
      summary: facts.yoloEnabled ? "YOLO mode is enabled" : "YOLO mode is disabled",
      metric: facts.yoloEnabled,
    },
  ];

  const blockedReasons = checks.filter((check) => check.status === "fail").map((check) => check.code);

  return {
    generatedAt: facts.generatedAt,
    status: blockedReasons.length > 0 ? "blocked" : "open",
    blockedReasons,
    checks,
    metrics: {
      openAlerts: facts.openAlerts,
      queuedCommands: facts.queuedCommands,
      blockedWorkers: facts.blockedWorkers,
      waitingApprovalWorkers: facts.waitingApprovalWorkers,
      activeMissions: facts.activeMissions,
      yoloEnabled: facts.yoloEnabled,
    },
  };
}

function numericCheck(
  code: Extract<ReleaseGateCheck["code"], "open_alerts" | "queued_commands" | "blocked_workers">,
  metric: number,
  label: string,
): ReleaseGateCheck {
  return {
    code,
    status: metric > 0 ? "fail" : "pass",
    summary: metric > 0 ? `${metric} ${label}${metric === 1 ? "" : "s"} require attention` : `No ${label}s are blocking release`,
    metric,
  };
}
