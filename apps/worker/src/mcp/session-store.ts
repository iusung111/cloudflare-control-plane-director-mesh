import type { JsonRpcNotification } from "./protocol";

interface SessionEvent {
  id: string;
  message: JsonRpcNotification;
}

interface SessionFollower {
  id: string;
  cursor: string;
  queue: SessionEvent[];
  wake?: () => void;
  closed: boolean;
}

interface McpSession {
  id: string;
  initialized: boolean;
  subscriptions: Set<string>;
  events: SessionEvent[];
  followers: Map<string, SessionFollower>;
  deliveredEventId?: string;
  nextSequence: number;
}

export interface SessionEventFollower {
  read(): Promise<SessionEvent[] | null>;
  close(): void;
}

const sessions = new Map<string, McpSession>();
const MAX_EVENT_HISTORY = 256;

export function createSession(): McpSession {
  const session: McpSession = {
    id: crypto.randomUUID(),
    initialized: false,
    subscriptions: new Set<string>(),
    events: [],
    followers: new Map<string, SessionFollower>(),
    nextSequence: 1,
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(sessionId: string | null | undefined): McpSession | null {
  if (!sessionId) {
    return null;
  }
  return sessions.get(sessionId) ?? null;
}

export function markSessionInitialized(sessionId: string): void {
  const session = getSession(sessionId);
  if (session) {
    session.initialized = true;
  }
}

export function terminateSession(sessionId: string): boolean {
  const session = getSession(sessionId);
  if (!session) {
    return false;
  }

  for (const follower of session.followers.values()) {
    closeFollower(session, follower.id);
  }

  return sessions.delete(sessionId);
}

export function subscribeToResource(sessionId: string, uri: string): void {
  getSession(sessionId)?.subscriptions.add(uri);
}

export function unsubscribeFromResource(sessionId: string, uri: string): void {
  getSession(sessionId)?.subscriptions.delete(uri);
}

export function enqueueMutationNotifications(input: {
  updatedResources: string[];
  listChanged?: boolean;
}): void {
  for (const session of sessions.values()) {
    if (!session.initialized) {
      continue;
    }

    if (input.listChanged) {
      enqueue(session, { jsonrpc: "2.0", method: "notifications/resources/list_changed" });
    }

    for (const uri of input.updatedResources) {
      if (session.subscriptions.has(uri)) {
        enqueue(session, {
          jsonrpc: "2.0",
          method: "notifications/resources/updated",
          params: { uri },
        });
      }
    }
  }
}

export function drainSessionEvents(sessionId: string, lastEventId?: string | null): SessionEvent[] {
  const session = getSession(sessionId);
  if (!session) {
    return [];
  }

  const pending = session.events.filter((event) => event.id > (lastEventId ?? session.deliveredEventId ?? ""));
  if (pending.length > 0) {
    session.deliveredEventId = pending[pending.length - 1].id;
  }

  return pending;
}

export function followSessionEvents(sessionId: string, lastEventId?: string | null): SessionEventFollower | null {
  const session = getSession(sessionId);
  if (!session) {
    return null;
  }

  const follower: SessionFollower = {
    id: crypto.randomUUID(),
    cursor: lastEventId ?? session.deliveredEventId ?? "",
    queue: session.events.filter((event) => event.id > (lastEventId ?? session.deliveredEventId ?? "")),
    closed: false,
  };
  session.followers.set(follower.id, follower);

  return {
    read: async () => {
      if (follower.closed) {
        return null;
      }

      if (follower.queue.length > 0) {
        return flushFollowerQueue(follower);
      }

      return new Promise<SessionEvent[] | null>((resolve) => {
        follower.wake = () => {
          follower.wake = undefined;
          if (follower.closed) {
            resolve(null);
            return;
          }
          resolve(flushFollowerQueue(follower));
        };
      });
    },
    close: () => closeFollower(session, follower.id),
  };
}

function enqueue(session: McpSession, message: JsonRpcNotification): void {
  const event = {
    id: String(session.nextSequence++).padStart(12, "0"),
    message,
  };
  session.events.push(event);
  if (session.events.length > MAX_EVENT_HISTORY) {
    session.events = session.events.slice(-MAX_EVENT_HISTORY);
  }

  for (const follower of session.followers.values()) {
    if (event.id <= follower.cursor) {
      continue;
    }
    follower.queue.push(event);
    const wake = follower.wake;
    follower.wake = undefined;
    wake?.();
  }
}

function flushFollowerQueue(follower: SessionFollower): SessionEvent[] {
  const batch = follower.queue.splice(0);
  if (batch.length > 0) {
    follower.cursor = batch[batch.length - 1].id;
  }
  return batch;
}

function closeFollower(session: McpSession, followerId: string): void {
  const follower = session.followers.get(followerId);
  if (!follower) {
    return;
  }

  follower.closed = true;
  session.followers.delete(followerId);
  const wake = follower.wake;
  follower.wake = undefined;
  wake?.();
}
