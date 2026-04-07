# ADR 002: GitHub as the Single Source of Truth

## Status
Accepted

## Context
The system needs a reliable, auditable, and persistent storage for both real artifacts (code, docs) and control plane metadata (events, leases, sessions). 
Cloudflare provides a powerful execution environment but storing complex, long-lived state directly in Cloudflare KV or D1 without a clear audit trail or external visibility creates "black box" state. 

We need to ensure that the state of the control plane is as transparent and versionable as the code it manages.

## Decision
We will use **GitHub** as the single source of truth (SoT) for ALL persistent data:
1.  **Artifact Plane:** All code, documentation, and configuration files.
2.  **Control Plane State:** All events, session records, leases, and queue items will be stored as JSON files within a hidden `.control-plane/` directory in the managed repository.

Cloudflare will be used for:
*   Real-time request handling and routing.
*   Executing the Mission Kernel logic.
*   Transient caching of metadata for performance (optional).

## Consequences
*   **Auditability:** Every state change is a Git commit (or a file write visible in the repo history), providing a perfect audit trail.
*   **Consistency:** By placing state in the same repo as artifacts, we can ensure atomic-like updates (e.g., updating a file and recording the event).
*   **Latency:** Writes to GitHub via API are slower than local DB writes. This is acceptable for a control plane coordinating agent work (not high-frequency trading).
*   **Availability:** The control plane's availability is tied to GitHub's API availability.
*   **No Multi-Writer:** To prevent race conditions on GitHub files, the system must strictly enforce single-writer access via leases.

## What this file does not cover
*   Specific GitHub API rate limit handling.
*   Git commit signing policies.
*   Encryption at rest for sensitive metadata (if any).
