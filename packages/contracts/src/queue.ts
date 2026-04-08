export type ControlQueueMessage =
  | {
      kind: "retry-command";
      commandId: string;
      enqueuedAt: string;
      reason?: string;
    }
  | {
      kind: "execute-command";
      commandId: string;
      action: "browser_check" | "verify_run";
      enqueuedAt: string;
      reason?: string;
    }
  | {
      kind: "dispatch-operator-request";
      requestId: string;
      enqueuedAt: string;
      reason?: string;
    }
  | {
      kind: "projection-rebuild";
      missionId?: string;
      enqueuedAt: string;
      reason?: string;
    }
  | {
      kind: "alert-fanout";
      alertId: string;
      enqueuedAt: string;
      reason?: string;
    }
  | {
      kind: "browser-evidence-postprocess";
      commandId: string;
      enqueuedAt: string;
      reason?: string;
    };
