import { describe, expect, it } from "vitest";
import { createApp } from "../apps/worker/src/create-app";
import { createServices } from "../apps/worker/src/services";
import { MemoryControlPlaneStore } from "../packages/adapters/src/store/memory-control-plane.store";

describe("control plane worker", () => {
  it("serves the operator shell and phase-1 APIs", async () => {
    const app = buildApp();

    const session = await postJson(app, "/api/sessions", {
      sessionId: "sess-1",
      actorId: "user-1",
      role: "delivery",
    }, 201);

    expect(session.status).toBe("active");

    const lease = await postJson(app, "/api/leases", {
      leaseId: "lease-1",
      sessionId: "sess-1",
      resource: { repo: "iusung111/repo", branch: "main", path: "src/app.ts" },
    }, 201);

    expect(lease.status).toBe("active");

    const command = await postJson(app, "/api/commands", {
      commandId: "cmd-1",
      dedupKey: "dedup-1",
      sessionId: "sess-1",
      leaseId: "lease-1",
      action: "github_write",
      resource: { repo: "iusung111/repo", branch: "main", path: "src/app.ts" },
      payload: { title: "write a file" },
    });

    expect(command.status).toBe("completed");
    expect(command.events).toHaveLength(2);

    const summary = await getJson(app, "/api/state/summary");
    expect(summary.commands.completed).toBe(1);
    expect(summary.sessions.active).toBe(1);

    await postJson(app, "/api/approvals/yolo", {
      enabled: true,
      updatedBy: "user-1",
      note: "manual override",
    });

    const mcpSummary = await getJson(app, "/mcp/resources/state-summary");
    expect(mcpSummary.yoloMode.enabled).toBe(true);

    const html = await app.request("/app");
    expect(html.status).toBe(200);
    expect(await html.text()).toContain("Control Plane Director Mesh");
  });

  it("rejects duplicate dedup keys and blocks conflicting leases", async () => {
    const app = buildApp();

    await postJson(app, "/api/sessions", {
      sessionId: "sess-a",
      actorId: "user-a",
      role: "delivery",
    }, 201);

    await postJson(app, "/api/leases", {
      leaseId: "lease-a",
      sessionId: "sess-a",
      resource: { repo: "iusung111/repo", branch: "main", path: "src/file.ts" },
    }, 201);

    await postJson(app, "/api/sessions", {
      sessionId: "sess-b",
      actorId: "user-b",
      role: "reviewer",
    }, 201);

    const conflict = await app.request("/api/leases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leaseId: "lease-b",
        sessionId: "sess-b",
        resource: { repo: "iusung111/repo", branch: "main", path: "src/file.ts" },
      }),
    });

    expect(conflict.status).toBe(409);

    const first = await postJson(app, "/api/commands", {
      commandId: "cmd-a",
      dedupKey: "dedup-a",
      sessionId: "sess-a",
      leaseId: "lease-a",
      action: "deploy_live",
      resource: { repo: "iusung111/repo", branch: "main", path: "src/file.ts" },
      payload: { explicitLive: true },
    });

    const duplicate = await postJson(app, "/api/commands", {
      commandId: "cmd-b",
      dedupKey: "dedup-a",
      sessionId: "sess-a",
      leaseId: "lease-a",
      action: "deploy_live",
      resource: { repo: "iusung111/repo", branch: "main", path: "src/file.ts" },
      payload: { explicitLive: true },
    });

    expect(first.status).toBe("completed");
    expect(duplicate.status).toBe("rejected");
    expect(duplicate.events[0].reason).toBe("duplicate_command");

    const queue = await getJson<any[]>(app, "/api/queue");
    expect(queue).toHaveLength(0);

    const runs = await getJson<any[]>(app, "/api/runs");
    expect(runs.length).toBeGreaterThanOrEqual(2);

    const event = await getJson<any>(app, `/api/events/${duplicate.events[0].eventId}`);
    expect(event.eventId).toBe(duplicate.events[0].eventId);
  });

  it("supports command approval, lifecycle endpoints, and alert projection", async () => {
    const app = buildApp();

    await postJson(app, "/api/sessions", {
      sessionId: "sess-c",
      actorId: "user-c",
      role: "delivery",
    }, 201);

    await postJson(app, "/api/leases", {
      leaseId: "lease-c",
      sessionId: "sess-c",
      resource: { repo: "iusung111/repo", branch: "main", path: "src/deploy.ts" },
    }, 201);

    const rejected = await postJson(app, "/api/commands", {
      commandId: "cmd-c",
      dedupKey: "dedup-c",
      sessionId: "sess-c",
      leaseId: "lease-c",
      action: "deploy_live",
      resource: { repo: "iusung111/repo", branch: "main", path: "src/deploy.ts" },
      payload: {},
    });

    expect(rejected.status).toBe("rejected");

    const alerts = await getJson<any[]>(app, "/api/alerts");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].commandId).toBe("cmd-c");

    const approved = await postJson(app, "/api/commands/cmd-c/approve", {});
    expect(approved.status).toBe("completed");

    const commands = await getJson<any[]>(app, "/api/commands");
    expect(commands[0].commandId).toBe("cmd-c");

    const retried = await app.request("/api/commands/cmd-c/retry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(retried.status).toBe(409);

    const cancelled = await postJson(app, "/api/commands/cmd-c/cancel", { reason: "operator_stop" });
    expect(cancelled.status).toBe("cancelled");

    const target = await getJson<any>(app, "/api/alerts/alert:cmd-c/target");
    expect(target.commandId).toBe("cmd-c");
  });

  it("persists alert read and dismiss state across current and log views", async () => {
    const app = buildApp();

    await postJson(app, "/api/sessions", {
      sessionId: "sess-alert",
      actorId: "user-alert",
      role: "delivery",
    }, 201);

    await postJson(app, "/api/leases", {
      leaseId: "lease-alert",
      sessionId: "sess-alert",
      resource: { repo: "iusung111/repo", branch: "main", path: "src/live.ts" },
    }, 201);

    await postJson(app, "/api/commands", {
      commandId: "cmd-alert",
      dedupKey: "dedup-alert",
      sessionId: "sess-alert",
      leaseId: "lease-alert",
      action: "deploy_live",
      resource: { repo: "iusung111/repo", branch: "main", path: "src/live.ts" },
      payload: {},
    });

    const before = await getJson<any[]>(app, "/api/alerts");
    expect(before).toHaveLength(1);
    expect(before[0].unread).toBe(true);

    const read = await postJson(app, "/api/alerts/alert:cmd-alert/read", {});
    expect(read.unread).toBe(false);
    expect(read.dismissed).toBe(false);

    const afterRead = await getJson<any[]>(app, "/api/alerts");
    expect(afterRead).toHaveLength(1);
    expect(afterRead[0].unread).toBe(false);

    const dismissed = await postJson(app, "/api/alerts/alert:cmd-alert/dismiss", {});
    expect(dismissed.dismissed).toBe(true);

    const current = await getJson<any[]>(app, "/api/alerts");
    expect(current).toHaveLength(0);

    const log = await getJson<any[]>(app, "/api/alerts/log");
    expect(log).toHaveLength(1);
    expect(log[0].alertId).toBe("alert:cmd-alert");
    expect(log[0].dismissed).toBe(true);
    expect(log[0].unread).toBe(false);
  });

  it("allows scoped approvals to satisfy deploy_live guardrails", async () => {
    const app = buildApp();

    await postJson(app, "/api/sessions", {
      sessionId: "sess-d",
      actorId: "user-d",
      role: "delivery",
    }, 201);

    await postJson(app, "/api/leases", {
      leaseId: "lease-d",
      sessionId: "sess-d",
      resource: { repo: "iusung111/repo", branch: "main", path: "infra/deploy.ts" },
    }, 201);

    await postJson(app, "/api/approvals/scoped", {
      approvalId: "approval-1",
      actorId: "user-d",
      action: "deploy_live",
      resource: { repo: "iusung111/repo", branch: "main", path: "infra/deploy.ts" },
      ttlMinutes: 30,
    }, 201);

    const command = await postJson(app, "/api/commands", {
      commandId: "cmd-d",
      dedupKey: "dedup-d",
      sessionId: "sess-d",
      leaseId: "lease-d",
      action: "deploy_live",
      resource: { repo: "iusung111/repo", branch: "main", path: "infra/deploy.ts" },
      payload: {},
    });

    expect(command.status).toBe("completed");

    const approvals = await getJson<any[]>(app, "/api/approvals/scoped");
    expect(approvals).toHaveLength(1);

    const deleted = await app.request("/api/approvals/scoped/approval-1", { method: "DELETE" });
    expect(deleted.status).toBe(204);
  });

  it("builds a mission graph, handoff trail, playback stream, and mcp resources", async () => {
    const app = buildApp();

    const mission = await postJson(app, "/api/missions", {
      missionId: "mission-1",
      title: "Ship control plane",
      repoKey: "iusung111/cloudflare-control-plane-director-mesh",
      ownerActor: "user-ops",
      phase: "plan",
    }, 201);

    expect(mission.missionId).toBe("mission-1");

    const parentWorker = await postJson(app, "/api/missions/mission-1/workers", {
      workerId: "worker-root",
      role: "director",
      title: "Plan the rollout",
      summary: "Preparing implementation steps",
      phase: "plan",
      status: "running",
      progress: 25,
    }, 201);

    const childWorker = await postJson(app, "/api/missions/mission-1/workers", {
      workerId: "worker-build",
      parentWorkerId: "worker-root",
      role: "builder",
      title: "Implement routes",
      summary: "Adding mission APIs",
      phase: "build",
      status: "running",
      progress: 55,
    }, 201);

    expect(parentWorker.workerId).toBe("worker-root");
    expect(childWorker.parentWorkerId).toBe("worker-root");

    const handoff = await postJson(app, "/api/missions/mission-1/handoffs", {
      handoffId: "handoff-1",
      fromWorkerId: "worker-root",
      toWorkerId: "worker-build",
      handoffType: "brief",
      title: "Implementation brief",
      summary: "Add graph and playback endpoints",
      artifactRefs: ["artifact://spec"],
    }, 201);

    expect(handoff.handoffId).toBe("handoff-1");

    const graph = await getJson<any>(app, "/api/missions/mission-1/graph");
    expect(graph.workers).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    expect(graph.handoffs).toHaveLength(1);

    const playback = await getJson<any[]>(app, "/api/missions/mission-1/playback");
    expect(playback.length).toBeGreaterThanOrEqual(4);

    const evidence = await getJson<any>(app, "/api/missions/mission-1/evidence");
    expect(evidence.handoffs).toHaveLength(1);

    const liveWithoutUpgrade = await app.request("/api/missions/mission-1/live");
    expect(liveWithoutUpgrade.status).toBe(426);

    const mcpGraph = await getJson<any>(app, "/mcp/resources/mission-graph/mission-1");
    expect(mcpGraph.mission.missionId).toBe("mission-1");
  });
});

function buildApp() {
  const store = new MemoryControlPlaneStore();
  const services = createServices(undefined, { store });
  return createApp({ services });
}

async function getJson<T = any>(app: ReturnType<typeof buildApp>, path: string): Promise<T> {
  const response = await app.request(path);
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
