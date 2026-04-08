import { describe, expect, it } from "vitest";
import { renderConsoleShell } from "../apps/worker/src/ui-shell/console-shell";

describe("console ui component shell", () => {
  it("includes worker graph, evidence drawers, saved views and korean controls", () => {
    const now = new Date().toISOString();
    const html = renderConsoleShell({
      summary: {
        generatedAt: now,
        sessions: { active: 1, expired: 0, revoked: 0 },
        leases: { active: 1, expired: 0, revoked: 0, released: 0 },
        commands: { queued: 1, emitted: 0, completed: 0, rejected: 0, failed: 0, cancelled: 0 },
        requests: { queuedForOrchestrator: 1, claimed: 0, awaitingApproval: 1, browserActionPending: 0 },
        yoloMode: { enabled: false, updatedAt: now, updatedBy: "tester" },
      },
      recentEvents: [],
      requests: [],
      sessions: [],
      leases: [],
      missions: [{
        missionId: "mission-ui",
        title: "UI Mission",
        repoKey: "iusung111/repo",
        env: "prod",
        phase: "review",
        status: "active",
        ownerActor: "tester",
        createdAt: now,
        updatedAt: now,
      }],
    });

    expect(html).toContain("Mission Live View");
    expect(html).toContain("Handoff Inspector");
    expect(html).toContain("Evidence Drawer");
    expect(html).toContain("Completed");
    expect(html).toContain("saved views");
    expect(html).toContain("worker-phase-filter");
    expect(html).toContain("mission-view-mode");
    expect(html).toContain("data-command-action");
    expect(html).toContain("승인");
  });
});
