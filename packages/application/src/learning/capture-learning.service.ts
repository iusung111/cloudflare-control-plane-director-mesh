import type { CaptureLearningInput, LearningRecord } from "../../../contracts/src";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";
import { ControlPlaneError } from "../../../shared/src/control-plane-error";

export class CaptureLearningService {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: CaptureLearningInput): Promise<LearningRecord> {
    if (!input.learningId || !input.title || !input.summary || !input.createdBy) {
      throw new ControlPlaneError(400, "invalid_learning_input");
    }

    if (input.missionId && !(await this.store.getMission(input.missionId))) {
      throw new ControlPlaneError(404, "mission_not_found");
    }

    const learning: LearningRecord = {
      learningId: input.learningId,
      scope: input.scope,
      kind: input.kind,
      title: input.title,
      summary: input.summary,
      createdAt: this.now().toISOString(),
      createdBy: input.createdBy,
      missionId: input.missionId,
      repoKey: input.repoKey,
      tags: normalizeTags(input.tags),
      artifactRefs: input.artifactRefs,
    };

    await this.store.putLearning(learning);
    return learning;
  }
}

function normalizeTags(tags: string[] | undefined): string[] {
  return Array.from(new Set((tags ?? []).filter(Boolean).map((tag) => tag.trim()).filter(Boolean))).sort();
}
