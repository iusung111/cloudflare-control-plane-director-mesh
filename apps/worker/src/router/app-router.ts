import { Hono } from "hono";
import { deleteOperatorSession, issueOperatorSession, loginPasswordMatches, type ControlPlaneAuthConfig } from "../auth/control-plane-auth";
import type { AppServices } from "../services";
import { renderConsoleShell } from "../ui-shell/console-shell";

export function createAppRouter(services: AppServices, auth: ControlPlaneAuthConfig): Hono {
  const app = new Hono();

  app.get("/", (context) => context.redirect("/app"));

  app.get("/login", (context) => {
    if (!auth.enabled || !auth.appPassword) {
      return context.redirect("/app");
    }

    return context.html(renderLoginPage(context.req.query("next") ?? "/app"));
  });

  app.post("/login", async (context) => {
    if (!auth.enabled || !auth.appPassword) {
      return context.redirect("/app");
    }

    const contentType = context.req.header("content-type") ?? "";
    const next = context.req.query("next") ?? "/app";
    const password = contentType.includes("application/json")
      ? String(((await context.req.json().catch(() => ({}))) as Record<string, unknown>).password ?? "")
      : String((await context.req.formData().catch(() => new FormData())).get("password") ?? "");

    if (!loginPasswordMatches(password, auth)) {
      return context.html(renderLoginPage(next, "Invalid password."), 401);
    }

    await issueOperatorSession(context, auth);
    return context.redirect(next);
  });

  app.post("/logout", (context) => {
    deleteOperatorSession(context);
    return context.redirect("/login");
  });

  app.get("/app", async (context) => {
    const [summary, quality, releaseGate, retro, alerts, learnings, recentEvents, sessions, leases, missions, commands, scopedApprovals, deadLetters] = await Promise.all([
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
      services.commandQuery.list(),
      services.scopedApprovals.list(),
      services.queueOverview.listDeadLetters(),
    ]);

    return context.html(renderConsoleShell({
      alerts,
      commands: commands.slice(0, 12),
      deadLetters: deadLetters.slice(0, 8),
      learnings: learnings.slice(0, 5),
      scopedApprovals: scopedApprovals.slice(0, 8),
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

function renderLoginPage(next: string, error?: string): string {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Control Plane Login</title>
      <style>
        body {
          margin: 0;
          min-height: 100vh;
          display: grid;
          place-items: center;
          background: linear-gradient(160deg, #f4f2eb 0%, #e5eadf 100%);
          font-family: "Segoe UI", "Noto Sans KR", sans-serif;
          color: #1b2318;
        }
        main {
          width: min(420px, calc(100vw - 32px));
          background: rgba(255, 255, 255, 0.94);
          border: 1px solid #d5d7ca;
          border-radius: 24px;
          padding: 28px;
          box-shadow: 0 18px 40px rgba(20, 28, 19, 0.08);
        }
        h1 { margin: 0 0 10px; font-size: 30px; }
        p { margin: 0 0 18px; color: #5d6854; }
        form { display: grid; gap: 12px; }
        input, button {
          font: inherit;
          border-radius: 14px;
          padding: 12px 14px;
        }
        input { border: 1px solid #d5d7ca; }
        button {
          border: none;
          background: linear-gradient(135deg, #1f4f3b, #2f7d56);
          color: white;
          cursor: pointer;
        }
        .error {
          margin: 0 0 14px;
          padding: 10px 12px;
          border-radius: 12px;
          background: #fee7e7;
          color: #b91c1c;
        }
      </style>
    </head>
    <body>
      <main>
        <h1>Control Plane Login</h1>
        <p>Operator console access requires the configured control-plane password.</p>
        ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
        <form method="post" action="/login?next=${encodeURIComponent(next)}">
          <input name="password" type="password" placeholder="Control plane password" required />
          <button type="submit">Sign In</button>
        </form>
      </main>
    </body>
  </html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[char] ?? char);
}
