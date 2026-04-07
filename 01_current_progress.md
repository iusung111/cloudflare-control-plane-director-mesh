# 01_current_progress (Updated 2026-04-07)

## Purpose
This file summarizes the current implementation state for the Cloudflare Control Plane prototype.

## Current status (Fixed Core Defects)
- **Core Runtime:** Fully wired and compilable. Dependency injection supported for testing.
- **Import Hierarchy:** Fixed. Clean separation between `store.ts`, `types.ts`, and `github_store.ts`.
- **Self-Lock Bug:** Fixed. `hasActiveLock` now accepts `exceptLeaseId` to avoid conflicting with self.
- **Deploy Live Path:** Fixed. Double-blocking removed; `guardrail` handles policy and `executor` delegates to registered handlers.
- **GitHub Store Safety:**
  - `GITHUB_BRANCH` is now mandatory or explicitly defaulted to avoid mismatch.
  - Dedup paths are now safe (using hashed filenames) and store metadata in JSON.
  - UTF-8 safe base64 encoding/decoding using `TextEncoder`/`TextDecoder`.
- **Validation:** `conflictKey` is now validated against resource normalization rules.
- **Verification:** Unit and integration tests covering core invariants and full execution flow are passing.

## Implementation Details
- `runtime/resource_key.ts`: Resource normalization and `conflictKey` generation.
- `runtime/encoding.ts`: UTF-8 safe base64 helpers.
- `runtime/github_path.ts`: Safe path generation for GitHub storage.
- `runtime/executor.ts`: `MissionExecutor` with handler registration and mock support.
- `runtime/test/runtime.test.ts`: New integration tests for full flow (emitted -> completed/failed).

## Created/Updated files
- `runtime/types.ts`: Domain models
- `runtime/store.ts`: RuntimeStore interface and InMemory implementation
- `runtime/github_store.ts`: Refactored GitHub API adapter (safe paths, UTF-8 base64)
- `runtime/kernel.ts`: Refactored kernel (self-lock fix, conflictKey validation)
- `runtime/executor.ts`: Refactored executor (delegation, handler support)
- `runtime/index.ts`: Refactored runtime (DI support, executor wiring)
- `src/index.ts`: Refactored Worker entry point (env validation)
- `wrangler.toml`: Added configuration for Cloudflare Workers
- `runtime/test/kernel.test.ts`: Updated core invariant tests
- `runtime/test/runtime.test.ts`: New flow tests

## Next steps
- **Real Effect Handlers:** Implement Octokit/GitHub API calls for `github_write`, `github_branch_create`, etc.
- **Session Broker:** Implement logic to issue and revoke sessions/leases via API.
- **CLI/GUI Surface:** Connect the worker to a user-facing tool for command submission.

## Working rules
- All writes must go to `.control-plane/` in GitHub.
- `deploy_live` requires `payload.explicitLive: true`.
- `conflictKey` must match `makeConflictKey(resource)`.
- `GITHUB_BRANCH` must be explicitly configured.
