import { Hono } from "hono";
import type {
  AcquireLeaseInput,
  CommandRequest,
  IssueSessionInput,
} from "../../../../packages/contracts/src";
import { asControlPlaneError } from "../../../../packages/shared/src/control-plane-error";
import { callMcpTool, listMcpResources, MCP_RESOURCE_TEMPLATES, MCP_TOOLS, readMcpResource } from "../mcp/catalog";
import { errorResponse, isJsonRpcNotification, isJsonRpcRequest, isJsonRpcResponse, MCP_PROTOCOL_VERSION, okResponse, type JsonRpcId, type JsonRpcRequest, type JsonRpcResponse } from "../mcp/protocol";
import { createSession, drainSessionEvents, enqueueMutationNotifications, followSessionEvents, getSession, markSessionInitialized, subscribeToResource, terminateSession, unsubscribeFromResource } from "../mcp/session-store";
import type { AppServices } from "../services";
import { readJson } from "../api/http";

const DEFAULT_SSE_HEARTBEAT_MS = 15000;

export function createMcpRouter(services: AppServices): Hono {
  const app = new Hono();

  app.get("/", async (context) => {
    if (wantsEventStream(context.req.header("accept"))) {
      const sessionId = context.req.header("mcp-session-id") ?? context.req.header("Mcp-Session-Id");
      if (!sessionId) {
        return context.json({ error: "mcp_session_id_required" }, 400);
      }

      if (!getSession(sessionId)) {
        return context.json({ error: "mcp_session_not_found" }, 404);
      }

      const body = streamSessionEvents(sessionId, {
        lastEventId: context.req.header("last-event-id") ?? context.req.header("Last-Event-ID"),
        follow: wantsFollowStream(context.req.query("follow")),
        heartbeatMs: heartbeatMs(context.req.query("heartbeatMs")),
        abortSignal: context.req.raw.signal,
      });
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
          "content-encoding": "identity",
        },
      });
    }

    return context.json({
      protocol: "thin-http-gateway",
      transport: "streamable-http-json-rpc",
      tools: MCP_TOOLS.map((tool) => tool.name),
      resources: (await listMcpResources(services)).map((resource) => resource.uri),
    });
  });

  app.delete("/", (context) => {
    const sessionId = context.req.header("mcp-session-id") ?? context.req.header("Mcp-Session-Id");
    if (!sessionId) {
      return context.json({ error: "mcp_session_id_required" }, 400);
    }

    return terminateSession(sessionId)
      ? new Response(null, { status: 204 })
      : context.json({ error: "mcp_session_not_found" }, 404);
  });

  app.post("/", async (context) => {
    const payload = await context.req.json().catch(() => undefined);
    if (payload === undefined) {
      return context.json(errorResponse(null, -32700, "Parse error"), 400);
    }

    const sessionId = context.req.header("mcp-session-id") ?? context.req.header("Mcp-Session-Id");
    const response = Array.isArray(payload)
      ? await handleBatch(payload, sessionId, services)
      : await handleMessage(payload, sessionId, services);

    if (response.status === 200 && response.sessionId) {
      context.header("Mcp-Session-Id", response.sessionId);
    }

    return response.body === null
      ? new Response(null, { status: response.status })
      : context.json(response.body, response.status as 200 | 202 | 400 | 404);
  });

  app.get("/resources/state-summary", async (context) => context.json(await services.stateSummary.execute()));
  app.get("/resources/events-recent", async (context) => context.json(await services.events.execute(20)));
  app.get("/resources/queue-active", async (context) => context.json(await services.queueOverview.execute()));
  app.get("/resources/learnings-recent", async (context) => context.json(await services.learningQuery.list()));
  app.get("/resources/retro-summary", async (context) => context.json(await services.retro.execute()));
  app.get("/resources/quality-summary", async (context) => context.json(await services.quality.execute()));
  app.get("/resources/release-gate", async (context) => context.json(await services.releaseGate.execute()));
  app.get("/resources/sessions-active", async (context) => context.json(await services.sessions.list()));
  app.get("/resources/leases-active", async (context) => context.json(await services.leases.list()));
  app.get("/resources/alerts-current", async (context) => context.json(await services.alerts.listCurrent()));
  app.get("/resources/alerts-log", async (context) => context.json(await services.alerts.listLog()));
  app.get("/resources/missions-active", async (context) => context.json(await services.missions.list()));
  app.get("/resources/mission-graph/:id", async (context) => context.json(await services.missionQuery.getGraph(context.req.param("id"))));
  app.get("/resources/mission-live-graph/:id", async (context) => context.json(await services.missionQuery.getLiveGraph(context.req.param("id"))));
  app.get("/resources/mission-workers/:id", async (context) => context.json(await services.missionQuery.listWorkers(context.req.param("id"))));
  app.get("/resources/mission-handoffs/:id", async (context) => context.json(await services.missionQuery.listHandoffs(context.req.param("id"))));
  app.get("/resources/mission-playback/:id", async (context) => context.json(await services.missionQuery.listPlayback(context.req.param("id"))));
  app.get("/resources/mission-learnings/:id", async (context) => context.json(await services.learningQuery.list({ missionId: context.req.param("id") })));
  app.get("/resources/mission-retro/:id", async (context) => context.json(await services.retro.execute({ missionId: context.req.param("id") })));

  app.post("/tools/submit-command", async (context) => context.json(await services.commands.execute(await readJson<CommandRequest>(context))));
  app.post("/tools/issue-session", async (context) => context.json(await services.sessions.issue(await readJson<IssueSessionInput>(context)), 201));
  app.post("/tools/create-mission", async (context) => context.json(await services.missions.create(await readJson<Record<string, unknown>>(context) as any), 201));
  app.post("/tools/upsert-worker", async (context) => context.json(await services.missionActivity.upsertWorker(await readJson<Record<string, unknown>>(context) as any), 201));
  app.post("/tools/record-handoff", async (context) => context.json(await services.missionActivity.recordHandoff(await readJson<Record<string, unknown>>(context) as any), 201));
  app.post("/tools/capture-learning", async (context) => context.json(await services.captureLearning.execute(await readJson<Record<string, unknown>>(context) as any), 201));
  app.post("/tools/read-alert", async (context) => {
    const body = await readJson<{ alertId: string }>(context);
    return context.json(await services.alerts.markRead(body.alertId));
  });
  app.post("/tools/dismiss-alert", async (context) => {
    const body = await readJson<{ alertId: string }>(context);
    return context.json(await services.alerts.dismiss(body.alertId));
  });
  app.post("/tools/acquire-lease", async (context) => context.json(await services.leases.acquire(await readJson<AcquireLeaseInput>(context)), 201));
  app.post("/tools/release-lease", async (context) => {
    const body = await readJson<{ leaseId: string }>(context);
    return context.json(await services.leases.release(body.leaseId));
  });
  app.post("/tools/approve-run", async (context) => {
    const body = await readJson<{ commandId: string }>(context);
    return context.json(await services.commandLifecycle.approve(body.commandId));
  });
  app.post("/tools/reject-run", async (context) => {
    const body = await readJson<{ commandId: string; reason?: string }>(context);
    return context.json(await services.commandLifecycle.reject(body.commandId, body.reason));
  });
  app.post("/tools/retry-run", async (context) => {
    const body = await readJson<{ commandId: string }>(context);
    return context.json(await services.commandLifecycle.retry(body.commandId));
  });
  app.post("/tools/cancel-run", async (context) => {
    const body = await readJson<{ commandId: string; reason?: string }>(context);
    return context.json(await services.commandLifecycle.cancel(body.commandId, body.reason));
  });
  app.post("/tools/set-yolo-mode", async (context) => context.json(await services.yoloMode.set(await readJson<{ enabled: boolean; updatedBy: string; note?: string }>(context))));

  return app;
}

async function handleBatch(
  messages: unknown[],
  sessionId: string | null | undefined,
  services: AppServices,
): Promise<{ status: number; body: JsonRpcResponse[] | null; sessionId?: string }> {
  if (messages.length === 0) {
    return { status: 400, body: [errorResponse(null, -32600, "Invalid Request")] };
  }

  const responses: JsonRpcResponse[] = [];
  let createdSessionId: string | undefined;
  for (const message of messages) {
    const handled = await handleMessage(message, sessionId, services);
    if (handled.body && !Array.isArray(handled.body)) {
      responses.push(handled.body);
    }
    createdSessionId ??= handled.sessionId;
  }

  return responses.length === 0
    ? { status: 202, body: null, sessionId: createdSessionId }
    : { status: 200, body: responses, sessionId: createdSessionId };
}

async function handleMessage(
  message: unknown,
  sessionId: string | null | undefined,
  services: AppServices,
): Promise<{ status: number; body: JsonRpcResponse | null; sessionId?: string }> {
  if (isJsonRpcResponse(message)) {
    return { status: 202, body: null };
  }
  if (!isJsonRpcRequest(message)) {
    return { status: 400, body: errorResponse(null, -32600, "Invalid Request") };
  }

  if (message.method === "initialize") {
    const session = createSession();
    return {
      status: 200,
      sessionId: session.id,
      body: okResponse(message.id ?? null, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          resources: { subscribe: true, listChanged: true },
          tools: {},
        },
        serverInfo: {
          name: "cloudflare-control-plane-director-mesh",
          version: "0.1.0",
        },
      }),
    };
  }

  if (!sessionId) {
    return { status: 400, body: errorResponse(message.id ?? null, -32000, "Mcp-Session-Id header is required") };
  }

  const session = getSession(sessionId);
  if (!session) {
    return { status: 404, body: errorResponse(message.id ?? null, -32001, "Session not found") };
  }

  if (message.method === "notifications/initialized") {
    markSessionInitialized(sessionId);
    return { status: 202, body: null };
  }

  if (!session.initialized && message.method !== "ping") {
    return { status: 400, body: errorResponse(message.id ?? null, -32002, "Session is not initialized") };
  }

  if (isJsonRpcNotification(message)) {
    return { status: 202, body: null };
  }

  const request = message as JsonRpcRequest;

  try {
    switch (request.method) {
      case "ping":
        return { status: 200, body: okResponse(request.id ?? null, {}) };
      case "tools/list":
        return { status: 200, body: okResponse(request.id ?? null, { tools: MCP_TOOLS }) };
      case "tools/call":
        return { status: 200, body: await handleToolCall(request, services) };
      case "resources/list":
        return { status: 200, body: okResponse(request.id ?? null, { resources: await listMcpResources(services) }) };
      case "resources/templates/list":
        return { status: 200, body: okResponse(request.id ?? null, { resourceTemplates: MCP_RESOURCE_TEMPLATES }) };
      case "resources/read":
        return { status: 200, body: await handleResourceRead(request, services) };
      case "resources/subscribe":
        subscribeToResource(sessionId, requireUri(request.params));
        return { status: 200, body: okResponse(request.id ?? null, {}) };
      case "resources/unsubscribe":
        unsubscribeFromResource(sessionId, requireUri(request.params));
        return { status: 200, body: okResponse(request.id ?? null, {}) };
      default:
        return { status: 400, body: errorResponse(request.id ?? null, -32601, "Method not found", { method: request.method }) };
    }
  } catch (error) {
    const controlPlaneError = asControlPlaneError(error);
    return { status: controlPlaneError.status, body: errorResponse(request.id ?? null, -32603, controlPlaneError.code, controlPlaneError.details) };
  }
}

async function handleToolCall(message: JsonRpcRequest, services: AppServices): Promise<JsonRpcResponse> {
  const params = asRecord(message.params);
  const name = typeof params.name === "string" ? params.name : "";
  const args = asRecord(params.arguments);

  try {
    const result = await callMcpTool(services, name, args);
    enqueueMutationNotifications({
      updatedResources: result.updatedResources,
      listChanged: result.listChanged,
    });

    return okResponse(message.id ?? null, {
      content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
      structuredContent: result.data,
      isError: false,
    });
  } catch (error) {
    const controlPlaneError = asControlPlaneError(error);
    return okResponse(message.id ?? null, {
      content: [{ type: "text", text: JSON.stringify({ error: controlPlaneError.code, details: controlPlaneError.details }, null, 2) }],
      isError: true,
    });
  }
}

async function handleResourceRead(message: JsonRpcRequest, services: AppServices): Promise<JsonRpcResponse> {
  const uri = requireUri(message.params);
  const resource = await readMcpResource(services, uri);
  return okResponse(message.id ?? null, {
    contents: [{
      uri,
      mimeType: "application/json",
      text: JSON.stringify(resource, null, 2),
    }],
  });
}

function requireUri(params: unknown): string {
  const record = asRecord(params);
  if (typeof record.uri !== "string") {
    throw new Error("uri_required");
  }
  return record.uri;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function wantsEventStream(acceptHeader: string | undefined): boolean {
  return acceptHeader?.includes("text/event-stream") ?? false;
}

function wantsFollowStream(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

function heartbeatMs(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : DEFAULT_SSE_HEARTBEAT_MS;
}

function streamSessionEvents(sessionId: string, options: {
  lastEventId?: string | null;
  follow: boolean;
  heartbeatMs: number;
  abortSignal?: AbortSignal;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  if (!options.follow) {
    const events = drainSessionEvents(sessionId, options.lastEventId);
    return new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(formatSseEvent(event.id, event.message)));
        }
        controller.close();
      },
    });
  }

  let cancelStream = () => {};
  return new ReadableStream({
    async start(controller) {
      const follower = followSessionEvents(sessionId, options.lastEventId);
      if (!follower) {
        controller.close();
        return;
      }

      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      const close = () => {
        if (closed) {
          return;
        }
        closed = true;
        clearInterval(heartbeat);
        options.abortSignal?.removeEventListener("abort", close);
        follower.close();
        try {
          controller.close();
        } catch {}
      };
      cancelStream = close;

      heartbeat = setInterval(() => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          close();
        }
      }, options.heartbeatMs);

      options.abortSignal?.addEventListener("abort", close, { once: true });

      try {
        while (!closed) {
          const batch = await follower.read();
          if (batch === null) {
            break;
          }
          for (const event of batch) {
            controller.enqueue(encoder.encode(formatSseEvent(event.id, event.message)));
          }
        }
      } finally {
        close();
      }
    },
    cancel() {
      cancelStream();
    },
  });
}

function formatSseEvent(id: string, message: unknown): string {
  return `id: ${id}\ndata: ${JSON.stringify(message)}\n\n`;
}
