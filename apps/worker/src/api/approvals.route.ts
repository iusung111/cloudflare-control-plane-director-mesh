import { Hono } from "hono";
import type { AppServices } from "../services";
import { readJson, requireString } from "./http";

export function createApprovalsRoute(services: AppServices): Hono {
  const app = new Hono();

  app.get("/yolo", async (context) => context.json(await services.yoloMode.get()));
  app.get("/scoped", async (context) => context.json(await services.scopedApprovals.list()));

  app.post("/yolo", async (context) => {
    const body = await readJson<Record<string, unknown>>(context);
    const mode = await services.yoloMode.set({
      enabled: body.enabled === true,
      updatedBy: requireString(body.updatedBy, "updated_by_required"),
      note: typeof body.note === "string" ? body.note : undefined,
    });
    return context.json(mode);
  });

  app.post("/scoped", async (context) => {
    const body = await readJson<Record<string, unknown>>(context);
    const resource = body.resource as Record<string, unknown>;
    const approval = await services.scopedApprovals.create({
      approvalId: requireString(body.approvalId, "approval_id_required"),
      actorId: requireString(body.actorId, "approval_actor_required"),
      action: requireString(body.action, "approval_action_required") as any,
      reason: typeof body.reason === "string" ? body.reason : undefined,
      ttlMinutes: typeof body.ttlMinutes === "number" ? body.ttlMinutes : undefined,
      resource: {
        repo: requireString(resource?.repo, "resource_repo_required"),
        branch: typeof resource?.branch === "string" ? resource.branch : undefined,
        path: typeof resource?.path === "string" ? resource.path : undefined,
      },
    });

    return context.json(approval, 201);
  });

  app.delete("/scoped/:id", async (context) => {
    await services.scopedApprovals.delete(context.req.param("id"));
    return context.body(null, 204);
  });

  return app;
}
