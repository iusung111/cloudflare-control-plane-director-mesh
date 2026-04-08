import type { CommandRecord } from "../../../contracts/src";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";

export class QueueOverviewService {
  constructor(private readonly store: ControlPlaneStore) {}

  async execute(): Promise<CommandRecord[]> {
    const commands = await this.store.listCommands();
    return commands.filter((command) => command.status === "queued");
  }
}
