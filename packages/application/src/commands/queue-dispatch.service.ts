import type { ControlQueueMessage } from "../../../contracts/src";

export class QueueDispatchService {
  constructor(private readonly queue?: Queue<ControlQueueMessage>) {}

  async enqueueRetry(commandId: string, reason?: string): Promise<boolean> {
    if (!this.queue) {
      return false;
    }

    await this.queue.send({
      kind: "retry-command",
      commandId,
      enqueuedAt: new Date().toISOString(),
      reason,
    });

    return true;
  }
}
