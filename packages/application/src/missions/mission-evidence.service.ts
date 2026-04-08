import type { MissionEvidenceSnapshot } from "../../../contracts/src";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";
import { ControlPlaneError } from "../../../shared/src/control-plane-error";

export class MissionEvidenceService {
  constructor(private readonly store: ControlPlaneStore) {}

  async execute(missionId: string): Promise<MissionEvidenceSnapshot> {
    const mission = await this.store.getMission(missionId);
    if (!mission) {
      throw new ControlPlaneError(404, "mission_not_found");
    }

    const [handoffs, deltas, commands] = await Promise.all([
      this.store.listHandoffs(missionId),
      this.store.listMissionDeltas(missionId),
      this.store.listCommands(),
    ]);

    const workerIds = new Set((await this.store.listWorkers(missionId)).map((worker) => worker.workerId));
    const missionCommands = commands.filter((command) =>
      workerIds.has(command.leaseId) || command.payload.missionId === missionId,
    );

    return {
      mission,
      handoffs,
      events: deltas.flatMap((delta) => {
        if (delta.type === "worker.updated") {
          return [{
            commandId: delta.worker.workerId,
            status: delta.worker.status,
            reason: delta.worker.blockerReason,
            createdAt: delta.worker.updatedAt,
          }];
        }

        return [];
      }),
      alerts: missionCommands
        .filter((command) => ["queued", "rejected", "failed", "cancelled"].includes(command.status))
        .map((command) => ({
          alertId: `alert:${command.commandId}`,
          summary: `${command.action} is ${command.status}`,
          status: command.status,
          createdAt: command.updatedAt,
        })),
    };
  }
}
