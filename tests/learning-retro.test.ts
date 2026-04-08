import { describe, expect, it } from "vitest";
import { createApp } from "../apps/worker/src/create-app";
import { createServices } from "../apps/worker/src/services";
import { MemoryControlPlaneStore } from "../packages/adapters/src/store/memory-control-plane.store";

describe("learning and retro", () => {
  it("captures learnings and exposes mission-scoped retrieval plus retro summary", async () => {
    const app = buildApp();

    await postJson(app, "/api/missions", {
      missionId: "mission-learn",
      title: "Capture learnings",
      repoKey: "iusung111/cloudflare-control-plane-director-mesh",
      ownerActor: "operator-1",
      phase: "learn",
    }, 201);

    const learning = await postJson(app, "/api/learnings", {
      learningId: "learning-1",
      scope: "mission",
      kind: "improvement",
      title: "Queue retry needs visibility",
      summary: "Operators need backlog visibility before retry storms escalate.",
      createdBy: "operator-1",
      missionId: "mission-learn",
      repoKey: "iusung111/cloudflare-control-plane-director-mesh",
      tags: ["queue", "observability"],
    }, 201);

    expect(learning.learningId).toBe("learning-1");

    const list = await getJson<any[]>(app, "/api/learnings?missionId=mission-learn");
    expect(list).toHaveLength(1);
    expect(list[0].tags).toContain("queue");

    const missionLearnings = await getJson<any[]>(app, "/api/missions/mission-learn/learnings");
    expect(missionLearnings).toHaveLength(1);
    expect(missionLearnings[0].learningId).toBe("learning-1");

    const retro = await getJson<any>(app, "/api/retro");
    expect(retro.learningsCount).toBe(1);
    expect(retro.topTags[0].tag).toBe("observability");

    const missionRetro = await getJson<any>(app, "/api/missions/mission-learn/retro");
    expect(missionRetro.missionCount).toBe(1);
    expect(missionRetro.learningsCount).toBe(1);

    const retroByQuery = await getJson<any>(app, "/api/retro?missionId=mission-learn");
    expect(retroByQuery.missionCount).toBe(1);
    expect(retroByQuery.recentLearnings[0].learningId).toBe("learning-1");
  });

  it("exposes learnings and retro through MCP resources and tool calls", async () => {
    const app = buildApp();
    const sessionId = await initializeSession(app);

    await postMcp(app, {
      jsonrpc: "2.0",
      id: 31,
      method: "tools/call",
      params: {
        name: "create_mission",
        arguments: {
          missionId: "mission-learn-mcp",
          title: "Learn via MCP",
          repoKey: "iusung111/cloudflare-control-plane-director-mesh",
          ownerActor: "operator-mcp",
          phase: "learn",
        },
      },
    }, sessionId);

    const captured = await postMcp(app, {
      jsonrpc: "2.0",
      id: 32,
      method: "tools/call",
      params: {
        name: "capture_learning",
        arguments: {
          learningId: "learning-mcp",
          scope: "mission",
          kind: "guardrail",
          title: "Live deploy needs approval trace",
          summary: "Keep approval evidence linked to the mission timeline.",
          createdBy: "operator-mcp",
          missionId: "mission-learn-mcp",
          tags: ["approval", "timeline"],
        },
      },
    }, sessionId);

    expect(captured.result.isError).toBe(false);
    expect(captured.result.structuredContent.learningId).toBe("learning-mcp");

    const learnings = await postMcp(app, {
      jsonrpc: "2.0",
      id: 33,
      method: "resources/read",
      params: { uri: "mission://mission-learn-mcp/learnings" },
    }, sessionId);
    expect(learnings.result.contents[0].text).toContain("learning-mcp");

    const retro = await postMcp(app, {
      jsonrpc: "2.0",
      id: 34,
      method: "resources/read",
      params: { uri: "retro://summary" },
    }, sessionId);
    expect(retro.result.contents[0].text).toContain("\"learningsCount\": 1");

    const missionRetro = await postMcp(app, {
      jsonrpc: "2.0",
      id: 35,
      method: "resources/read",
      params: { uri: "mission://mission-learn-mcp/retro" },
    }, sessionId);
    expect(missionRetro.result.contents[0].text).toContain("\"missionCount\": 1");
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

async function initializeSession(app: ReturnType<typeof buildApp>): Promise<string> {
  const initialize = await app.request("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "vitest", version: "1.0.0" },
      },
    }),
  });

  expect(initialize.status).toBe(200);
  const sessionId = initialize.headers.get("Mcp-Session-Id")!;

  const initialized = await app.request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });

  expect(initialized.status).toBe(202);
  return sessionId;
}

async function postMcp(app: ReturnType<typeof buildApp>, payload: unknown, sessionId: string) {
  const response = await app.request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify(payload),
  });

  expect(response.status).toBe(200);
  return response.json() as Promise<any>;
}
