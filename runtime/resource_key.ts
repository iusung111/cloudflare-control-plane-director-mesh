import { ResourceScope } from "./types";

/**
 * Normalizes a ResourceScope into a consistent string key for conflict detection.
 * Format: repo:branch:path
 */
export function makeConflictKey(resource: ResourceScope): string {
  const repo = resource.repo.toLowerCase().trim();
  const branch = (resource.branch ?? "").toLowerCase().trim();
  const path = (resource.path ?? "").toLowerCase().trim();
  
  return `${repo}:${branch}:${path}`;
}
