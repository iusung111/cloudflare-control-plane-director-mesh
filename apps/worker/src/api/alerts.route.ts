import { Hono } from "hono";
import type { AppServices } from "../services";
import type { WorkerEnv } from "../services";
import { applyAlertStateOverrides, listCachedAlertStates, putCachedAlertState } from "../state/control-state.client";

export function createAlertsRoute(services: AppServices, env?: WorkerEnv): Hono<{ Bindings: WorkerEnv }> {
  const app = new Hono<{ Bindings: WorkerEnv }>();

  app.get("/", async (context) => context.json(applyAlertStateOverrides(await services.alerts.listCurrent(), await listCachedAlertStates(env))));
  app.get("/log", async (context) => context.json(applyAlertStateOverrides(await services.alerts.listLog(), await listCachedAlertStates(env))));
  app.post("/:id/read", async (context) => {
    const state = await services.alerts.markRead(context.req.param("id"));
    await putCachedAlertState(env, {
      alertId: state.alertId,
      unread: state.unread,
      dismissed: state.dismissed,
      updatedAt: state.createdAt,
    });
    return context.json(state);
  });
  app.post("/:id/dismiss", async (context) => {
    const state = await services.alerts.dismiss(context.req.param("id"));
    await putCachedAlertState(env, {
      alertId: state.alertId,
      unread: state.unread,
      dismissed: state.dismissed,
      updatedAt: state.createdAt,
    });
    return context.json(state);
  });
  app.get("/:id/target", async (context) => context.json(await services.alerts.getTarget(context.req.param("id"))));

  return app;
}
