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
- `GET /login`
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
- `GET /api/queue/summary`
- `GET /api/queue/dlq`
- `POST /api/queue/dlq/:id/requeue`
- `POST /api/queue/dlq/:id/dismiss`
- `GET /api/observability`
- `GET /api/quality`
- `GET /api/release-gate`
- `GET,POST /api/learnings`
- `GET /api/learnings/:id`
- `GET /api/retro`
- `GET /api/runs`
- `GET,POST /api/requests`
- `GET /api/requests/:id`
- `POST /api/requests/:id/claim`
- `POST /api/requests/:id/heartbeat`
- `POST /api/requests/:id/status`
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
- `GET /mcp/app`
- `POST /mcp/app`

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
- `queue://active`
- `queue://dead-letter`
- `requests://active`
- `observability://summary`
- `alerts://current`
- `alerts://log`
- `learnings://recent`
- `retro://summary`
- `mission://{id}/graph`
- `mission://{id}/live`
- `mission://{id}/playback`
- `mission://{id}/learnings`
- `mission://{id}/requests`
- `mission://{id}/retro`
- `submit_command`
- `submit_operator_request`
- `claim_request`
- `update_request_status`
- `create_mission`
- `upsert_worker`
- `record_handoff`
- `capture_learning`
- `read_alert`
- `dismiss_alert`
- `requeue_dead_letter`
- `dismiss_dead_letter`

SSE supports backlog drain, `Last-Event-ID` replay/resume, and long-lived `follow=1` fan-out streams.

When `MCP_BROKER` is bound, MCP sessions, subscriptions, and SSE replay state are persisted through the broker Durable Object instead of an in-memory map.

`/mcp/app` is the ChatGPT Developer Mode remote MCP surface. It intentionally exposes only the safe subset needed to enqueue operator requests from ChatGPT into the main orchestrator lane.

## Auth

When any control-plane auth variable is configured, `/app`, `/api`, and `/mcp` require authentication.

- Browser operators authenticate through `GET,POST /login` and receive a signed cookie
- Bearer tokens support `viewer` and `operator` roles
- `viewer` can read `/api` and `/mcp` resources but cannot mutate state
- `operator` can use mutating `/api` endpoints, `/mcp/tools/*`, and JSON-RPC `tools/call`

## Operator Console

`/app` serves an interactive client-side console shell that:

- Boots from the server snapshot and refreshes live data
- Shows mission selection, live graph, completed mode, sessions, handoffs, evidence, alerts, release checks, learnings, retro, and operator requests
- Connects to mission live WebSocket updates
- Allows in-console alert read/dismiss actions
- Allows in-console learning capture
- Allows command approve, retry, reject, and cancel actions
- Allows scoped approval creation and deletion
- Shows DLQ/dead-letter commands with requeue and dismiss actions
- Supports worker filters and saved views
- Allows in-console YOLO mode toggling and logout

## Runtime Bindings

GitHub backing store settings:

- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_BRANCH`
- `GITHUB_TOKEN`

GitHub App backing store settings:

- `GITHUB_APP_ID`
- `GITHUB_APP_CLIENT_ID`
- `GITHUB_INSTALLATION_ID`
- `GITHUB_PRIVATE_KEY`

When both static token and GitHub App credentials are configured, the worker prefers the GitHub App path and mints short-lived installation tokens on demand.

## GitHub App Setup

Use a GitHub App for production-backed state writes instead of a long-lived personal token.

1. Create a GitHub App and install it on `iusung111/cloudflare-control-plane-director-mesh` or your target repository only.
2. Grant repository permission `Contents: Read and write`.
3. Record the App identifiers:
   - `App ID`
   - `Client ID` (`Iv1...`, recommended JWT issuer)
   - `Installation ID`
4. Generate a private key for the app and store the PEM contents as a Cloudflare secret.
5. Configure Worker secrets:

```bash
npx wrangler secret put GITHUB_OWNER
npx wrangler secret put GITHUB_REPO
npx wrangler secret put GITHUB_BRANCH
npx wrangler secret put GITHUB_APP_ID
npx wrangler secret put GITHUB_APP_CLIENT_ID
npx wrangler secret put GITHUB_INSTALLATION_ID
npx wrangler secret put GITHUB_PRIVATE_KEY
```

Recommended values:

- `GITHUB_OWNER=iusung111`
- `GITHUB_REPO=cloudflare-control-plane-director-mesh`
- `GITHUB_BRANCH=master`

The worker accepts both `-----BEGIN RSA PRIVATE KEY-----` (PKCS#1, GitHub default download) and `-----BEGIN PRIVATE KEY-----` (PKCS#8) PEM formats.

Cloudflare bindings:

- `MISSION_ROOM` Durable Object binding
- `MCP_BROKER` Durable Object binding
- `CONTROL_STATE` Durable Object binding
- `CONTROL_QUEUE` Queue binding

Control-plane auth settings:

- `CONTROL_PLANE_OPERATOR_TOKEN`
- `CONTROL_PLANE_VIEWER_TOKEN`
- `CONTROL_PLANE_APP_PASSWORD`
- `CONTROL_PLANE_COOKIE_SECRET`

`wrangler.toml` includes these bindings, queue DLQ settings, and the `MissionRoomDurableObject` plus `McpBrokerDurableObject` migrations.

## Validation

```bash
npm run typecheck
npm test
npm run test:ui
npm run test:load
npm run test:chaos
npm run build
```

Browser E2E:

```bash
TEST_BASE_URL=https://cloudflare-control-plane-director-mesh.iusung111.workers.dev \
TEST_OPERATOR_TOKEN=... \
TEST_APP_PASSWORD=... \
npm run test:e2e
```

## Current Status

The worker now covers the requirement-doc gaps that were still open earlier in the project:

- operator request lane and orchestrator queue handoff
- ChatGPT app-style remote MCP entrypoint
- Korean approval-button handling in the operator console
- sessions, handoffs, evidence drawer, completed mode, saved views, and worker filters in `/app`
- approval-scope and alert-unread coordination through `CONTROL_STATE`
- observability summaries, structured request tracing, and queue-side mutation fan-out
- load pack, chaos-lite, UI shell, and browser E2E validation scripts

The remaining work is operational hardening, not missing platform surface. See `docs/derived/orchestrator_chatgpt_console_flow.md`.

Repository hygiene is also normalized for the new structure: generated artifacts are ignored via `.gitignore`, `node_modules` is no longer intended to be versioned, and the old `src/` plus `runtime/` prototype tree has been removed.
