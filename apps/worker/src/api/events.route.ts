import { Hono } from "hono";
import type { AppServices } from "../services";

export function createEventsRoute(services: AppServices): Hono {
  const app = new Hono();

  app.get("/", async (context) => {
    const limit = Number(context.req.query("limit") ?? "20");
    return context.json(await services.events.execute(Number.isFinite(limit) ? limit : 20));
  });

  app.get("/:id", async (context) => context.json(await services.eventDetail.execute(context.req.param("id"))));

  return app;
}
