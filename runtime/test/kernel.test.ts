import { describe, it, expect, beforeEach } from 'vitest';
import { MissionKernel } from '../kernel';
import { InMemoryRuntimeStore } from '../store';
import { GuardrailEngine } from '../guardrail';
import { CommandRequest, Session, Lease } from '../types';

describe('MissionKernel - Core Invariants', () => {
  let store: InMemoryRuntimeStore;
  let guardrails: GuardrailEngine;
  let kernel: MissionKernel;

  const validSession: Session = {
    sessionId: 'sess-1',
    role: 'delivery',
    templateVersion: '1.0',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };

  const activeLease: Lease = {
    leaseId: 'lease-1',
    sessionId: 'sess-1',
    resource: { repo: 'owner/repo', branch: 'main', path: 'src/' },
    status: 'active',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };

  beforeEach(() => {
    store = new InMemoryRuntimeStore();
    store.seedSession(validSession);
    store.saveLease(activeLease);
    
    guardrails = new GuardrailEngine({
      locks: { hasActiveWriter: (res) => store.hasActiveLock(res) }
    });
    
    kernel = new MissionKernel({
      store,
      guardrails,
      leases: {
        isValid: async (s, l, r) => {
          const lease = await store.getLease(l);
          return !!lease && lease.sessionId === s && lease.status === 'active';
        }
      }
    });
  });

  it('should reject duplicate commands based on dedupKey', async () => {
    const request: CommandRequest = {
      commandId: 'cmd-1',
      dedupKey: 'dedup-1',
      conflictKey: 'key-1',
      authority: 'P2_CONTROL_PLANE',
      sessionId: 'sess-1',
      leaseId: 'lease-1',
      resource: { repo: 'owner/repo', branch: 'main', path: 'src/' },
      action: 'github_write',
      payload: {},
    };

    // First call succeeds
    const result1 = await kernel.processCommand(request);
    expect(result1.event.status).toBe('emitted');

    // Second call with same dedupKey fails
    const result2 = await kernel.processCommand({ ...request, commandId: 'cmd-2' });
    expect(result2.event.status).toBe('rejected');
    expect(result2.event.reason).toBe('duplicate_command');
  });

  it('should block deploy_live without explicit approval', async () => {
    const request: CommandRequest = {
      commandId: 'cmd-3',
      dedupKey: 'dedup-3',
      conflictKey: 'key-3',
      authority: 'P2_CONTROL_PLANE',
      sessionId: 'sess-1',
      leaseId: 'lease-1',
      resource: { repo: 'owner/repo', branch: 'main', path: 'src/' },
      action: 'deploy_live',
      payload: {}, // No explicitLive: true
    };

    const result = await kernel.processCommand(request);
    expect(result.event.status).toBe('rejected');
    expect(result.event.reason).toContain('requires_explicit_user_approval');
  });

  it('should always block template_mutation', async () => {
    const request: CommandRequest = {
      commandId: 'cmd-4',
      dedupKey: 'dedup-4',
      conflictKey: 'key-4',
      authority: 'P2_CONTROL_PLANE',
      sessionId: 'sess-1',
      leaseId: 'lease-1',
      resource: { repo: 'owner/repo', branch: 'main', path: 'src/' },
      action: 'template_mutation',
      payload: {},
    };

    const result = await kernel.processCommand(request);
    expect(result.event.status).toBe('rejected');
    expect(result.event.reason).toContain('strictly_forbidden');
  });

  it('should queue commands on resource conflict', async () => {
    // Occupy resource with another active lease
    store.saveLease({
      leaseId: 'lease-other',
      sessionId: 'sess-other',
      resource: { repo: 'owner/repo', branch: 'main', path: 'src/' },
      status: 'active',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    const request: CommandRequest = {
      commandId: 'cmd-5',
      dedupKey: 'dedup-5',
      conflictKey: 'key-5',
      authority: 'P2_CONTROL_PLANE',
      sessionId: 'sess-1',
      leaseId: 'lease-1',
      resource: { repo: 'owner/repo', branch: 'main', path: 'src/' },
      action: 'github_write',
      payload: {},
    };

    const result = await kernel.processCommand(request);
    expect(result.event.status).toBe('queued');
    expect(result.event.type).toBe('COMMAND_QUEUED');
  });
});
