export function dedupPath(dedupKey: string): string {
  return `.control-plane/dedup/${hashKey(dedupKey)}.json`;
}

export function eventPath(eventId: string, createdAt: string): string {
  return `.control-plane/events/${createdAt.replace(/[:.]/g, "-")}__${safeId(eventId)}.json`;
}

export function alertStatePath(alertId: string): string {
  return `.control-plane/alert-state/${safeId(alertId)}.json`;
}

export function sessionPath(sessionId: string): string {
  return `.control-plane/sessions/${safeId(sessionId)}.json`;
}

export function leasePath(leaseId: string): string {
  return `.control-plane/leases/${safeId(leaseId)}.json`;
}

export function commandPath(commandId: string): string {
  return `.control-plane/commands/${safeId(commandId)}.json`;
}

export function missionPath(missionId: string): string {
  return `.control-plane/missions/${safeId(missionId)}.json`;
}

export function workerPath(missionId: string, workerId: string): string {
  return `.control-plane/workers/${safeId(missionId)}/${safeId(workerId)}.json`;
}

export function workerDir(missionId: string): string {
  return `.control-plane/workers/${safeId(missionId)}`;
}

export function edgePath(missionId: string, edgeId: string): string {
  return `.control-plane/edges/${safeId(missionId)}/${safeId(edgeId)}.json`;
}

export function edgeDir(missionId: string): string {
  return `.control-plane/edges/${safeId(missionId)}`;
}

export function handoffPath(missionId: string, handoffId: string): string {
  return `.control-plane/handoffs/${safeId(missionId)}/${safeId(handoffId)}.json`;
}

export function handoffDir(missionId: string): string {
  return `.control-plane/handoffs/${safeId(missionId)}`;
}

export function missionDeltaPath(missionId: string, index: number): string {
  return `.control-plane/deltas/${safeId(missionId)}/${String(index).padStart(8, "0")}.json`;
}

export function missionDeltaDir(missionId: string): string {
  return `.control-plane/deltas/${safeId(missionId)}`;
}

export function learningPath(learningId: string): string {
  return `.control-plane/learnings/${safeId(learningId)}.json`;
}

export function operatorRequestPath(requestId: string): string {
  return `.control-plane/requests/${safeId(requestId)}.json`;
}

export function scopedApprovalPath(approvalId: string): string {
  return `.control-plane/approvals/${safeId(approvalId)}.json`;
}

export function yoloPath(): string {
  return ".control-plane/settings/yolo.json";
}

export function safeId(value: string): string {
  return encodeURIComponent(value).replace(/%/g, "_");
}

function hashKey(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(16).padStart(8, "0");
}
