import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = required("TEST_BASE_URL");
const operatorToken = required("TEST_OPERATOR_TOKEN");
const appPassword = required("TEST_APP_PASSWORD");
const artifactDir = process.env.TEST_ARTIFACT_DIR || path.join(process.cwd(), ".gstack", "e2e-artifacts");

const runId = `e2e-${Date.now()}`;
const missionId = `${runId}-mission`;
const sessionId = `${runId}-session`;
const leaseId = `${runId}-lease`;
const commandId = `${runId}-deploy-live`;
const requestId = `${runId}-approval-request`;

await mkdir(artifactDir, { recursive: true });

const operatorHeaders = {
  Authorization: `Bearer ${operatorToken}`,
  "content-type": "application/json",
};

await apiJson("/api/sessions", {
  method: "POST",
  headers: operatorHeaders,
  body: { sessionId, actorId: "e2e-operator", role: "delivery" },
  expectedStatus: 201,
});
await apiJson("/api/leases", {
  method: "POST",
  headers: operatorHeaders,
  body: {
    leaseId,
    sessionId,
    resource: {
      repo: "iusung111/cloudflare-control-plane-director-mesh",
      branch: "master",
      path: `ops/e2e/${runId}.txt`,
    },
  },
  expectedStatus: 201,
});
await apiJson("/api/missions", {
  method: "POST",
  headers: operatorHeaders,
  body: {
    missionId,
    title: `E2E ${runId}`,
    repoKey: "iusung111/cloudflare-control-plane-director-mesh",
    ownerActor: "e2e-operator",
    phase: "review",
  },
  expectedStatus: 201,
});

const command = await apiJson("/api/commands", {
  method: "POST",
  headers: operatorHeaders,
  body: {
    commandId,
    dedupKey: commandId,
    sessionId,
    leaseId,
    action: "deploy_live",
    resource: {
      repo: "iusung111/cloudflare-control-plane-director-mesh",
      branch: "master",
      path: `ops/e2e/${runId}.txt`,
    },
    payload: {
      missionId,
      explicitLive: false,
      note: "e2e-console-approval",
    },
  },
});
assert.ok(["queued", "rejected"].includes(command.status), `unexpected approval candidate state: ${command.status}`);

const mcpSessionId = await initializeAppSession();
await callAppTool(mcpSessionId, "submit_operator_request", {
  requestId,
  actorId: "chatgpt-e2e",
  source: "chatgpt_app",
  queue: "approval",
  locale: "ko",
  title: "승인 버튼 클릭",
  prompt: "메인 orchestrator가 콘솔에서 승인 버튼을 눌러 deploy_live를 승인해야 합니다.",
  missionId,
  relatedCommandId: commandId,
  targetUrl: `${baseUrl}/app`,
  selector: `[data-command-action='approve'][data-id='${commandId}']`,
  expectedText: "승인",
});

await poll(() => apiJson(`/api/requests/${encodeURIComponent(requestId)}`, {
  headers: { Authorization: `Bearer ${operatorToken}` },
}), (request) => request.status === "queued_for_orchestrator");

await apiJson(`/api/requests/${encodeURIComponent(requestId)}/claim`, {
  method: "POST",
  headers: operatorHeaders,
  body: { owner: "e2e-orchestrator" },
});

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

try {
  await page.goto(`${baseUrl}/app`, { waitUntil: "networkidle" });
  if (page.url().includes("/login")) {
    await page.fill("input[name='password']", appPassword);
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL(/\/app$/, { timeout: 15000 });
  }

  await page.waitForSelector("text=Operator Requests");
  await page.waitForSelector("text=Sessions / Leases");
  await page.waitForSelector("text=Handoff Inspector");
  await page.waitForSelector("text=Evidence Drawer");
  await page.selectOption("#mission-select", missionId);
  await page.waitForSelector(`[data-command-action='approve'][data-id='${commandId}']`, { timeout: 20000 });

  const approveButton = page.locator(`[data-command-action='approve'][data-id='${commandId}']`);
  await assertTextIncludes(approveButton, "승인");
  await approveButton.click();

  const completedCommand = await poll(() => apiJson(`/api/commands/${encodeURIComponent(commandId)}`, {
    headers: { Authorization: `Bearer ${operatorToken}` },
  }), (result) => result.status === "completed");
  const completedRequest = await poll(() => apiJson(`/api/requests/${encodeURIComponent(requestId)}`, {
    headers: { Authorization: `Bearer ${operatorToken}` },
  }), (result) => result.status === "completed");

  assert.equal(completedCommand.status, "completed");
  assert.equal(completedRequest.status, "completed");
  await page.screenshot({ path: path.join(artifactDir, `${runId}-console.png`), fullPage: true });
} finally {
  await browser.close();
  await apiJson(`/api/leases/${encodeURIComponent(leaseId)}/release`, {
    method: "POST",
    headers: operatorHeaders,
    body: {},
  });
  await apiJson(`/api/sessions/${encodeURIComponent(sessionId)}/revoke`, {
    method: "POST",
    headers: operatorHeaders,
    body: {},
  });
}

console.log(JSON.stringify({
  baseUrl,
  missionId,
  sessionId,
  leaseId,
  commandId,
  requestId,
  screenshot: path.join(artifactDir, `${runId}-console.png`),
  outcome: "passed",
}));

async function initializeAppSession() {
  const initialize = await fetch(`${baseUrl}/mcp/app`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "console-flow-e2e", version: "1.0.0" },
      },
    }),
  });
  assert.equal(initialize.status, 200);
  const sessionId = initialize.headers.get("Mcp-Session-Id");
  assert.ok(sessionId, "mcp app session id is required");

  const initialized = await fetch(`${baseUrl}/mcp/app`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  assert.equal(initialized.status, 202);
  return sessionId;
}

async function callAppTool(sessionId, name, args) {
  const response = await fetch(`${baseUrl}/mcp/app`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  return body.result?.structuredContent ?? body.result;
}

async function apiJson(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: options.method || "GET",
    headers: options.headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const expectedStatus = options.expectedStatus || 200;
  assert.equal(response.status, expectedStatus, `${route} -> ${response.status} ${await response.clone().text()}`);
  return response.status === 204 ? null : response.json();
}

async function poll(action, predicate, timeoutMs = 20000, intervalMs = 500) {
  const startedAt = Date.now();
  for (;;) {
    const value = await action();
    if (predicate(value)) {
      return value;
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`poll timeout: ${JSON.stringify(value)}`);
    }
    await delay(intervalMs);
  }
}

async function assertTextIncludes(locator, expected) {
  const text = await locator.textContent();
  assert.ok(text?.includes(expected), `expected "${text}" to include "${expected}"`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function required(name) {
  const value = process.env[name];
  assert.ok(value, `${name} is required`);
  return value;
}
