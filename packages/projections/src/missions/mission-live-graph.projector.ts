import type {
  CompletedWorkerBundle,
  GraphEdge,
  HandoffRecord,
  MissionGraphSnapshot,
  MissionLiveGraphSnapshot,
  WorkerPhase,
  WorkerRecord,
} from "../../../contracts/src";

const DEFAULT_COOLING_SECONDS = 60;
const DEFAULT_ARCHIVE_SECONDS = 300;

export function projectMissionLiveGraph(input: {
  graph: MissionGraphSnapshot;
  now?: Date;
  coolingSeconds?: number;
  archiveSeconds?: number;
}): MissionLiveGraphSnapshot {
  const now = input.now ?? new Date();
  const coolingCutoff = now.getTime() - ((input.coolingSeconds ?? DEFAULT_COOLING_SECONDS) * 1000);
  const archiveCutoff = now.getTime() - ((input.archiveSeconds ?? DEFAULT_ARCHIVE_SECONDS) * 1000);

  const visibleWorkers: WorkerRecord[] = [];
  const collapsedCandidates: WorkerRecord[] = [];
  let archivedWorkers = 0;

  for (const worker of input.graph.workers) {
    if (!shouldCollapse(worker)) {
      visibleWorkers.push(worker);
      continue;
    }

    const completedAt = Date.parse(worker.completedAt ?? worker.updatedAt);
    if (completedAt >= coolingCutoff) {
      visibleWorkers.push(worker);
      continue;
    }

    if (completedAt < archiveCutoff) {
      archivedWorkers += 1;
      continue;
    }

    collapsedCandidates.push(worker);
  }

  const visibleIds = new Set(visibleWorkers.map((worker) => worker.workerId));

  return {
    mission: input.graph.mission,
    visibleWorkers,
    collapsedBundles: bundleCompletedWorkers(collapsedCandidates),
    archivedWorkers,
    edges: input.graph.edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to)),
    handoffs: filterHandoffs(input.graph.handoffs, visibleIds),
  };
}

function shouldCollapse(worker: WorkerRecord): boolean {
  return worker.status === "completed" || worker.status === "cancelled";
}

function bundleCompletedWorkers(workers: WorkerRecord[]): CompletedWorkerBundle[] {
  const grouped = new Map<WorkerPhase, WorkerRecord[]>();

  for (const worker of workers) {
    const current = grouped.get(worker.phase) ?? [];
    current.push(worker);
    grouped.set(worker.phase, current);
  }

  return Array.from(grouped.entries())
    .map(([phase, phaseWorkers]) => ({
      bundleId: `bundle:${phase}`,
      phase,
      count: phaseWorkers.length,
      workerIds: phaseWorkers.map((worker) => worker.workerId),
      latestCompletedAt: phaseWorkers
        .map((worker) => worker.completedAt ?? worker.updatedAt)
        .sort((left, right) => right.localeCompare(left))[0]!,
    }))
    .sort((left, right) => right.latestCompletedAt.localeCompare(left.latestCompletedAt));
}

function filterHandoffs(handoffs: HandoffRecord[], visibleIds: Set<string>): HandoffRecord[] {
  return handoffs.filter((handoff) => visibleIds.has(handoff.fromWorkerId) || visibleIds.has(handoff.toWorkerId));
}
