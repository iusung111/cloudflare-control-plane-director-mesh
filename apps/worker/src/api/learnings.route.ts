import { Hono } from "hono";
import type { CaptureLearningInput } from "../../../../packages/contracts/src";
import type { AppServices } from "../services";
import { readJson } from "./http";

export function createLearningsRoute(services: AppServices): Hono {
  const app = new Hono();

  app.get("/", async (context) => context.json(await services.learningQuery.list({
    missionId: context.req.query("missionId") ?? undefined,
    q: context.req.query("q") ?? undefined,
    tag: context.req.query("tag") ?? undefined,
  })));

  app.get("/:id", async (context) => context.json(await services.learningQuery.get(context.req.param("id"))));

  app.post("/", async (context) => {
    return context.json(await services.captureLearning.execute(await readJson<CaptureLearningInput>(context)), 201);
  });

  return app;
}
