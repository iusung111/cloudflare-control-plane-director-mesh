import { CommandRequest, ResourceScope } from "./types";

export interface GuardrailResult {
  allowed: boolean;
  reason?: string;
}

export interface LockChecker {
  hasActiveWriter(resource: ResourceScope): Promise<boolean>;
}

export class GuardrailEngine {
  constructor(private readonly deps: { locks: LockChecker }) {}

  async allows(request: CommandRequest): Promise<GuardrailResult> {
    // 1. Template Mutation is always forbidden (non-negotiable)
    if (request.action === "template_mutation") {
      return { allowed: false, reason: "template_mutation_is_strictly_forbidden" };
    }

    // 2. Deploy Live requires explicit user approval in payload
    if (request.action === "deploy_live") {
      if (request.payload?.explicitLive !== true) {
        return { allowed: false, reason: "deploy_live_requires_explicit_user_approval_in_payload" };
      }
    }

    // 3. Cloudflare is metadata only (check resource path intent)
    // If the intent is to store real artifacts in cloudflare/ directory, reject it.
    if (this.isArtifactStorageAttempt(request)) {
      return { allowed: false, reason: "cloudflare_can_only_be_used_for_metadata_not_real_artifacts" };
    }

    // 4. Multi-writer check (one resource cannot have multiple writers)
    const writeActions = new Set([
      "github_write",
      "github_branch_create",
      "github_pr_create",
      "deploy_mirror",
      "deploy_live",
    ]);

    if (writeActions.has(request.action)) {
      const hasWriter = await this.deps.locks.hasActiveWriter(request.resource);
      if (hasWriter) {
        return { allowed: false, reason: "multi_writer_conflict_on_same_resource" };
      }
    }

    return { allowed: true };
  }

  private isArtifactStorageAttempt(request: CommandRequest): boolean {
    const path = request.resource.path?.toLowerCase() || "";
    // If writing to a cloudflare-related path that isn't metadata/control-plane
    return path.startsWith("cloudflare/") && !path.includes(".control-plane/");
  }
}
