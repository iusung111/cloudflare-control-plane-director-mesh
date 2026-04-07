# 01_current_progress

## Purpose
This file summarizes the current implementation state for external CLI and offline work.
Read this after `00_design_baseline.md`.

## Current status
- Baseline docs and entry rules are in place
- Session-log-refined intent doc is in place
- Runtime core is fully implemented and wired
- GitHub-backed store adapter is functional (via GitHub API)
- State format (events, sessions, leases) is defined

## Created docs
- `README.md`
- `00_design_baseline.md`
- `01_current_progress.md`
- `docs/derived/00_session_refined.md`
- `docs/derived/01_overview.md`
- `docs/derived/02_runtime_boundary.md`
- `docs/derived/03_guardrail.md`
- `docs/derived/04_runtime_to_code_map.md`
- `docs/derived/05_state_format.md`
- `docs/adr/adr_001_event_driven_control.md`
- `docs/adr/adr_002_github_truth.md`

## Created runtime files
- `runtime/types.ts` (centralized types)
- `runtime/kernel.ts` (mission kernel)
- `runtime/session.ts` (session and lease manager)
- `runtime/queue.ts` (queue manager)
- `runtime/guardrail.ts` (policy engine)
- `runtime/executor.ts` (side effect executor)
- `runtime/store.ts` (store interface)
- `runtime/github_store.ts` (GitHub-backed persistence)
- `runtime/index.ts` (runtime bootstrap entry point)

## Next external CLI tasks
- Implement real GitHub effect handlers (e.g., using Octokit)
- Add a CLI wrapper to trigger commands from the terminal
- Implement a dashboard or summary view for the event log
- Add automated tests for the wired runtime

## Working rules
- Treat `00_design_baseline.md` as the root intent summary for CLI work
- Use `docs/derived/00_session_refined.md` for fuller baseline context
- All writes must pass through `GitHubRuntimeStore` to `.control-plane/`
- Do not introduce live-deploy behaviour without explicit user command
