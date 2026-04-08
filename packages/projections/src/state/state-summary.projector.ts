import type {
  CommandCount,
  LeaseRecord,
  MissionEvent,
  SessionRecord,
  StateSummary,
  YoloMode,
} from "../../../contracts/src";

export function projectStateSummary(input: {
  now: string;
  sessions: SessionRecord[];
  leases: LeaseRecord[];
  events: MissionEvent[];
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
