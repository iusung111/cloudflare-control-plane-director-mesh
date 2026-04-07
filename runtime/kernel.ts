import {
  CommandRequest,
  MissionEvent,
  DerivedState,
  CommandStatus,
  ResourceScope,
} from "./types";

export interface KernelStore {
  hasDedup(dedupKey: string): Promise<boolean>;
  saveDedup(dedupKey: string, commandId: string): Promise<void>;
  hasActiveLock(resource: ResourceScope): Promise<boolean>;
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

    // 1. Dedup Check (using dedupKey)
    if (await this.deps.store.hasDedup(request.dedupKey)) {
      return this.reject(request, "duplicate_command");
    }

    // 2. Conflict Check (using conflictKey/resource)
    if (await this.deps.store.hasActiveLock(request.resource)) {
      return this.queue(request, "resource_conflict");
    }

    // 3. Guardrail Check
    const guardrailResult = await this.deps.guardrails.allows(request);
    if (!guardrailResult.allowed) {
      return this.reject(request, guardrailResult.reason ?? "guardrail_blocked");
    }

    // 4. Emit Event
    const event = this.emitEvent(request, "COMMAND_EMITTED", "emitted");
    await this.deps.store.appendEvent(event);
    
    // 5. Save Dedup Index (only after successful emission)
    await this.deps.store.saveDedup(request.dedupKey, request.commandId);

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

  private emitEvent(
    request: CommandRequest,
    type: MissionEvent["type"],
    status: CommandStatus,
    reason?: string,
  ): MissionEvent {
    return {
      eventId: `evt:${request.commandId}:${status}:${Date.now()}`,
      commandId: request.commandId,
      type,
      status,
      reason,
      resource: request.resource,
      payload: request.payload,
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
    const event = this.emitEvent(request, "COMMAND_QUEUED", "queued", reason);
    await this.deps.store.appendEvent(event);

    return {
      event,
      state: this.deriveState(event, "queue"),
    };
  }
}
