import type { ResourceScope } from "../../../contracts/src";

export function normalizeResourceScope(resource: ResourceScope): ResourceScope {
  return {
    repo: resource.repo.trim().toLowerCase(),
    branch: resource.branch?.trim().toLowerCase() || "",
    path: resource.path?.trim().toLowerCase() || "",
  };
}

export function makeConflictKey(resource: ResourceScope): string {
  const normalized = normalizeResourceScope(resource);
  return `${normalized.repo}:${normalized.branch}:${normalized.path}`;
}

export function sameResourceScope(left: ResourceScope, right: ResourceScope): boolean {
  return makeConflictKey(left) === makeConflictKey(right);
}
