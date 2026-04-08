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
    expect(queue.sent).toEqual([{
      kind: "retry-command",
      commandId: "cmd-queued",
      enqueuedAt: expect.any(String),
      reason: "resource_conflict_with_active_lease",
    }]);
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
