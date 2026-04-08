import { Hono } from "hono";
import type { AppServices } from "../services";

export function createStateRoute(services: AppServices): Hono {
  const app = new Hono();
  app.get("/summary", async (context) => context.json(await services.stateSummary.execute()));
  return app;
}
