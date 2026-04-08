import type { ResourceScope } from "./resource";

export type SessionRole = "delivery" | "reliability" | "reviewer";
export type SessionStatus = "active" | "expired" | "revoked";
export type LeaseStatus = "active" | "released" | "revoked" | "expired";

export interface SessionRecord {
  sessionId: string;
  actorId: string;
  role: SessionRole;
  status: SessionStatus;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
}

export interface LeaseRecord {
  leaseId: string;
  sessionId: string;
  resource: ResourceScope;
  status: LeaseStatus;
  createdAt: string;
  expiresAt: string;
  releasedAt?: string;
  revokedAt?: string;
}

export interface IssueSessionInput {
  sessionId: string;
  actorId: string;
  role: SessionRole;
  ttlMinutes?: number;
}

export interface AcquireLeaseInput {
  leaseId: string;
  sessionId: string;
  resource: ResourceScope;
  ttlMinutes?: number;
}

export interface YoloMode {
  enabled: boolean;
  updatedAt: string;
  updatedBy: string;
  note?: string;
}
