import type { MissionEvent } from "./command";
import type { LearningRecord, RetroSummary } from "./learning";
import type { MissionRecord } from "./mission";
import type { QualitySummary } from "./quality";
import type { ReleaseGateSummary } from "./release";
import type { AlertRecord } from "./alert";
import type { ScopedApprovalRecord } from "./approval";
import type { CommandRecord } from "./command";
import type { LeaseRecord, SessionRecord, YoloMode } from "./session";

export interface StatusCount {
  active: number;
  expired: number;
  revoked: number;
  released?: number;
}

export interface CommandCount {
  queued: number;
  emitted: number;
  completed: number;
  rejected: number;
  failed: number;
  cancelled: number;
}

export interface StateSummary {
  generatedAt: string;
  sessions: StatusCount;
  leases: StatusCount;
  commands: CommandCount;
  yoloMode: YoloMode;
  recentEventAt?: string;
}

export interface ConsoleSnapshot {
  alerts?: AlertRecord[];
  commands?: CommandRecord[];
  deadLetters?: CommandRecord[];
  learnings?: LearningRecord[];
  retro?: RetroSummary;
  scopedApprovals?: ScopedApprovalRecord[];
  summary: StateSummary;
  quality?: QualitySummary;
  releaseGate?: ReleaseGateSummary;
  recentEvents: MissionEvent[];
  sessions: SessionRecord[];
  leases: LeaseRecord[];
  missions: MissionRecord[];
}
