import { GitHubControlPlaneStore } from "../../../packages/adapters/src/github/github-control-plane.store";
import type { ControlPlaneStore } from "../../../packages/adapters/src/store/control-plane-store";
import { MemoryControlPlaneStore } from "../../../packages/adapters/src/store/memory-control-plane.store";
import { ListAlertsService } from "../../../packages/application/src/approvals/list-alerts.service";
import { ScopedApprovalService } from "../../../packages/application/src/approvals/scoped-approval.service";
import { SubmitCommandService } from "../../../packages/application/src/commands/submit-command.service";
import { CommandLifecycleService } from "../../../packages/application/src/commands/command-lifecycle.service";
import { CommandQueryService } from "../../../packages/application/src/commands/command-query.service";
import { QueueDispatchService } from "../../../packages/application/src/commands/queue-dispatch.service";
import { MissionActivityService } from "../../../packages/application/src/missions/mission-activity.service";
import { MissionEvidenceService } from "../../../packages/application/src/missions/mission-evidence.service";
import { MissionLifecycleService } from "../../../packages/application/src/missions/mission-lifecycle.service";
import { MissionQueryService } from "../../../packages/application/src/missions/mission-query.service";
import { CaptureLearningService } from "../../../packages/application/src/learning/capture-learning.service";
import { LearningQueryService } from "../../../packages/application/src/learning/learning-query.service";
import { RetroQueryService } from "../../../packages/application/src/learning/retro-query.service";
import { GetQualitySummaryService } from "../../../packages/application/src/quality/get-quality-summary.service";
import { GetReleaseGateService } from "../../../packages/application/src/release/get-release-gate.service";
import { YoloModeService } from "../../../packages/application/src/approvals/yolo-mode.service";
import { EventDetailService } from "../../../packages/application/src/events/event-detail.service";
import { ListEventsService } from "../../../packages/application/src/events/list-events.service";
import { LeaseLifecycleService } from "../../../packages/application/src/sessions/lease-lifecycle.service";
import { SessionLifecycleService } from "../../../packages/application/src/sessions/session-lifecycle.service";
import { GetStateSummaryService } from "../../../packages/application/src/state/get-state-summary.service";
import { QueueOverviewService } from "../../../packages/application/src/state/queue-overview.service";

export interface WorkerEnv {
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_TOKEN?: string;
  GITHUB_BRANCH?: string;
  CONTROL_PLANE_OPERATOR_TOKEN?: string;
  CONTROL_PLANE_VIEWER_TOKEN?: string;
  CONTROL_PLANE_APP_PASSWORD?: string;
  CONTROL_PLANE_COOKIE_SECRET?: string;
  CONTROL_QUEUE?: Queue<import("../../../packages/contracts/src").ControlQueueMessage>;
  MISSION_ROOM?: DurableObjectNamespace;
  MCP_BROKER?: DurableObjectNamespace;
}

export interface AppServices {
  store: ControlPlaneStore;
  commands: SubmitCommandService;
  commandLifecycle: CommandLifecycleService;
  commandQuery: CommandQueryService;
  queueDispatch: QueueDispatchService;
  missions: MissionLifecycleService;
  missionActivity: MissionActivityService;
  missionQuery: MissionQueryService;
  missionEvidence: MissionEvidenceService;
  captureLearning: CaptureLearningService;
  learningQuery: LearningQueryService;
  sessions: SessionLifecycleService;
  leases: LeaseLifecycleService;
  events: ListEventsService;
  eventDetail: EventDetailService;
  alerts: ListAlertsService;
  quality: GetQualitySummaryService;
  releaseGate: GetReleaseGateService;
  retro: RetroQueryService;
  scopedApprovals: ScopedApprovalService;
  queueOverview: QueueOverviewService;
  stateSummary: GetStateSummaryService;
  yoloMode: YoloModeService;
}

let fallbackMemoryStore: ControlPlaneStore | undefined;

export function createServices(
  env?: WorkerEnv,
  overrides?: { store?: ControlPlaneStore },
): AppServices {
  const store = overrides?.store ?? createGitHubStore(env);
  const commands = new SubmitCommandService(store);
  const releaseGate = new GetReleaseGateService(store);
  const learningQuery = new LearningQueryService(store);
  return {
    store,
    commands,
    commandLifecycle: new CommandLifecycleService(store, commands),
    commandQuery: new CommandQueryService(store),
    queueDispatch: new QueueDispatchService(env?.CONTROL_QUEUE),
    missions: new MissionLifecycleService(store),
    missionActivity: new MissionActivityService(store),
    missionQuery: new MissionQueryService(store),
    missionEvidence: new MissionEvidenceService(store),
    captureLearning: new CaptureLearningService(store),
    learningQuery,
    sessions: new SessionLifecycleService(store),
    leases: new LeaseLifecycleService(store),
    events: new ListEventsService(store),
    eventDetail: new EventDetailService(store),
    alerts: new ListAlertsService(store),
    quality: new GetQualitySummaryService(store, releaseGate),
    releaseGate,
    retro: new RetroQueryService(store),
    scopedApprovals: new ScopedApprovalService(store),
    queueOverview: new QueueOverviewService(store),
    stateSummary: new GetStateSummaryService(store),
    yoloMode: new YoloModeService(store),
  };
}

function createGitHubStore(env?: WorkerEnv): ControlPlaneStore {
  if (!hasGitHubStoreConfig(env)) {
    fallbackMemoryStore ??= new MemoryControlPlaneStore();
    return fallbackMemoryStore;
  }

  return new GitHubControlPlaneStore({
    owner: env?.GITHUB_OWNER ?? "",
    repo: env?.GITHUB_REPO ?? "",
    token: env?.GITHUB_TOKEN ?? "",
    branch: env?.GITHUB_BRANCH ?? "",
  });
}

function hasGitHubStoreConfig(env?: WorkerEnv): boolean {
  return Boolean(
    env?.GITHUB_OWNER?.trim()
    && env?.GITHUB_REPO?.trim()
    && env?.GITHUB_TOKEN?.trim()
    && env?.GITHUB_BRANCH?.trim(),
  );
}
