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
  OperatorRequestRecord,
  WorkerRecord,
  YoloMode,
} from "../../../contracts/src";

export interface ControlPlaneStore {
  hasDedup(dedupKey: string): Promise<boolean>;
  saveDedup(dedupKey: string, commandId: string): Promise<void>;
  getCommand(commandId: string): Promise<CommandRecord | null>;
  putCommand(command: CommandRecord): Promise<void>;
  listCommands(): Promise<CommandRecord[]>;
  getMission(missionId: string): Promise<MissionRecord | null>;
  putMission(mission: MissionRecord): Promise<void>;
  listMissions(): Promise<MissionRecord[]>;
  putWorker(worker: WorkerRecord): Promise<void>;
  listWorkers(missionId: string): Promise<WorkerRecord[]>;
  putEdge(missionId: string, edge: GraphEdge): Promise<void>;
  listEdges(missionId: string): Promise<GraphEdge[]>;
  putHandoff(handoff: HandoffRecord): Promise<void>;
  listHandoffs(missionId: string): Promise<HandoffRecord[]>;
  appendMissionDelta(missionId: string, delta: MissionDelta): Promise<void>;
  listMissionDeltas(missionId: string): Promise<MissionDelta[]>;
  appendEvent(event: MissionEvent): Promise<void>;
  listEvents(limit?: number): Promise<MissionEvent[]>;
  getAlertState(alertId: string): Promise<AlertStateRecord | null>;
  putAlertState(state: AlertStateRecord): Promise<void>;
  listAlertStates(): Promise<AlertStateRecord[]>;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  putSession(session: SessionRecord): Promise<void>;
  listSessions(): Promise<SessionRecord[]>;
  getLease(leaseId: string): Promise<LeaseRecord | null>;
  putLease(lease: LeaseRecord): Promise<void>;
  listLeases(): Promise<LeaseRecord[]>;
  putScopedApproval(approval: ScopedApprovalRecord): Promise<void>;
  deleteScopedApproval(approvalId: string): Promise<void>;
  listScopedApprovals(): Promise<ScopedApprovalRecord[]>;
  putLearning(learning: LearningRecord): Promise<void>;
  getLearning(learningId: string): Promise<LearningRecord | null>;
  listLearnings(): Promise<LearningRecord[]>;
  getOperatorRequest(requestId: string): Promise<OperatorRequestRecord | null>;
  putOperatorRequest(request: OperatorRequestRecord): Promise<void>;
  listOperatorRequests(): Promise<OperatorRequestRecord[]>;
  getYoloMode(): Promise<YoloMode>;
  setYoloMode(mode: YoloMode): Promise<void>;
}

export const DEFAULT_YOLO_MODE: YoloMode = {
  enabled: false,
  updatedAt: "1970-01-01T00:00:00.000Z",
  updatedBy: "system",
};
