export interface ControlQueueMessage {
  kind: "retry-command";
  commandId: string;
  enqueuedAt: string;
  reason?: string;
}
