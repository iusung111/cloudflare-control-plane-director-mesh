# 01_current_progress (Updated 2026-04-08)

## Delivered So Far

- Rebuilt the worker around a fresh layered structure instead of extending the old prototype
- Added command, session, lease, approval, alert, mission, queue, run, and state surfaces
- Added mission graph, playback, evidence, and live mission APIs
- Wired Cloudflare Durable Objects for mission live rooms
- Wired Cloudflare Queues for deferred retry flow
- Added release gate and quality aggregation
- Added live graph cooling/collapse/archive projection
- Preserved completed-worker traceability through playback and worker search
- Added JSON-RPC MCP transport with session headers and SSE drain
- Added `Last-Event-ID` replay/resume for MCP SSE
- Added long-lived `follow=1` SSE fan-out for concurrent MCP subscribers
- Added learning capture and retrospective summary surfaces
- Added mission-scoped learning and retro retrieval
- Added alert read/dismiss persistence and lifecycle endpoints
- Replaced the static `/app` shell with an interactive client-side operator console
- Added deterministic failure-path coverage for queue retry and mission-room snapshot restore
- Removed the legacy `src/` and `runtime/` prototype tree from the repository
- Added `.gitignore` and prepared `node_modules` to be dropped from version control

## Notable Endpoints

- `GET /api/missions/:id/graph/live`
- `GET /api/missions/:id/learnings`
- `GET /api/missions/:id/retro`
- `GET /api/quality`
- `GET /api/release-gate`
- `GET,POST /api/learnings`
- `GET /api/retro`
- `POST /api/alerts/:id/read`
- `POST /api/alerts/:id/dismiss`
- `POST /mcp`
- `GET /mcp`
- `DELETE /mcp`
- `GET /mcp?follow=1`
- `GET /mcp/resources/quality-summary`
- `GET /mcp/resources/release-gate`
- `GET /mcp/resources/learnings-recent`
- `GET /mcp/resources/retro-summary`
- `GET /mcp/resources/alerts-log`
- `GET /mcp/resources/mission-live-graph/:id`
- `GET /mcp/resources/mission-learnings/:id`
- `GET /mcp/resources/mission-retro/:id`

## Validation Status

- `npm run typecheck` passes
- `npm test` passes
- `npm run build` passes
- `wrangler deploy --dry-run` sees both `MISSION_ROOM` and `CONTROL_QUEUE`

## Scope Status

- The previously called-out gaps around interactive console UI, MCP follow streams, alert lifecycle handling, and mission-scoped learn/retro retrieval are now implemented
- Remaining work is hardening and product refinement rather than missing core platform surfaces

## Notes

- Build scope is currently `apps/**`, `packages/**`, and `tests/**`
- Legacy prototype paths under old `src/` and `runtime/` have been removed
- `node_modules` has been removed from the git index and is now ignored going forward
