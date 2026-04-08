import type { JsonRpcNotification } from "./protocol";

interface SessionEvent {
  id: string;
  message: JsonRpcNotification;
}

interface BrokerSessionRecord {
  id: string;
  initialized: boolean;
  subscriptions: string[];
  events: SessionEvent[];
  deliveredEventId?: string;
  nextSequence: number;
  createdAt: string;
  updatedAt: string;
}

interface BrokerFollower {
  id: string;
  cursor: string;
  queue: SessionEvent[];
  wake?: () => void;
  closed: boolean;
}

const SESSION_PREFIX = "mcp:session:";
const MAX_EVENT_HISTORY = 256;

export class McpBrokerDurableObject {
  private readonly followersBySession = new Map<string, Map<string, BrokerFollower>>();

  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "POST" && path === "/initialize") {
      const session = await this.createSession();
      return Response.json({ session });
    }

    if (request.method === "POST" && path === "/notify") {
      const body = await request.json().catch(() => ({})) as { updatedResources?: string[]; listChanged?: boolean };
      await this.notify(body.updatedResources ?? [], body.listChanged === true);
      return Response.json({ ok: true });
    }

    const sessionMatch = /^\/session\/([^/]+)(?:\/(initialized|subscribe|unsubscribe|events))?$/.exec(path);
    if (!sessionMatch) {
      return new Response("mcp_broker", { status: 200 });
    }

    const sessionId = decodeURIComponent(sessionMatch[1]);
    const action = sessionMatch[2];

    if (!action && request.method === "GET") {
      const session = await this.getSession(sessionId);
      return session
        ? Response.json({ session: toSessionSummary(session) })
        : Response.json({ error: "session_not_found" }, { status: 404 });
    }

    if (!action && request.method === "DELETE") {
      return (await this.deleteSession(sessionId))
        ? new Response(null, { status: 204 })
        : Response.json({ error: "session_not_found" }, { status: 404 });
    }

    if (action === "initialized" && request.method === "POST") {
      const session = await this.getSession(sessionId);
      if (!session) {
        return Response.json({ error: "session_not_found" }, { status: 404 });
      }
      session.initialized = true;
      session.updatedAt = new Date().toISOString();
      await this.putSession(session);
      return Response.json({ session: toSessionSummary(session) });
    }

    if ((action === "subscribe" || action === "unsubscribe") && request.method === "POST") {
      const session = await this.getSession(sessionId);
      if (!session) {
        return Response.json({ error: "session_not_found" }, { status: 404 });
      }

      const body = await request.json().catch(() => ({})) as { uri?: string };
      if (!body.uri) {
        return Response.json({ error: "uri_required" }, { status: 400 });
      }

      const subscriptions = new Set(session.subscriptions);
      if (action === "subscribe") {
        subscriptions.add(body.uri);
      } else {
        subscriptions.delete(body.uri);
      }

      session.subscriptions = Array.from(subscriptions).sort();
      session.updatedAt = new Date().toISOString();
      await this.putSession(session);
      return Response.json({ session: toSessionSummary(session) });
    }

    if (action === "events" && request.method === "GET") {
      return this.streamSessionEvents(sessionId, {
        lastEventId: request.headers.get("last-event-id") ?? request.headers.get("Last-Event-ID") ?? url.searchParams.get("lastEventId"),
        follow: url.searchParams.get("follow") === "1" || url.searchParams.get("follow") === "true",
        heartbeatMs: parseHeartbeatMs(url.searchParams.get("heartbeatMs")),
        abortSignal: request.signal,
      });
    }

    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  private async createSession(): Promise<BrokerSessionRecord> {
    const now = new Date().toISOString();
    const session: BrokerSessionRecord = {
      id: crypto.randomUUID(),
      initialized: false,
      subscriptions: [],
      events: [],
      nextSequence: 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.putSession(session);
    return session;
  }

  private async getSession(sessionId: string): Promise<BrokerSessionRecord | null> {
    return await this.state.storage.get<BrokerSessionRecord>(sessionKey(sessionId)) ?? null;
  }

  private async putSession(session: BrokerSessionRecord): Promise<void> {
    await this.state.storage.put(sessionKey(session.id), session);
  }

  private async deleteSession(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return false;
    }

    await this.state.storage.delete(sessionKey(sessionId));
    this.closeFollowers(sessionId);
    return true;
  }

  private async listSessions(): Promise<BrokerSessionRecord[]> {
    const entries = await this.state.storage.list<BrokerSessionRecord>({ prefix: SESSION_PREFIX });
    return Array.from(entries.values());
  }

  private async notify(updatedResources: string[], listChanged: boolean): Promise<void> {
    const sessions = await this.listSessions();
    for (const session of sessions) {
      if (!session.initialized) {
        continue;
      }

      let changed = false;
      if (listChanged) {
        enqueueSessionEvent(session, { jsonrpc: "2.0", method: "notifications/resources/list_changed" });
        changed = true;
      }

      for (const uri of updatedResources) {
        if (session.subscriptions.includes(uri)) {
          enqueueSessionEvent(session, {
            jsonrpc: "2.0",
            method: "notifications/resources/updated",
            params: { uri },
          });
          changed = true;
        }
      }

      if (!changed) {
        continue;
      }

      session.updatedAt = new Date().toISOString();
      await this.putSession(session);
      this.enqueueFollowerBatch(session.id, session.events);
    }
  }

  private async streamSessionEvents(
    sessionId: string,
    options: { lastEventId?: string | null; follow: boolean; heartbeatMs: number; abortSignal?: AbortSignal },
  ): Promise<Response> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return Response.json({ error: "session_not_found" }, { status: 404 });
    }

    if (!options.follow) {
      const pending = pendingEvents(session, options.lastEventId);
      if (pending.length > 0) {
        session.deliveredEventId = pending[pending.length - 1].id;
        session.updatedAt = new Date().toISOString();
        await this.putSession(session);
      }

      return new Response(
        new ReadableStream<Uint8Array>({
          start: (controller) => {
            const encoder = new TextEncoder();
            for (const event of pending) {
              controller.enqueue(encoder.encode(formatSseEvent(event.id, event.message)));
            }
            controller.close();
          },
        }),
        { headers: sseHeaders() },
      );
    }

    const encoder = new TextEncoder();
    const initial = pendingEvents(session, options.lastEventId);
    const follower = this.createFollower(sessionId, options.lastEventId ?? session.deliveredEventId ?? "", initial);

    let cancel = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        let closed = false;
        let heartbeat: ReturnType<typeof setInterval> | undefined;
        const close = () => {
          if (closed) {
            return;
          }
          closed = true;
          clearInterval(heartbeat);
          options.abortSignal?.removeEventListener("abort", close);
          this.closeFollower(sessionId, follower.id);
          try {
            controller.close();
          } catch {}
        };
        cancel = close;

        heartbeat = setInterval(() => {
          if (closed) {
            return;
          }
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            close();
          }
        }, options.heartbeatMs);

        options.abortSignal?.addEventListener("abort", close, { once: true });

        try {
          while (!closed) {
            const batch = await readFollowerBatch(follower);
            if (batch === null) {
              break;
            }
            if (batch.length > 0) {
              const latest = batch[batch.length - 1].id;
              const current = await this.getSession(sessionId);
              if (current) {
                current.deliveredEventId = latest;
                current.updatedAt = new Date().toISOString();
                await this.putSession(current);
              }
            }
            for (const event of batch) {
              controller.enqueue(encoder.encode(formatSseEvent(event.id, event.message)));
            }
          }
        } finally {
          close();
        }
      },
      cancel() {
        cancel();
      },
    });

    return new Response(stream, { headers: sseHeaders() });
  }

  private createFollower(sessionId: string, cursor: string, initialQueue: SessionEvent[]): BrokerFollower {
    const follower: BrokerFollower = {
      id: crypto.randomUUID(),
      cursor,
      queue: initialQueue.slice(),
      closed: false,
    };
    const sessionFollowers = this.followersBySession.get(sessionId) ?? new Map<string, BrokerFollower>();
    sessionFollowers.set(follower.id, follower);
    this.followersBySession.set(sessionId, sessionFollowers);
    return follower;
  }

  private enqueueFollowerBatch(sessionId: string, events: SessionEvent[]): void {
    const followers = this.followersBySession.get(sessionId);
    if (!followers) {
      return;
    }

    for (const follower of followers.values()) {
      const freshEvents = events.filter((event) => event.id > follower.cursor && !follower.queue.some((queued) => queued.id === event.id));
      if (freshEvents.length === 0) {
        continue;
      }
      follower.queue.push(...freshEvents);
      const wake = follower.wake;
      follower.wake = undefined;
      wake?.();
    }
  }

  private closeFollowers(sessionId: string): void {
    const followers = this.followersBySession.get(sessionId);
    if (!followers) {
      return;
    }

    for (const follower of followers.values()) {
      this.closeFollower(sessionId, follower.id);
    }
  }

  private closeFollower(sessionId: string, followerId: string): void {
    const followers = this.followersBySession.get(sessionId);
    const follower = followers?.get(followerId);
    if (!followers || !follower) {
      return;
    }

    follower.closed = true;
    followers.delete(followerId);
    if (followers.size === 0) {
      this.followersBySession.delete(sessionId);
    }
    const wake = follower.wake;
    follower.wake = undefined;
    wake?.();
  }
}

function sessionKey(sessionId: string): string {
  return `${SESSION_PREFIX}${sessionId}`;
}

function toSessionSummary(session: BrokerSessionRecord): Record<string, unknown> {
  return {
    id: session.id,
    initialized: session.initialized,
    subscriptions: session.subscriptions,
    deliveredEventId: session.deliveredEventId,
    nextSequence: session.nextSequence,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function enqueueSessionEvent(session: BrokerSessionRecord, message: JsonRpcNotification): void {
  session.events.push({
    id: String(session.nextSequence++).padStart(12, "0"),
    message,
  });
  if (session.events.length > MAX_EVENT_HISTORY) {
    session.events = session.events.slice(-MAX_EVENT_HISTORY);
  }
}

function pendingEvents(session: BrokerSessionRecord, lastEventId?: string | null): SessionEvent[] {
  return session.events.filter((event) => event.id > (lastEventId ?? session.deliveredEventId ?? ""));
}

async function readFollowerBatch(follower: BrokerFollower): Promise<SessionEvent[] | null> {
  if (follower.closed) {
    return null;
  }

  if (follower.queue.length > 0) {
    const batch = follower.queue.splice(0);
    follower.cursor = batch[batch.length - 1]?.id ?? follower.cursor;
    return batch;
  }

  return new Promise<SessionEvent[] | null>((resolve) => {
    follower.wake = () => {
      follower.wake = undefined;
      if (follower.closed) {
        resolve(null);
        return;
      }

      const batch = follower.queue.splice(0);
      follower.cursor = batch[batch.length - 1]?.id ?? follower.cursor;
      resolve(batch);
    };
  });
}

function parseHeartbeatMs(value: string | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : 15000;
}

function formatSseEvent(id: string, message: unknown): string {
  return `id: ${id}\ndata: ${JSON.stringify(message)}\n\n`;
}

function sseHeaders(): HeadersInit {
  return {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "content-encoding": "identity",
  };
}
