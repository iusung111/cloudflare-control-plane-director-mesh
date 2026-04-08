import type {
  AcquireLeaseInput,
  CaptureLearningInput,
  ClaimOperatorRequestInput,
  CommandRequest,
  IssueSessionInput,
  SubmitOperatorRequestInput,
  UpdateOperatorRequestStatusInput,
} from "../../../../packages/contracts/src";
import { ControlPlaneError } from "../../../../packages/shared/src/control-plane-error";
import { enqueueAlertFanoutIfNeeded, missionIdFromCommand, syncRelatedRequestsForCommand } from "../commands/command-side-effects";
import type { AppServices } from "../services";

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, unknown>;
}

export interface McpResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface McpResourceTemplate {
  uriTemplate: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface McpToolExecution {
  data: unknown;
  updatedResources: string[];
  listChanged?: boolean;
}

export const MCP_TOOLS: McpToolDefinition[] = [
  tool("submit_command", "Submit a control-plane command", commandSchema(["commandId", "dedupKey", "sessionId", "leaseId", "resource", "action", "payload"]), false, true, false),
  tool("issue_session", "Issue an operator session", objectSchema(["sessionId", "actorId", "role"]), false, false, true),
  tool("acquire_lease", "Acquire a scoped lease", objectSchema(["leaseId", "sessionId", "resource"]), false, false, false),
  tool("release_lease", "Release a scoped lease", objectSchema(["leaseId"]), false, false, true),
  tool("create_mission", "Create a mission record", objectSchema(["missionId", "title", "repoKey", "ownerActor"]), false, false, true),
  tool("upsert_worker", "Create or update a mission worker", objectSchema(["missionId", "workerId", "role", "title", "summary", "phase", "status"]), false, false, false),
  tool("record_handoff", "Record a handoff between workers", objectSchema(["missionId", "handoffId", "fromWorkerId", "toWorkerId", "handoffType", "title", "summary"]), false, false, false),
  tool("capture_learning", "Capture a learning or retrospective note", objectSchema(["learningId", "scope", "kind", "title", "summary", "createdBy"]), false, false, true),
  tool("read_alert", "Mark an alert as read", objectSchema(["alertId"]), false, false, true),
  tool("dismiss_alert", "Dismiss an alert from the active list", objectSchema(["alertId"]), false, false, true),
  tool("approve_run", "Approve a queued or rejected run", objectSchema(["commandId"]), false, true, false),
  tool("reject_run", "Reject a run", objectSchema(["commandId"]), false, true, false),
  tool("retry_run", "Retry a run", objectSchema(["commandId"]), false, true, false),
  tool("cancel_run", "Cancel a run", objectSchema(["commandId"]), false, true, false),
  tool("requeue_dead_letter", "Requeue a dead-lettered command", objectSchema(["commandId"]), false, true, false),
  tool("dismiss_dead_letter", "Dismiss a dead-lettered command", objectSchema(["commandId"]), false, true, false),
  tool("submit_operator_request", "Submit an operator request for the main orchestrator queue", objectSchema(["requestId", "actorId", "queue", "title", "prompt"]), false, true, true),
  tool("claim_request", "Claim a queued operator request", objectSchema(["requestId", "owner"]), false, true, false),
  tool("update_request_status", "Update an operator request lifecycle state", objectSchema(["requestId", "status"]), false, true, false),
  tool("set_yolo_mode", "Set YOLO mode", objectSchema(["enabled", "updatedBy"]), false, true, true),
];

const STATIC_RESOURCES: McpResourceDefinition[] = [
  resource("state://summary", "state-summary", "Control-plane state summary"),
  resource("observability://summary", "observability-summary", "Operational observability summary"),
  resource("events://recent", "events-recent", "Recent mission events"),
  resource("queue://active", "queue-active", "Queued commands"),
  resource("queue://dead-letter", "queue-dead-letter", "Dead-lettered commands"),
  resource("requests://active", "requests-active", "Operator requests awaiting orchestration"),
  resource("learnings://recent", "learnings-recent", "Recent learnings"),
  resource("retro://summary", "retro-summary", "Retrospective summary"),
  resource("quality://summary", "quality-summary", "Quality aggregation summary"),
  resource("release-gate://summary", "release-gate", "Release gate summary"),
  resource("sessions://active", "sessions-active", "Active and historical sessions"),
  resource("leases://active", "leases-active", "Active and historical leases"),
  resource("alerts://current", "alerts-current", "Current alerts"),
  resource("alerts://log", "alerts-log", "Alert log"),
  resource("missions://active", "missions-active", "Mission index"),
];

export const MCP_RESOURCE_TEMPLATES: McpResourceTemplate[] = [
  template("mission://{id}/graph", "mission-graph", "Mission graph snapshot"),
  template("mission://{id}/live", "mission-live-graph", "Mission live graph projection"),
  template("mission://{id}/workers", "mission-workers", "Mission workers"),
  template("mission://{id}/handoffs", "mission-handoffs", "Mission handoffs"),
  template("mission://{id}/playback", "mission-playback", "Mission playback"),
  template("mission://{id}/evidence", "mission-evidence", "Mission evidence"),
  template("mission://{id}/learnings", "mission-learnings", "Mission learnings"),
  template("mission://{id}/requests", "mission-requests", "Mission operator requests"),
  template("mission://{id}/retro", "mission-retro", "Mission retrospective summary"),
];

export async function listMcpResources(services: AppServices): Promise<McpResourceDefinition[]> {
  const missions = await services.missions.list();
  return [
    ...STATIC_RESOURCES,
    ...missions.flatMap((mission) => missionResourceDefinitions(mission.missionId)),
  ];
}

export async function readMcpResource(services: AppServices, uri: string): Promise<unknown> {
  if (uri === "state://summary") return services.stateSummary.execute();
  if (uri === "observability://summary") return services.observability.execute();
  if (uri === "events://recent") return services.events.execute(20);
  if (uri === "queue://active") return services.queueOverview.execute();
  if (uri === "queue://dead-letter") return services.queueOverview.listDeadLetters();
  if (uri === "requests://active") return services.requestQuery.list();
  if (uri === "learnings://recent") return services.learningQuery.list();
  if (uri === "retro://summary") return services.retro.execute();
  if (uri === "quality://summary") return services.quality.execute();
  if (uri === "release-gate://summary") return services.releaseGate.execute();
  if (uri === "sessions://active") return services.sessions.list();
  if (uri === "leases://active") return services.leases.list();
  if (uri === "alerts://current") return services.alerts.listCurrent();
  if (uri === "alerts://log") return services.alerts.listLog();
  if (uri === "missions://active") return services.missions.list();

  const mission = matchMissionUri(uri);
  if (!mission) {
    throw new ControlPlaneError(404, "mcp_resource_not_found", { uri });
  }

  if (mission.kind === "graph") return services.missionQuery.getGraph(mission.id);
  if (mission.kind === "live") return services.missionQuery.getLiveGraph(mission.id);
  if (mission.kind === "workers") return services.missionQuery.listWorkers(mission.id);
  if (mission.kind === "handoffs") return services.missionQuery.listHandoffs(mission.id);
  if (mission.kind === "playback") return services.missionQuery.listPlayback(mission.id);
  if (mission.kind === "learnings") return services.learningQuery.list({ missionId: mission.id });
  if (mission.kind === "requests") return services.requestQuery.list({ missionId: mission.id });
  if (mission.kind === "retro") return services.retro.execute({ missionId: mission.id });
  return services.missionEvidence.execute(mission.id);
}

export async function callMcpTool(services: AppServices, name: string, args: Record<string, unknown>): Promise<McpToolExecution> {
  switch (name) {
    case "submit_command": {
      const command = await services.commands.execute(args as unknown as CommandRequest);
      await enqueueQueuedCommand(services, command);
      await enqueueAlertFanoutIfNeeded(services, {
        commandId: command.commandId,
        status: command.status as any,
        latestReason: command.events.at(-1)?.reason,
      });
      return mutation(command, commandResources());
    }
    case "issue_session":
      return mutation(await services.sessions.issue(args as unknown as IssueSessionInput), ["sessions://active", "state://summary"]);
    case "acquire_lease":
      return mutation(await services.leases.acquire(args as unknown as AcquireLeaseInput), ["leases://active", "state://summary"]);
    case "release_lease":
      return mutation(await services.leases.release(String(args.leaseId)), ["leases://active", "state://summary"]);
    case "create_mission": {
      const mission = await services.missions.create(args as any);
      return mutation(mission, ["missions://active", "quality://summary", "release-gate://summary", ...missionUris(mission.missionId)], true);
    }
    case "upsert_worker": {
      const worker = await services.missionActivity.upsertWorker(args as any);
      return mutation(worker, missionResources(worker.missionId));
    }
    case "record_handoff": {
      const handoff = await services.missionActivity.recordHandoff(args as any);
      return mutation(handoff, missionResources(handoff.missionId));
    }
    case "capture_learning": {
      const learning = await services.captureLearning.execute(args as unknown as CaptureLearningInput);
      return mutation(learning, learningResources(learning.missionId), true);
    }
    case "read_alert":
      return mutation(await services.alerts.markRead(String(args.alertId)), ["alerts://current", "alerts://log"]);
    case "dismiss_alert":
      return mutation(await services.alerts.dismiss(String(args.alertId)), ["alerts://current", "alerts://log"]);
    case "approve_run": {
      const command = await services.commandLifecycle.approve(String(args.commandId));
      await enqueueQueuedCommand(services, command);
      await enqueueAlertFanoutIfNeeded(services, command);
      await syncRelatedRequestsForCommand(services, command);
      return mutation(command, commandResources(missionIdFromCommand(command)));
    }
    case "reject_run": {
      const command = await services.commandLifecycle.reject(String(args.commandId), optionalString(args.reason));
      await enqueueAlertFanoutIfNeeded(services, command);
      await syncRelatedRequestsForCommand(services, command);
      return mutation(command, commandResources(missionIdFromCommand(command)));
    }
    case "retry_run": {
      const command = await services.commandLifecycle.retry(String(args.commandId));
      await enqueueQueuedCommand(services, command);
      await enqueueAlertFanoutIfNeeded(services, command);
      await syncRelatedRequestsForCommand(services, command);
      return mutation(command, commandResources(missionIdFromCommand(command)));
    }
    case "cancel_run": {
      const command = await services.commandLifecycle.cancel(String(args.commandId), optionalString(args.reason));
      await enqueueAlertFanoutIfNeeded(services, command);
      await syncRelatedRequestsForCommand(services, command);
      return mutation(command, commandResources(missionIdFromCommand(command)));
    }
    case "requeue_dead_letter": {
      const command = await services.commandLifecycle.retry(String(args.commandId));
      await enqueueQueuedCommand(services, command);
      await enqueueAlertFanoutIfNeeded(services, command);
      await syncRelatedRequestsForCommand(services, command);
      return mutation(command, commandResources(missionIdFromCommand(command)));
    }
    case "dismiss_dead_letter": {
      const command = await services.commandLifecycle.cancel(String(args.commandId), "dead_letter_dismissed");
      await enqueueAlertFanoutIfNeeded(services, command);
      await syncRelatedRequestsForCommand(services, command);
      return mutation(command, commandResources(missionIdFromCommand(command)));
    }
    case "submit_operator_request": {
      const request = await services.submitRequest.execute(args as unknown as SubmitOperatorRequestInput);
      await services.queueDispatch.enqueueOperatorRequest(request.requestId, "mcp_request_submission");
      return mutation(request, requestResources(request.missionId), true);
    }
    case "claim_request":
      return mutation(await services.requestLifecycle.claim(args as unknown as ClaimOperatorRequestInput), requestResources(optionalString(args.missionId)));
    case "update_request_status":
      return mutation(await services.requestLifecycle.updateStatus(args as unknown as UpdateOperatorRequestStatusInput), requestResources(optionalString(args.missionId)));
    case "set_yolo_mode":
      return mutation(await services.yoloMode.set(args as any), ["state://summary", "quality://summary", "release-gate://summary"]);
    default:
      throw new ControlPlaneError(400, "unknown_mcp_tool", { name });
  }
}

function commandResources(missionId?: string): string[] {
  return [
    "state://summary",
    "observability://summary",
    "events://recent",
    "queue://active",
    "queue://dead-letter",
    "quality://summary",
    "release-gate://summary",
    "alerts://current",
    ...(missionId ? [`mission://${missionId}/evidence`, `mission://${missionId}/playback`, `mission://${missionId}/requests`] : []),
  ];
}

function missionResources(missionId: string): string[] {
  return ["missions://active", ...missionUris(missionId)];
}

function missionUris(missionId: string): string[] {
  return [
    `mission://${missionId}/graph`,
    `mission://${missionId}/live`,
    `mission://${missionId}/workers`,
    `mission://${missionId}/handoffs`,
    `mission://${missionId}/playback`,
    `mission://${missionId}/evidence`,
    `mission://${missionId}/learnings`,
    `mission://${missionId}/requests`,
    `mission://${missionId}/retro`,
  ];
}

function requestResources(missionId?: string): string[] {
  return [
    "requests://active",
    "observability://summary",
    ...(missionId ? [`mission://${missionId}/requests`] : []),
  ];
}

function learningResources(missionId?: string): string[] {
  return [
    "learnings://recent",
    "retro://summary",
    ...(missionId ? [`mission://${missionId}/learnings`, `mission://${missionId}/retro`] : []),
  ];
}

function missionResourceDefinitions(missionId: string): McpResourceDefinition[] {
  return [
    resource(`mission://${missionId}/graph`, `mission-${missionId}-graph`, "Mission graph snapshot"),
    resource(`mission://${missionId}/live`, `mission-${missionId}-live`, "Mission live graph projection"),
    resource(`mission://${missionId}/workers`, `mission-${missionId}-workers`, "Mission worker list"),
    resource(`mission://${missionId}/handoffs`, `mission-${missionId}-handoffs`, "Mission handoff list"),
    resource(`mission://${missionId}/playback`, `mission-${missionId}-playback`, "Mission playback events"),
    resource(`mission://${missionId}/evidence`, `mission-${missionId}-evidence`, "Mission evidence summary"),
    resource(`mission://${missionId}/learnings`, `mission-${missionId}-learnings`, "Mission learnings"),
    resource(`mission://${missionId}/requests`, `mission-${missionId}-requests`, "Mission operator requests"),
    resource(`mission://${missionId}/retro`, `mission-${missionId}-retro`, "Mission retrospective summary"),
  ];
}

function mutation(data: unknown, updatedResources: string[], listChanged = false): McpToolExecution {
  return { data, updatedResources, listChanged };
}

function tool(name: string, description: string, inputSchema: Record<string, unknown>, readOnlyHint: boolean, destructiveHint: boolean, idempotentHint: boolean): McpToolDefinition {
  return {
    name,
    description,
    inputSchema,
    annotations: {
      readOnlyHint,
      destructiveHint,
      idempotentHint,
      openWorldHint: name === "submit_command",
      title: name.replaceAll("_", " "),
    },
  };
}

function resource(uri: string, name: string, description: string): McpResourceDefinition {
  return { uri, name, description, mimeType: "application/json" };
}

function template(uriTemplate: string, name: string, description: string): McpResourceTemplate {
  return { uriTemplate, name, description, mimeType: "application/json" };
}

function objectSchema(required: string[]): Record<string, unknown> {
  return { type: "object", required, additionalProperties: true };
}

function commandSchema(required: string[]): Record<string, unknown> {
  return {
    type: "object",
    required,
    additionalProperties: true,
    properties: {
      action: { type: "string" },
      payload: { type: "object" },
      resource: { type: "object" },
    },
  };
}

function matchMissionUri(uri: string): { id: string; kind: "graph" | "live" | "workers" | "handoffs" | "playback" | "evidence" | "learnings" | "requests" | "retro" } | null {
  const match = /^mission:\/\/([^/]+)\/(graph|live|workers|handoffs|playback|evidence|learnings|requests|retro)$/.exec(uri);
  if (!match) {
    return null;
  }
  return { id: match[1], kind: match[2] as any };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function enqueueQueuedCommand(services: AppServices, command: unknown): Promise<void> {
  const record = command as {
    commandId?: unknown;
    action?: unknown;
    status?: unknown;
    latestReason?: unknown;
    events?: Array<{ reason?: unknown }>;
  };

  if (record.status !== "queued" || typeof record.commandId !== "string") {
    return;
  }

  const eventReason = record.events?.at(-1)?.reason;
  const reason = typeof record.latestReason === "string"
    ? record.latestReason
    : typeof eventReason === "string"
      ? eventReason
      : undefined;
  if (record.action === "browser_check" || record.action === "verify_run") {
    await services.queueDispatch.enqueueCommandExecution(record.commandId, record.action, reason);
    return;
  }
  await services.queueDispatch.enqueueRetry(record.commandId, reason);
}
