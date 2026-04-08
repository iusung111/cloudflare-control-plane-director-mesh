import { Hono } from "hono";
import type { CommandRequest } from "../../../../packages/contracts/src";
import { enqueueAlertFanoutIfNeeded, syncRelatedRequestsForCommand } from "../commands/command-side-effects";
import type { AppServices } from "../services";
import { readJson } from "./http";

export function createCommandsRoute(services: AppServices): Hono {
  const app = new Hono();

  app.get("/", async (context) => context.json(await services.commandQuery.list()));
  app.get("/:id", async (context) => context.json(await services.commandQuery.get(context.req.param("id"))));

  app.post("/", async (context) => {
    const body = await readJson<CommandRequest>(context);
    const result = await services.commands.execute(body);
    await enqueueIfQueued(services, body.action, result.commandId, result.status, result.events.at(-1)?.reason);
    await enqueueAlertFanoutIfNeeded(services, {
      commandId: result.commandId,
      status: result.status as any,
      latestReason: result.events.at(-1)?.reason,
    });
    return context.json(result);
  });

  app.post("/:id/approve", async (context) => {
    const command = await services.commandLifecycle.approve(context.req.param("id"));
    await enqueueIfQueued(services, command.action, command.commandId, command.status, command.latestReason);
    await enqueueAlertFanoutIfNeeded(services, command);
    await syncRelatedRequestsForCommand(services, command);
    return context.json(command);
  });

  app.post("/:id/retry", async (context) => {
    const command = await services.commandLifecycle.retry(context.req.param("id"));
    await enqueueIfQueued(services, command.action, command.commandId, command.status, command.latestReason);
    await enqueueAlertFanoutIfNeeded(services, command);
    await syncRelatedRequestsForCommand(services, command);
    return context.json(command);
  });

  app.post("/:id/reject", async (context) => {
    const body = await readJson<Record<string, unknown>>(context).catch(() => ({}) as Record<string, unknown>);
    const reason = typeof body.reason === "string" ? body.reason : "rejected_by_operator";
    const command = await services.commandLifecycle.reject(context.req.param("id"), reason);
    await enqueueAlertFanoutIfNeeded(services, command);
    await syncRelatedRequestsForCommand(services, command);
    return context.json(command);
  });

  app.post("/:id/cancel", async (context) => {
    const body = await readJson<Record<string, unknown>>(context).catch(() => ({}) as Record<string, unknown>);
    const reason = typeof body.reason === "string" ? body.reason : "cancelled_by_operator";
    const command = await services.commandLifecycle.cancel(context.req.param("id"), reason);
    await enqueueAlertFanoutIfNeeded(services, command);
    await syncRelatedRequestsForCommand(services, command);
    return context.json(command);
  });

  return app;
}

async function enqueueIfQueued(
  services: AppServices,
  action: string,
  commandId: string,
  status: string,
  reason?: string,
): Promise<void> {
  if (status === "queued") {
    if (action === "browser_check" || action === "verify_run") {
      await services.queueDispatch.enqueueCommandExecution(commandId, action, reason);
      return;
    }

    await services.queueDispatch.enqueueRetry(commandId, reason);
  }
}
