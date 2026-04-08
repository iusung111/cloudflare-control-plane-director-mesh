import { Hono } from "hono";
import { broadcastMissionDelta, registerMissionSocket, unregisterMissionSocket } from "../../../../packages/adapters/src/live/mission-live-hub";
import type { MissionDelta } from "../../../../packages/contracts/src";
import { pushMissionDeltaIfConfigured, pushMissionSnapshotIfConfigured, roomStub } from "../live/mission-live-sync";
import type { AppServices, WorkerEnv } from "../services";
import { optionalNumber, readJson, requireString } from "./http";

export function createMissionsRoute(services: AppServices, env?: WorkerEnv): Hono<{ Bindings: WorkerEnv }> {
  const app = new Hono<{ Bindings: WorkerEnv }>();

  app.get("/", async (context) => context.json(await services.missions.list()));

  app.post("/", async (context) => {
    const body = await readJson<Record<string, unknown>>(context);
    const mission = await services.missions.create({
      missionId: requireString(body.missionId, "mission_id_required"),
      title: requireString(body.title, "mission_title_required"),
      repoKey: requireString(body.repoKey, "mission_repo_key_required"),
      ownerActor: requireString(body.ownerActor, "mission_owner_required"),
      env: typeof body.env === "string" ? body.env : undefined,
      phase: typeof body.phase === "string" ? body.phase as any : undefined,
    });

    const graph = await services.missionActivity.snapshot(mission.missionId);
    const snapshot: MissionDelta = { type: "mission.snapshot", graph };
    broadcastMissionDelta(mission.missionId, snapshot);
    await pushMissionSnapshotIfConfigured(env, mission.missionId, graph);
    return context.json(mission, 201);
  });

  app.get("/:id", async (context) => context.json(await services.missions.get(context.req.param("id"))));
  app.get("/:id/graph", async (context) => context.json(await services.missionQuery.getGraph(context.req.param("id"))));
  app.get("/:id/graph/live", async (context) => {
    const coolingSeconds = Number(context.req.query("coolingSeconds"));
    const archiveSeconds = Number(context.req.query("archiveSeconds"));
    return context.json(await services.missionQuery.getLiveGraph(context.req.param("id"), {
      coolingSeconds: Number.isFinite(coolingSeconds) ? coolingSeconds : undefined,
      archiveSeconds: Number.isFinite(archiveSeconds) ? archiveSeconds : undefined,
    }));
  });
  app.get("/:id/workers", async (context) => context.json(await services.missionQuery.listWorkers(context.req.param("id"), {
    status: context.req.query("status") as any,
    phase: context.req.query("phase") as any,
    q: context.req.query("q") ?? undefined,
  })));
  app.get("/:id/learnings", async (context) => context.json(await services.learningQuery.list({ missionId: context.req.param("id") })));
  app.get("/:id/retro", async (context) => context.json(await services.retro.execute({ missionId: context.req.param("id") })));
  app.get("/:id/handoffs", async (context) => context.json(await services.missionQuery.listHandoffs(context.req.param("id"))));
  app.get("/:id/evidence", async (context) => context.json(await services.missionEvidence.execute(context.req.param("id"))));
  app.get("/:id/playback", async (context) => context.json(await services.missionQuery.listPlayback(context.req.param("id"))));

  app.post("/:id/workers", async (context) => {
    const missionId = context.req.param("id");
    const body = await readJson<Record<string, unknown>>(context);
    const worker = await services.missionActivity.upsertWorker({
      missionId,
      workerId: requireString(body.workerId, "worker_id_required"),
      role: requireString(body.role, "worker_role_required"),
      title: requireString(body.title, "worker_title_required"),
      summary: requireString(body.summary, "worker_summary_required"),
      phase: requireString(body.phase, "worker_phase_required") as any,
      status: requireString(body.status, "worker_status_required") as any,
      parentWorkerId: typeof body.parentWorkerId === "string" ? body.parentWorkerId : undefined,
      progress: optionalNumber(body.progress),
      blockerReason: typeof body.blockerReason === "string" ? body.blockerReason : undefined,
    });

    const workerDelta: MissionDelta = { type: "worker.updated", worker };
    broadcastMissionDelta(missionId, workerDelta);
    await pushMissionDeltaIfConfigured(env, missionId, workerDelta);
    if (worker.parentWorkerId) {
      const edges = await services.missionQuery.listEdges(missionId);
      const edge = edges.find((item) => item.to === worker.workerId && item.from === worker.parentWorkerId);
      if (edge) {
        const edgeDelta: MissionDelta = { type: "edge.created", edge };
        broadcastMissionDelta(missionId, edgeDelta);
        await pushMissionDeltaIfConfigured(env, missionId, edgeDelta);
      }
    }

    const mission = await services.missions.get(missionId);
    if (mission.status === "completed" || mission.status === "failed") {
      const graph = await services.missionActivity.snapshot(missionId);
      const snapshot: MissionDelta = { type: "mission.snapshot", graph };
      broadcastMissionDelta(missionId, snapshot);
      await pushMissionSnapshotIfConfigured(env, missionId, graph);
    }

    return context.json(worker, 201);
  });

  app.post("/:id/handoffs", async (context) => {
    const missionId = context.req.param("id");
    const body = await readJson<Record<string, unknown>>(context);
    const handoff = await services.missionActivity.recordHandoff({
      missionId,
      handoffId: requireString(body.handoffId, "handoff_id_required"),
      fromWorkerId: requireString(body.fromWorkerId, "handoff_from_required"),
      toWorkerId: requireString(body.toWorkerId, "handoff_to_required"),
      handoffType: requireString(body.handoffType, "handoff_type_required") as any,
      title: requireString(body.title, "handoff_title_required"),
      summary: requireString(body.summary, "handoff_summary_required"),
      artifactRefs: Array.isArray(body.artifactRefs) ? body.artifactRefs.filter((value): value is string => typeof value === "string") : undefined,
    });

    const handoffDelta: MissionDelta = { type: "handoff.created", handoff };
    broadcastMissionDelta(missionId, handoffDelta);
    await pushMissionDeltaIfConfigured(env, missionId, handoffDelta);
    return context.json(handoff, 201);
  });

  app.get("/:id/live", async (context) => {
    if (context.req.header("upgrade") !== "websocket") {
      return context.json({ error: "websocket_upgrade_required" }, 426);
    }

    const missionId = context.req.param("id");
    const stub = roomStub(env, missionId);
    if (stub) {
      return stub.fetch(context.req.raw);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    registerMissionSocket(missionId, server);

    const graph = await services.missionQuery.getGraph(missionId);
    const snapshot: MissionDelta = { type: "mission.snapshot", graph };
    server.send(JSON.stringify(snapshot));

    server.addEventListener("message", async (event) => {
      if (String(event.data) === "snapshot") {
        const freshGraph = await services.missionQuery.getGraph(missionId);
        server.send(JSON.stringify({ type: "mission.snapshot", graph: freshGraph } satisfies MissionDelta));
      }
    });

    server.addEventListener("close", () => unregisterMissionSocket(missionId, server));
    server.addEventListener("error", () => unregisterMissionSocket(missionId, server));

    return new Response(null, { status: 101, webSocket: client });
  });

  return app;
}
