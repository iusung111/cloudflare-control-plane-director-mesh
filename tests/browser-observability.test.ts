import { describe, expect, it, vi } from "vitest";
import { createApp } from "../apps/worker/src/create-app";
import { processControlQueueBatch } from "../apps/worker/src/queue/process-control-queue";
import { createServices } from "../apps/worker/src/services";
import { MemoryControlPlaneStore } from "../packages/adapters/src/store/memory-control-plane.store";
import type { ControlQueueMessage } from "../packages/contracts/src";

describe("browser queue and observability", () => {
  it("completes browser_check commands through the queue and surfaces evidence", async () => {
    const store = new MemoryControlPlaneStore();
    const services = createServices(undefined, { store });
    services.browserQa = {
      execute: vi.fn(async () => ({
        url: "https://example.com",
        statusCode: 200,
        matchedText: true,
        selector: "h1",
        summary: "Verified Example Domain",
        checkedAt: new Date().toISOString(),
      })),
    } as any;
    const app = createApp({ services });

    await postJson(app, "/api/sessions", {
      sessionId: "sess-browser",
      actorId: "user-browser",
      role: "delivery",
    }, 201);
    await postJson(app, "/api/leases", {
      leaseId: "lease-browser",
      sessionId: "sess-browser",
      resource: { repo: "iusung111/repo", branch: "main", path: "ops/browser.txt" },
    }, 201);
    await postJson(app, "/api/missions", {
      missionId: "mission-browser",
      title: "Browser QA mission",
      repoKey: "iusung111/repo",
      ownerActor: "operator-browser",
    }, 201);

    const command = await postJson<any>(app, "/api/commands", {
      commandId: "cmd-browser",
      dedupKey: "dedup-browser",
      sessionId: "sess-browser",
      leaseId: "lease-browser",
      action: "browser_check",
      resource: { repo: "iusung111/repo", branch: "main", path: "ops/browser.txt" },
      payload: {
        missionId: "mission-browser",
        url: "https://example.com",
        expectedText: "Example Domain",
        selector: "h1",
      },
    });

    expect(command.status).toBe("queued");

    const executeMessage = new FakeQueueMessage({
      kind: "execute-command",
      commandId: "cmd-browser",
      action: "browser_check",
      enqueuedAt: new Date().toISOString(),
    }, 1);

    await processControlQueueBatch({
      queue: "control",
      messages: [executeMessage],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    }, services);

    const stored = await getJson<any>(app, "/api/commands/cmd-browser");
    expect(stored.status).toBe("completed");
    expect(stored.result.summary).toContain("Verified");

    const evidence = await getJson<any>(app, "/api/missions/mission-browser/evidence");
    expect(evidence.browserEvidence).toHaveLength(1);
    expect(evidence.browserEvidence[0].commandId).toBe("cmd-browser");

    const observability = await getJson<any>(app, "/api/observability");
    expect(observability.metrics.browserQaDurationMs).toBeGreaterThanOrEqual(0);
    expect(observability.logFields).toContain("traceId");
  });

  it("renders the expanded console shell panels and korean approval buttons", async () => {
    const app = createApp({ services: createServices(undefined, { store: new MemoryControlPlaneStore() }) });
    const response = await app.request("/app");
    const html = await response.text();

    expect(html).toContain("Sessions / Leases");
    expect(html).toContain("Operator Requests");
    expect(html).toContain("Handoff Inspector");
    expect(html).toContain("Evidence Drawer");
    expect(html).toContain("요청 큐 적재");
    expect(html).toContain("승인");
  });
});

async function getJson<T>(app: ReturnType<typeof createApp>, url: string): Promise<T> {
  const response = await app.request(url);
  expect(response.status).toBe(200);
  return response.json() as Promise<T>;
}

async function postJson<T>(app: ReturnType<typeof createApp>, url: string, body: unknown, expectedStatus = 200): Promise<T> {
  const response = await app.request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(expectedStatus);
  return response.json() as Promise<T>;
}

class FakeQueueMessage implements Message<ControlQueueMessage> {
  readonly id = crypto.randomUUID();
  readonly timestamp = new Date();
  acked = false;
  retried?: QueueRetryOptions;

  constructor(
    readonly body: ControlQueueMessage,
    readonly attempts: number,
  ) {}

  ack(): void {
    this.acked = true;
  }

  retry(options?: QueueRetryOptions): void {
    this.retried = options;
  }
}
