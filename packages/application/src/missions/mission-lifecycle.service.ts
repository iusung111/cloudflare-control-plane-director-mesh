import type { MissionRecord, WorkerPhase } from "../../../contracts/src";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";
import { ControlPlaneError } from "../../../shared/src/control-plane-error";

export class MissionLifecycleService {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(input: {
    missionId: string;
    title: string;
    repoKey: string;
    env?: string;
    ownerActor: string;
    phase?: WorkerPhase;
  }): Promise<MissionRecord> {
    const existing = await this.store.getMission(input.missionId);
    if (existing) {
      throw new ControlPlaneError(409, "mission_already_exists");
    }

    const now = this.now().toISOString();
    const mission: MissionRecord = {
      missionId: input.missionId,
      title: input.title,
      repoKey: input.repoKey,
      env: input.env ?? "prod",
      phase: input.phase ?? "plan",
      status: "active",
      ownerActor: input.ownerActor,
      createdAt: now,
      updatedAt: now,
    };

    await this.store.putMission(mission);
    return mission;
  }

  list(): Promise<MissionRecord[]> {
    return this.store.listMissions();
  }

  async get(missionId: string): Promise<MissionRecord> {
    const mission = await this.store.getMission(missionId);
    if (!mission) {
      throw new ControlPlaneError(404, "mission_not_found");
    }
    return mission;
  }
}
