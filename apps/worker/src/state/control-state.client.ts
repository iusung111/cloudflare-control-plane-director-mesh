import type { AlertRecord, AlertStateRecord, ScopedApprovalRecord } from "../../../../packages/contracts/src";
import type { WorkerEnv } from "../services";

const CONTROL_STATE_ID = "control-state";

export async function listCachedApprovals(env?: WorkerEnv): Promise<ScopedApprovalRecord[] | null> {
  return controlStateFetch<ScopedApprovalRecord[]>(env, "/approvals");
}

export async function putCachedApproval(env: WorkerEnv | undefined, approval: ScopedApprovalRecord): Promise<void> {
  await controlStateFetch(env, `/approvals/${encodeURIComponent(approval.approvalId)}`, {
    method: "PUT",
    body: JSON.stringify(approval),
  });
}

export async function deleteCachedApproval(env: WorkerEnv | undefined, approvalId: string): Promise<void> {
  await controlStateFetch(env, `/approvals/${encodeURIComponent(approvalId)}`, { method: "DELETE" });
}

export async function listCachedAlertStates(env?: WorkerEnv): Promise<AlertStateRecord[] | null> {
  return controlStateFetch<AlertStateRecord[]>(env, "/alert-states");
}

export async function putCachedAlertState(env: WorkerEnv | undefined, state: AlertStateRecord): Promise<void> {
  await controlStateFetch(env, `/alert-states/${encodeURIComponent(state.alertId)}`, {
    method: "PUT",
    body: JSON.stringify(state),
  });
}

export function applyAlertStateOverrides(alerts: AlertRecord[], states: AlertStateRecord[] | null): AlertRecord[] {
  if (!states?.length) {
    return alerts;
  }
  const index = new Map(states.map((state) => [state.alertId, state]));
  return alerts.map((alert) => {
    const state = index.get(alert.alertId);
    if (!state) {
      return alert;
    }
    return {
      ...alert,
      unread: state.unread,
      dismissed: state.dismissed,
    };
  });
}

async function controlStateFetch<T>(
  env: WorkerEnv | undefined,
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  if (!env?.CONTROL_STATE) {
    return null;
  }
  const stub = env.CONTROL_STATE.get(env.CONTROL_STATE.idFromName(CONTROL_STATE_ID));
  const response = await stub.fetch(`https://control-state${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (response.status === 204) {
    return null;
  }
  return response.json() as Promise<T>;
}
