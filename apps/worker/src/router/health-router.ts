import { Hono } from "hono";

export function createHealthRouter(): Hono {
  const app = new Hono();
  app.get("/healthz", (context) => context.json({ status: "ok", timestamp: new Date().toISOString() }));
  return app;
}
