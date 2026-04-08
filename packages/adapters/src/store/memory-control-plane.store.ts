import type {
  AlertStateRecord,
  CommandRecord,
  GraphEdge,
  HandoffRecord,
  LeaseRecord,
  LearningRecord,
  MissionDelta,
  MissionRecord,
  MissionEvent,
  ScopedApprovalRecord,
  SessionRecord,
  WorkerRecord,
  YoloMode,
} from "../../../contracts/src";
import { DEFAULT_YOLO_MODE, type ControlPlaneStore } from "./control-plane-store";

export class MemoryControlPlaneStore implements ControlPlaneStore {
  private readonly dedup = new Map<string, string>();
  private readonly commands = new Map<string, CommandRecord>();
  private readonly missions = new Map<string, MissionRecord>();
  private readonly workers = new Map<string, WorkerRecord>();
  private readonly edges = new Map<string, GraphEdge[]>();
  private readonly handoffs = new Map<string, HandoffRecord[]>();
  private readonly missionDeltas = new Map<string, MissionDelta[]>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly leases = new Map<string, LeaseRecord>();
  private readonly alertStates = new Map<string, AlertStateRecord>();
  private readonly learnings = new Map<string, LearningRecord>();
  private readonly scopedApprovals = new Map<string, ScopedApprovalRecord>();
  private readonly events: MissionEvent[] = [];
  private yoloMode: YoloMode = DEFAULT_YOLO_MODE;
  async hasDedup(dedupKey: string): Promise<boolean> {
    return this.dedup.has(dedupKey);
  }
  async saveDedup(dedupKey: string, commandId: string): Promise<void> {
    this.dedup.set(dedupKey, commandId);
  }
  async getCommand(commandId: string): Promise<CommandRecord | null> {
    return this.commands.get(commandId) ?? null;
  }
  async putCommand(command: CommandRecord): Promise<void> {
    this.commands.set(command.commandId, command);
  }
  async listCommands(): Promise<CommandRecord[]> {
    return Array.from(this.commands.values()).sort(byUpdatedAtDesc);
  }
  async getMission(missionId: string): Promise<MissionRecord | null> {
    return this.missions.get(missionId) ?? null;
  }
  async putMission(mission: MissionRecord): Promise<void> {
    this.missions.set(mission.missionId, mission);
  }
  async listMissions(): Promise<MissionRecord[]> {
    return Array.from(this.missions.values()).sort(byUpdatedAtDesc);
  }
  async putWorker(worker: WorkerRecord): Promise<void> {
    this.workers.set(`${worker.missionId}:${worker.workerId}`, worker);
  }
  async listWorkers(missionId: string): Promise<WorkerRecord[]> {
    return Array.from(this.workers.values())
      .filter((worker) => worker.missionId === missionId)
      .sort(byUpdatedAtDesc);
  }
  async putEdge(missionId: string, edge: GraphEdge): Promise<void> {
    const current = this.edges.get(missionId) ?? [];
    const next = current.filter((item) => item.id !== edge.id);
    next.push(edge);
    this.edges.set(missionId, next);
  }
  async listEdges(missionId: string): Promise<GraphEdge[]> {
    return (this.edges.get(missionId) ?? []).slice().sort(byCreatedAtDesc);
  }
  async putHandoff(handoff: HandoffRecord): Promise<void> {
    const current = this.handoffs.get(handoff.missionId) ?? [];
    const next = current.filter((item) => item.handoffId !== handoff.handoffId);
    next.push(handoff);
    this.handoffs.set(handoff.missionId, next);
  }
  async listHandoffs(missionId: string): Promise<HandoffRecord[]> {
    return (this.handoffs.get(missionId) ?? []).slice().sort(byCreatedAtDesc);
  }
  async appendMissionDelta(missionId: string, delta: MissionDelta): Promise<void> {
    const current = this.missionDeltas.get(missionId) ?? [];
    current.push(delta);
    this.missionDeltas.set(missionId, current);
  }
  async listMissionDeltas(missionId: string): Promise<MissionDelta[]> {
    return (this.missionDeltas.get(missionId) ?? []).slice();
  }
  async appendEvent(event: MissionEvent): Promise<void> {
    this.events.push(event);
  }
  async listEvents(limit = 20): Promise<MissionEvent[]> {
    return this.events.slice().sort(byCreatedAtDesc).slice(0, limit);
  }
  async getAlertState(alertId: string): Promise<AlertStateRecord | null> {
    return this.alertStates.get(alertId) ?? null;
  }
  async putAlertState(state: AlertStateRecord): Promise<void> {
    this.alertStates.set(state.alertId, state);
  }
  async listAlertStates(): Promise<AlertStateRecord[]> {
    return Array.from(this.alertStates.values()).sort(byUpdatedAtDesc);
  }
  async getSession(sessionId: string): Promise<SessionRecord | null> {
    return this.sessions.get(sessionId) ?? null;
  }
  async putSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.sessionId, session);
  }
  async listSessions(): Promise<SessionRecord[]> {
    return Array.from(this.sessions.values()).sort(byCreatedAtDesc);
  }
  async getLease(leaseId: string): Promise<LeaseRecord | null> {
    return this.leases.get(leaseId) ?? null;
  }
  async putLease(lease: LeaseRecord): Promise<void> {
    this.leases.set(lease.leaseId, lease);
  }
  async listLeases(): Promise<LeaseRecord[]> {
    return Array.from(this.leases.values()).sort(byCreatedAtDesc);
  }
  async putScopedApproval(approval: ScopedApprovalRecord): Promise<void> {
    this.scopedApprovals.set(approval.approvalId, approval);
  }
  async deleteScopedApproval(approvalId: string): Promise<void> {
    this.scopedApprovals.delete(approvalId);
  }
  async listScopedApprovals(): Promise<ScopedApprovalRecord[]> {
    return Array.from(this.scopedApprovals.values()).sort(byCreatedAtDesc);
  }
  async putLearning(learning: LearningRecord): Promise<void> {
    this.learnings.set(learning.learningId, learning);
  }
  async getLearning(learningId: string): Promise<LearningRecord | null> {
    return this.learnings.get(learningId) ?? null;
  }
  async listLearnings(): Promise<LearningRecord[]> {
    return Array.from(this.learnings.values()).sort(byCreatedAtDesc);
  }
  async getYoloMode(): Promise<YoloMode> {
    return this.yoloMode;
  }
  async setYoloMode(mode: YoloMode): Promise<void> {
    this.yoloMode = mode;
  }
}
function byCreatedAtDesc<T extends { createdAt: string }>(left: T, right: T): number {
  return right.createdAt.localeCompare(left.createdAt);
}
function byUpdatedAtDesc<T extends { updatedAt: string }>(left: T, right: T): number {
  return right.updatedAt.localeCompare(left.updatedAt);
}
