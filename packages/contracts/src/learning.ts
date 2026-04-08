export type LearningScope = "mission" | "repo" | "system";
export type LearningKind = "incident" | "guardrail" | "improvement" | "note";

export interface LearningRecord {
  learningId: string;
  scope: LearningScope;
  kind: LearningKind;
  title: string;
  summary: string;
  createdAt: string;
  createdBy: string;
  missionId?: string;
  repoKey?: string;
  tags: string[];
  artifactRefs?: string[];
}

export interface CaptureLearningInput {
  learningId: string;
  scope: LearningScope;
  kind: LearningKind;
  title: string;
  summary: string;
  createdBy: string;
  missionId?: string;
  repoKey?: string;
  tags?: string[];
  artifactRefs?: string[];
}

export interface RetroSummary {
  generatedAt: string;
  missionCount: number;
  completedMissions: number;
  learningsCount: number;
  topTags: Array<{ tag: string; count: number }>;
  recentLearnings: LearningRecord[];
  recommendedFocus: string[];
}
