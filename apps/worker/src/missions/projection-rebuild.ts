import { broadcastMissionDelta } from "../../../../packages/adapters/src/live/mission-live-hub";
import type { MissionDelta } from "../../../../packages/contracts/src";
import { pushMissionSnapshotIfConfigured } from "../live/mission-live-sync";
import { publishMutationNotifications } from "../notifications/mutation-publisher";
import type { AppServices, WorkerEnv } from "../services";

export async function rebuildMissionProjection(
  services: Pick<AppServices, "missionQuery">,
  env: WorkerEnv | undefined,
  missionId: string,
): Promise<void> {
  const graph = await services.missionQuery.getGraph(missionId);
  const snapshot: MissionDelta = { type: "mission.snapshot", graph };
  broadcastMissionDelta(missionId, snapshot);
  await pushMissionSnapshotIfConfigured(env, missionId, graph);
  await publishMutationNotifications(env, {
    updatedResources: missionMutationResources(missionId),
    listChanged: false,
  });
}

export function missionMutationResources(missionId: string): string[] {
  return [
    "missions://active",
    "quality://summary",
    "release-gate://summary",
    "observability://summary",
    "state://summary",
    `mission://${missionId}/graph`,
    `mission://${missionId}/live`,
    `mission://${missionId}/workers`,
    `mission://${missionId}/handoffs`,
    `mission://${missionId}/playback`,
    `mission://${missionId}/evidence`,
    `mission://${missionId}/learnings`,
    `mission://${missionId}/requests`,
    `mission://${missionId}/retro`,
  ];
}
