export type AlertSeverity = "low" | "medium" | "high";
export type AlertKind = "queued_command" | "rejected_command" | "failed_command" | "cancelled_command";

export interface AlertRecord {
  alertId: string;
  kind: AlertKind;
  severity: AlertSeverity;
  summary: string;
  commandId: string;
  status: string;
  unread: boolean;
  dismissed: boolean;
  createdAt: string;
}

export interface AlertStateRecord {
  alertId: string;
  unread: boolean;
  dismissed: boolean;
  updatedAt: string;
}
