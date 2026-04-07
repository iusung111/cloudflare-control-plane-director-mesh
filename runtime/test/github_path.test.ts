import { describe, it, expect } from 'vitest';
import { safeDedupPath } from '../github_path';

describe('GitHub Path Utility', () => {
  it('should create safe dedup path ending with .json', () => {
    const key = "test-key";
    const path = safeDedupPath(key);
    expect(path).toContain(".control-plane/dedup/");
    expect(path.endsWith(".json")).toBe(true);
  });

  it('should be consistent for the same dedupKey', () => {
    const key = "consistent-key";
    expect(safeDedupPath(key)).toBe(safeDedupPath(key));
  });

  it('should handle special characters in dedupKey', () => {
    const key = "my/resource:branch*with space";
    const path = safeDedupPath(key);
    const filename = path.split('/').pop() || "";
    expect(filename).not.toContain("/"); 
    expect(filename).not.toContain(" ");
    expect(filename).not.toContain(":");
    expect(path.endsWith(".json")).toBe(true);
  });

  it('should produce different paths for different keys', () => {
    expect(safeDedupPath("key1")).not.toBe(safeDedupPath("key2"));
  });
});
