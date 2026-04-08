import { Hono } from "hono";
import type { AppServices } from "../services";
import { createAlertsRoute } from "../api/alerts.route";
import { createApprovalsRoute } from "../api/approvals.route";
import { createCommandsRoute } from "../api/commands.route";
import { createEventsRoute } from "../api/events.route";
import { createLeasesRoute } from "../api/leases.route";
import { createLearningsRoute } from "../api/learnings.route";
import { createMissionsRoute } from "../api/missions.route";
import { createQueueRoute } from "../api/queue.route";
import { createQualityRoute } from "../api/quality.route";
import { createReleaseGateRoute } from "../api/release-gate.route";
import { createRetroRoute } from "../api/retro.route";
import { createRunsRoute } from "../api/runs.route";
import { createSessionsRoute } from "../api/sessions.route";
import { createStateRoute } from "../api/state.route";
import type { WorkerEnv } from "../services";

export function createApiRouter(services: AppServices, env?: WorkerEnv): Hono<{ Bindings: WorkerEnv }> {
  const app = new Hono<{ Bindings: WorkerEnv }>();
  app.route("/commands", createCommandsRoute(services));
  app.route("/sessions", createSessionsRoute(services));
  app.route("/leases", createLeasesRoute(services));
  app.route("/events", createEventsRoute(services));
  app.route("/learnings", createLearningsRoute(services));
  app.route("/missions", createMissionsRoute(services, env));
  app.route("/queue", createQueueRoute(services));
  app.route("/quality", createQualityRoute(services));
  app.route("/release-gate", createReleaseGateRoute(services));
  app.route("/retro", createRetroRoute(services));
  app.route("/runs", createRunsRoute(services));
  app.route("/state", createStateRoute(services));
  app.route("/approvals", createApprovalsRoute(services));
  app.route("/alerts", createAlertsRoute(services));
  return app;
}
