import type { WorkerEnv } from "../services";

export interface BrokerSessionSummary {
  id: string;
  initialized: boolean;
  subscriptions: string[];
  deliveredEventId?: string;
  nextSequence: number;
  createdAt: string;
  updatedAt: string;
}

export async function createBrokerSession(env?: WorkerEnv): Promise<BrokerSessionSummary | null> {
  const response = await brokerFetch(env, "https://mcp-broker.internal/initialize", { method: "POST" });
  if (!response) {
    return null;
  }
  const body = await response.json() as { session: BrokerSessionSummary };
  return body.session;
}

export async function getBrokerSession(env: WorkerEnv | undefined, sessionId: string): Promise<BrokerSessionSummary | null> {
  const response = await brokerFetch(env, sessionUrl(sessionId));
  if (!response || response.status === 404) {
    return null;
  }
  const body = await response.json() as { session: BrokerSessionSummary };
  return body.session;
}

export async function markBrokerSessionInitialized(env: WorkerEnv | undefined, sessionId: string): Promise<void> {
  await brokerFetch(env, `${sessionUrl(sessionId)}/initialized`, { method: "POST" });
}

export async function subscribeBrokerResource(env: WorkerEnv | undefined, sessionId: string, uri: string): Promise<void> {
  await brokerFetch(env, `${sessionUrl(sessionId)}/subscribe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ uri }),
  });
}

export async function unsubscribeBrokerResource(env: WorkerEnv | undefined, sessionId: string, uri: string): Promise<void> {
  await brokerFetch(env, `${sessionUrl(sessionId)}/unsubscribe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ uri }),
  });
}

export async function deleteBrokerSession(env: WorkerEnv | undefined, sessionId: string): Promise<boolean> {
  const response = await brokerFetch(env, sessionUrl(sessionId), { method: "DELETE" });
  return response?.status === 204;
}

export async function notifyBrokerMutations(
  env: WorkerEnv | undefined,
  input: { updatedResources: string[]; listChanged?: boolean },
): Promise<void> {
  await brokerFetch(env, "https://mcp-broker.internal/notify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function fetchBrokerEventStream(
  env: WorkerEnv | undefined,
  sessionId: string,
  input: { lastEventId?: string | null; follow: boolean; heartbeatMs: number },
): Promise<Response | null> {
  const url = new URL(`${sessionUrl(sessionId)}/events`);
  url.searchParams.set("follow", input.follow ? "1" : "0");
  url.searchParams.set("heartbeatMs", String(input.heartbeatMs));
  if (input.lastEventId) {
    url.searchParams.set("lastEventId", input.lastEventId);
  }

  return brokerFetch(env, url.toString(), {
    headers: input.lastEventId ? { "last-event-id": input.lastEventId } : undefined,
  });
}

function sessionUrl(sessionId: string): string {
  return `https://mcp-broker.internal/session/${encodeURIComponent(sessionId)}`;
}

async function brokerFetch(env: WorkerEnv | undefined, url: string, init?: RequestInit): Promise<Response | null> {
  const namespace = env?.MCP_BROKER;
  if (!namespace) {
    return null;
  }

  const stub = namespace.get(namespace.idFromName("mcp-broker"));
  return stub.fetch(url, init);
}
