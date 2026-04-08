# Cloudflare Control Plane Director Mesh

A Cloudflare Worker control-plane baseline rebuilt around the requirement docs, with clear layering and one deployable worker entrypoint.

## Structure

```text
apps/
  worker/
    src/
      api/
      live/
      mcp/
      queue/
      router/
      ui-shell/
packages/
  adapters/
  application/
  contracts/
  domain/
  projections/
  shared/
tests/
```

## Key Principles

- Single Worker entrypoint: `apps/worker/src/index.ts`
- One deployable surface for `/app`, `/api`, `/mcp`, `/healthz`
- Domain rules live under `packages/domain`
- Routes call application services only
- Read models and summaries are projection-driven
- Durable Objects handle coordination/live state
- Queues handle retry and deferred execution

## API Surfaces

- `GET /healthz`
- `GET /app`
- `GET /api/commands`
- `POST /api/commands`
- `GET /api/commands/:id`
- `POST /api/commands/:id/approve`
- `POST /api/commands/:id/reject`
- `POST /api/commands/:id/retry`
- `POST /api/commands/:id/cancel`
- `GET,POST /api/sessions`
- `POST /api/sessions/:id/renew`
- `POST /api/sessions/:id/revoke`
- `GET,POST /api/leases`
- `POST /api/leases/:id/release`
- `POST /api/leases/:id/revoke`
- `GET /api/events`
- `GET /api/events/:id`
- `GET,POST /api/missions`
- `GET /api/missions/:id`
- `GET /api/missions/:id/graph`
- `GET /api/missions/:id/graph/live`
- `GET /api/missions/:id/workers`
- `GET /api/missions/:id/learnings`
- `GET /api/missions/:id/retro`
- `GET /api/missions/:id/handoffs`
- `GET /api/missions/:id/evidence`
- `GET /api/missions/:id/playback`
- `GET /api/missions/:id/live`
- `POST /api/missions/:id/workers`
- `POST /api/missions/:id/handoffs`
- `GET /api/queue`
- `GET /api/quality`
- `GET /api/release-gate`
- `GET,POST /api/learnings`
- `GET /api/learnings/:id`
- `GET /api/retro`
- `GET /api/runs`
- `GET /api/state/summary`
- `GET,POST /api/approvals/yolo`
- `GET /api/approvals/scoped`
- `POST /api/approvals/scoped`
- `DELETE /api/approvals/scoped/:id`
- `GET /api/alerts`
- `GET /api/alerts/log`
- `POST /api/alerts/:id/read`
- `POST /api/alerts/:id/dismiss`
- `GET /api/alerts/:id/target`

## Mission Graph Modes

- Full graph: `GET /api/missions/:id/graph`
- Live graph: `GET /api/missions/:id/graph/live`

The live graph applies cooling, collapse, and archive rules. Playback and worker search keep the full trace.

## MCP

The worker exposes both a thin HTTP MCP gateway and a JSON-RPC MCP transport.

Thin HTTP:

- `GET /mcp/resources/*`
- `POST /mcp/tools/*`

JSON-RPC / Streamable HTTP style:

- `POST /mcp`
- `GET /mcp` with `Accept: text/event-stream`
- `DELETE /mcp`

Supported JSON-RPC methods:

- `initialize`
- `ping`
- `tools/list`
- `tools/call`
- `resources/list`
- `resources/templates/list`
- `resources/read`
- `resources/subscribe`
- `resources/unsubscribe`

Key MCP resources and tools include:

- `state://summary`
- `quality://summary`
- `release-gate://summary`
- `alerts://current`
- `alerts://log`
- `learnings://recent`
- `retro://summary`
- `mission://{id}/graph`
- `mission://{id}/live`
- `mission://{id}/playback`
- `mission://{id}/learnings`
- `mission://{id}/retro`
- `submit_command`
- `create_mission`
- `upsert_worker`
- `record_handoff`
- `capture_learning`
- `read_alert`
- `dismiss_alert`

SSE supports backlog drain, `Last-Event-ID` replay/resume, and long-lived `follow=1` fan-out streams.

## Operator Console

`/app` serves an interactive client-side console shell that:

- Boots from the server snapshot and refreshes live data
- Shows mission selection, live graph, playback, alerts, release checks, learnings, and retro
- Connects to mission live WebSocket updates
- Allows in-console alert read/dismiss actions
- Allows in-console learning capture

## Runtime Bindings

GitHub backing store settings:

- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_TOKEN`
- `GITHUB_BRANCH`

Cloudflare bindings:

- `MISSION_ROOM` Durable Object binding
- `CONTROL_QUEUE` Queue binding

`wrangler.toml` includes these bindings and the `MissionRoomDurableObject` migration.

## Validation

```bash
npm run typecheck
npm test
npm run build
```

## Current Status

The current scope includes the interactive console shell, MCP JSON-RPC transport, follow-capable SSE, mission live room wiring, queue retry flow, alert lifecycle, learning capture, retro summary, release gate, and quality aggregation. Remaining work is operational hardening and product polish rather than missing core surfaces.

Repository hygiene is also normalized for the new structure: generated artifacts are ignored via `.gitignore`, `node_modules` is no longer intended to be versioned, and the old `src/` plus `runtime/` prototype tree has been removed.
