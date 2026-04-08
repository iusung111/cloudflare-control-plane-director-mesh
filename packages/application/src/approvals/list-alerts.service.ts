import type { AlertRecord, AlertStateRecord, CommandRecord } from "../../../contracts/src";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";
import { ControlPlaneError } from "../../../shared/src/control-plane-error";

export class ListAlertsService {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listCurrent(): Promise<AlertRecord[]> {
    const [commands, states] = await Promise.all([
      this.store.listCommands(),
      this.store.listAlertStates(),
    ]);
    const stateByAlertId = new Map(states.map((state) => [state.alertId, state]));

    return commands
      .filter(isAlertCandidate)
      .map((command) => toAlert(command, stateByAlertId.get(`alert:${command.commandId}`)))
      .filter((alert) => !alert.dismissed)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async listLog(): Promise<AlertRecord[]> {
    const [commands, states] = await Promise.all([
      this.store.listCommands(),
      this.store.listAlertStates(),
    ]);
    const stateByAlertId = new Map(states.map((state) => [state.alertId, state]));

    return commands
      .filter(isAlertCandidate)
      .map((command) => toAlert(command, stateByAlertId.get(`alert:${command.commandId}`)))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getTarget(alertId: string): Promise<CommandRecord> {
    const commandId = alertId.replace(/^alert:/, "");
    const command = await this.store.getCommand(commandId);
    if (!command) {
      throw new ControlPlaneError(404, "alert_target_not_found");
    }
    return command;
  }

  async markRead(alertId: string): Promise<AlertRecord> {
    const alert = await this.requireAlert(alertId);
    await this.store.putAlertState({
      alertId,
      unread: false,
      dismissed: alert.dismissed,
      updatedAt: this.now().toISOString(),
    });
    return this.requireAlert(alertId);
  }

  async dismiss(alertId: string): Promise<AlertRecord> {
    const alert = await this.requireAlert(alertId);
    await this.store.putAlertState({
      alertId,
      unread: false,
      dismissed: true,
      updatedAt: this.now().toISOString(),
    });
    return this.requireAlert(alertId, true);
  }

  private async requireAlert(alertId: string, includeDismissed = false): Promise<AlertRecord> {
    const alert = (await this.listLog()).find((item) => item.alertId === alertId && (includeDismissed || !item.dismissed));
    if (!alert) {
      throw new ControlPlaneError(404, "alert_not_found");
    }
    return alert;
  }
}

function isAlertCandidate(command: CommandRecord): boolean {
  return ["queued", "rejected", "failed", "cancelled"].includes(command.status);
}

function toAlert(command: CommandRecord, state?: AlertStateRecord): AlertRecord {
  return {
    alertId: `alert:${command.commandId}`,
    kind: kindFor(command.status),
    severity: severityFor(command.status),
    summary: `${command.action} is ${command.status}${command.latestReason ? `: ${command.latestReason}` : ""}`,
    commandId: command.commandId,
    status: command.status,
    unread: state?.unread ?? true,
    dismissed: state?.dismissed ?? false,
    createdAt: command.updatedAt,
  };
}

function kindFor(status: CommandRecord["status"]): AlertRecord["kind"] {
  if (status === "queued") {
    return "queued_command";
  }
  if (status === "cancelled") {
    return "cancelled_command";
  }
  if (status === "failed") {
    return "failed_command";
  }
  return "rejected_command";
}

function severityFor(status: CommandRecord["status"]): AlertRecord["severity"] {
  return status === "failed" ? "high" : status === "queued" ? "medium" : "low";
}
