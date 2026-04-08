export type MissionStatus = "active" | "blocked" | "completed" | "failed" | "cancelled";
export type WorkerPhase = "think" | "plan" | "build" | "review" | "qa" | "ship" | "learn";
export type WorkerStatus =
  | "created"
  | "running"
  | "blocked"
  | "waiting_approval"
  | "retrying"
  | "completed"
  | "failed"
  | "cancelled";

export interface MissionRecord {
  missionId: string;
  title: string;
  repoKey: string;
  env: string;
  phase: WorkerPhase;
  status: MissionStatus;
  ownerActor: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerRecord {
  missionId: string;
  workerId: string;
  parentWorkerId?: string;
  role: string;
  phase: WorkerPhase;
  status: WorkerStatus;
  title: string;
  summary: string;
  progress?: number;
  blockerReason?: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  lastHeartbeatAt: string;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  relation: "spawned" | "delegated" | "depends_on" | "blocked_by" | "reviewed_by" | "emits_to" | "reads_from";
  summary?: string;
  createdAt: string;
}

export interface HandoffRecord {
  handoffId: string;
  missionId: string;
  fromWorkerId: string;
  toWorkerId: string;
  handoffType: "brief" | "constraint" | "artifact" | "finding" | "approval" | "result";
  title: string;
  summary: string;
  artifactRefs?: string[];
  createdAt: string;
}

export interface MissionGraphSnapshot {
  mission: MissionRecord;
  workers: WorkerRecord[];
  edges: GraphEdge[];
  handoffs: HandoffRecord[];
}

export interface CompletedWorkerBundle {
  bundleId: string;
  phase: WorkerPhase;
  count: number;
  workerIds: string[];
  latestCompletedAt: string;
}

export interface MissionLiveGraphSnapshot {
  mission: MissionRecord;
  visibleWorkers: WorkerRecord[];
  collapsedBundles: CompletedWorkerBundle[];
  archivedWorkers: number;
  edges: GraphEdge[];
  handoffs: HandoffRecord[];
}

export interface MissionEvidenceSnapshot {
  mission: MissionRecord;
  events: Array<{
    commandId: string;
    status: string;
    reason?: string;
    createdAt: string;
  }>;
  handoffs: HandoffRecord[];
  alerts: Array<{
    alertId: string;
    summary: string;
    status: string;
    createdAt: string;
  }>;
}

export type MissionDelta =
  | { type: "mission.snapshot"; graph: MissionGraphSnapshot }
  | { type: "worker.updated"; worker: WorkerRecord }
  | { type: "handoff.created"; handoff: HandoffRecord }
  | { type: "edge.created"; edge: GraphEdge };
