import type { CommandRecord } from "../../../contracts/src";
import { makeCommandEvent } from "../../../domain/src/commands/command-event";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";
import { ControlPlaneError } from "../../../shared/src/control-plane-error";
import { SubmitCommandService } from "./submit-command.service";
import { toCommandRequest, updateCommandRecord } from "./command-record";

export class CommandLifecycleService {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly submitCommand: SubmitCommandService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async approve(commandId: string): Promise<CommandRecord> {
    const command = await this.requireCommand(commandId);
    if (command.action !== "deploy_live" || command.status === "completed" || command.status === "cancelled") {
      throw new ControlPlaneError(409, "command_approve_not_allowed");
    }

    const request = {
      ...toCommandRequest(command),
      payload: { ...command.payload, explicitLive: true },
    };

    await this.submitCommand.execute(request, {
      skipDedup: true,
      persistDedup: false,
    });

    return this.requireCommand(commandId);
  }

  async retry(commandId: string): Promise<CommandRecord> {
    const command = await this.requireCommand(commandId);
    if (command.status === "completed" || command.status === "cancelled") {
      throw new ControlPlaneError(409, "command_retry_not_allowed");
    }

    await this.submitCommand.execute(toCommandRequest(command), {
      skipDedup: true,
      persistDedup: false,
    });

    return this.requireCommand(commandId);
  }

  async fail(commandId: string, reason = "retry_exhausted"): Promise<CommandRecord> {
    const command = await this.requireCommand(commandId);
    if (command.status === "completed" || command.status === "cancelled") {
      throw new ControlPlaneError(409, "command_fail_not_allowed");
    }
    if (command.status === "failed" && command.latestReason === reason) {
      return command;
    }

    return this.transition(commandId, "COMMAND_FAILED", "failed", reason);
  }

  async reject(commandId: string, reason = "rejected_by_operator"): Promise<CommandRecord> {
    return this.transition(commandId, "COMMAND_REJECTED", "rejected", reason);
  }

  async cancel(commandId: string, reason = "cancelled_by_operator"): Promise<CommandRecord> {
    return this.transition(commandId, "COMMAND_CANCELLED", "cancelled", reason);
  }

  private async transition(
    commandId: string,
    type: "COMMAND_REJECTED" | "COMMAND_CANCELLED" | "COMMAND_FAILED",
    status: "rejected" | "cancelled" | "failed",
    reason: string,
  ): Promise<CommandRecord> {
    const command = await this.requireCommand(commandId);
    const now = this.now();
    const request = toCommandRequest(command);
    const event = makeCommandEvent({
      request,
      type,
      status,
      conflictKey: command.conflictKey,
      now,
      reason,
    });

    await this.store.appendEvent(event);
    const updated = updateCommandRecord(command, status, now, reason);
    await this.store.putCommand(updated);
    return updated;
  }

  private async requireCommand(commandId: string): Promise<CommandRecord> {
    const command = await this.store.getCommand(commandId);
    if (!command) {
      throw new ControlPlaneError(404, "command_not_found");
    }
    return command;
  }
}
