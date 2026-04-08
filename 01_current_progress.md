# 01_current_progress (Updated 2026-04-09)

## Delivered So Far

- Rebuilt the worker around a fresh layered structure instead of extending the old prototype
- Added command, session, lease, approval, alert, mission, queue, run, request, observability, and state surfaces
- Added mission graph, playback, evidence, handoff, completed-mode, and live mission APIs
- Wired Cloudflare Durable Objects for mission live rooms, MCP broker sessions, and control-state overlays
- Wired Cloudflare Queues for retry, async browser execution, alert fan-out, and projection rebuild side-effects
- Added release gate and quality aggregation
- Added live graph cooling, collapse, and archive projection
- Preserved completed-worker traceability through playback and worker search
- Added JSON-RPC MCP transport with session headers and SSE drain
- Added `Last-Event-ID` replay/resume and long-lived `follow=1` SSE fan-out for concurrent MCP subscribers
- Added browser login, bearer auth roles, and operator-only mutation guards
- Added `/mcp/app` as a ChatGPT Developer Mode compatible remote MCP surface
- Added operator request lane plus orchestrator queue handoff
- Added Korean console action labels and linked request auto-convergence on command completion
- Added learning capture and retrospective summary surfaces
- Added alert read/dismiss persistence and lifecycle endpoints
- Replaced the static `/app` shell with an interactive client-side operator console
- Added in-console command lifecycle controls, scoped approval management, YOLO toggle, sessions, handoffs, evidence drawer, completed mode, saved views, worker filters, and logout
- Added queue dead-letter views plus requeue and dismiss operations
- Added deterministic failure-path, load-pack, chaos-lite, UI shell, and browser E2E coverage
- Removed the legacy `src/` and `runtime/` prototype tree from the repository
- Added `.gitignore` and prepared `node_modules` to be dropped from version control

## Notable Endpoints

- `GET /api/missions/:id/graph/live`
- `GET /api/missions/:id/learnings`
- `GET /api/missions/:id/retro`
- `GET /api/missions/:id/handoffs`
- `GET /api/missions/:id/evidence`
- `GET /api/observability`
- `GET /api/quality`
- `GET /api/release-gate`
- `GET,POST /api/learnings`
- `GET /api/retro`
- `GET,POST /api/requests`
- `POST /api/requests/:id/claim`
- `POST /api/requests/:id/heartbeat`
- `POST /api/requests/:id/status`
- `GET /api/queue/dlq`
- `POST /api/queue/dlq/:id/requeue`
- `POST /api/queue/dlq/:id/dismiss`
- `POST /api/alerts/:id/read`
- `POST /api/alerts/:id/dismiss`
- `GET,POST /login`
- `POST /mcp`
- `GET /mcp`
- `DELETE /mcp`
- `GET /mcp?follow=1`
- `GET /mcp/app`
- `POST /mcp/app`
- `GET /mcp/resources/observability-summary`
- `GET /mcp/resources/requests-active`
- `GET /mcp/resources/quality-summary`
- `GET /mcp/resources/release-gate`
- `GET /mcp/resources/learnings-recent`
- `GET /mcp/resources/retro-summary`
- `GET /mcp/resources/alerts-log`
- `GET /mcp/resources/mission-live-graph/:id`
- `GET /mcp/resources/mission-learnings/:id`
- `GET /mcp/resources/mission-requests/:id`
- `GET /mcp/resources/mission-retro/:id`

## Validation Status

- `npm run typecheck` passes
- `npm test` passes
- `npm run test:ui` passes
- `npm run test:load` passes
- `npm run test:chaos` passes
- `npm run build` passes
- `wrangler deploy --dry-run` sees `MISSION_ROOM`, `MCP_BROKER`, `CONTROL_STATE`, and `CONTROL_QUEUE`

## Scope Status

- The previously called-out gaps around auth, MCP session durability, console action parity, queue and DLQ ops, operator request handoff, ChatGPT app attach surface, Korean approval handling, and validation breadth are now implemented
- Remaining work is deployment posture, operational QA, and product hardening rather than missing core platform surfaces

## Notes

- Build scope is currently `apps/**`, `packages/**`, `tests/**`, and `docs/**`
- Legacy prototype paths under old `src/` and `runtime/` have been removed
- `node_modules` has been removed from the git index and is now ignored going forward
- Detailed requirement closure is documented in `docs/derived/orchestrator_chatgpt_console_flow.md`
