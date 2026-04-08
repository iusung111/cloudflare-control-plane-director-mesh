import type { MissionEvent } from "../../../contracts/src";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";

export class ListEventsService {
  constructor(private readonly store: ControlPlaneStore) {}

  async execute(limit = 20): Promise<MissionEvent[]> {
    return this.store.listEvents(limit);
  }
}
