import type { CommandRecord } from "../../../contracts/src";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";
import { ControlPlaneError } from "../../../shared/src/control-plane-error";

export class CommandQueryService {
  constructor(private readonly store: ControlPlaneStore) {}

  list(): Promise<CommandRecord[]> {
    return this.store.listCommands();
  }

  async get(commandId: string): Promise<CommandRecord> {
    const command = await this.store.getCommand(commandId);
    if (!command) {
      throw new ControlPlaneError(404, "command_not_found");
    }
    return command;
  }
}
