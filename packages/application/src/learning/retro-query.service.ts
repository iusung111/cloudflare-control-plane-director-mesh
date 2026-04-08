import type { RetroSummary } from "../../../contracts/src";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";
import { projectRetroSummary } from "../../../projections/src/learning/retro-summary.projector";

export class RetroQueryService {
  constructor(private readonly store: ControlPlaneStore) {}

  async execute(options?: { now?: Date; missionId?: string }): Promise<RetroSummary> {
    const [missions, learnings] = await Promise.all([
      this.store.listMissions(),
      this.store.listLearnings(),
    ]);
    const missionId = options?.missionId;

    return projectRetroSummary({
      now: (options?.now ?? new Date()).toISOString(),
      missions: missionId ? missions.filter((mission) => mission.missionId === missionId) : missions,
      learnings: missionId ? learnings.filter((learning) => learning.missionId === missionId) : learnings,
    });
  }
}
