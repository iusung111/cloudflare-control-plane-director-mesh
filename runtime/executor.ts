import { CommandRequest, MissionEvent, CommandStatus } from "./types";

export interface ExecutionResult {
  status: "success" | "failure" | "blocked";
  reason?: string;
  payload?: any;
}

export interface CommandHandler {
  handle(request: CommandRequest): Promise<ExecutionResult>;
}

export class MissionExecutor {
  private handlers = new Map<string, CommandHandler>();

  registerHandler(action: string, handler: CommandHandler): void {
    this.handlers.set(action, handler);
  }

  async execute(request: CommandRequest): Promise<ExecutionResult> {
    // [A-3] Removed hardcoded deploy_live blocking
    // Delegation is now handled by guardrails and individual handlers

    const handler = this.handlers.get(request.action);
    if (!handler) {
      return {
        status: "blocked",
        reason: `no_handler_registered_for_${request.action}`,
      };
    }

    try {
      return await handler.handle(request);
    } catch (error: any) {
      return {
        status: "failure",
        reason: `handler_exception: ${error.message}`,
      };
    }
  }

  // --- Helper for creating completed/failed events ---
  static toEvent(
    request: CommandRequest,
    result: ExecutionResult,
  ): MissionEvent {
    const status: CommandStatus =
      result.status === "success"
        ? "completed"
        : result.status === "blocked"
        ? "failed" // [B-2] Aligning blocked with failed as per recommendation
        : "failed";

    const type = status === "completed" ? "COMMAND_COMPLETED" : "COMMAND_FAILED";

    return {
      eventId: `evt:${request.commandId}:${status}:${Date.now()}`,
      commandId: request.commandId,
      type,
      status,
      reason: result.reason,
      resource: request.resource,
      payload: result.payload,
      createdAt: new Date().toISOString(),
    };
  }
}

/**
 * [A-3] Temporary Mock Handler for deploy_live to prove the flow
 */
export class MockDeployHandler implements CommandHandler {
  async handle(request: CommandRequest): Promise<ExecutionResult> {
    if (request.payload.forceFail) {
      return {
        status: "failure",
        reason: "mock_forced_failure",
      };
    }
    if (request.action === "deploy_live" && request.payload.explicitLive) {
      return {
        status: "success",
        reason: "mock_deployment_successful",
      };
    }
    return {
      status: "failure",
      reason: "mock_deployment_rejected",
    };
  }
}
