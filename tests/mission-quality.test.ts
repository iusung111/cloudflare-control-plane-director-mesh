import { describe, expect, it } from "vitest";
import { createApp } from "../apps/worker/src/create-app";
import { createServices } from "../apps/worker/src/services";
import { MemoryControlPlaneStore } from "../packages/adapters/src/store/memory-control-plane.store";
import { projectMissionLiveGraph } from "../packages/projections/src/missions/mission-live-graph.projector";

describe("mission live graph and quality aggregation", () => {
  it("collapses completed workers in live graph while keeping search and playback intact", async () => {
    const app = buildApp();

    await postJson(app, "/api/missions", {
      missionId: "mission-live-graph",
      title: "Collapse completed work",
      repoKey: "iusung111/cloudflare-control-plane-director-mesh",
      ownerActor: "operator-1",
      phase: "build",
    }, 201);

    await postJson(app, "/api/missions/mission-live-graph/workers", {
      workerId: "worker-root",
      role: "director",
      title: "Coordinate rollout",
      summary: "Keep the mission active",
      phase: "build",
      status: "running",
      progress: 50,
    }, 201);

    await postJson(app, "/api/missions/mission-live-graph/workers", {
      workerId: "worker-complete",
      parentWorkerId: "worker-root",
      role: "builder",
      title: "Implement routes",
      summary: "Finished mission route wiring",
      phase: "build",
      status: "completed",
      progress: 100,
    }, 201);

    const liveGraph = await getJson<any>(app, "/api/missions/mission-live-graph/graph/live?coolingSeconds=0&archiveSeconds=3600");
    expect(liveGraph.visibleWorkers.map((worker: any) => worker.workerId)).toEqual(["worker-root"]);
    expect(liveGraph.collapsedBundles).toHaveLength(1);
    expect(liveGraph.collapsedBundles[0].workerIds).toContain("worker-complete");

    const search = await getJson<any[]>(app, "/api/missions/mission-live-graph/workers?status=completed&q=routes");
    expect(search).toHaveLength(1);
    expect(search[0].workerId).toBe("worker-complete");

    const playback = await getJson<any[]>(app, "/api/missions/mission-live-graph/playback");
    expect(playback.some((entry) => entry.type === "worker.updated" && entry.worker.workerId === "worker-complete")).toBe(true);

    const mcpGraph = await getJson<any>(app, "/mcp/resources/mission-live-graph/mission-live-graph");
    expect(mcpGraph.mission.missionId).toBe("mission-live-graph");
  });

  it("aggregates quality signals from release risk state", async () => {
    const app = buildApp();

    await postJson(app, "/api/missions", {
      missionId: "mission-quality",
      title: "Quality rollup",
      repoKey: "iusung111/cloudflare-control-plane-director-mesh",
      ownerActor: "operator-2",
      phase: "qa",
    }, 201);

    await postJson(app, "/api/missions/mission-quality/workers", {
      workerId: "worker-qa",
      role: "qa",
      title: "Wait for approval",
      summary: "Approval gate is pending",
      phase: "qa",
      status: "waiting_approval",
      progress: 90,
    }, 201);

    const quality = await getJson<any>(app, "/api/quality");
    expect(quality.status).toBe("blocked");
    expect(quality.releaseGateStatus).toBe("blocked");
    expect(quality.metrics.waitingApprovalWorkers).toBe(1);

    const qualityFromMcp = await getJson<any>(app, "/mcp/resources/quality-summary");
    expect(qualityFromMcp.status).toBe("blocked");
    expect(qualityFromMcp.metrics.activeMissions).toBe(1);
  });

  it("marks missions completed and stores a final snapshot when all workers finish", async () => {
    const app = buildApp();

    await postJson(app, "/api/missions", {
      missionId: "mission-finish",
      title: "Close out work",
      repoKey: "iusung111/cloudflare-control-plane-director-mesh",
      ownerActor: "operator-4",
      phase: "ship",
    }, 201);

    await postJson(app, "/api/missions/mission-finish/workers", {
      workerId: "worker-finish",
      role: "shipper",
      title: "Complete release",
      summary: "Everything is done",
      phase: "ship",
      status: "completed",
      progress: 100,
    }, 201);

    const mission = await getJson<any>(app, "/api/missions/mission-finish");
    expect(mission.status).toBe("completed");

    const playback = await getJson<any[]>(app, "/api/missions/mission-finish/playback");
    expect(playback.at(-1)?.type).toBe("mission.snapshot");
  });

  it("archives completed workers after the archive window in the live projector", () => {
    const graph = {
      mission: {
        missionId: "mission-archive",
        title: "Archive old work",
        repoKey: "iusung111/cloudflare-control-plane-director-mesh",
        env: "prod",
        phase: "ship",
        status: "active",
        ownerActor: "operator-3",
        createdAt: "2026-04-08T00:00:00.000Z",
        updatedAt: "2026-04-08T00:00:00.000Z",
      },
      workers: [
        {
          missionId: "mission-archive",
          workerId: "worker-old",
          role: "builder",
          phase: "build",
          status: "completed",
          title: "Old work",
          summary: "Already finished",
          startedAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:01:00.000Z",
          completedAt: "2026-04-08T00:01:00.000Z",
          lastHeartbeatAt: "2026-04-08T00:01:00.000Z",
        },
      ],
      edges: [],
      handoffs: [],
    } as const;

    const projected = projectMissionLiveGraph({
      graph: graph as any,
      now: new Date("2026-04-08T00:10:00.000Z"),
      coolingSeconds: 60,
      archiveSeconds: 120,
    });

    expect(projected.visibleWorkers).toHaveLength(0);
    expect(projected.collapsedBundles).toHaveLength(0);
    expect(projected.archivedWorkers).toBe(1);
  });
});

function buildApp() {
  const store = new MemoryControlPlaneStore();
  const services = createServices(undefined, { store });
  return createApp({ services });
}

async function getJson<T = any>(app: ReturnType<typeof buildApp>, path: string): Promise<T> {
  const response = await app.request(path);
  expect(response.status).toBe(200);
  return response.json() as Promise<T>;
}

async function postJson(
  app: ReturnType<typeof buildApp>,
  path: string,
  body: unknown,
  status = 200,
): Promise<any> {
  const response = await app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  expect(response.status).toBe(status);
  return response.json() as Promise<any>;
}
