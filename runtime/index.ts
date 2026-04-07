import { MissionKernel, MissionKernelDeps } from "./kernel";
import { SessionManager } from "./session";
import { QueueManager } from "./queue";
import { GuardrailEngine } from "./guardrail";
import { SideEffectExecutor, NoopHandler, SideEffectRequest } from "./executor";
import { RuntimeStore } from "./store";
import { GitHubRuntimeStore, GitHubStoreConfig } from "./github_store";
import { CommandRequest, MissionEvent, DerivedState } from "./types";

export interface RuntimeConfig {
  github: GitHubStoreConfig;
}

export class ControlPlaneRuntime {
  private readonly store: RuntimeStore;
  private readonly sessions: SessionManager;
  private readonly queue: QueueManager;
  private readonly guardrails: GuardrailEngine;
  private readonly executor: SideEffectExecutor;
  private readonly kernel: MissionKernel;

  constructor(config: RuntimeConfig) {
    this.store = new GitHubRuntimeStore(config.github);
    this.sessions = new SessionManager(this.store);
    this.queue = new QueueManager(this.store);

    this.guardrails = new GuardrailEngine({
      locks: {
        hasActiveWriter: (resource) => this.store.hasActiveLock(resource),
      },
    });

    this.executor = new SideEffectExecutor({
      github_write: new NoopHandler(),
      github_branch_create: new NoopHandler(),
      github_pr_create: new NoopHandler(),
      verify_run: new NoopHandler(),
      browser_check: new NoopHandler(),
      deploy_mirror: new NoopHandler(),
      deploy_live: new NoopHandler(), // Will be called only if guardrail passes
    });

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
      const effectRequest: SideEffectRequest = {
        effectId: `eff:${request.commandId}:${Date.now()}`,
        effectType: request.action,
        sourceEventId: result.event.eventId,
        resource: request.resource,
        payload: request.payload,
        executionPolicy: {
          retry: 1,
          timeoutSeconds: 30,
          idempotent: true,
        },
      };

      try {
        const executionResult = await this.executor.execute(effectRequest);
        
        // Emit completion/failure event based on execution result
        const statusEvent: MissionEvent = {
          eventId: `evt:${request.commandId}:${executionResult.status === "success" ? "completed" : "failed"}:${Date.now()}`,
          commandId: request.commandId,
          type: executionResult.status === "success" ? "COMMAND_COMPLETED" : "COMMAND_FAILED",
          status: executionResult.status === "success" ? "completed" : "failed",
          reason: executionResult.reason,
          resource: request.resource,
          payload: executionResult.output,
          createdAt: new Date().toISOString(),
        };
        
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
          reason: err.message,
          resource: request.resource,
          createdAt: new Date().toISOString(),
        };
        await this.store.appendEvent(errorEvent);
        return { event: result.event, state: { ...result.state, status: "failed", nextAction: "escalate" } };
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
