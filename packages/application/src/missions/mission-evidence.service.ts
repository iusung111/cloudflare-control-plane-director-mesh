import type { MissionEvidenceSnapshot } from "../../../contracts/src";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";
import { ControlPlaneError } from "../../../shared/src/control-plane-error";
import { GetReleaseGateService } from "../release/get-release-gate.service";

export class MissionEvidenceService {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly releaseGate?: GetReleaseGateService,
  ) {}

  async execute(missionId: string): Promise<MissionEvidenceSnapshot> {
    const mission = await this.store.getMission(missionId);
    if (!mission) {
      throw new ControlPlaneError(404, "mission_not_found");
    }

    const [handoffs, deltas, commands, learnings, releaseGate] = await Promise.all([
      this.store.listHandoffs(missionId),
      this.store.listMissionDeltas(missionId),
      this.store.listCommands(),
      this.store.listLearnings(),
      this.releaseGate?.execute(),
    ]);

    const workerIds = new Set((await this.store.listWorkers(missionId)).map((worker) => worker.workerId));
    const missionCommands = commands.filter((command) =>
      workerIds.has(command.leaseId) || command.payload.missionId === missionId,
    );
    const missionLearnings = learnings.filter((learning) => learning.missionId === missionId);

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
      browserEvidence: missionCommands
        .filter((command) => (command.action === "browser_check" || command.action === "verify_run") && command.result)
        .map((command) => ({
          commandId: command.commandId,
          status: command.status,
          summary: String(command.result?.summary ?? command.latestReason ?? command.status),
          checkedAt: String(command.result?.checkedAt ?? command.updatedAt),
          url: typeof command.result?.url === "string" ? command.result.url : undefined,
          selector: typeof command.result?.selector === "string" ? command.result.selector : undefined,
        })),
      reviewFindings: [
        ...handoffs
          .filter((handoff) => handoff.handoffType === "finding" || handoff.handoffType === "approval")
          .map((handoff) => ({
            id: handoff.handoffId,
            title: handoff.title,
            summary: handoff.summary,
            createdAt: handoff.createdAt,
            source: "handoff" as const,
          })),
        ...missionLearnings.map((learning) => ({
          id: learning.learningId,
          title: learning.title,
          summary: learning.summary,
          createdAt: learning.createdAt,
          source: "learning" as const,
        })),
        ...missionCommands
          .filter((command) => command.status === "failed" || command.status === "rejected")
          .map((command) => ({
            id: command.commandId,
            title: `${command.action} ${command.status}`,
            summary: command.latestReason ?? command.status,
            createdAt: command.updatedAt,
            source: "command" as const,
          })),
      ].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      releaseChecks: releaseGate?.checks ?? [],
      learnings: missionLearnings.map((learning) => ({
        learningId: learning.learningId,
        title: learning.title,
        kind: learning.kind,
        summary: learning.summary,
        createdAt: learning.createdAt,
      })),
    };
  }
}
