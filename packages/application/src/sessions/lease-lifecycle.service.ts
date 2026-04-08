import type {
  AcquireLeaseInput,
  LeaseRecord,
} from "../../../contracts/src";
import { sameResourceScope } from "../../../domain/src/resources/resource-scope";
import {
  acquireLease,
  isSessionUsable,
  releaseLease,
  revokeLease,
} from "../../../domain/src/sessions/session.policy";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";
import { ControlPlaneError } from "../../../shared/src/control-plane-error";

export class LeaseLifecycleService {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async acquire(input: AcquireLeaseInput): Promise<LeaseRecord> {
    const [session, leases] = await Promise.all([
      this.store.getSession(input.sessionId),
      this.store.listLeases(),
    ]);

    if (!isSessionUsable(session, this.now())) {
      throw new ControlPlaneError(403, "invalid_session");
    }

    const hasConflict = leases.some((lease) =>
      lease.status === "active" &&
      sameResourceScope(lease.resource, input.resource),
    );

    if (hasConflict) {
      throw new ControlPlaneError(409, "resource_already_locked");
    }

    const lease = acquireLease({
      ...input,
      ttlMinutes: input.ttlMinutes ?? 30,
    }, this.now());

    await this.store.putLease(lease);
    return lease;
  }

  list(): Promise<LeaseRecord[]> {
    return this.store.listLeases();
  }

  async release(leaseId: string): Promise<LeaseRecord> {
    const lease = await this.store.getLease(leaseId);
    if (!lease) {
      throw new ControlPlaneError(404, "lease_not_found");
    }

    const released = releaseLease(lease, this.now());
    await this.store.putLease(released);
    return released;
  }

  async revoke(leaseId: string): Promise<LeaseRecord> {
    const lease = await this.store.getLease(leaseId);
    if (!lease) {
      throw new ControlPlaneError(404, "lease_not_found");
    }

    const revoked = revokeLease(lease, this.now());
    await this.store.putLease(revoked);
    return revoked;
  }
}
