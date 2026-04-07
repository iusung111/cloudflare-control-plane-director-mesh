import { ResourceScope } from "./types";

/**
 * Normalizes a ResourceScope into a consistent object.
 * Trims and lowercases repo, branch, and path.
 */
export function normalizeResourceScope(resource: ResourceScope): ResourceScope {
  return {
    repo: resource.repo.toLowerCase().trim(),
    branch: (resource.branch ?? "").toLowerCase().trim(),
    path: (resource.path ?? "").toLowerCase().trim(),
  };
}

/**
 * Normalizes a ResourceScope into a consistent string key for conflict detection.
 * Format: repo:branch:path
 */
export function makeConflictKey(resource: ResourceScope): string {
  const normalized = normalizeResourceScope(resource);
  return `${normalized.repo}:${normalized.branch}:${normalized.path}`;
}
