# Cloudflare Control Plane / Director Mesh

This repository implements a Cloudflare-based control plane that coordinates agent delivery work while keeping GitHub as the source of truth for all persistent state and artifacts.

## Quick Start & Execution

### 1. Environment Variables
The following environment variables must be configured in `wrangler.toml` or as secrets:

- `GITHUB_OWNER`: GitHub organization or user name.
- `GITHUB_REPO`: The repository name where state is stored.
- `GITHUB_TOKEN`: A GitHub Personal Access Token (PAT) with repo scope.
- `GITHUB_BRANCH`: **Must be explicitly configured** (e.g., `master` or `main`). It must match the default branch of the target repository.

### 2. Validation Commands
Before deploying or committing, run these commands:

```bash
# Type check
npx tsc --noEmit

# Run tests
npm test

# Build/Deploy dry-run
npx wrangler deploy --dry-run
```

### 3. Worker Endpoints
- `GET /health`: Returns service status.
- `POST /commands`: Processes control plane commands.

### 4. Command Payload Example
```json
{
  "commandId": "cmd_123",
  "dedupKey": "unique_operation_id",
  "action": "task_create",
  "resource": {
    "repo": "my-org/my-repo",
    "branch": "feature-x",
    "path": "src/module.ts"
  },
  "payload": {
    "title": "Fix bug in module",
    "description": "...",
    "explicitLive": true
  }
}
```

- **Conflict Detection**: `dedupKey` is used for idempotent operations. `conflictKey` (generated internally) ensures no multi-writer conflicts on the same resource.
- **Live Deployment**: Actions involving live deployment (e.g., `deploy_live`) require `payload.explicitLive: true`.

---

## Documentation Structure

- **CLI start baseline**: `00_design_baseline.md`
- **CLI current progress**: `01_current_progress.md`
- **System shape**: `docs/derived/01_overview.md`
- **Runtime boundaries**: `docs/derived/02_runtime_boundary.md`
- **Guardrails**: `docs/derived/03_guardrail.md`
- **State format**: `docs/derived/05_state_format.md`
- **Decision records**: `docs/adr/`
- **Machine-readable index**: `registry/doc_index.json`

## Rules & Principles
1. **GitHub as Source of Truth**: Cloudflare is the control plane; GitHub is the persistent storage.
2. **Event-Driven**: All state changes are driven by events.
3. **Explicit Approval**: Live deployments require explicit approval/payload flags.
4. **No Multi-Writer**: Concurrent modifications to the same resource are blocked.
5. **No Branch Fallbacks**: The target branch must be explicitly configured.
