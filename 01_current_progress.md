# 01_current_progress (Updated 2026-04-07)

## Purpose
This file summarizes the current implementation state for the Cloudflare Control Plane prototype.

## Current status (Fixed Core Defects)
- **Core Runtime:** Fully wired and compilable. Dependency injection supported for testing.
- **Import Hierarchy:** Fixed. Clean separation between `store.ts`, `types.ts`, and `github_store.ts`.
- **Self-Lock Bug:** Fixed. `hasActiveLock` now accepts `exceptLeaseId` to avoid conflicting with self.
- **Deploy Live Path:** Fixed. Double-blocking removed; `guardrail` handles policy and `executor` delegates to registered handlers.
- **GitHub Store Safety:**
  - `GITHUB_BRANCH` is now **strictly mandatory**. No fallback to "main" or "master" is allowed.
  - Dedup paths are now safe (using hashed filenames) and store metadata in JSON.
  - UTF-8 safe base64 encoding/decoding using `TextEncoder`/`TextDecoder`.
- **Validation:** `resource` normalization and `conflictKey` generation are now consistent across all stores.
- **Verification:** 
  - `npx tsc --noEmit` passing.
  - `npm test` passing with expanded coverage (encoding, path safety, invalid session/lease).
  - `npx wrangler deploy --dry-run` passing.

## Implementation Details
- `runtime/resource_key.ts`: Resource normalization (`normalizeResourceScope`) and `conflictKey` generation.
- `runtime/encoding.ts`: UTF-8 safe base64 helpers.
- `runtime/github_path.ts`: Safe path generation for GitHub storage.
- `runtime/executor.ts`: `MissionExecutor` with handler registration and mock support.
- `runtime/test/kernel.test.ts`: Expanded core invariant tests (invalid session/lease).
- `runtime/test/encoding.test.ts`: New encoding roundtrip tests (ASCII, UTF-8, JSON).
- `runtime/test/github_path.test.ts`: New path safety and consistency tests.
- `runtime/test/runtime.test.ts`: Integration tests for full flow.

## Created/Updated files
- `runtime/resource_key.ts`: Added normalization logic
- `runtime/store.ts`: Updated `InMemoryRuntimeStore` to use normalization
- `runtime/github_store.ts`: Updated `GitHubRuntimeStore` to use normalization and require branch
- `src/index.ts`: Enforced mandatory `GITHUB_BRANCH`
- `README.md`: Added execution and environment documentation
- `runtime/test/kernel.test.ts`: Added invalid lease/session cases
- `runtime/test/encoding.test.ts`: New file
- `runtime/test/github_path.test.ts`: New file
- `wrangler.toml`: Updated configuration comments

## Next steps
- **Real Effect Handlers:** Implement Octokit/GitHub API calls for `github_write`, `github_branch_create`, etc.
- **Session Broker:** Implement logic to issue and revoke sessions/leases via API.
- **CLI/GUI Surface:** Connect the worker to a user-facing tool for command submission.

## Working rules
- All writes must go to `.control-plane/` in GitHub.
- `deploy_live` requires `payload.explicitLive: true`.
- `conflictKey` must match `makeConflictKey(resource)`.
- `GITHUB_BRANCH` must be explicitly configured.
