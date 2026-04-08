import type { CommandRecord } from "../../../contracts/src";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";

export class QueueOverviewService {
  constructor(private readonly store: ControlPlaneStore) {}

  async execute(): Promise<CommandRecord[]> {
    return this.listQueued();
  }

  async listQueued(): Promise<CommandRecord[]> {
    const commands = await this.store.listCommands();
    return commands.filter((command) => command.status === "queued");
  }

  async listDeadLetters(): Promise<CommandRecord[]> {
    const commands = await this.store.listCommands();
    return commands.filter((command) => command.status === "failed");
  }

  async summary(): Promise<{ queued: number; deadLetters: number }> {
    const [queued, deadLetters] = await Promise.all([
      this.listQueued(),
      this.listDeadLetters(),
    ]);
    return {
      queued: queued.length,
      deadLetters: deadLetters.length,
    };
  }
}
