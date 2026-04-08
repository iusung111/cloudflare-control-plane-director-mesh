import { Hono } from "hono";
import { asControlPlaneError } from "../../../packages/shared/src/control-plane-error";
import { createAppRouter } from "./router/app-router";
import { createApiRouter } from "./router/api-router";
import { createHealthRouter } from "./router/health-router";
import { createMcpRouter } from "./router/mcp-router";
import { createServices, type AppServices, type WorkerEnv } from "./services";

export function createApp(options?: {
  env?: WorkerEnv;
  services?: AppServices;
}): Hono<{ Bindings: WorkerEnv }> {
  const app = new Hono<{ Bindings: WorkerEnv }>();
  const services = options?.services ?? createServices(options?.env);

  app.route("/", createAppRouter(services));
  app.route("/", createHealthRouter());
  app.route("/api", createApiRouter(services, options?.env));
  app.route("/mcp", createMcpRouter(services));

  app.onError((error, context) => {
    const controlPlaneError = asControlPlaneError(error);
    return context.json({
      error: controlPlaneError.code,
      details: controlPlaneError.details,
    }, { status: controlPlaneError.status as 400 });
  });

  app.notFound((context) => context.json({ error: "not_found" }, 404));
  return app;
}
