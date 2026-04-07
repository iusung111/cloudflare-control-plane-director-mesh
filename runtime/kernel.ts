import {
  CommandRequest,
  MissionEvent,
  DerivedState,
  CommandStatus,
  ResourceScope,
} from "./types";

export interface KernelStore {
  hasDedup(key: string): Promise<boolean>;
  hasConflict(key: string, resource: ResourceScope): Promise<boolean>;
  appendEvent(event: MissionEvent): Promise<void>;
}

export interface LeaseValidator {
  isValid(sessionId: string, leaseId: string, resource: ResourceScope): Promise<boolean>;
}

export interface GuardrailEngine {
  allows(request: CommandRequest): Promise<{ allowed: boolean; reason?: string }>;
}

export interface MissionKernelDeps {
  store: KernelStore;
  leases: LeaseValidator;
  guardrails: GuardrailEngine;
}

export class MissionKernel {
  constructor(private readonly deps: MissionKernelDeps) {}

  async processCommand(request: CommandRequest): Promise<{
    event: MissionEvent;
    state: DerivedState;
  }> {
    await this.validate(request);
    await this.authorityCheck(request);

    if (await this.dedupCheck(request)) {
      return this.reject(request, "duplicate_command");
    }

    if (await this.conflictCheck(request)) {
      return this.queue(request, "resource_conflict");
    }

    const guardrailResult = await this.guardrailCheck(request);
    if (!guardrailResult.allowed) {
      return this.reject(request, guardrailResult.reason ?? "guardrail_blocked");
    }

    const event = this.emitEvent(request, "COMMAND_EMITTED", "emitted");
    await this.deps.store.appendEvent(event);

    return {
      event,
      state: this.deriveState(event, "emit_side_effect"),
    };
  }

  private async validate(request: CommandRequest): Promise<void> {
    if (!request.commandId || !request.dedupKey || !request.conflictKey) {
      throw new Error("mission_kernel: invalid_request");
    }
  }

  private async authorityCheck(request: CommandRequest): Promise<void> {
    const leaseOk = await this.deps.leases.isValid(
      request.sessionId,
      request.leaseId,
      request.resource,
    );

    if (!leaseOk) {
      throw new Error("mission_kernel: lease_invalid");
    }
  }

  private dedupCheck(request: CommandRequest): Promise<boolean> {
    return this.deps.store.hasDedup(request.dedupKey);
  }

  private conflictCheck(request: CommandRequest): Promise<boolean> {
    return this.deps.store.hasConflict(request.conflictKey, request.resource);
  }

  private guardrailCheck(request: CommandRequest): Promise<{ allowed: boolean; reason?: string }> {
    return this.deps.guardrails.allows(request);
  }

  private emitEvent(
    request: CommandRequest,
    type: MissionEvent["type"],
    status: CommandStatus,
    reason?: string,
  ): MissionEvent {
    return {
      eventId: `evt:${request.commandId}:${status}`,
      commandId: request.commandId,
      type,
      status,
      reason,
      resource: request.resource,
      createdAt: new Date().toISOString(),
    };
  }

  private deriveState(event: MissionEvent, nextAction: DerivedState["nextAction"]): DerivedState {
    return {
      commandId: event.commandId,
      status: event.status,
      lastEventId: event.eventId,
      nextAction,
    };
  }

  private async reject(
    request: CommandRequest,
    reason: string,
  ): Promise<{ event: MissionEvent; state: DerivedState }> {
    const event = this.emitEvent(request, "COMMAND_REJECTED", "rejected", reason);
    await this.deps.store.appendEvent(event);

    return {
      event,
      state: this.deriveState(event, "escalate"),
    };
  }

  private async queue(
    request: CommandRequest,
    reason: string,
  ): Promise<{ event: MissionEvent; state: DerivedState }> {
    const event = this.emitEvent(request, "COMMAND_REJECTED", "queued", reason);
    await this.deps.store.appendEvent(event);

    return {
      event,
      state: this.deriveState(event, "queue"),
    };
  }
}
