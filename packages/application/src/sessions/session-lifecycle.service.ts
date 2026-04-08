import type {
  IssueSessionInput,
  SessionRecord,
} from "../../../contracts/src";
import { issueSession, renewSession, revokeSession } from "../../../domain/src/sessions/session.policy";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";
import { ControlPlaneError } from "../../../shared/src/control-plane-error";

export class SessionLifecycleService {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async issue(input: IssueSessionInput): Promise<SessionRecord> {
    const session = issueSession({
      sessionId: input.sessionId,
      actorId: input.actorId,
      role: input.role,
      ttlMinutes: input.ttlMinutes ?? 120,
    }, this.now());

    await this.store.putSession(session);
    return session;
  }

  list(): Promise<SessionRecord[]> {
    return this.store.listSessions();
  }

  async renew(sessionId: string, ttlMinutes = 120): Promise<SessionRecord> {
    const session = await this.store.getSession(sessionId);
    if (!session) {
      throw new ControlPlaneError(404, "session_not_found");
    }

    const renewed = renewSession(session, ttlMinutes, this.now());
    await this.store.putSession(renewed);
    return renewed;
  }

  async revoke(sessionId: string): Promise<SessionRecord> {
    const session = await this.store.getSession(sessionId);
    if (!session) {
      throw new ControlPlaneError(404, "session_not_found");
    }

    const revoked = revokeSession(session, this.now());
    await this.store.putSession(revoked);
    return revoked;
  }
}
