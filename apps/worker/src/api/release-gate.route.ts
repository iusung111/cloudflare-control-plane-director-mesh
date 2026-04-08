import { Hono } from "hono";
import type { AppServices } from "../services";

export function createReleaseGateRoute(services: AppServices): Hono {
  const app = new Hono();

  app.get("/", async (context) => context.json(await services.releaseGate.execute()));

  return app;
}
