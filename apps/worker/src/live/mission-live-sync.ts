import type { MissionDelta, MissionGraphSnapshot } from "../../../../packages/contracts/src";
import type { WorkerEnv } from "../services";

export async function pushMissionSnapshotIfConfigured(
  env: WorkerEnv | undefined,
  missionId: string,
  snapshot: MissionGraphSnapshot,
): Promise<void> {
  const stub = roomStub(env, missionId);
  if (!stub) {
    return;
  }

  await stub.fetch("https://mission-room.internal/snapshot", {
    method: "POST",
    body: JSON.stringify({ type: "mission.snapshot", graph: snapshot } satisfies MissionDelta),
  });
}

export async function pushMissionDeltaIfConfigured(
  env: WorkerEnv | undefined,
  missionId: string,
  delta: MissionDelta,
): Promise<void> {
  const stub = roomStub(env, missionId);
  if (!stub) {
    return;
  }

  await stub.fetch("https://mission-room.internal/delta", {
    method: "POST",
    body: JSON.stringify(delta),
  });
}

export function roomStub(env: WorkerEnv | undefined, missionId: string) {
  if (!env?.MISSION_ROOM) {
    return null;
  }

  return env.MISSION_ROOM.get(env.MISSION_ROOM.idFromName(missionId));
}
