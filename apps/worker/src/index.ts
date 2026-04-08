import type { ControlQueueMessage } from "../../../packages/contracts/src";
import { createApp } from "./create-app";
import { MissionRoomDurableObject } from "./live/mission-room.do";
import { McpBrokerDurableObject } from "./mcp/mcp-broker.do";
import { processControlQueueBatch } from "./queue/process-control-queue";
import { createServices, type WorkerEnv } from "./services";

export { McpBrokerDurableObject, MissionRoomDurableObject };

export default {
  fetch(request: Request, env: WorkerEnv, executionContext: ExecutionContext) {
    const app = createApp({ env });
    return app.fetch(request, env, executionContext);
  },
  async queue(batch: MessageBatch, env: WorkerEnv): Promise<void> {
    const services = createServices(env);
    await processControlQueueBatch(batch as MessageBatch<ControlQueueMessage>, services);
  },
} satisfies ExportedHandler<WorkerEnv>;
