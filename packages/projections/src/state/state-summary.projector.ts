import type {
  CommandCount,
  LeaseRecord,
  MissionEvent,
  OperatorRequestRecord,
  SessionRecord,
  StateSummary,
  YoloMode,
} from "../../../contracts/src";

export function projectStateSummary(input: {
  now: string;
  sessions: SessionRecord[];
  leases: LeaseRecord[];
  events: MissionEvent[];
  requests?: OperatorRequestRecord[];
  yoloMode: YoloMode;
}): StateSummary {
  const generatedAt = input.now;
  const latestByCommand = new Map<string, MissionEvent>();

  for (const event of input.events) {
    const current = latestByCommand.get(event.commandId);
    if (!current || current.createdAt <= event.createdAt) {
      latestByCommand.set(event.commandId, event);
    }
  }

  const commands = countCommands(Array.from(latestByCommand.values()));

  return {
    generatedAt,
    sessions: {
      active: countActive(input.sessions, generatedAt),
      expired: countExpired(input.sessions, generatedAt),
      revoked: input.sessions.filter((session) => session.status === "revoked").length,
    },
    leases: {
      active: countActive(input.leases, generatedAt),
      expired: countExpired(input.leases, generatedAt),
      released: input.leases.filter((lease) => lease.status === "released").length,
      revoked: input.leases.filter((lease) => lease.status === "revoked").length,
    },
    commands,
    requests: countRequests(input.requests ?? []),
    yoloMode: input.yoloMode,
    recentEventAt: input.events[0]?.createdAt,
  };
}

function countCommands(events: MissionEvent[]): CommandCount {
  return events.reduce<CommandCount>((counts, event) => {
    if (event.status in counts) {
      counts[event.status as keyof CommandCount] += 1;
    }
    return counts;
  }, {
    queued: 0,
    emitted: 0,
    completed: 0,
    rejected: 0,
    failed: 0,
    cancelled: 0,
  });
}

function countActive(items: Array<{ status: string; expiresAt: string }>, now: string): number {
  return items.filter((item) => item.status === "active" && item.expiresAt > now).length;
}

function countExpired(items: Array<{ status: string; expiresAt: string }>, now: string): number {
  return items.filter((item) => item.status === "expired" || item.expiresAt <= now).length;
}

function countRequests(requests: OperatorRequestRecord[]): NonNullable<StateSummary["requests"]> {
  return requests.reduce<NonNullable<StateSummary["requests"]>>((counts, request) => {
    if (request.status === "queued_for_orchestrator") {
      counts.queuedForOrchestrator += 1;
    }
    if (request.status === "claimed") {
      counts.claimed += 1;
    }
    if (request.status === "awaiting_approval") {
      counts.awaitingApproval += 1;
    }
    if (request.status === "browser_action_pending") {
      counts.browserActionPending += 1;
    }
    return counts;
  }, {
    queuedForOrchestrator: 0,
    claimed: 0,
    awaitingApproval: 0,
    browserActionPending: 0,
  });
}
