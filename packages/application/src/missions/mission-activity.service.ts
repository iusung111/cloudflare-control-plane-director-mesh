import type {
  GraphEdge,
  HandoffRecord,
  MissionDelta,
  MissionRecord,
  MissionStatus,
  WorkerPhase,
  WorkerRecord,
  WorkerStatus,
} from "../../../contracts/src";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";
import { ControlPlaneError } from "../../../shared/src/control-plane-error";
import { projectMissionGraph } from "../../../projections/src/missions/mission-graph.projector";

export class MissionActivityService {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async upsertWorker(input: {
    missionId: string;
    workerId: string;
    role: string;
    title: string;
    summary: string;
    phase: WorkerPhase;
    status: WorkerStatus;
    parentWorkerId?: string;
    progress?: number;
    blockerReason?: string;
  }): Promise<WorkerRecord> {
    const mission = await this.requireMission(input.missionId);
    const existingWorkers = await this.store.listWorkers(input.missionId);
    const existing = existingWorkers.find((worker) => worker.workerId === input.workerId);
    const now = this.now().toISOString();

    const worker: WorkerRecord = {
      missionId: input.missionId,
      workerId: input.workerId,
      parentWorkerId: input.parentWorkerId,
      role: input.role,
      phase: input.phase,
      status: input.status,
      title: input.title,
      summary: input.summary,
      progress: input.progress,
      blockerReason: input.blockerReason,
      startedAt: existing?.startedAt ?? now,
      updatedAt: now,
      completedAt: isTerminal(input.status) ? now : existing?.completedAt,
      lastHeartbeatAt: now,
    };

    await this.store.putWorker(worker);
    await this.bumpMission(mission, input.phase, mergeWorker(existingWorkers, worker));

    const delta: MissionDelta = { type: "worker.updated", worker };
    await this.store.appendMissionDelta(input.missionId, delta);

    if (input.parentWorkerId) {
      const edge: GraphEdge = {
        id: `${input.parentWorkerId}->${input.workerId}:spawned`,
        from: input.parentWorkerId,
        to: input.workerId,
        relation: "spawned",
        createdAt: now,
      };
      await this.store.putEdge(input.missionId, edge);
      await this.store.appendMissionDelta(input.missionId, { type: "edge.created", edge });
    }

    return worker;
  }

  async recordHandoff(input: {
    missionId: string;
    handoffId: string;
    fromWorkerId: string;
    toWorkerId: string;
    handoffType: HandoffRecord["handoffType"];
    title: string;
    summary: string;
    artifactRefs?: string[];
  }): Promise<HandoffRecord> {
    await this.requireMission(input.missionId);
    const handoff: HandoffRecord = {
      ...input,
      createdAt: this.now().toISOString(),
    };

    await this.store.putHandoff(handoff);
    await this.store.appendMissionDelta(input.missionId, {
      type: "handoff.created",
      handoff,
    });

    return handoff;
  }

  async snapshot(missionId: string) {
    const mission = await this.requireMission(missionId);
    const [workers, edges, handoffs] = await Promise.all([
      this.store.listWorkers(missionId),
      this.store.listEdges(missionId),
      this.store.listHandoffs(missionId),
    ]);

    const graph = projectMissionGraph({ mission, workers, edges, handoffs });
    await this.store.appendMissionDelta(missionId, { type: "mission.snapshot", graph });
    return graph;
  }

  private async requireMission(missionId: string): Promise<MissionRecord> {
    const mission = await this.store.getMission(missionId);
    if (!mission) {
      throw new ControlPlaneError(404, "mission_not_found");
    }
    return mission;
  }

  private async bumpMission(
    mission: MissionRecord,
    phase: WorkerPhase,
    workers: WorkerRecord[],
  ): Promise<void> {
    const now = this.now().toISOString();
    const status = deriveMissionStatus(workers, mission.status);

    await this.store.putMission({
      ...mission,
      phase,
      status,
      updatedAt: now,
    });
  }
}

function isTerminal(status: WorkerStatus): boolean {
  return ["completed", "failed", "cancelled"].includes(status);
}

function mergeWorker(workers: WorkerRecord[], next: WorkerRecord): WorkerRecord[] {
  const filtered = workers.filter((worker) => worker.workerId !== next.workerId);
  filtered.push(next);
  return filtered;
}

function deriveMissionStatus(workers: WorkerRecord[], currentStatus: MissionStatus): MissionStatus {
  if (workers.some((worker) => worker.status === "failed")) {
    return "failed";
  }

  if (workers.some((worker) => worker.status === "blocked" || worker.status === "waiting_approval")) {
    return "blocked";
  }

  if (workers.length > 0 && workers.every((worker) => isTerminal(worker.status))) {
    return currentStatus === "failed" ? "failed" : "completed";
  }

  return "active";
}
