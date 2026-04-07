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

## Dedup and Conflict Keys
- Dedup check: Check if `.control-plane/events/*/*/*/<commandId>*` exists. (Optimization: use a summary index if needed).
- Conflict check: Check if any active lease exists for the same resource.

## What this file does not cover
- Cloudflare KV metadata mapping
- API implementation details
- Repository auth details
