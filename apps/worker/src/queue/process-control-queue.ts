import { asControlPlaneError } from "../../../../packages/shared/src/control-plane-error";
import type { ControlQueueMessage } from "../../../../packages/contracts/src";
import { missionIdFromCommand, syncRelatedRequestsForCommand } from "../commands/command-side-effects";
import { rebuildMissionProjection } from "../missions/projection-rebuild";
import { publishMutationNotifications } from "../notifications/mutation-publisher";
import type { AppServices, WorkerEnv } from "../services";

const MAX_QUEUE_ATTEMPTS = 4;

export async function processControlQueueBatch(
  batch: MessageBatch<ControlQueueMessage>,
  services: Pick<AppServices, "commandLifecycle"> & Partial<Pick<AppServices, "alerts" | "browserQa" | "commandQuery" | "missionQuery" | "queueDispatch" | "requestLifecycle" | "requestQuery">>,
  env?: WorkerEnv,
): Promise<void> {
  for (const message of batch.messages) {
    try {
      await processMessage(message, services, env);
    } catch (error) {
      const controlPlaneError = asControlPlaneError(error);
      if (controlPlaneError.status < 500 && controlPlaneError.status !== 429) {
        if (message.body.kind === "execute-command") {
          await services.commandLifecycle.fail(message.body.commandId, controlPlaneError.code);
        }
        message.ack();
        continue;
      }

      if (message.attempts >= MAX_QUEUE_ATTEMPTS) {
        if ("commandId" in message.body) {
          await services.commandLifecycle.fail(message.body.commandId, "retry_exhausted");
        }
        if (message.body.kind === "dispatch-operator-request") {
          if (!services.requestLifecycle) {
            throw new Error("request lifecycle services are not configured");
          }
          await services.requestLifecycle.updateStatus({
            requestId: message.body.requestId,
            status: "failed",
            lastError: "dispatch_retry_exhausted",
          });
        }
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

async function processMessage(
  message: MessageBatch<ControlQueueMessage>["messages"][number],
  services: Pick<AppServices, "commandLifecycle"> & Partial<Pick<AppServices, "alerts" | "browserQa" | "commandQuery" | "missionQuery" | "queueDispatch" | "requestLifecycle" | "requestQuery">>,
  env?: WorkerEnv,
): Promise<void> {
  console.log(JSON.stringify({
    traceId: message.id,
    requestId: message.id,
    queueMessageId: message.id,
    outcome: "processing",
    retryCount: message.attempts,
    kind: message.body.kind,
  }));
  switch (message.body.kind) {
    case "retry-command": {
      const command = await services.commandLifecycle.retry(message.body.commandId);
      if (command.status === "queued") {
        if (message.attempts >= MAX_QUEUE_ATTEMPTS) {
          await services.commandLifecycle.fail(message.body.commandId, "retry_exhausted");
          message.ack();
          return;
        }
        message.retry({ delaySeconds: nextRetryDelaySeconds(message.attempts) });
        return;
      }
      if (services.requestLifecycle && services.requestQuery) {
        await syncRelatedRequestsForCommand(services as Pick<AppServices, "requestLifecycle" | "requestQuery">, command);
      }
      const missionId = missionIdFromCommand(command);
      if (missionId && services.missionQuery) {
        await rebuildMissionProjection(services as Pick<AppServices, "missionQuery">, env, missionId);
      }
      await publishMutationNotifications(env, {
        updatedResources: [
          "state://summary",
          "observability://summary",
          "events://recent",
          "queue://active",
          "queue://dead-letter",
          "quality://summary",
          "release-gate://summary",
          ...(missionId ? [`mission://${missionId}/evidence`, `mission://${missionId}/playback`, `mission://${missionId}/requests`] : []),
        ],
        listChanged: true,
      });
      message.ack();
      return;
    }
    case "execute-command": {
      if (!services.commandQuery || !services.browserQa || !services.queueDispatch) {
        throw new Error("execute-command services are not configured");
      }
      const command = await services.commandQuery.get(message.body.commandId);
      const result = await services.browserQa.execute(command);
      const completed = await services.commandLifecycle.complete(command.commandId, "browser_check_passed", result as unknown as Record<string, unknown>);
      if (services.requestLifecycle && services.requestQuery) {
        await syncRelatedRequestsForCommand(services as Pick<AppServices, "requestLifecycle" | "requestQuery">, completed);
      }
      await services.queueDispatch.enqueueBrowserEvidencePostprocess(command.commandId, "browser_check_completed");
      message.ack();
      return;
    }
    case "dispatch-operator-request":
      if (!services.requestLifecycle) {
        throw new Error("request lifecycle services are not configured");
      }
      await services.requestLifecycle.queue(message.body.requestId);
      await publishMutationNotifications(env, {
        updatedResources: ["requests://active", "observability://summary", "state://summary"],
        listChanged: true,
      });
      message.ack();
      return;
    case "projection-rebuild":
      if (message.body.missionId && services.missionQuery) {
        await rebuildMissionProjection(services as Pick<AppServices, "missionQuery">, env, message.body.missionId);
      } else {
        await publishMutationNotifications(env, {
          updatedResources: ["missions://active", "observability://summary", "state://summary"],
          listChanged: true,
        });
      }
      message.ack();
      return;
    case "alert-fanout": {
      if (!services.alerts) {
        throw new Error("alert fanout services are not configured");
      }
      const command = await services.alerts.getTarget(message.body.alertId);
      const missionId = missionIdFromCommand(command);
      if (missionId && services.missionQuery) {
        await rebuildMissionProjection(services as Pick<AppServices, "missionQuery">, env, missionId);
      }
      await publishMutationNotifications(env, {
        updatedResources: [
          "alerts://current",
          "alerts://log",
          "observability://summary",
          "state://summary",
          "quality://summary",
          "release-gate://summary",
          "queue://active",
          "queue://dead-letter",
          "events://recent",
          ...(missionId ? [`mission://${missionId}/evidence`, `mission://${missionId}/playback`, `mission://${missionId}/requests`] : []),
        ],
        listChanged: true,
      });
      message.ack();
      return;
    }
    case "browser-evidence-postprocess": {
      if (!services.commandQuery) {
        throw new Error("browser evidence postprocess services are not configured");
      }
      const command = await services.commandQuery.get(message.body.commandId);
      const missionId = missionIdFromCommand(command);
      if (missionId && services.missionQuery) {
        const queued = services.queueDispatch
          ? await services.queueDispatch.enqueueProjectionRebuild(missionId, "browser_evidence_postprocess")
          : false;
        if (!queued) {
          await rebuildMissionProjection(services as Pick<AppServices, "missionQuery">, env, missionId);
        }
      }
      if (services.requestLifecycle && services.requestQuery) {
        await syncRelatedRequestsForCommand(services as Pick<AppServices, "requestLifecycle" | "requestQuery">, command);
      }
      await publishMutationNotifications(env, {
        updatedResources: [
          "state://summary",
          "observability://summary",
          "events://recent",
          "queue://active",
          "queue://dead-letter",
          "quality://summary",
          "release-gate://summary",
          ...(missionId ? [`mission://${missionId}/evidence`, `mission://${missionId}/playback`, `mission://${missionId}/requests`] : []),
        ],
        listChanged: true,
      });
      message.ack();
      return;
    }
  }
}
