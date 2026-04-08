import { Hono } from "hono";
import type { AppServices } from "../services";

export function createObservabilityRoute(services: AppServices): Hono {
  const app = new Hono();
  app.get("/", async (context) => context.json(await services.observability.execute()));
  return app;
}
