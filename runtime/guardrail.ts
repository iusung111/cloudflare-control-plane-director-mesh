import { CommandAction, ResourceScope, CommandRequest } from "./types";

export interface GuardrailResult {
  allowed: boolean;
  reason?: string;
}

export interface LockChecker {
  hasActiveWriter(resource: ResourceScope): Promise<boolean>;
}

export interface DeployAuthorizer {
  hasExplicitLiveCommand(commandId: string): Promise<boolean>;
}

export interface GuardrailEngineDeps {
  locks: LockChecker;
  deploy: DeployAuthorizer;
}

export class GuardrailEngine {
  constructor(private readonly deps: GuardrailEngineDeps) {}

  async allows(request: CommandRequest): Promise<GuardrailResult> {
    if (request.action === "deploy_live") {
      const liveCommand = await this.deps.deploy.hasExplicitLiveCommand(request.commandId);
      if (!liveCommand) {
        return { allowed: false, reason: "live_deploy_requires_explicit_user_command" };
      }
    }

    if (request.action === "template_mutation") {
      return { allowed: false, reason: "template_mutation_forbidden" };
    }

    if (this.isCloudflarePath(request.resource.path)) {
      return { allowed: false, reason: "cloudflare_can_only_store_metadata" };
    }

    const writeActions = new Set<CommandAction>([
      "github_write",
      "github_branch_create",
      "github_pr_create",
    ]);

    if (writeActions.has(request.action)) {
      const hasWriter = await this.deps.locks.hasActiveWriter(request.resource);
      if (hasWriter) {
        return { allowed: false, reason: "multi_writer_on_same_resource_forbidden" };
      }
    }

    return { allowed: true };
  }

  private isCloudflarePath(path?: string): boolean {
    if (!path) {
      return false;
    }

    return path.startsWith("cloudflare/");
  }
}
