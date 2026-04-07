# 05_state_format

## Purpose
This file defines the machine-readable format for events, sessions, leases, and queue items stored in GitHub.

## Storage Path
All state is stored under the `.control-plane/` directory in the target repository.

## Event Schema
Events are stored in `.control-plane/events/YYYY/MM/DD/<eventId>.json`.
`eventId` format: `evt:<commandId>:<status>:<timestamp>`

```json
{
  "eventId": "evt:cmd-123:emitted:1712476800000",
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

## Dedup Index Schema
Dedup indices are stored in `.control-plane/dedup/<hashed_dedupKey>.json`.
The filename is a simple hash of the `dedupKey` to ensure safety across file systems and APIs.

```json
{
  "dedupKey": "client-provided-dedup-key-123",
  "commandId": "cmd-123",
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
  "queue": "conflict",
  "priority": "P2",
  "blocking": true,
  "createdAt": "2026-04-07T08:05:00.000Z",
  "payload": {}
}
```

## State Transitions
Commands follow a deterministic path:
1.  **COMMAND_RECEIVED / received:** External input validated.
2.  **COMMAND_QUEUED / queued:** Resource conflict detected; placed in the conflict queue.
3.  **COMMAND_REJECTED / rejected:** Validation, authority, or guardrail check failed.
4.  **COMMAND_EMITTED / emitted:** Command cleared for execution; side-effect request created.
5.  **COMMAND_COMPLETED / completed:** Side-effect execution reported success.
6.  **COMMAND_FAILED / failed:** Side-effect execution failed or was blocked.

| Current Type | Next Type | Condition |
| :--- | :--- | :--- |
| (None) | RECEIVED | External request arrival |
| RECEIVED | QUEUED | Resource match with active lease (excluding current lease) |
| RECEIVED | REJECTED | `authority` or `guardrail` fail, or invalid `conflictKey` |
| RECEIVED | EMITTED | All checks pass |
| EMITTED | COMPLETED | Side-effect executor returns `success` |
| EMITTED | FAILED | Side-effect executor returns `failure` or `blocked` |

## Idempotency Rules
*   **Dedup Key:** Each command must include a client-generated `dedupKey`. 
*   **Storage-based check:** Before processing, the Mission Kernel checks for an existing dedup index file.
*   **Hashed Path:** `dedupKey` is hashed to create a safe filename in `.control-plane/dedup/`.

## Conflict Resolution
*   **Conflict Key:** Normalized identification of the resource: `repo:branch:path` (all lowercase, trimmed).
*   **Validation:** `conflictKey` must exactly match the normalized `resource` scope.
*   **Lease Locking:** Only one session can hold an "active" lease on a specific resource.
*   **Self-Lock Waiver:** If the current command's `leaseId` matches the active lock, it is NOT considered a conflict.

## What this file does not cover
- Cloudflare KV metadata mapping
- API implementation details
- Repository auth details
