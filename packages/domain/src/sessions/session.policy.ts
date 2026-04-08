import type {
  AcquireLeaseInput,
  LeaseRecord,
  SessionRecord,
  SessionRole,
} from "../../../contracts/src";
import type { ResourceScope } from "../../../contracts/src";
import { sameResourceScope } from "../resources/resource-scope";

export function issueSession(
  input: { sessionId: string; actorId: string; role: SessionRole; ttlMinutes: number },
  now: Date,
): SessionRecord {
  return {
    sessionId: input.sessionId,
    actorId: input.actorId,
    role: input.role,
    status: "active",
    createdAt: now.toISOString(),
    expiresAt: minutesFromNow(now, input.ttlMinutes),
  };
}

export function renewSession(session: SessionRecord, ttlMinutes: number, now: Date): SessionRecord {
  return {
    ...session,
    status: "active",
    expiresAt: minutesFromNow(now, ttlMinutes),
  };
}

export function revokeSession(session: SessionRecord, now: Date): SessionRecord {
  return {
    ...session,
    status: "revoked",
    revokedAt: now.toISOString(),
  };
}

export function acquireLease(input: AcquireLeaseInput, now: Date): LeaseRecord {
  return {
    leaseId: input.leaseId,
    sessionId: input.sessionId,
    resource: input.resource,
    status: "active",
    createdAt: now.toISOString(),
    expiresAt: minutesFromNow(now, input.ttlMinutes ?? 30),
  };
}

export function releaseLease(lease: LeaseRecord, now: Date): LeaseRecord {
  return {
    ...lease,
    status: "released",
    releasedAt: now.toISOString(),
  };
}

export function revokeLease(lease: LeaseRecord, now: Date): LeaseRecord {
  return {
    ...lease,
    status: "revoked",
    revokedAt: now.toISOString(),
  };
}

export function isSessionUsable(session: SessionRecord | null, now: Date): boolean {
  return !!session && session.status === "active" && session.expiresAt > now.toISOString();
}

export function isLeaseUsable(
  lease: LeaseRecord | null,
  resource: ResourceScope,
  now: Date,
): boolean {
  return !!lease &&
    lease.status === "active" &&
    lease.expiresAt > now.toISOString() &&
    sameResourceScope(lease.resource, resource);
}

function minutesFromNow(now: Date, ttlMinutes: number): string {
  return new Date(now.getTime() + ttlMinutes * 60_000).toISOString();
}
