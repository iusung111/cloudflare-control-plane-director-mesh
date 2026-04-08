import { Hono } from "hono";
import type { AppServices } from "../services";

export function createQueueRoute(services: AppServices): Hono {
  const app = new Hono();
  app.get("/", async (context) => context.json(await services.queueOverview.execute()));
  app.get("/summary", async (context) => context.json(await services.queueOverview.summary()));
  app.get("/dlq", async (context) => context.json(await services.queueOverview.listDeadLetters()));

  app.post("/dlq/:id/requeue", async (context) => {
    const command = await services.commandLifecycle.retry(context.req.param("id"));
    if (command.status === "queued") {
      await services.queueDispatch.enqueueRetry(command.commandId, command.latestReason);
    }
    return context.json(command);
  });

  app.post("/dlq/:id/dismiss", async (context) => {
    const command = await services.commandLifecycle.cancel(context.req.param("id"), "dead_letter_dismissed");
    return context.json(command);
  });

  return app;
}
