import { MissionKernel, MissionKernelDeps } from "./kernel";
import { SessionManager } from "./session";
import { QueueManager } from "./queue";
import { GuardrailEngine } from "./guardrail";
import { MissionExecutor, MockDeployHandler } from "./executor";
import { RuntimeStore } from "./store";
import { GitHubRuntimeStore, GitHubStoreConfig } from "./github_store";
import { CommandRequest, MissionEvent, DerivedState } from "./types";

export interface RuntimeConfig {
  github: GitHubStoreConfig;
}

export interface RuntimeDeps {
  store: RuntimeStore;
  executor: MissionExecutor;
  guardrails: GuardrailEngine;
}

export class ControlPlaneRuntime {
  private readonly store: RuntimeStore;
  private readonly sessions: SessionManager;
  private readonly queue: QueueManager;
  private readonly guardrails: GuardrailEngine;
  private readonly executor: MissionExecutor;
  private readonly kernel: MissionKernel;

  constructor(config: RuntimeConfig, overrides?: Partial<RuntimeDeps>) {
    // [B-1] Support Dependency Injection
    this.store = overrides?.store ?? new GitHubRuntimeStore(config.github);
    this.sessions = new SessionManager(this.store);
    this.queue = new QueueManager(this.store);

    this.guardrails = overrides?.guardrails ?? new GuardrailEngine({
      locks: {
        // [A-2] Pass exceptLeaseId to avoid self-lock conflict
        hasActiveWriter: (resource, exceptLeaseId) => this.store.hasActiveLock(resource, exceptLeaseId),
      },
    });

    if (overrides?.executor) {
      this.executor = overrides.executor;
    } else {
      this.executor = new MissionExecutor();
      // Register default handlers or mock handlers
      this.executor.registerHandler("deploy_live", new MockDeployHandler());
      // Other handlers can be registered here as Noop or real ones
    }

    const kernelDeps: MissionKernelDeps = {
      store: this.store,
      leases: {
        isValid: (sessionId, leaseId, resource) =>
          this.sessions.isValidLease(sessionId, leaseId, resource),
      },
      guardrails: this.guardrails,
    };

    this.kernel = new MissionKernel(kernelDeps);
  }

  async handleCommand(request: CommandRequest): Promise<{
    event: MissionEvent;
    state: DerivedState;
  }> {
    // 1. Process command via Kernel
    const result = await this.kernel.processCommand(request);

    // 2. Handle next actions
    if (result.state.nextAction === "emit_side_effect") {
      try {
        const executionResult = await this.executor.execute(request);
        
        // [B-2] Emit completion/failure event based on execution result
        const statusEvent = MissionExecutor.toEvent(request, executionResult);
        await this.store.appendEvent(statusEvent);
        
        // Return refined state
        return {
          event: result.event,
          state: {
            ...result.state,
            status: statusEvent.status,
            lastEventId: statusEvent.eventId,
            nextAction: "none",
          },
        };
      } catch (err: any) {
        // Log unexpected execution failure
        const errorEvent: MissionEvent = {
          eventId: `evt:${request.commandId}:failed:${Date.now()}`,
          commandId: request.commandId,
          type: "COMMAND_FAILED",
          status: "failed",
          reason: `unexpected_executor_error: ${err.message}`,
          resource: request.resource,
          createdAt: new Date().toISOString(),
        };
        await this.store.appendEvent(errorEvent);
        return { 
          event: result.event, 
          state: { ...result.state, status: "failed", nextAction: "escalate" } 
        };
      }

    } else if (result.state.nextAction === "queue") {
      await this.queue.put({
        itemId: `item:${request.commandId}`,
        queue: "conflict",
        priority: "P2",
        blocking: true,
        createdAt: new Date().toISOString(),
        payload: request,
      });
    }

    return result;
  }

  getStore(): RuntimeStore {
    return this.store;
  }
}
