# Orchestrator + ChatGPT + Console Flow

Updated: 2026-04-09

## Goal

Close the remaining requirement-doc gaps around:

- console-originated operator requests
- main orchestrator queue handoff
- Korean approval-button handling in the web console
- ChatGPT Developer Mode app-style attachment through remote MCP
- queue, DO, observability, and validation completeness

## Delivered

### Operator Request Lane

- `POST /api/requests` stores a first-class `OperatorRequestRecord`
- queue kinds now include `dispatch-operator-request`
- request lifecycle supports:
  - `received`
  - `queued_for_orchestrator`
  - `claimed`
  - `planning`
  - `awaiting_approval`
  - `browser_action_pending`
  - `executing`
  - `completed`
  - `failed`
  - `cancelled`
- console shows `Operator Requests` and request counts in the dashboard

Primary files:

- `packages/contracts/src/operator-request.ts`
- `packages/application/src/requests/*`
- `apps/worker/src/api/requests.route.ts`
- `apps/worker/src/ui-shell/console-shell.ts`

### ChatGPT App Attachment

- public remote MCP entrypoint: `GET,POST /mcp/app`
- safe app subset:
  - tool: `submit_operator_request`
  - resources:
    - `missions://active`
    - `requests://active`
    - `quality://summary`
    - `observability://summary`
    - `mission://{id}/requests`
- designed for ChatGPT Developer Mode remote MCP attachment
- current auth mode is no-auth safe subset for initialize/list/tool-call on the app route

Primary files:

- `apps/worker/src/router/mcp-router.ts`
- `apps/worker/src/mcp/catalog.ts`
- `tests/operator-requests.test.ts`

### Korean Approval Handling

- console command actions render Korean labels:
  - `승인`
  - `재시도`
  - `거부`
  - `취소`
- stable selectors are preserved with `data-command-action` and `data-id`
- related operator requests now auto-converge when the linked command completes, fails, or is cancelled

Primary files:

- `apps/worker/src/ui-shell/console-shell.ts`
- `apps/worker/src/commands/command-side-effects.ts`
- `apps/worker/src/api/commands.route.ts`
- `apps/worker/src/mcp/catalog.ts`

### Queue and DO Completion

- `CONTROL_STATE` Durable Object now backs:
  - scoped approval cache
  - alert unread state overlay
- queue kinds now have real handlers:
  - `retry-command`
  - `execute-command`
  - `dispatch-operator-request`
  - `projection-rebuild`
  - `alert-fanout`
  - `browser-evidence-postprocess`
- mission projection rebuild pushes fresh snapshots to the mission room and publishes MCP mutation notifications

Primary files:

- `apps/worker/src/state/control-state.do.ts`
- `apps/worker/src/state/control-state.client.ts`
- `apps/worker/src/queue/process-control-queue.ts`
- `apps/worker/src/missions/projection-rebuild.ts`
- `apps/worker/src/notifications/mutation-publisher.ts`

### Console Requirement Closure

The console now includes the previously missing document items:

- `Sessions / Leases`
- `Mission Live View`
- `Worker Graph`
- `Live Agent Summary`
- `Handoff Inspector`
- `Evidence Drawer`
- `Completed` mode
- worker filters
- saved views
- observability panel
- operator request form

Primary file:

- `apps/worker/src/ui-shell/console-shell.ts`

## Validation Surface

### Automated

- unit/integration:
  - `npm test`
- UI shell presence:
  - `npm run test:ui`
- load pack:
  - `npm run test:load`
- chaos-lite:
  - `npm run test:chaos`
- browser E2E:
  - `npm run test:e2e`

### Browser E2E Scenario

`tests/e2e/console-flow.mjs` verifies:

1. create session, lease, and mission
2. create a `deploy_live` command that requires approval
3. submit an operator request through `/mcp/app`
4. claim the request as the orchestrator
5. log into `/app`
6. click the Korean `승인` button in the console
7. verify command status converges to `completed`
8. verify the related operator request converges to `completed`

Required environment variables:

- `TEST_BASE_URL`
- `TEST_OPERATOR_TOKEN`
- `TEST_APP_PASSWORD`
- optional `TEST_ARTIFACT_DIR`

## External Documentation Notes

Context7 was attempted first for vendor documentation lookup, but the MCP transport returned `Transport closed` during resolution in this session. Official OpenAI documentation was used as the fallback for remote MCP / ChatGPT Developer Mode guidance.

## Remaining Post-Implementation Work

No known requirement-doc feature gaps remain in the worker itself.

What remains is operational hardening only:

- optional migration from no-auth app route to mixed-auth or OAuth for broader ChatGPT app distribution
- stronger privacy-policy and app-review packaging if this is submitted to the ChatGPT app review flow
- production credential rotation and long-run monitoring
