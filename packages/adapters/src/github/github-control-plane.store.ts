import type {
  AlertStateRecord,
  CommandRecord,
  LeaseRecord,
  GraphEdge,
  HandoffRecord,
  LearningRecord,
  MissionDelta,
  MissionRecord,
  MissionEvent,
  ScopedApprovalRecord,
  SessionRecord,
  WorkerRecord,
  YoloMode,
} from "../../../contracts/src";
import {
  DEFAULT_YOLO_MODE,
  type ControlPlaneStore,
} from "../store/control-plane-store";
import { GitHubContentsClient, type GitHubStoreConfig } from "./github-contents.client";
import {
  alertStatePath,
  commandPath,
  dedupPath, edgeDir, edgePath, eventPath, handoffDir, handoffPath, leasePath,
  missionDeltaDir, missionDeltaPath, missionPath, sessionPath, workerDir, workerPath,
  learningPath,
  scopedApprovalPath,
  yoloPath,
} from "./github-paths";

export class GitHubControlPlaneStore implements ControlPlaneStore {
  private readonly client: GitHubContentsClient;
  constructor(config: GitHubStoreConfig) {
    this.client = new GitHubContentsClient(config);
  }
  hasDedup(dedupKey: string): Promise<boolean> {
    return this.client.exists(dedupPath(dedupKey));
  }
  saveDedup(dedupKey: string, commandId: string): Promise<void> {
    return this.client.writeJson(dedupPath(dedupKey), { dedupKey, commandId });
  }
  getCommand(commandId: string): Promise<CommandRecord | null> {
    return this.client.readJson(commandPath(commandId));
  }
  putCommand(command: CommandRecord): Promise<void> {
    return this.client.writeJson(commandPath(command.commandId), command);
  }
  async listCommands(): Promise<CommandRecord[]> {
    const entries = await this.client.list(".control-plane/commands");
    return readMany<CommandRecord>(entries.map((entry) => entry.path), this.client);
  }
  getMission(missionId: string): Promise<MissionRecord | null> {
    return this.client.readJson(missionPath(missionId));
  }
  putMission(mission: MissionRecord): Promise<void> {
    return this.client.writeJson(missionPath(mission.missionId), mission);
  }
  async listMissions(): Promise<MissionRecord[]> {
    const entries = await this.client.list(".control-plane/missions");
    return readMany<MissionRecord>(entries.map((entry) => entry.path), this.client);
  }
  putWorker(worker: WorkerRecord): Promise<void> {
    return this.client.writeJson(workerPath(worker.missionId, worker.workerId), worker);
  }
  async listWorkers(missionId: string): Promise<WorkerRecord[]> {
    const entries = await this.client.list(workerDir(missionId));
    return readMany<WorkerRecord>(entries.map((entry) => entry.path), this.client);
  }
  putEdge(missionId: string, edge: GraphEdge): Promise<void> {
    return this.client.writeJson(edgePath(missionId, edge.id), edge);
  }
  async listEdges(missionId: string): Promise<GraphEdge[]> {
    const entries = await this.client.list(edgeDir(missionId));
    return readMany<GraphEdge>(entries.map((entry) => entry.path), this.client);
  }
  putHandoff(handoff: HandoffRecord): Promise<void> {
    return this.client.writeJson(handoffPath(handoff.missionId, handoff.handoffId), handoff);
  }
  async listHandoffs(missionId: string): Promise<HandoffRecord[]> {
    const entries = await this.client.list(handoffDir(missionId));
    return readMany<HandoffRecord>(entries.map((entry) => entry.path), this.client);
  }
  async appendMissionDelta(missionId: string, delta: MissionDelta): Promise<void> {
    const nextIndex = (await this.client.list(missionDeltaDir(missionId))).length;
    await this.client.writeJson(missionDeltaPath(missionId, nextIndex), delta);
  }
  async listMissionDeltas(missionId: string): Promise<MissionDelta[]> {
    const entries = await this.client.list(missionDeltaDir(missionId));
    const ordered = entries.sort((left, right) => left.name.localeCompare(right.name));
    return readMany<MissionDelta>(ordered.map((entry) => entry.path), this.client);
  }
  appendEvent(event: MissionEvent): Promise<void> {
    return this.client.writeJson(eventPath(event.eventId, event.createdAt), event);
  }
  async listEvents(limit = 20): Promise<MissionEvent[]> {
    const entries = await this.client.list(".control-plane/events");
    const files = entries.sort((left, right) => right.name.localeCompare(left.name)).slice(0, limit);
    return readMany<MissionEvent>(files.map((file) => file.path), this.client);
  }
  getAlertState(alertId: string): Promise<AlertStateRecord | null> {
    return this.client.readJson(alertStatePath(alertId));
  }
  putAlertState(state: AlertStateRecord): Promise<void> {
    return this.client.writeJson(alertStatePath(state.alertId), state);
  }
  async listAlertStates(): Promise<AlertStateRecord[]> {
    const entries = await this.client.list(".control-plane/alert-state");
    return readMany<AlertStateRecord>(entries.map((entry) => entry.path), this.client);
  }
  getSession(sessionId: string): Promise<SessionRecord | null> {
    return this.client.readJson(sessionPath(sessionId));
  }
  putSession(session: SessionRecord): Promise<void> {
    return this.client.writeJson(sessionPath(session.sessionId), session);
  }
  async listSessions(): Promise<SessionRecord[]> {
    const entries = await this.client.list(".control-plane/sessions");
    return readMany<SessionRecord>(entries.map((entry) => entry.path), this.client);
  }
  getLease(leaseId: string): Promise<LeaseRecord | null> {
    return this.client.readJson(leasePath(leaseId));
  }
  putLease(lease: LeaseRecord): Promise<void> {
    return this.client.writeJson(leasePath(lease.leaseId), lease);
  }
  async listLeases(): Promise<LeaseRecord[]> {
    const entries = await this.client.list(".control-plane/leases");
    return readMany<LeaseRecord>(entries.map((entry) => entry.path), this.client);
  }
  putScopedApproval(approval: ScopedApprovalRecord): Promise<void> {
    return this.client.writeJson(scopedApprovalPath(approval.approvalId), approval);
  }
  async deleteScopedApproval(approvalId: string): Promise<void> {
    await this.client.writeJson(scopedApprovalPath(approvalId), { deleted: true, approvalId });
  }
  async listScopedApprovals(): Promise<ScopedApprovalRecord[]> {
    const entries = await this.client.list(".control-plane/approvals");
    const approvals = await readMany<ScopedApprovalRecord | { deleted: true }>(entries.map((entry) => entry.path), this.client);
    return approvals.filter((value): value is ScopedApprovalRecord => !("deleted" in value));
  }
  getLearning(learningId: string): Promise<LearningRecord | null> {
    return this.client.readJson(learningPath(learningId));
  }
  putLearning(learning: LearningRecord): Promise<void> {
    return this.client.writeJson(learningPath(learning.learningId), learning);
  }
  async listLearnings(): Promise<LearningRecord[]> {
    const entries = await this.client.list(".control-plane/learnings");
    return readMany<LearningRecord>(entries.map((entry) => entry.path), this.client);
  }
  async getYoloMode(): Promise<YoloMode> {
    return (await this.client.readJson<YoloMode>(yoloPath())) ?? DEFAULT_YOLO_MODE;
  }
  setYoloMode(mode: YoloMode): Promise<void> {
    return this.client.writeJson(yoloPath(), mode);
  }
}

async function readMany<T>(paths: string[], client: GitHubContentsClient): Promise<T[]> {
  const values = await Promise.all(paths.map((path) => client.readJson<T>(path)));
  return values.flatMap((value) => value === null ? [] : [value]);
}
