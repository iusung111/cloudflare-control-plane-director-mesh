import type { ReleaseGateSummary, WorkerRecord } from "../../../contracts/src";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";
import { evaluateReleaseGate } from "../../../domain/src/release/release-gate.policy";

export class GetReleaseGateService {
  constructor(private readonly store: ControlPlaneStore) {}

  async execute(now = new Date()): Promise<ReleaseGateSummary> {
    const [commands, missions, yoloMode] = await Promise.all([
      this.store.listCommands(),
      this.store.listMissions(),
      this.store.getYoloMode(),
    ]);
    const activeMissions = missions.filter((mission) => mission.status === "active" || mission.status === "blocked");
    const workers = (await Promise.all(activeMissions.map((mission) => this.store.listWorkers(mission.missionId)))).flat();

    return evaluateReleaseGate({
      generatedAt: now.toISOString(),
      openAlerts: commands.filter((command) => ["queued", "rejected", "failed", "cancelled"].includes(command.status)).length,
      queuedCommands: commands.filter((command) => command.status === "queued").length,
      blockedWorkers: countWorkers(workers, ["blocked", "failed"]),
      waitingApprovalWorkers: countWorkers(workers, ["waiting_approval"]),
      activeMissions: activeMissions.length,
      yoloEnabled: yoloMode.enabled,
    });
  }
}

function countWorkers(workers: WorkerRecord[], statuses: WorkerRecord["status"][]): number {
  return workers.filter((worker) => statuses.includes(worker.status)).length;
}
