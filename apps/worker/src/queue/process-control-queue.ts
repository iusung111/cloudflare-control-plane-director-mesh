import { asControlPlaneError } from "../../../../packages/shared/src/control-plane-error";
import type { ControlQueueMessage } from "../../../../packages/contracts/src";
import type { AppServices } from "../services";

const MAX_QUEUE_ATTEMPTS = 4;

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
        if (message.attempts >= MAX_QUEUE_ATTEMPTS) {
          await services.commandLifecycle.fail(message.body.commandId, "retry_exhausted");
          message.ack();
          continue;
        }

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

      if (message.attempts >= MAX_QUEUE_ATTEMPTS) {
        await services.commandLifecycle.fail(message.body.commandId, "retry_exhausted");
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
