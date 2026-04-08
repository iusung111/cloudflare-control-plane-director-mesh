import { describe, expect, it } from "vitest";
import { createApp } from "../apps/worker/src/create-app";
import { createServices } from "../apps/worker/src/services";
import { MemoryControlPlaneStore } from "../packages/adapters/src/store/memory-control-plane.store";

describe("mcp transport", () => {
  it("supports initialize, list, tool call, and resource read over JSON-RPC", async () => {
    const app = buildApp();
    const sessionId = await initializeSession(app);

    const toolsList = await postMcp(app, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    }, sessionId);

    expect(toolsList.result.tools.some((tool: any) => tool.name === "create_mission")).toBe(true);

    const createMission = await postMcp(app, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "create_mission",
        arguments: {
          missionId: "mission-mcp",
          title: "MCP mission",
          repoKey: "iusung111/cloudflare-control-plane-director-mesh",
          ownerActor: "operator-mcp",
          phase: "plan",
        },
      },
    }, sessionId);

    expect(createMission.result.isError).toBe(false);
    expect(createMission.result.structuredContent.missionId).toBe("mission-mcp");

    const resourcesList = await postMcp(app, {
      jsonrpc: "2.0",
      id: 4,
      method: "resources/list",
    }, sessionId);

    expect(resourcesList.result.resources.some((resource: any) => resource.uri === "mission://mission-mcp/graph")).toBe(true);

    const graph = await postMcp(app, {
      jsonrpc: "2.0",
      id: 5,
      method: "resources/read",
      params: { uri: "mission://mission-mcp/graph" },
    }, sessionId);

    expect(graph.result.contents[0].text).toContain("\"missionId\": \"mission-mcp\"");
  });

  it("supports resource subscriptions and SSE drain notifications", async () => {
    const app = buildApp();
    const sessionId = await initializeSession(app);

    const subscribe = await postMcp(app, {
      jsonrpc: "2.0",
      id: 11,
      method: "resources/subscribe",
      params: { uri: "missions://active" },
    }, sessionId);
    expect(subscribe.result).toEqual({});

    await postMcp(app, {
      jsonrpc: "2.0",
      id: 12,
      method: "tools/call",
      params: {
        name: "create_mission",
        arguments: {
          missionId: "mission-notify",
          title: "Notify mission",
          repoKey: "iusung111/cloudflare-control-plane-director-mesh",
          ownerActor: "operator-notify",
        },
      },
    }, sessionId);

    const stream = await app.request("/mcp", {
      method: "GET",
      headers: {
        accept: "text/event-stream",
        "mcp-session-id": sessionId,
      },
    });

    expect(stream.status).toBe(200);
    expect(stream.headers.get("content-type")).toContain("text/event-stream");

    const body = await stream.text();
    expect(body).toContain("notifications/resources/list_changed");
    expect(body).toContain("notifications/resources/updated");
    expect(body).toContain("missions://active");
  });

  it("exposes alert resources and lifecycle tools over MCP", async () => {
    const app = buildApp();

    await postJson(app, "/api/sessions", {
      sessionId: "sess-mcp-alert",
      actorId: "user-mcp-alert",
      role: "delivery",
    }, 201);
    await postJson(app, "/api/leases", {
      leaseId: "lease-mcp-alert",
      sessionId: "sess-mcp-alert",
      resource: { repo: "iusung111/repo", branch: "main", path: "src/app.ts" },
    }, 201);
    await postJson(app, "/api/commands", {
      commandId: "cmd-mcp-alert",
      dedupKey: "dedup-mcp-alert",
      sessionId: "sess-mcp-alert",
      leaseId: "lease-mcp-alert",
      action: "deploy_live",
      resource: { repo: "iusung111/repo", branch: "main", path: "src/app.ts" },
      payload: {},
    });

    const sessionId = await initializeSession(app);

    const before = await postMcp(app, {
      jsonrpc: "2.0",
      id: 16,
      method: "resources/read",
      params: { uri: "alerts://current" },
    }, sessionId);
    expect(before.result.contents[0].text).toContain("cmd-mcp-alert");
    expect(before.result.contents[0].text).toContain("\"unread\": true");

    const read = await postMcp(app, {
      jsonrpc: "2.0",
      id: 17,
      method: "tools/call",
      params: {
        name: "read_alert",
        arguments: { alertId: "alert:cmd-mcp-alert" },
      },
    }, sessionId);
    expect(read.result.isError).toBe(false);
    expect(read.result.structuredContent.unread).toBe(false);

    const dismiss = await postMcp(app, {
      jsonrpc: "2.0",
      id: 18,
      method: "tools/call",
      params: {
        name: "dismiss_alert",
        arguments: { alertId: "alert:cmd-mcp-alert" },
      },
    }, sessionId);
    expect(dismiss.result.isError).toBe(false);
    expect(dismiss.result.structuredContent.dismissed).toBe(true);

    const current = await postMcp(app, {
      jsonrpc: "2.0",
      id: 19,
      method: "resources/read",
      params: { uri: "alerts://current" },
    }, sessionId);
    expect(current.result.contents[0].text).toContain("[]");

    const log = await postMcp(app, {
      jsonrpc: "2.0",
      id: 20,
      method: "resources/read",
      params: { uri: "alerts://log" },
    }, sessionId);
    expect(log.result.contents[0].text).toContain("\"dismissed\": true");
  });

  it("supports unread drain, Last-Event-ID replay, and session termination", async () => {
    const app = buildApp();
    const sessionId = await initializeSession(app);

    await postMcp(app, {
      jsonrpc: "2.0",
      id: 21,
      method: "resources/subscribe",
      params: { uri: "missions://active" },
    }, sessionId);

    await createMissionViaMcp(app, sessionId, "mission-replay-1");

    const firstStream = await app.request("/mcp", {
      method: "GET",
      headers: {
        accept: "text/event-stream",
        "mcp-session-id": sessionId,
      },
    });
    expect(firstStream.status).toBe(200);
    const firstBody = await firstStream.text();
    const firstIds = extractEventIds(firstBody);
    expect(firstIds.length).toBeGreaterThan(0);

    const secondStream = await app.request("/mcp", {
      method: "GET",
      headers: {
        accept: "text/event-stream",
        "mcp-session-id": sessionId,
      },
    });
    expect(await secondStream.text()).toBe("");

    await createMissionViaMcp(app, sessionId, "mission-replay-2");

    const resumed = await app.request("/mcp", {
      method: "GET",
      headers: {
        accept: "text/event-stream",
        "mcp-session-id": sessionId,
        "last-event-id": firstIds[0],
      },
    });
    const resumedBody = await resumed.text();
    expect(resumedBody).not.toBe("");
    expect(resumedBody).toContain("notifications/resources");
    expect(extractEventIds(resumedBody).every((id) => id > firstIds[0])).toBe(true);

    const deleted = await app.request("/mcp", {
      method: "DELETE",
      headers: { "mcp-session-id": sessionId },
    });
    expect(deleted.status).toBe(204);

    const afterDelete = await app.request("/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-session-id": sessionId,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 22, method: "ping" }),
    });
    expect(afterDelete.status).toBe(404);
  });

  it("keeps follow streams open and fans out updates to multiple subscribers", async () => {
    const app = buildApp();
    const sessionId = await initializeSession(app);

    await postMcp(app, {
      jsonrpc: "2.0",
      id: 41,
      method: "resources/subscribe",
      params: { uri: "missions://active" },
    }, sessionId);

    const firstStream = await app.request("/mcp?follow=1&heartbeatMs=1000", {
      method: "GET",
      headers: {
        accept: "text/event-stream",
        "mcp-session-id": sessionId,
      },
    });
    const secondStream = await app.request("/mcp?follow=1&heartbeatMs=1000", {
      method: "GET",
      headers: {
        accept: "text/event-stream",
        "mcp-session-id": sessionId,
      },
    });

    expect(firstStream.status).toBe(200);
    expect(secondStream.status).toBe(200);

    const firstReader = firstStream.body?.getReader();
    const secondReader = secondStream.body?.getReader();
    expect(firstReader).toBeTruthy();
    expect(secondReader).toBeTruthy();

    await createMissionViaMcp(app, sessionId, "mission-follow");

    const [firstBody, secondBody] = await Promise.all([
      readSseUntil(firstReader!, "missions://active"),
      readSseUntil(secondReader!, "missions://active"),
    ]);

    expect(firstBody).toContain("notifications/resources/list_changed");
    expect(firstBody).toContain("notifications/resources/updated");
    expect(secondBody).toContain("notifications/resources/list_changed");
    expect(secondBody).toContain("notifications/resources/updated");

    await Promise.all([firstReader!.cancel(), secondReader!.cancel()]);
  });
});

function buildApp() {
  const store = new MemoryControlPlaneStore();
  const services = createServices(undefined, { store });
  return createApp({ services });
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
  const sessionId = initialize.headers.get("Mcp-Session-Id") ?? initialize.headers.get("mcp-session-id");
  expect(sessionId).toBeTruthy();

  const initialized = await app.request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": sessionId!,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
  });

  expect(initialized.status).toBe(202);
  return sessionId!;
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

async function createMissionViaMcp(app: ReturnType<typeof buildApp>, sessionId: string, missionId: string) {
  return postMcp(app, {
    jsonrpc: "2.0",
    id: missionId,
    method: "tools/call",
    params: {
      name: "create_mission",
      arguments: {
        missionId,
        title: missionId,
        repoKey: "iusung111/cloudflare-control-plane-director-mesh",
        ownerActor: "operator-replay",
      },
    },
  }, sessionId);
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

function extractEventIds(body: string): string[] {
  return body
    .split("\n")
    .filter((line) => line.startsWith("id: "))
    .map((line) => line.slice(4).trim());
}

async function readSseUntil(reader: ReadableStreamDefaultReader<Uint8Array>, needle: string): Promise<string> {
  const decoder = new TextDecoder();
  let body = "";

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const chunk = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("sse_timeout")), 2000)),
    ]);

    if (chunk.done) {
      break;
    }

    body += decoder.decode(chunk.value, { stream: true });
    if (body.includes(needle)) {
      return body;
    }
  }

  throw new Error(`missing_sse_payload:${needle}`);
}
