import { describe, expect, it, vi } from "vitest";
import { createApp } from "../apps/worker/src/create-app";
import { processControlQueueBatch } from "../apps/worker/src/queue/process-control-queue";
import { createServices, type WorkerEnv } from "../apps/worker/src/services";
import { MemoryControlPlaneStore } from "../packages/adapters/src/store/memory-control-plane.store";
import type { ControlQueueMessage } from "../packages/contracts/src";

describe("operator requests and chatgpt app mcp", () => {
  it("queues operator requests and supports claim plus status updates", async () => {
    const { app, services } = buildApp();

    const created = await postJson<any>(app, "/api/requests", {
      requestId: "request-1",
      actorId: "operator-1",
      queue: "llm",
      title: "Plan rollout",
      prompt: "Send this to the main orchestrator queue",
    }, 201);
    expect(created.status).toBe("received");

    const dispatchMessage = new FakeQueueMessage({
      kind: "dispatch-operator-request",
      requestId: "request-1",
      enqueuedAt: new Date().toISOString(),
    }, 1);

    await processControlQueueBatch({
      queue: "control",
      messages: [dispatchMessage],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    }, {
      commandLifecycle: services.commandLifecycle,
      requestLifecycle: services.requestLifecycle,
    });

    const queued = await getJson<any>(app, "/api/requests/request-1");
    expect(queued.status).toBe("queued_for_orchestrator");

    const claimed = await postJson<any>(app, "/api/requests/request-1/claim", {
      owner: "orchestrator-1",
    });
    expect(claimed.status).toBe("claimed");

    const completed = await postJson<any>(app, "/api/requests/request-1/status", {
      status: "completed",
      owner: "orchestrator-1",
      resultSummary: "completed from orchestrator",
    });
    expect(completed.status).toBe("completed");

    const summary = await getJson<any>(app, "/api/state/summary");
    expect(summary.requests.queuedForOrchestrator).toBe(0);
  });

  it("exposes a no-auth chatgpt app endpoint with request submission only", async () => {
    const { app } = buildApp({
      CONTROL_PLANE_OPERATOR_TOKEN: "operator-token",
      CONTROL_PLANE_VIEWER_TOKEN: "viewer-token",
      CONTROL_PLANE_APP_PASSWORD: "console-password",
      CONTROL_PLANE_COOKIE_SECRET: "cookie-secret",
    });

    const initialize = await postJsonRpc(app, "/mcp/app", {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
    });
    expect(initialize.status).toBe(200);
    const sessionId = initialize.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();

    await postJsonRpc(app, "/mcp/app", {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }, sessionId ?? undefined);

    const tools = await postJsonRpc(app, "/mcp/app", {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    }, sessionId ?? undefined);
    const parsedTools = await tools.json() as any;
    expect(parsedTools.result.tools).toHaveLength(1);
    expect(parsedTools.result.tools[0].name).toBe("submit_operator_request");

    const resources = await postJsonRpc(app, "/mcp/app", {
      jsonrpc: "2.0",
      id: 3,
      method: "resources/list",
    }, sessionId ?? undefined);
    const parsedResources = await resources.json() as any;
    expect(parsedResources.result.resources.some((resource: any) => resource.uri === "requests://active")).toBe(true);

    const submitted = await postJsonRpc(app, "/mcp/app", {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "submit_operator_request",
        arguments: {
          requestId: "request-app-1",
          actorId: "chatgpt-user",
          source: "chatgpt_app",
          queue: "approval",
          locale: "en",
          title: "approval button request",
          prompt: "queue a browser approval action for the orchestrator",
        },
      },
    }, sessionId ?? undefined);
    const parsedSubmitted = await submitted.json() as any;
    expect(parsedSubmitted.result.structuredContent.requestId).toBe("request-app-1");

    const list = await getJson<any[]>(app, "/api/requests", {
      Authorization: "Bearer operator-token",
    });
    expect(list.some((request) => request.requestId === "request-app-1")).toBe(true);
  });
});

function buildApp(env?: WorkerEnv) {
  const store = new MemoryControlPlaneStore();
  const services = createServices(env, { store });
  return { app: createApp({ env, services }), services };
}

async function getJson<T>(app: ReturnType<typeof createApp>, url: string, headers?: Record<string, string>): Promise<T> {
  const response = await app.request(url, { headers });
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

async function postJsonRpc(
  app: ReturnType<typeof createApp>,
  url: string,
  body: unknown,
  sessionId?: string,
) {
  return app.request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify(body),
  });
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
