# 01_current_progress

## Purpose
This file summarizes the current implementation state for the Cloudflare Control Plane prototype.

## Current status (Prototype Phase)
- **Core Runtime:** Fully wired and compilable. Kernel -> Guardrail -> Executor flow is active.
- **State Model:** Unified types defined. Role separation between `commandId`, `dedupKey`, and `eventId` is enforced.
- **Persistence:** `GitHubRuntimeStore` implemented for audit logs, leases, and dedup indexing in GitHub.
- **Infrastructure:** Cloudflare Worker entry point provided via Hono. TypeScript build and test suite integrated.
- **Verification:** Unit tests covering core invariants (dedup, conflict, guardrails) are implemented and passing.

## Created docs
- `README.md` (Updated rules)
- `docs/derived/05_state_format.md` (Updated with transition rules)
- `docs/adr/adr_002_github_truth.md` (Detailed)

## Created runtime/infrastructure files
- `runtime/types.ts`: Domain models
- `runtime/index.ts`: Wired runtime
- `runtime/github_store.ts`: GitHub API adapter
- `src/index.ts`: Worker entry point
- `package.json` & `tsconfig.json`: Build system
- `runtime/test/kernel.test.ts`: Core invariant tests

## Next steps
- **Real Effect Handlers:** Replace `NoopHandler` with real Octokit/GitHub API calls for `github_write`, etc.
- **Session Broker:** Implement the logic to issue and revoke sessions/leases.
- **CLI Wrapper:** Create a simple tool to send commands to the Worker.
- **Retry Logic:** Enhance the executor with robust retry and error recovery.

## Working rules
- All writes must go to `.control-plane/` in GitHub.
- `deploy_live` requires `payload.explicitLive: true`.
- One file = one role.
