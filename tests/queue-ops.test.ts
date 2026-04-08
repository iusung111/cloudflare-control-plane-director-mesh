import { describe, expect, it } from "vitest";
import { createApp } from "../apps/worker/src/create-app";
import { createServices } from "../apps/worker/src/services";
import { MemoryControlPlaneStore } from "../packages/adapters/src/store/memory-control-plane.store";

describe("queue ops", () => {
  it("lists dead letters and supports requeue and dismiss operations", async () => {
    const store = new MemoryControlPlaneStore();
    const services = createServices(undefined, { store });
    const app = createApp({ services });

    await postJson(app, "/api/sessions", {
      sessionId: "sess-primary",
      actorId: "user-primary",
      role: "delivery",
    }, 201);
    await postJson(app, "/api/sessions", {
      sessionId: "sess-secondary",
      actorId: "user-secondary",
      role: "reviewer",
    }, 201);

    await postJson(app, "/api/leases", {
      leaseId: "lease-primary",
      sessionId: "sess-primary",
      resource: { repo: "iusung111/repo", branch: "main", path: "src/dlq.ts" },
    }, 201);

    const now = new Date();
    await store.putLease({
      leaseId: "lease-secondary",
      sessionId: "sess-secondary",
      resource: { repo: "iusung111/repo", branch: "main", path: "src/dlq.ts" },
      status: "active",
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
    });

    await postJson(app, "/api/commands", {
      commandId: "cmd-dlq-requeue",
      dedupKey: "dedup-dlq-requeue",
      sessionId: "sess-primary",
      leaseId: "lease-primary",
      action: "github_write",
      resource: { repo: "iusung111/repo", branch: "main", path: "src/dlq.ts" },
      payload: { title: "blocked by lease conflict" },
    });
    await services.commandLifecycle.fail("cmd-dlq-requeue", "retry_exhausted");

    await postJson(app, "/api/commands", {
      commandId: "cmd-dlq-dismiss",
      dedupKey: "dedup-dlq-dismiss",
      sessionId: "sess-primary",
      leaseId: "lease-primary",
      action: "github_write",
      resource: { repo: "iusung111/repo", branch: "main", path: "src/dlq.ts" },
      payload: { title: "dismiss me" },
    });
    await services.commandLifecycle.fail("cmd-dlq-dismiss", "retry_exhausted");

    const initialDlq = await getJson<any[]>(app, "/api/queue/dlq");
    expect(initialDlq.map((command) => command.commandId)).toEqual([
      "cmd-dlq-dismiss",
      "cmd-dlq-requeue",
    ]);

    const summary = await getJson<{ queued: number; deadLetters: number }>(app, "/api/queue/summary");
    expect(summary.deadLetters).toBe(2);

    await postJson(app, "/api/leases/lease-secondary/release", {});

    const requeued = await postJson(app, "/api/queue/dlq/cmd-dlq-requeue/requeue", {});
    expect(requeued.status).toBe("completed");

    const dismissed = await postJson(app, "/api/queue/dlq/cmd-dlq-dismiss/dismiss", {});
    expect(dismissed.status).toBe("cancelled");

    const finalDlq = await getJson<any[]>(app, "/api/queue/dlq");
    expect(finalDlq).toHaveLength(0);
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
