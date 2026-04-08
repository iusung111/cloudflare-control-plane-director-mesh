import type { GraphEdge, HandoffRecord, MissionDelta, MissionGraphSnapshot, WorkerRecord } from "../../../../packages/contracts/src";

export function applyMissionDeltaToSnapshot(
  snapshotPayload: string | null,
  deltaPayload: string,
): string | null {
  const delta = JSON.parse(deltaPayload) as MissionDelta;
  if (delta.type === "mission.snapshot") {
    return JSON.stringify(delta);
  }

  if (!snapshotPayload) {
    return null;
  }

  const snapshotDelta = JSON.parse(snapshotPayload) as Extract<MissionDelta, { type: "mission.snapshot" }>;
  const graph = applyMissionDelta(snapshotDelta.graph, delta);
  return JSON.stringify({ type: "mission.snapshot", graph } satisfies MissionDelta);
}

export function applyMissionDelta(
  snapshot: MissionGraphSnapshot,
  delta: Exclude<MissionDelta, { type: "mission.snapshot" }>,
): MissionGraphSnapshot {
  switch (delta.type) {
    case "worker.updated":
      return {
        ...snapshot,
        mission: {
          ...snapshot.mission,
          updatedAt: delta.worker.updatedAt,
        },
        workers: upsertBy(snapshot.workers, delta.worker, (item) => item.workerId),
      };
    case "handoff.created":
      return {
        ...snapshot,
        mission: {
          ...snapshot.mission,
          updatedAt: delta.handoff.createdAt,
        },
        handoffs: upsertBy(snapshot.handoffs, delta.handoff, (item) => item.handoffId),
      };
    case "edge.created":
      return {
        ...snapshot,
        mission: {
          ...snapshot.mission,
          updatedAt: delta.edge.createdAt,
        },
        edges: upsertBy(snapshot.edges, delta.edge, (item) => item.id),
      };
  }
}

function upsertBy<T extends WorkerRecord | HandoffRecord | GraphEdge>(
  items: T[],
  next: T,
  key: (item: T) => string,
): T[] {
  const nextKey = key(next);
  const index = items.findIndex((item) => key(item) === nextKey);
  if (index === -1) {
    return [...items, next];
  }

  const updated = items.slice();
  updated[index] = next;
  return updated;
}
