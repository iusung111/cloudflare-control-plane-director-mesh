import { Hono } from "hono";
import type { AppServices } from "../services";

export function createAlertsRoute(services: AppServices): Hono {
  const app = new Hono();

  app.get("/", async (context) => context.json(await services.alerts.listCurrent()));
  app.get("/log", async (context) => context.json(await services.alerts.listLog()));
  app.post("/:id/read", async (context) => context.json(await services.alerts.markRead(context.req.param("id"))));
  app.post("/:id/dismiss", async (context) => context.json(await services.alerts.dismiss(context.req.param("id"))));
  app.get("/:id/target", async (context) => context.json(await services.alerts.getTarget(context.req.param("id"))));

  return app;
}
