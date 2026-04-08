import { Hono } from "hono";
import type { AppServices } from "../services";
import { optionalNumber, readJson, requireString } from "./http";

export function createSessionsRoute(services: AppServices): Hono {
  const app = new Hono();

  app.get("/", async (context) => context.json(await services.sessions.list()));

  app.post("/", async (context) => {
    const body = await readJson<Record<string, unknown>>(context);
    const session = await services.sessions.issue({
      sessionId: requireString(body.sessionId, "session_id_required"),
      actorId: requireString(body.actorId, "actor_id_required"),
      role: requireString(body.role, "session_role_required") as "delivery" | "reliability" | "reviewer",
      ttlMinutes: optionalNumber(body.ttlMinutes),
    });
    return context.json(session, 201);
  });

  app.post("/:id/renew", async (context) => {
    const body = await readJson<Record<string, unknown>>(context)
      .catch(() => ({}) as Record<string, unknown>);
    const session = await services.sessions.renew(context.req.param("id"), optionalNumber(body.ttlMinutes));
    return context.json(session);
  });

  app.post("/:id/revoke", async (context) => context.json(await services.sessions.revoke(context.req.param("id"))));

  return app;
}
