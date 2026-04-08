import { Hono } from "hono";
import type { AppServices } from "../services";
import { optionalNumber, readJson, requireString } from "./http";

export function createLeasesRoute(services: AppServices): Hono {
  const app = new Hono();

  app.get("/", async (context) => context.json(await services.leases.list()));

  app.post("/", async (context) => {
    const body = await readJson<Record<string, unknown>>(context);
    const resource = body.resource as Record<string, unknown>;
    const lease = await services.leases.acquire({
      leaseId: requireString(body.leaseId, "lease_id_required"),
      sessionId: requireString(body.sessionId, "session_id_required"),
      ttlMinutes: optionalNumber(body.ttlMinutes),
      resource: {
        repo: requireString(resource?.repo, "resource_repo_required"),
        branch: typeof resource?.branch === "string" ? resource.branch : undefined,
        path: typeof resource?.path === "string" ? resource.path : undefined,
      },
    });

    return context.json(lease, 201);
  });

  app.post("/:id/release", async (context) => context.json(await services.leases.release(context.req.param("id"))));
  app.post("/:id/revoke", async (context) => context.json(await services.leases.revoke(context.req.param("id"))));

  return app;
}
