import { describe, it, expect, beforeEach } from 'vitest';
import { ControlPlaneRuntime } from '../index';
import { InMemoryRuntimeStore } from '../store';
import { MissionExecutor, MockDeployHandler } from '../executor';
import { GuardrailEngine } from '../guardrail';
import { CommandRequest, Session, Lease } from '../types';
import { makeConflictKey } from '../resource_key';

describe('ControlPlaneRuntime - Integration Flow', () => {
  let store: InMemoryRuntimeStore;
  let executor: MissionExecutor;
  let runtime: ControlPlaneRuntime;

  const validSession: Session = {
    sessionId: 'sess-1',
    role: 'delivery',
    templateVersion: '1.0',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };

  const resource = { repo: 'owner/repo', branch: 'main', path: 'src/' };
  const conflictKey = makeConflictKey(resource);

  const activeLease: Lease = {
    leaseId: 'lease-1',
    sessionId: 'sess-1',
    resource,
    status: 'active',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };

  beforeEach(() => {
    store = new InMemoryRuntimeStore();
    store.seedSession(validSession);
    store.saveLease(activeLease);
    
    executor = new MissionExecutor();
    executor.registerHandler('deploy_live', new MockDeployHandler());
    
    runtime = new ControlPlaneRuntime(
      { github: { owner: 'o', repo: 'r', token: 't', branch: 'main' } },
      { store, executor }
    );
  });

  it('[D-2] should complete flow: emitted -> executor -> completed', async () => {
    const request: CommandRequest = {
      commandId: 'cmd-flow-1',
      dedupKey: 'dedup-flow-1',
      conflictKey,
      authority: 'P2_CONTROL_PLANE',
      sessionId: 'sess-1',
      leaseId: 'lease-1',
      resource,
      action: 'deploy_live',
      payload: { explicitLive: true },
    };

    const result = await runtime.handleCommand(request);
    
    expect(result.event.status).toBe('emitted');
    expect(result.state.status).toBe('completed');
    expect(result.state.nextAction).toBe('none');

    // Verify events in store
    const events = store.getEvents();
    expect(events.some(e => e.status === 'emitted')).toBe(true);
    expect(events.some(e => e.status === 'completed')).toBe(true);
  });

  it('[D-2] should fail flow: emitted -> executor -> failed', async () => {
    const request: CommandRequest = {
      commandId: 'cmd-flow-2',
      dedupKey: 'dedup-flow-2',
      conflictKey,
      authority: 'P2_CONTROL_PLANE',
      sessionId: 'sess-1',
      leaseId: 'lease-1',
      resource,
      action: 'deploy_live',
      payload: { explicitLive: true, forceFail: true }, // Pass guardrail, but force fail in executor
    };

    const result = await runtime.handleCommand(request);
    
    expect(result.event.status).toBe('emitted');
    expect(result.state.status).toBe('failed');
    
    const events = store.getEvents();
    expect(events.some(e => e.status === 'failed')).toBe(true);
  });

  it('should block flow if guardrail fails', async () => {
    const request: CommandRequest = {
      commandId: 'cmd-flow-3',
      dedupKey: 'dedup-flow-3',
      conflictKey,
      authority: 'P2_CONTROL_PLANE',
      sessionId: 'sess-1',
      leaseId: 'lease-1',
      resource,
      action: 'template_mutation',
      payload: {},
    };

    const result = await runtime.handleCommand(request);
    
    expect(result.event.status).toBe('rejected');
    expect(result.state.nextAction).toBe('escalate');
  });
});
