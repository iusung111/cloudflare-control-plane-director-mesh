import { Hono } from "hono";
import type { AppServices } from "../services";

export function createQualityRoute(services: AppServices): Hono {
  const app = new Hono();

  app.get("/", async (context) => context.json(await services.quality.execute()));

  return app;
}
