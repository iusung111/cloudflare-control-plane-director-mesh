import { describe, expect, it } from "vitest";
import { createApp } from "../apps/worker/src/create-app";
import { createServices, type WorkerEnv } from "../apps/worker/src/services";
import { MemoryControlPlaneStore } from "../packages/adapters/src/store/memory-control-plane.store";

describe("control plane auth", () => {
  it("redirects browser requests to login and accepts signed-cookie login", async () => {
    const app = buildApp({
      CONTROL_PLANE_OPERATOR_TOKEN: "operator-token",
      CONTROL_PLANE_APP_PASSWORD: "console-password",
      CONTROL_PLANE_COOKIE_SECRET: "cookie-secret",
    });

    const unauthenticated = await app.request("/app", {
      headers: { accept: "text/html" },
    });
    expect(unauthenticated.status).toBe(302);
    expect(unauthenticated.headers.get("location")).toContain("/login?next=%2Fapp");

    const login = await app.request("/login?next=%2Fapp", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "password=console-password",
    });
    expect(login.status).toBe(302);
    expect(login.headers.get("set-cookie")).toContain("control_plane_session=");

    const html = await app.request("/app", {
      headers: {
        accept: "text/html",
        cookie: login.headers.get("set-cookie") ?? "",
      },
    });
    expect(html.status).toBe(200);
    expect(await html.text()).toContain("Control Plane Director Mesh");
  });

  it("allows viewer reads but blocks mutating api and mcp tool calls", async () => {
    const app = buildApp({
      CONTROL_PLANE_OPERATOR_TOKEN: "operator-token",
      CONTROL_PLANE_VIEWER_TOKEN: "viewer-token",
      CONTROL_PLANE_COOKIE_SECRET: "cookie-secret",
    });

    const commands = await app.request("/api/commands", {
      headers: { authorization: "Bearer viewer-token" },
    });
    expect(commands.status).toBe(200);

    const createSession = await app.request("/api/sessions", {
      method: "POST",
      headers: {
        authorization: "Bearer viewer-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sessionId: "sess-viewer",
        actorId: "viewer",
        role: "delivery",
      }),
    });
    expect(createSession.status).toBe(403);

    const initialize = await app.request("/mcp", {
      method: "POST",
      headers: {
        authorization: "Bearer viewer-token",
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
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
    const sessionId = initialize.headers.get("Mcp-Session-Id");
    expect(sessionId).toBeTruthy();

    const initialized = await app.request("/mcp", {
      method: "POST",
      headers: {
        authorization: "Bearer viewer-token",
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-session-id": sessionId ?? "",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    });
    expect(initialized.status).toBe(202);

    const resources = await app.request("/mcp", {
      method: "POST",
      headers: {
        authorization: "Bearer viewer-token",
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-session-id": sessionId ?? "",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "resources/list",
      }),
    });
    expect(resources.status).toBe(200);

    const toolCall = await app.request("/mcp", {
      method: "POST",
      headers: {
        authorization: "Bearer viewer-token",
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-session-id": sessionId ?? "",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "create_mission",
          arguments: {
            missionId: "mission-auth",
            title: "Blocked by viewer auth",
            repoKey: "iusung111/cloudflare-control-plane-director-mesh",
            ownerActor: "viewer",
          },
        },
      }),
    });
    expect(toolCall.status).toBe(403);
    const body = await toolCall.json() as { error: { message: string } };
    expect(body.error.message).toBe("forbidden");
  });
});

function buildApp(env: Partial<WorkerEnv>) {
  const store = new MemoryControlPlaneStore();
  const services = createServices(env as WorkerEnv, { store });
  return createApp({ env: env as WorkerEnv, services });
}
