import { describe, expect, it, vi } from "vitest";
import { processControlQueueBatch } from "../apps/worker/src/queue/process-control-queue";
import { createServices, type WorkerEnv } from "../apps/worker/src/services";
import { MemoryControlPlaneStore } from "../packages/adapters/src/store/memory-control-plane.store";
import type { CommandRecord, ControlQueueMessage, MissionRecord, OperatorRequestRecord, WorkerRecord } from "../packages/contracts/src";
import { ControlPlaneError } from "../packages/shared/src/control-plane-error";

describe("load and chaos-lite", () => {
  it("load pack keeps large mission graph queries responsive and collapses completed work", async () => {
    const store = new MemoryControlPlaneStore();
    const services = createServices(undefined, { store });
    const now = new Date();
    const mission: MissionRecord = {
      missionId: "mission-load-pack",
      title: "Load pack mission",
      repoKey: "iusung111/cloudflare-control-plane-director-mesh",
      env: "prod",
      phase: "qa",
      status: "active",
      ownerActor: "load-tester",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await store.putMission(mission);

    for (let index = 0; index < 50; index += 1) {
      await store.putWorker(activeWorker(mission.missionId, index, now.toISOString()));
    }
    for (let index = 0; index < 2000; index += 1) {
      await store.putWorker(completedWorker(mission.missionId, index, new Date(now.getTime() - (10 * 60_000)).toISOString()));
    }

    const graphStartedAt = Date.now();
    const liveGraph = await services.missionQuery.getLiveGraph(mission.missionId, {
      now,
      coolingSeconds: 30,
      archiveSeconds: 300,
    });
    const graphDurationMs = Date.now() - graphStartedAt;

    const listStartedAt = Date.now();
    const completed = await services.missionQuery.listWorkers(mission.missionId, { status: "completed" });
    const listDurationMs = Date.now() - listStartedAt;

    expect(graphDurationMs).toBeLessThan(1500);
    expect(listDurationMs).toBeLessThan(1500);
    expect(completed).toHaveLength(2000);
    expect(liveGraph.visibleWorkers.length).toBeLessThan(120);
    expect(liveGraph.collapsedBundles.length + liveGraph.archivedWorkers).toBeGreaterThan(0);
  });

  it("chaos-lite retries transient browser execution and converges related request plus projections", async () => {
    const store = new MemoryControlPlaneStore();
    const missionRoom = new FakeMissionRoomNamespace();
    const queue = new FakeQueue();
    const env = {
      MISSION_ROOM: missionRoom as unknown as DurableObjectNamespace,
      CONTROL_QUEUE: queue as unknown as Queue<ControlQueueMessage>,
    } as WorkerEnv;
    const services = createServices(env, { store });
    services.browserQa = {
      execute: vi.fn()
        .mockRejectedValueOnce(new ControlPlaneError(500, "browser_upstream_transient"))
        .mockResolvedValueOnce({
          url: "https://example.com/review",
          statusCode: 200,
          matchedText: true,
          selector: "[data-command-action='approve']",
          summary: "Clicked 승인 in browser flow",
          checkedAt: new Date().toISOString(),
        }),
    } as any;

    const missionId = "mission-chaos-lite";
    await store.putMission({
      missionId,
      title: "Chaos mission",
      repoKey: "iusung111/cloudflare-control-plane-director-mesh",
      env: "prod",
      phase: "review",
      status: "active",
      ownerActor: "chaos-tester",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await store.putWorker(activeWorker(missionId, 1, new Date().toISOString()));

    const command: CommandRecord = {
      commandId: "cmd-chaos-browser",
      dedupKey: "cmd-chaos-browser",
      sessionId: "session-chaos",
      leaseId: "lease-chaos",
      action: "browser_check",
      resource: { repo: "iusung111/cloudflare-control-plane-director-mesh", branch: "master", path: "ops/chaos.txt" },
      conflictKey: "iusung111/cloudflare-control-plane-director-mesh:master:ops/chaos.txt",
      payload: {
        missionId,
        url: "https://example.com/review",
        expectedText: "승인",
        selector: "[data-command-action='approve']",
      },
      status: "queued",
      latestReason: "queued_for_async_execution",
      attemptCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await store.putCommand(command);

    const request: OperatorRequestRecord = {
      requestId: "request-chaos-browser",
      actorId: "chatgpt-user",
      source: "chatgpt_app",
      queue: "browser",
      locale: "ko",
      title: "승인 버튼 클릭",
      prompt: "승인 버튼 클릭 후 상태 갱신",
      missionId,
      relatedCommandId: command.commandId,
      targetUrl: "https://example.com/review",
      selector: "[data-command-action='approve']",
      expectedText: "승인",
      status: "claimed",
      claimOwner: "orchestrator-chaos",
      claimHeartbeatAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await store.putOperatorRequest(request);

    const firstAttempt = new FakeQueueMessage({
      kind: "execute-command",
      commandId: command.commandId,
      action: "browser_check",
      enqueuedAt: new Date().toISOString(),
    }, 1);
    await processControlQueueBatch({
      queue: "control",
      messages: [firstAttempt],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    }, services, env);
    expect(firstAttempt.retried).toEqual({ delaySeconds: 30 });

    const secondAttempt = new FakeQueueMessage({
      kind: "execute-command",
      commandId: command.commandId,
      action: "browser_check",
      enqueuedAt: new Date().toISOString(),
    }, 2);
    await processControlQueueBatch({
      queue: "control",
      messages: [secondAttempt],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    }, services, env);

    const postprocess = new FakeQueueMessage({
      kind: "browser-evidence-postprocess",
      commandId: command.commandId,
      enqueuedAt: new Date().toISOString(),
    }, 1);
    await processControlQueueBatch({
      queue: "control",
      messages: [postprocess],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    }, services, env);
    const projectionRebuild = queue.sent.find((message) => message.kind === "projection-rebuild");
    expect(projectionRebuild).toBeTruthy();
    await processControlQueueBatch({
      queue: "control",
      messages: [new FakeQueueMessage(projectionRebuild as ControlQueueMessage, 1)],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    }, services, env);

    const completedCommand = await store.getCommand(command.commandId);
    const completedRequest = await store.getOperatorRequest(request.requestId);
    expect(completedCommand?.status).toBe("completed");
    expect(completedRequest?.status).toBe("completed");
    expect(queue.sent).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "browser-evidence-postprocess",
        commandId: command.commandId,
      }),
      expect.objectContaining({
        kind: "projection-rebuild",
        missionId,
      }),
    ]));
    expect(missionRoom.calls.map((call) => `${call.method} ${call.pathname}`)).toContain("POST /snapshot");
  });
});

function activeWorker(missionId: string, index: number, now: string): WorkerRecord {
  return {
    missionId,
    workerId: `worker-active-${index}`,
    parentWorkerId: index > 0 ? `worker-active-${index - 1}` : undefined,
    role: "builder",
    phase: index % 2 === 0 ? "build" : "review",
    status: index % 5 === 0 ? "waiting_approval" : "running",
    title: `Active worker ${index}`,
    summary: `Active summary ${index}`,
    progress: (index % 10) * 10,
    blockerReason: index % 5 === 0 ? "approval_pending" : undefined,
    startedAt: now,
    updatedAt: now,
    lastHeartbeatAt: now,
  };
}

function completedWorker(missionId: string, index: number, now: string): WorkerRecord {
  return {
    missionId,
    workerId: `worker-completed-${index}`,
    parentWorkerId: index > 0 ? `worker-completed-${index - 1}` : undefined,
    role: "reviewer",
    phase: index % 2 === 0 ? "review" : "qa",
    status: "completed",
    title: `Completed worker ${index}`,
    summary: `Completed summary ${index}`,
    progress: 100,
    startedAt: now,
    updatedAt: now,
    completedAt: now,
    lastHeartbeatAt: now,
  };
}

class FakeQueue {
  sent: ControlQueueMessage[] = [];

  async send(message: ControlQueueMessage): Promise<void> {
    this.sent.push(message);
  }
}

class FakeMissionRoomNamespace {
  calls: Array<{ method: string; pathname: string; body: string }> = [];

  idFromName(): DurableObjectId {
    return {} as DurableObjectId;
  }

  get(): DurableObjectStub {
    return {
      id: {} as DurableObjectId,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        this.calls.push({
          method: request.method,
          pathname: new URL(request.url).pathname,
          body: await request.clone().text(),
        });
        return new Response("snapshot", { status: 200 });
      },
      connect: () => {
        throw new Error("socket_connect_not_supported_in_test");
      },
    } as DurableObjectStub;
  }
}

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
