import type {
  OperatorRequestQueue,
  OperatorRequestRecord,
  OperatorRequestStatus,
} from "../../../contracts/src";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";
import { ControlPlaneError } from "../../../shared/src/control-plane-error";

export class OperatorRequestQueryService {
  constructor(private readonly store: ControlPlaneStore) {}

  async get(requestId: string): Promise<OperatorRequestRecord> {
    const request = await this.store.getOperatorRequest(requestId);
    if (!request) {
      throw new ControlPlaneError(404, "operator_request_not_found");
    }
    return request;
  }

  async list(filters?: {
    missionId?: string;
    queue?: OperatorRequestQueue;
    status?: OperatorRequestStatus;
    q?: string;
  }): Promise<OperatorRequestRecord[]> {
    const requests = await this.store.listOperatorRequests();
    return requests.filter((request) => {
      if (filters?.missionId && request.missionId !== filters.missionId) {
        return false;
      }
      if (filters?.queue && request.queue !== filters.queue) {
        return false;
      }
      if (filters?.status && request.status !== filters.status) {
        return false;
      }
      if (filters?.q) {
        const haystack = `${request.requestId} ${request.title} ${request.prompt} ${request.resultSummary ?? ""}`.toLowerCase();
        return haystack.includes(filters.q.toLowerCase());
      }
      return true;
    });
  }
}
