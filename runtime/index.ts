import { MissionKernel, MissionKernelDeps } from "./kernel";
import { SessionManager } from "./session";
import { QueueManager } from "./queue";
import { GuardrailEngine } from "./guardrail";
import { SideEffectExecutor, NoopHandler } from "./executor";
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
      deploy: {
        hasExplicitLiveCommand: async (commandId) => {
          // Check if there is an event with type COMMAND_RECEIVED and payload.explicitLive = true
          // This is a placeholder. In real world, we'd check the command's original request.
          return false; 
        },
      },
    });

    this.executor = new SideEffectExecutor({
      github_write: new NoopHandler(),
      github_branch_create: new NoopHandler(),
      github_pr_create: new NoopHandler(),
      verify_run: new NoopHandler(),
      browser_check: new NoopHandler(),
      deploy_mirror: new NoopHandler(),
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
    const result = await this.kernel.processCommand(request);

    if (result.state.nextAction === "emit_side_effect") {
      // Trigger side effect asynchronously or synchronously depending on policy
      // For now, we just log it as "emitted" in the state
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
