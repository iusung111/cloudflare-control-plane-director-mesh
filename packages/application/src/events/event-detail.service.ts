import type { MissionEvent } from "../../../contracts/src";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";
import { ControlPlaneError } from "../../../shared/src/control-plane-error";

export class EventDetailService {
  constructor(private readonly store: ControlPlaneStore) {}

  async execute(eventId: string): Promise<MissionEvent> {
    const events = await this.store.listEvents(500);
    const event = events.find((item) => item.eventId === eventId);

    if (!event) {
      throw new ControlPlaneError(404, "event_not_found");
    }

    return event;
  }
}
