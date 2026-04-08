import { describe, expect, it, vi } from "vitest";
import { applyMissionDeltaToSnapshot } from "../apps/worker/src/live/mission-room.snapshot";
import { processControlQueueBatch } from "../apps/worker/src/queue/process-control-queue";
import type { ControlQueueMessage, MissionDelta } from "../packages/contracts/src";
import { ControlPlaneError } from "../packages/shared/src/control-plane-error";

describe("failure paths", () => {
  it("retries queue messages on transient server errors", async () => {
    const transientMessage = new FakeQueueMessage({
      kind: "retry-command",
      commandId: "cmd-transient",
      enqueuedAt: new Date().toISOString(),
    }, 3);

    await processControlQueueBatch({
      queue: "control",
      messages: [transientMessage],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    }, {
      commandLifecycle: {
        retry: vi.fn(async () => {
          throw new ControlPlaneError(503, "upstream_unavailable");
        }),
      } as any,
    });

    expect(transientMessage.acked).toBe(false);
    expect(transientMessage.retried).toEqual({ delaySeconds: 90 });
  });

  it("restores and updates mission room snapshots from live deltas", () => {
    const initialSnapshot = JSON.stringify({
      type: "mission.snapshot",
      graph: {
        mission: {
          missionId: "mission-room",
          title: "Mission room",
          repoKey: "iusung111/cloudflare-control-plane-director-mesh",
          env: "prod",
          phase: "build",
          status: "active",
          ownerActor: "operator-1",
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
        workers: [],
        edges: [],
        handoffs: [],
      },
    } satisfies MissionDelta);

    const workerDelta = JSON.stringify({
      type: "worker.updated",
      worker: {
        missionId: "mission-room",
        workerId: "worker-1",
        role: "builder",
        phase: "build",
        status: "running",
        title: "Build feature",
        summary: "Still running",
        startedAt: "2026-04-08T00:01:00.000Z",
        updatedAt: "2026-04-08T00:01:00.000Z",
        lastHeartbeatAt: "2026-04-08T00:01:00.000Z",
      },
    } satisfies MissionDelta);

    const handoffDelta = JSON.stringify({
      type: "handoff.created",
      handoff: {
        missionId: "mission-room",
        handoffId: "handoff-1",
        fromWorkerId: "worker-1",
        toWorkerId: "worker-2",
        handoffType: "brief",
        title: "Brief next worker",
        summary: "Continue rollout",
        createdAt: "2026-04-08T00:02:00.000Z",
      },
    } satisfies MissionDelta);

    const afterWorker = applyMissionDeltaToSnapshot(initialSnapshot, workerDelta);
    const afterHandoff = applyMissionDeltaToSnapshot(afterWorker, handoffDelta);
    const parsed = JSON.parse(afterHandoff ?? "");

    expect(parsed.graph.workers).toHaveLength(1);
    expect(parsed.graph.workers[0].workerId).toBe("worker-1");
    expect(parsed.graph.handoffs).toHaveLength(1);
    expect(parsed.graph.mission.updatedAt).toBe("2026-04-08T00:02:00.000Z");
  });

  it("ignores deltas until a mission snapshot exists", () => {
    const deltaOnly = JSON.stringify({
      type: "edge.created",
      edge: {
        id: "a->b:spawned",
        from: "a",
        to: "b",
        relation: "spawned",
        createdAt: "2026-04-08T00:00:00.000Z",
      },
    } satisfies MissionDelta);

    expect(applyMissionDeltaToSnapshot(null, deltaOnly)).toBeNull();
  });
});

class FakeQueueMessage implements Message<ControlQueueMessage> {
  readonly id = crypto.randomUUID();
  readonly timestamp = new Date();
  acked = false;
  retried?: QueueRetryOptions;

  constructor(
    readonly body: ControlQueueMessage,
    readonly attempts: number,
  ) {}

  ack(): void {
    this.acked = true;
  }

  retry(options?: QueueRetryOptions): void {
    this.retried = options;
  }
}
