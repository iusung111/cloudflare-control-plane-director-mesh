import type { CommandRequest, LeaseRecord, ScopedApprovalRecord } from "../../../contracts/src";
import { sameResourceScope } from "../resources/resource-scope";

export interface GuardrailDecision {
  allowed: boolean;
  reason?: string;
  outcome?: "reject" | "queue";
}

export function evaluateGuardrail(
  request: CommandRequest,
  leases: LeaseRecord[],
  approvals: ScopedApprovalRecord[] = [],
): GuardrailDecision {
  if (request.action === "template_mutation") {
    return deny("template_mutation_is_strictly_forbidden");
  }

  if (request.action === "deploy_live" && request.payload.explicitLive !== true) {
    const hasScopedApproval = approvals.some((approval) =>
      approval.action === request.action &&
      approval.expiresAt > new Date().toISOString() &&
      sameResourceScope(approval.resource, request.resource),
    );

    if (!hasScopedApproval) {
      return deny("deploy_live_requires_explicitLive_true");
    }
  }

  const hasCompetingLease = leases.some((lease) => {
    if (lease.leaseId === request.leaseId || lease.status !== "active") {
      return false;
    }

    return sameResourceScope(lease.resource, request.resource);
  });

  if (hasCompetingLease) {
    return {
      allowed: false,
      outcome: "queue",
      reason: "resource_conflict_with_active_lease",
    };
  }

  return { allowed: true };
}

function deny(reason: string): GuardrailDecision {
  return {
    allowed: false,
    outcome: "reject",
    reason,
  };
}
