import type { CommandRecord } from "../../../../packages/contracts/src";
import type { AppServices } from "../services";

export function missionIdFromCommand(command: Pick<CommandRecord, "payload">): string | undefined {
  return typeof command.payload.missionId === "string" ? command.payload.missionId : undefined;
}

export function isAlertCandidateStatus(status: string): status is "queued" | "rejected" | "failed" | "cancelled" {
  return ["queued", "rejected", "failed", "cancelled"].includes(status);
}

export async function enqueueAlertFanoutIfNeeded(
  services: Pick<AppServices, "queueDispatch">,
  command: Pick<CommandRecord, "commandId" | "status" | "latestReason">,
): Promise<void> {
  if (!isAlertCandidateStatus(command.status)) {
    return;
  }

  await services.queueDispatch.enqueueAlertFanout(`alert:${command.commandId}`, command.latestReason);
}

export async function syncRelatedRequestsForCommand(
  services: Pick<AppServices, "requestLifecycle" | "requestQuery">,
  command: Pick<CommandRecord, "commandId" | "status" | "latestReason" | "result">,
): Promise<void> {
  const related = (await services.requestQuery.list()).filter((request) =>
    request.relatedCommandId === command.commandId
    && !["completed", "failed", "cancelled"].includes(request.status));

  for (const request of related) {
    const status = requestStatusForCommand(command.status);
    if (!status) {
      continue;
    }
    await services.requestLifecycle.updateStatus({
      requestId: request.requestId,
      status,
      owner: request.claimOwner,
      resultSummary: typeof command.result?.summary === "string" ? command.result.summary : command.latestReason,
      lastError: status === "failed" ? command.latestReason : undefined,
    });
  }
}

function requestStatusForCommand(status: CommandRecord["status"]): "awaiting_approval" | "executing" | "completed" | "failed" | "cancelled" | undefined {
  if (status === "queued") {
    return "awaiting_approval";
  }
  if (status === "emitted") {
    return "executing";
  }
  if (status === "completed" || status === "failed" || status === "cancelled") {
    return status;
  }
  return undefined;
}
