import { Hono } from "hono";
import type { AppServices } from "../services";

export function createQueueRoute(services: AppServices): Hono {
  const app = new Hono();
  app.get("/", async (context) => context.json(await services.queueOverview.execute()));
  return app;
}
