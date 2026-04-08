import type { ControlQueueMessage } from "../../../contracts/src";

export class QueueDispatchService {
  constructor(private readonly queue?: Queue<ControlQueueMessage>) {}

  async enqueueRetry(commandId: string, reason?: string): Promise<boolean> {
    return this.send({
      kind: "retry-command",
      commandId,
      enqueuedAt: new Date().toISOString(),
      reason,
    });
  }

  async enqueueCommandExecution(
    commandId: string,
    action: "browser_check" | "verify_run",
    reason?: string,
  ): Promise<boolean> {
    return this.send({
      kind: "execute-command",
      commandId,
      action,
      enqueuedAt: new Date().toISOString(),
      reason,
    });
  }

  async enqueueOperatorRequest(requestId: string, reason?: string): Promise<boolean> {
    return this.send({
      kind: "dispatch-operator-request",
      requestId,
      enqueuedAt: new Date().toISOString(),
      reason,
    });
  }

  async enqueueAlertFanout(alertId: string, reason?: string): Promise<boolean> {
    return this.send({
      kind: "alert-fanout",
      alertId,
      enqueuedAt: new Date().toISOString(),
      reason,
    });
  }

  async enqueueProjectionRebuild(missionId?: string, reason?: string): Promise<boolean> {
    return this.send({
      kind: "projection-rebuild",
      missionId,
      enqueuedAt: new Date().toISOString(),
      reason,
    });
  }

  async enqueueBrowserEvidencePostprocess(commandId: string, reason?: string): Promise<boolean> {
    return this.send({
      kind: "browser-evidence-postprocess",
      commandId,
      enqueuedAt: new Date().toISOString(),
      reason,
    });
  }

  private async send(message: ControlQueueMessage): Promise<boolean> {
    if (!this.queue) {
      return false;
    }

    await this.queue.send(message);

    return true;
  }
}
