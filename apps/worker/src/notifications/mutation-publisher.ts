import { notifyBrokerMutations } from "../mcp/broker-client";
import { enqueueMutationNotifications } from "../mcp/session-store";
import type { WorkerEnv } from "../services";

export async function publishMutationNotifications(
  env: WorkerEnv | undefined,
  input: { updatedResources: string[]; listChanged?: boolean },
): Promise<void> {
  if (env?.MCP_BROKER) {
    await notifyBrokerMutations(env, input);
    return;
  }

  enqueueMutationNotifications(input);
}
