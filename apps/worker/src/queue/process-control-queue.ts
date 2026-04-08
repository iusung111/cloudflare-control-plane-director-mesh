import { asControlPlaneError } from "../../../../packages/shared/src/control-plane-error";
import type { ControlQueueMessage } from "../../../../packages/contracts/src";
import type { AppServices } from "../services";

export async function processControlQueueBatch(
  batch: MessageBatch<ControlQueueMessage>,
  services: Pick<AppServices, "commandLifecycle">,
): Promise<void> {
  for (const message of batch.messages) {
    if (message.body.kind !== "retry-command") {
      message.ack();
      continue;
    }

    try {
      const command = await services.commandLifecycle.retry(message.body.commandId);
      if (command.status === "queued") {
        message.retry({ delaySeconds: nextRetryDelaySeconds(message.attempts) });
        continue;
      }

      message.ack();
    } catch (error) {
      const controlPlaneError = asControlPlaneError(error);
      if (controlPlaneError.status < 500 && controlPlaneError.status !== 429) {
        message.ack();
        continue;
      }

      message.retry({ delaySeconds: nextRetryDelaySeconds(message.attempts) });
    }
  }
}

function nextRetryDelaySeconds(attempts: number): number {
  return Math.max(30, Math.min(300, attempts * 30));
}
