import {
  ResourceScope,
  MissionEvent,
  Session,
  Lease,
  QueueItem,
  QueueType,
} from "./types";
import { normalizeResourceScope } from "./resource_key";

export interface RuntimeStore {
  hasDedup(dedupKey: string): Promise<boolean>;
  saveDedup(dedupKey: string, commandId: string): Promise<void>;
  
  hasActiveLock(resource: ResourceScope, exceptLeaseId?: string): Promise<boolean>;
  
  appendEvent(event: MissionEvent): Promise<void>;

  getSession(sessionId: string): Promise<Session | null>;
  getLease(leaseId: string): Promise<Lease | null>;
  saveLease(lease: Lease): Promise<void>;

  list(queue: QueueType): Promise<QueueItem[]>;
  enqueue(item: QueueItem): Promise<void>;
  dequeue(itemId: string): Promise<void>;
}

export class InMemoryRuntimeStore implements RuntimeStore {
  private readonly dedupKeys = new Map<string, string>(); // dedupKey -> commandId
  private readonly events: MissionEvent[] = [];
  private readonly sessions = new Map<string, Session>();
  private readonly leases = new Map<string, Lease>();
  private readonly queues = new Map<string, QueueItem[]>();

  async hasDedup(dedupKey: string): Promise<boolean> {
    return this.dedupKeys.has(dedupKey);
  }

  async saveDedup(dedupKey: string, commandId: string): Promise<void> {
    this.dedupKeys.set(dedupKey, commandId);
  }

  async appendEvent(event: MissionEvent): Promise<void> {
    this.events.push(event);
  }

  async getSession(sessionId: string): Promise<Session | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async getLease(leaseId: string): Promise<Lease | null> {
    return this.leases.get(leaseId) ?? null;
  }

  async hasActiveLock(resource: ResourceScope, exceptLeaseId?: string): Promise<boolean> {
    for (const lease of this.leases.values()) {
      if (exceptLeaseId && lease.leaseId === exceptLeaseId) {
        continue;
      }
      if (lease.status !== "active") {
        continue;
      }
      if (this.sameResource(lease.resource, resource)) {
        return true;
      }
    }
    return false;
  }

  async saveLease(lease: Lease): Promise<void> {
    this.leases.set(lease.leaseId, lease);
  }

  async list(queue: QueueType): Promise<QueueItem[]> {
    return this.queues.get(queue) ?? [];
  }

  async enqueue(item: QueueItem): Promise<void> {
    const existing = this.queues.get(item.queue) ?? [];
    existing.push(item);
    this.queues.set(item.queue, existing);
  }

  async dequeue(itemId: string): Promise<void> {
    for (const [queue, items] of this.queues.entries()) {
      this.queues.set(queue, items.filter(item => item.itemId !== itemId));
    }
  }

  // --- Helpers for Test/Seed ---
  seedSession(session: Session): void {
    this.sessions.set(session.sessionId, session);
  }

  getEvents(): MissionEvent[] {
    return [...this.events];
  }

  private sameResource(left: ResourceScope, right: ResourceScope): boolean {
    const nLeft = normalizeResourceScope(left);
    const nRight = normalizeResourceScope(right);
    return (
      nLeft.repo === nRight.repo &&
      nLeft.branch === nRight.branch &&
      nLeft.path === nRight.path
    );
  }
}
