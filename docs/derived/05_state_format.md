# 05_state_format

## Purpose
This file defines the machine-readable format for events, sessions, leases, and queue items stored in GitHub.

## Storage Path
All state is stored under the `.control-plane/` directory in the target repository.

## Event Schema
Events are stored in `.control-plane/events/YYYY/MM/DD/<eventId>.json`.

```json
{
  "eventId": "evt:cmd-123:emitted",
  "commandId": "cmd-123",
  "type": "COMMAND_EMITTED",
  "status": "emitted",
  "reason": null,
  "resource": {
    "repo": "owner/repo",
    "branch": "main",
    "path": "src/"
  },
  "payload": {},
  "createdAt": "2026-04-07T08:00:00.000Z"
}
```

## Session Schema
Sessions are stored in `.control-plane/sessions/<sessionId>.json`.

```json
{
  "sessionId": "sess-456",
  "role": "delivery",
  "templateVersion": "1.0.0",
  "createdAt": "2026-04-07T07:00:00.000Z",
  "expiresAt": "2026-04-07T10:00:00.000Z"
}
```

## Lease Schema
Leases are stored in `.control-plane/leases/<leaseId>.json`.

```json
{
  "leaseId": "lease-789",
  "sessionId": "sess-456",
  "resource": {
    "repo": "owner/repo",
    "branch": "main",
    "path": "src/"
  },
  "status": "active",
  "createdAt": "2026-04-07T08:00:00.000Z",
  "expiresAt": "2026-04-07T09:00:00.000Z"
}
```

## Queue Item Schema
Queue items are stored in `.control-plane/queues/<queueName>/<itemId>.json`.

```json
{
  "itemId": "item-abc",
  "queue": "delivery-queue",
  "priority": "high",
  "blocking": true,
  "createdAt": "2026-04-07T08:05:00.000Z",
  "payload": {}
}
```

## State Transitions
Commands follow a deterministic path:
1.  **RECEIVED:** External input validated.
2.  **QUEUED (Optional):** Resource conflict detected; placed in the conflict queue.
3.  **REJECTED:** Validation, authority, or guardrail check failed.
4.  **EMITTED:** Command cleared for execution; side-effect request created.
5.  **COMPLETED:** Side-effect execution reported success.

| Current Type | Next Type | Condition |
| :--- | :--- | :--- |
| (None) | RECEIVED | External request arrival |
| RECEIVED | QUEUED | `conflictKey` match with active lease |
| RECEIVED | REJECTED | `authority` or `guardrail` fail |
| RECEIVED | EMITTED | All checks pass |
| EMITTED | COMPLETED | Side-effect executor returns `success` |
| EMITTED | REJECTED | Side-effect executor returns `failure` |

## Idempotency Rules
*   **Dedup Key:** Each command must include a client-generated `dedupKey`. 
*   **Storage-based check:** Before processing, the Mission Kernel checks for an existing event with the same `dedupKey`.
*   **Deterministic eventId:** `eventId` is derived from `commandId` and `status` to prevent duplicate file creation.

## Conflict Resolution
*   **Conflict Key:** Granular identification of the resource being modified (e.g., `repo:branch:path`).
*   **Lease Locking:** Only one session can hold an "active" lease on a specific `conflictKey`.
*   **Queueing:** When a conflict is detected, the command is moved to the `conflict` queue and its status becomes `queued`.

## What this file does not cover
- Cloudflare KV metadata mapping
- API implementation details
- Repository auth details
