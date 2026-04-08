import type {
  GraphEdge,
  HandoffRecord,
  MissionDelta,
  MissionGraphSnapshot,
  MissionLiveGraphSnapshot,
  WorkerPhase,
  WorkerRecord,
  WorkerStatus,
} from "../../../contracts/src";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";
import { ControlPlaneError } from "../../../shared/src/control-plane-error";
import { projectMissionGraph } from "../../../projections/src/missions/mission-graph.projector";
import { projectMissionLiveGraph } from "../../../projections/src/missions/mission-live-graph.projector";

export class MissionQueryService {
  constructor(private readonly store: ControlPlaneStore) {}

  async getGraph(missionId: string): Promise<MissionGraphSnapshot> {
    const mission = await this.store.getMission(missionId);
    if (!mission) {
      throw new ControlPlaneError(404, "mission_not_found");
    }

    const [workers, edges, handoffs] = await Promise.all([
      this.store.listWorkers(missionId),
      this.store.listEdges(missionId),
      this.store.listHandoffs(missionId),
    ]);

    return projectMissionGraph({ mission, workers, edges, handoffs });
  }

  async getLiveGraph(
    missionId: string,
    options?: { coolingSeconds?: number; archiveSeconds?: number; now?: Date },
  ): Promise<MissionLiveGraphSnapshot> {
    const graph = await this.getGraph(missionId);
    return projectMissionLiveGraph({
      graph,
      now: options?.now,
      coolingSeconds: options?.coolingSeconds,
      archiveSeconds: options?.archiveSeconds,
    });
  }

  async listWorkers(
    missionId: string,
    filters?: { status?: WorkerStatus; phase?: WorkerPhase; q?: string },
  ): Promise<WorkerRecord[]> {
    const workers = await this.store.listWorkers(missionId);
    return workers.filter((worker) => {
      if (filters?.status && worker.status !== filters.status) {
        return false;
      }
      if (filters?.phase && worker.phase !== filters.phase) {
        return false;
      }
      if (filters?.q) {
        const query = filters.q.toLowerCase();
        const haystack = `${worker.workerId} ${worker.role} ${worker.title} ${worker.summary}`.toLowerCase();
        return haystack.includes(query);
      }
      return true;
    });
  }

  listEdges(missionId: string): Promise<GraphEdge[]> {
    return this.store.listEdges(missionId);
  }

  listHandoffs(missionId: string): Promise<HandoffRecord[]> {
    return this.store.listHandoffs(missionId);
  }

  listPlayback(missionId: string): Promise<MissionDelta[]> {
    return this.store.listMissionDeltas(missionId);
  }
}
