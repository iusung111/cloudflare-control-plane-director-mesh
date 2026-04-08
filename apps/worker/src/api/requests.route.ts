import { Hono } from "hono";
import type { AppServices } from "../services";
import { readJson, requireString } from "./http";

export function createRequestsRoute(services: AppServices): Hono {
  const app = new Hono();

  app.get("/", async (context) => context.json(await services.requestQuery.list({
    missionId: context.req.query("missionId") ?? undefined,
    queue: context.req.query("queue") as any,
    status: context.req.query("status") as any,
    q: context.req.query("q") ?? undefined,
  })));

  app.get("/:id", async (context) => context.json(await services.requestQuery.get(context.req.param("id"))));

  app.post("/", async (context) => {
    const body = await readJson<Record<string, unknown>>(context);
    const request = await services.submitRequest.execute({
      requestId: requireString(body.requestId, "request_id_required"),
      actorId: requireString(body.actorId, "request_actor_required"),
      source: typeof body.source === "string" ? body.source as any : undefined,
      queue: requireString(body.queue, "request_queue_required") as any,
      locale: typeof body.locale === "string" ? body.locale : undefined,
      title: requireString(body.title, "request_title_required"),
      prompt: requireString(body.prompt, "request_prompt_required"),
      missionId: typeof body.missionId === "string" ? body.missionId : undefined,
      relatedCommandId: typeof body.relatedCommandId === "string" ? body.relatedCommandId : undefined,
      targetUrl: typeof body.targetUrl === "string" ? body.targetUrl : undefined,
      selector: typeof body.selector === "string" ? body.selector : undefined,
      expectedText: typeof body.expectedText === "string" ? body.expectedText : undefined,
    });

    await services.queueDispatch.enqueueOperatorRequest(request.requestId, "new_operator_request");
    return context.json(request, 201);
  });

  app.post("/:id/claim", async (context) => {
    const body = await readJson<Record<string, unknown>>(context);
    return context.json(await services.requestLifecycle.claim({
      requestId: context.req.param("id"),
      owner: requireString(body.owner, "request_owner_required"),
    }));
  });

  app.post("/:id/heartbeat", async (context) => {
    const body = await readJson<Record<string, unknown>>(context);
    return context.json(await services.requestLifecycle.heartbeat(
      context.req.param("id"),
      requireString(body.owner, "request_owner_required"),
    ));
  });

  app.post("/:id/status", async (context) => {
    const body = await readJson<Record<string, unknown>>(context);
    return context.json(await services.requestLifecycle.updateStatus({
      requestId: context.req.param("id"),
      status: requireString(body.status, "request_status_required") as any,
      owner: typeof body.owner === "string" ? body.owner : undefined,
      resultSummary: typeof body.resultSummary === "string" ? body.resultSummary : undefined,
      lastError: typeof body.lastError === "string" ? body.lastError : undefined,
    }));
  });

  return app;
}
