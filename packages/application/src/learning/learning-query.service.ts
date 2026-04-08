import type { LearningRecord } from "../../../contracts/src";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";
import { ControlPlaneError } from "../../../shared/src/control-plane-error";

export class LearningQueryService {
  constructor(private readonly store: ControlPlaneStore) {}

  async list(filters?: { missionId?: string; q?: string; tag?: string }): Promise<LearningRecord[]> {
    const learnings = await this.store.listLearnings();
    return learnings.filter((learning) => {
      if (filters?.missionId && learning.missionId !== filters.missionId) {
        return false;
      }
      if (filters?.tag && !learning.tags.includes(filters.tag)) {
        return false;
      }
      if (filters?.q) {
        const query = filters.q.toLowerCase();
        const haystack = `${learning.title} ${learning.summary} ${learning.tags.join(" ")}`.toLowerCase();
        return haystack.includes(query);
      }
      return true;
    });
  }

  async get(learningId: string): Promise<LearningRecord> {
    const learning = await this.store.getLearning(learningId);
    if (!learning) {
      throw new ControlPlaneError(404, "learning_not_found");
    }
    return learning;
  }
}
