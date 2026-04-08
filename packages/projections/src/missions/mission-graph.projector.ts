import type {
  GraphEdge,
  HandoffRecord,
  MissionGraphSnapshot,
  MissionRecord,
  WorkerRecord,
} from "../../../contracts/src";

export function projectMissionGraph(input: {
  mission: MissionRecord;
  workers: WorkerRecord[];
  edges: GraphEdge[];
  handoffs: HandoffRecord[];
}): MissionGraphSnapshot {
  return {
    mission: input.mission,
    workers: input.workers.slice().sort((left, right) => left.startedAt.localeCompare(right.startedAt)),
    edges: input.edges.slice().sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    handoffs: input.handoffs.slice().sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
  };
}
