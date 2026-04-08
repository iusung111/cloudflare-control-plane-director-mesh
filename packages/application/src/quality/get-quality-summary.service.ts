import type { QualitySummary, WorkerRecord } from "../../../contracts/src";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";
import { projectQualitySummary } from "../../../projections/src/state/quality-summary.projector";
import { GetReleaseGateService } from "../release/get-release-gate.service";

export class GetQualitySummaryService {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly releaseGate: GetReleaseGateService,
  ) {}

  async execute(now = new Date()): Promise<QualitySummary> {
    const [commands, missions, releaseGate] = await Promise.all([
      this.store.listCommands(),
      this.store.listMissions(),
      this.releaseGate.execute(now),
    ]);
    const activeMissions = missions.filter((mission) => mission.status === "active" || mission.status === "blocked");
    const workers = (await Promise.all(activeMissions.map((mission) => this.store.listWorkers(mission.missionId)))).flat();

    return projectQualitySummary({
      now: now.toISOString(),
      commands,
      workers: workers as WorkerRecord[],
      activeMissions: activeMissions.length,
      releaseGate,
    });
  }
}
