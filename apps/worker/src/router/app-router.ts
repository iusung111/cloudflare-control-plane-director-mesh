import { Hono } from "hono";
import type { AppServices } from "../services";
import { renderConsoleShell } from "../ui-shell/console-shell";

export function createAppRouter(services: AppServices): Hono {
  const app = new Hono();

  app.get("/", (context) => context.redirect("/app"));

  app.get("/app", async (context) => {
    const [summary, quality, releaseGate, retro, alerts, learnings, recentEvents, sessions, leases, missions] = await Promise.all([
      services.stateSummary.execute(),
      services.quality.execute(),
      services.releaseGate.execute(),
      services.retro.execute(),
      services.alerts.listCurrent(),
      services.learningQuery.list(),
      services.events.execute(20),
      services.sessions.list(),
      services.leases.list(),
      services.missions.list(),
    ]);

    return context.html(renderConsoleShell({
      alerts,
      learnings: learnings.slice(0, 5),
      retro,
      summary,
      quality,
      releaseGate,
      recentEvents,
      sessions,
      leases,
      missions,
    }));
  });

  return app;
}
