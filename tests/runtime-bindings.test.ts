import { describe, expect, it, vi } from "vitest";
import { createApp } from "../apps/worker/src/create-app";
import { processControlQueueBatch } from "../apps/worker/src/queue/process-control-queue";
import { createServices, type WorkerEnv } from "../apps/worker/src/services";
import { MemoryControlPlaneStore } from "../packages/adapters/src/store/memory-control-plane.store";
import type { ControlQueueMessage } from "../packages/contracts/src";
import { ControlPlaneError } from "../packages/shared/src/control-plane-error";

describe("runtime bindings", () => {
  it("enqueues queued commands when a queue binding is configured", async () => {
    const store = new MemoryControlPlaneStore();
    const queue = new FakeQueue();
    const env = { CONTROL_QUEUE: queue as unknown as Queue<ControlQueueMessage> };
    const app = createBoundApp(store, env);
    const now = Date.now();
    const expiresAt = new Date(now + 30 * 60_000).toISOString();

    await store.putSession({
      sessionId: "sess-primary",
      actorId: "user-primary",
      role: "delivery",
      status: "active",
      createdAt: new Date(now).toISOString(),
      expiresAt,
    });
    await store.putSession({
      sessionId: "sess-secondary",
      actorId: "user-secondary",
      role: "reviewer",
      status: "active",
      createdAt: new Date(now).toISOString(),
      expiresAt,
    });
    await store.putLease({
      leaseId: "lease-primary",
      sessionId: "sess-primary",
      resource: { repo: "iusung111/repo", branch: "main", path: "src/conflict.ts" },
      status: "active",
      createdAt: new Date(now).toISOString(),
      expiresAt,
    });
    await store.putLease({
      leaseId: "lease-secondary",
      sessionId: "sess-secondary",
      resource: { repo: "iusung111/repo", branch: "main", path: "src/conflict.ts" },
      status: "active",
      createdAt: new Date(now).toISOString(),
      expiresAt,
    });

    const response = await app.request("/api/commands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        commandId: "cmd-queued",
        dedupKey: "dedup-queued",
        sessionId: "sess-primary",
        leaseId: "lease-primary",
        action: "github_write",
        resource: { repo: "iusung111/repo", branch: "main", path: "src/conflict.ts" },
        payload: { title: "queue me" },
      }),
    });

    expect(response.status).toBe(200);
    const command = await response.json() as { status: string };
    expect(command.status).toBe("queued");
    expect(queue.sent).toEqual([
      {
        kind: "retry-command",
        commandId: "cmd-queued",
        enqueuedAt: expect.any(String),
        reason: "resource_conflict_with_active_lease",
      },
      {
        kind: "alert-fanout",
        alertId: "alert:cmd-queued",
        enqueuedAt: expect.any(String),
        reason: "resource_conflict_with_active_lease",
      },
    ]);
  });

  it("syncs mission snapshots and deltas through the durable object binding", async () => {
    const store = new MemoryControlPlaneStore();
    const missionRoom = new FakeMissionRoomNamespace();
    const env = { MISSION_ROOM: missionRoom as unknown as DurableObjectNamespace };
    const app = createBoundApp(store, env);

    await postJson(app, "/api/missions", {
      missionId: "mission-live",
      title: "Live mission",
      repoKey: "iusung111/cloudflare-control-plane-director-mesh",
      ownerActor: "operator-1",
      phase: "plan",
    }, 201);

    await postJson(app, "/api/missions/mission-live/workers", {
      workerId: "worker-live",
      role: "builder",
      title: "Implement live sync",
      summary: "Push deltas to mission room",
      phase: "build",
      status: "running",
      progress: 50,
    }, 201);

    const live = await app.request("/api/missions/mission-live/live", {
      headers: { upgrade: "websocket" },
    });

    expect(live.status).toBe(200);
    expect(missionRoom.calls.map((call) => `${call.method} ${call.pathname}`)).toEqual([
      "POST /snapshot",
      "POST /delta",
      "GET /api/missions/mission-live/live",
    ]);
    expect(missionRoom.calls[0].body).toContain("\"type\":\"mission.snapshot\"");
    expect(missionRoom.calls[1].body).toContain("\"type\":\"worker.updated\"");
  });

  it("routes mcp sessions and notifications through the broker durable object binding", async () => {
    const store = new MemoryControlPlaneStore();
    const broker = new FakeMcpBrokerNamespace();
    const env = { MCP_BROKER: broker as unknown as DurableObjectNamespace };
    const app = createBoundApp(store, env);

    const initialize = await app.request("/mcp", {
      method: "POST",
      headers: {
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

    const subscribed = await app.request("/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-session-id": sessionId ?? "",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "resources/subscribe",
        params: { uri: "missions://active" },
      }),
    });
    expect(subscribed.status).toBe(200);

    const createMission = await app.request("/mcp", {
      method: "POST",
      headers: {
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
            missionId: "mission-broker",
            title: "Broker mission",
            repoKey: "iusung111/cloudflare-control-plane-director-mesh",
            ownerActor: "operator-broker",
          },
        },
      }),
    });
    expect(createMission.status).toBe(200);

    const stream = await app.request("/mcp", {
      method: "GET",
      headers: {
        accept: "text/event-stream",
        "mcp-session-id": sessionId ?? "",
      },
    });
    expect(stream.status).toBe(200);
    expect(await stream.text()).toContain("missions://active");
    expect(broker.calls.map((call) => `${call.method} ${call.pathname}`)).toContain("POST /initialize");
    expect(broker.calls.map((call) => `${call.method} ${call.pathname}`)).toContain("POST /notify");
    expect(broker.calls.map((call) => `${call.method} ${call.pathname}`)).toContain(`GET /session/${sessionId}/events`);
  });

  it("syncs approval and alert cache overlays through the control-state durable object binding", async () => {
    const store = new MemoryControlPlaneStore();
    const controlState = new FakeControlStateNamespace();
    const env = { CONTROL_STATE: controlState as unknown as DurableObjectNamespace };
    const app = createBoundApp(store, env);

    await postJson(app, "/api/approvals/scoped", {
      approvalId: "approval-cache",
      actorId: "operator-cache",
      action: "deploy_live",
      resource: { repo: "iusung111/repo", branch: "main", path: "ops/cache.txt" },
    }, 201);

    await store.putCommand({
      commandId: "cmd-alert-cache",
      dedupKey: "dedup-alert-cache",
      sessionId: "session-cache",
      leaseId: "lease-cache",
      action: "github_write",
      resource: { repo: "iusung111/repo", branch: "main", path: "ops/cache.txt" },
      conflictKey: "iusung111/repo:main:ops/cache.txt",
      payload: { missionId: "mission-cache" },
      status: "failed",
      latestReason: "failed_for_cache_test",
      attemptCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const approvals = await app.request("/api/approvals/scoped");
    expect(approvals.status).toBe(200);
    expect(await approvals.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ approvalId: "approval-cache" }),
    ]));

    const readAlert = await app.request("/api/alerts/alert:cmd-alert-cache/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(readAlert.status).toBe(200);

    const alerts = await app.request("/api/alerts");
    expect(alerts.status).toBe(200);
    expect(await alerts.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ alertId: "alert:cmd-alert-cache", unread: false }),
    ]));

    expect(controlState.calls.map((call) => `${call.method} ${call.pathname}`)).toEqual(expect.arrayContaining([
      "PUT /approvals/approval-cache",
      "GET /approvals",
      "PUT /alert-states/alert%3Acmd-alert-cache",
      "GET /alert-states",
    ]));
  });

  it("retries queued queue messages and acks terminal errors", async () => {
    const queuedMessage = new FakeQueueMessage({
      kind: "retry-command",
      commandId: "cmd-1",
      enqueuedAt: new Date().toISOString(),
    });
    const staleMessage = new FakeQueueMessage({
      kind: "retry-command",
      commandId: "cmd-2",
      enqueuedAt: new Date().toISOString(),
    });

    await processControlQueueBatch({
      queue: "control",
      messages: [queuedMessage, staleMessage],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    }, {
      commandLifecycle: {
        retry: vi.fn(async (commandId: string) => {
          if (commandId === "cmd-1") {
            return { commandId, status: "queued" };
          }

          throw new ControlPlaneError(404, "command_not_found");
        }),
      } as any,
    });

    expect(queuedMessage.acked).toBe(false);
    expect(queuedMessage.retried).toEqual({ delaySeconds: 30 });
    expect(staleMessage.acked).toBe(true);
    expect(staleMessage.retried).toBeUndefined();
  });
});

function createBoundApp(store: MemoryControlPlaneStore, env: Partial<WorkerEnv>) {
  const services = createServices(env as WorkerEnv, { store });
  return createApp({ services, env: env as WorkerEnv });
}

async function postJson(app: ReturnType<typeof createBoundApp>, path: string, body: unknown, status = 200) {
  const response = await app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  expect(response.status).toBe(status);
  return response.json();
}

class FakeQueue {
  sent: ControlQueueMessage[] = [];

  async send(message: ControlQueueMessage): Promise<void> {
    this.sent.push(message);
  }
}

class FakeMissionRoomNamespace {
  calls: Array<{ method: string; pathname: string; body: string }> = [];

  idFromName(): DurableObjectId {
    return {} as DurableObjectId;
  }

  get(): DurableObjectStub {
    return {
      id: {} as DurableObjectId,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        this.calls.push({
          method: request.method,
          pathname: new URL(request.url).pathname,
          body: await request.clone().text(),
        });
        return new Response("proxied", { status: 200 });
      },
      connect: () => {
        throw new Error("socket_connect_not_supported_in_test");
      },
    } as DurableObjectStub;
  }
}

class FakeMcpBrokerNamespace {
  calls: Array<{ method: string; pathname: string; body: string }> = [];
  private readonly sessions = new Map<string, FakeBrokerSession>();

  idFromName(): DurableObjectId {
    return {} as DurableObjectId;
  }

  get(): DurableObjectStub {
    return {
      id: {} as DurableObjectId,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const pathname = new URL(request.url).pathname;
        this.calls.push({
          method: request.method,
          pathname,
          body: await request.clone().text(),
        });
        return this.handle(request);
      },
      connect: () => {
        throw new Error("socket_connect_not_supported_in_test");
      },
    } as DurableObjectStub;
  }

  private async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "POST" && path === "/initialize") {
      const session = this.createSession();
      return Response.json({ session: this.summary(session) });
    }

    if (request.method === "POST" && path === "/notify") {
      const body = await request.json().catch(() => ({})) as {
        updatedResources?: string[];
        listChanged?: boolean;
      };
      for (const session of this.sessions.values()) {
        if (!session.initialized) {
          continue;
        }

        if (body.listChanged) {
          this.enqueue(session, { jsonrpc: "2.0", method: "notifications/resources/list_changed" });
        }

        for (const uri of body.updatedResources ?? []) {
          if (session.subscriptions.has(uri)) {
            this.enqueue(session, {
              jsonrpc: "2.0",
              method: "notifications/resources/updated",
              params: { uri },
            });
          }
        }
      }

      return Response.json({ ok: true });
    }

    const match = /^\/session\/([^/]+)(?:\/(initialized|subscribe|unsubscribe|events))?$/.exec(path);
    if (!match) {
      return new Response("broker", { status: 200 });
    }

    const sessionId = decodeURIComponent(match[1]);
    const action = match[2];
    const session = this.sessions.get(sessionId);

    if (!action && request.method === "GET") {
      return session
        ? Response.json({ session: this.summary(session) })
        : Response.json({ error: "session_not_found" }, { status: 404 });
    }

    if (!action && request.method === "DELETE") {
      if (!session) {
        return Response.json({ error: "session_not_found" }, { status: 404 });
      }
      this.sessions.delete(sessionId);
      return new Response(null, { status: 204 });
    }

    if (!session) {
      return Response.json({ error: "session_not_found" }, { status: 404 });
    }

    if (action === "initialized" && request.method === "POST") {
      session.initialized = true;
      session.updatedAt = new Date().toISOString();
      return Response.json({ session: this.summary(session) });
    }

    if ((action === "subscribe" || action === "unsubscribe") && request.method === "POST") {
      const body = await request.json().catch(() => ({})) as { uri?: string };
      if (!body.uri) {
        return Response.json({ error: "uri_required" }, { status: 400 });
      }
      if (action === "subscribe") {
        session.subscriptions.add(body.uri);
      } else {
        session.subscriptions.delete(body.uri);
      }
      session.updatedAt = new Date().toISOString();
      return Response.json({ session: this.summary(session) });
    }

    if (action === "events" && request.method === "GET") {
      const lastEventId = request.headers.get("last-event-id") ?? url.searchParams.get("lastEventId");
      const pending = session.events.filter((event) => event.id > (lastEventId ?? session.deliveredEventId ?? ""));
      if (pending.length > 0) {
        session.deliveredEventId = pending[pending.length - 1].id;
        session.updatedAt = new Date().toISOString();
      }
      const body = pending.map((event) => `id: ${event.id}\ndata: ${JSON.stringify(event.message)}\n\n`).join("");
      return new Response(body, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }

    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  private createSession(): FakeBrokerSession {
    const now = new Date().toISOString();
    const session: FakeBrokerSession = {
      id: crypto.randomUUID(),
      initialized: false,
      subscriptions: new Set<string>(),
      events: [],
      nextSequence: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  private enqueue(session: FakeBrokerSession, message: unknown): void {
    session.events.push({
      id: String(session.nextSequence++).padStart(12, "0"),
      message,
    });
    session.updatedAt = new Date().toISOString();
  }

  private summary(session: FakeBrokerSession) {
    return {
      id: session.id,
      initialized: session.initialized,
      subscriptions: Array.from(session.subscriptions),
      deliveredEventId: session.deliveredEventId,
      nextSequence: session.nextSequence,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }
}

interface FakeBrokerSession {
  id: string;
  initialized: boolean;
  subscriptions: Set<string>;
  events: Array<{ id: string; message: unknown }>;
  deliveredEventId?: string;
  nextSequence: number;
  createdAt: string;
  updatedAt: string;
}

class FakeQueueMessage implements Message<ControlQueueMessage> {
  readonly id = crypto.randomUUID();
  readonly timestamp = new Date();
  readonly attempts = 1;
  acked = false;
  retried?: QueueRetryOptions;

  constructor(readonly body: ControlQueueMessage) {}

  ack(): void {
    this.acked = true;
  }

  retry(options?: QueueRetryOptions): void {
    this.retried = options;
  }
}

class FakeControlStateNamespace {
  calls: Array<{ method: string; pathname: string; body: string }> = [];
  private readonly approvals = new Map<string, unknown>();
  private readonly alertStates = new Map<string, unknown>();

  idFromName(): DurableObjectId {
    return {} as DurableObjectId;
  }

  get(): DurableObjectStub {
    return {
      id: {} as DurableObjectId,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const url = new URL(request.url);
        const pathname = url.pathname;
        const body = await request.clone().text();
        this.calls.push({ method: request.method, pathname, body });

        const approvalMatch = /^\/approvals\/([^/]+)$/.exec(pathname);
        if (request.method === "GET" && pathname === "/approvals") {
          return Response.json(Array.from(this.approvals.values()));
        }
        if (request.method === "PUT" && approvalMatch) {
          const approval = JSON.parse(body);
          this.approvals.set(decodeURIComponent(approvalMatch[1]), approval);
          return Response.json(approval, { status: 201 });
        }
        if (request.method === "DELETE" && approvalMatch) {
          this.approvals.delete(decodeURIComponent(approvalMatch[1]));
          return new Response(null, { status: 204 });
        }

        const alertMatch = /^\/alert-states\/([^/]+)$/.exec(pathname);
        if (request.method === "GET" && pathname === "/alert-states") {
          return Response.json(Array.from(this.alertStates.values()));
        }
        if (request.method === "PUT" && alertMatch) {
          const state = JSON.parse(body);
          this.alertStates.set(decodeURIComponent(alertMatch[1]), state);
          return Response.json(state, { status: 201 });
        }

        return new Response("control_state", { status: 200 });
      },
      connect: () => {
        throw new Error("socket_connect_not_supported_in_test");
      },
    } as DurableObjectStub;
  }
}
