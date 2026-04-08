import { describe, expect, it } from "vitest";
import { createApp } from "../apps/worker/src/create-app";
import { createServices } from "../apps/worker/src/services";
import { MemoryControlPlaneStore } from "../packages/adapters/src/store/memory-control-plane.store";

describe("release gate", () => {
  it("reports blocked state and exposes the summary over API and MCP", async () => {
    const store = new MemoryControlPlaneStore();
    const services = createServices(undefined, { store });
    const app = createApp({ services });

    await postJson(app, "/api/missions", {
      missionId: "mission-gate",
      title: "Release candidate",
      repoKey: "iusung111/cloudflare-control-plane-director-mesh",
      ownerActor: "operator-1",
      phase: "qa",
    }, 201);

    await postJson(app, "/api/missions/mission-gate/workers", {
      workerId: "worker-gate",
      role: "qa",
      title: "Run ship checks",
      summary: "Waiting for release checks",
      phase: "qa",
      status: "waiting_approval",
      progress: 90,
    }, 201);

    await postJson(app, "/api/approvals/yolo", {
      enabled: true,
      updatedBy: "operator-1",
      note: "temporary override",
    });

    const summary = await getJson<any>(app, "/api/release-gate");
    expect(summary.status).toBe("blocked");
    expect(summary.blockedReasons).toContain("blocked_workers");
    expect(summary.metrics.waitingApprovalWorkers).toBe(1);
    expect(summary.checks.find((check: any) => check.code === "yolo_mode")?.status).toBe("warn");

    const mcpSummary = await getJson<any>(app, "/mcp/resources/release-gate");
    expect(mcpSummary.status).toBe("blocked");
    expect(mcpSummary.metrics.activeMissions).toBe(1);
  });
});

async function getJson<T = any>(app: ReturnType<typeof createApp>, path: string): Promise<T> {
  const response = await app.request(path);
  expect(response.status).toBe(200);
  return response.json() as Promise<T>;
}

async function postJson(
  app: ReturnType<typeof createApp>,
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
