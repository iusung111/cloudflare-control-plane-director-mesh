import type { StateSummary } from "../../../contracts/src";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";
import { projectStateSummary } from "../../../projections/src/state/state-summary.projector";

export class GetStateSummaryService {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<StateSummary> {
    const [sessions, leases, events, yoloMode] = await Promise.all([
      this.store.listSessions(),
      this.store.listLeases(),
      this.store.listEvents(200),
      this.store.getYoloMode(),
    ]);

    return projectStateSummary({
      now: this.now().toISOString(),
      sessions,
      leases,
      events,
      yoloMode,
    });
  }
}
