import { describe, expect, it } from "vitest";
import { MissionRoomDurableObject } from "../apps/worker/src/live/mission-room.do";

describe("mission room durable object", () => {
  it("does not re-close sockets on webSocketClose", async () => {
    const room = new MissionRoomDurableObject({
      storage: {
        get: async () => null,
        put: async () => undefined,
      },
      acceptWebSocket: () => undefined,
      getWebSockets: () => [],
    } as unknown as DurableObjectState);

    const socket = {
      close: () => {
        throw new Error("close_should_not_be_called");
      },
    } as unknown as WebSocket;

    await expect(room.webSocketClose(socket, 1000, "normal")).resolves.toBeUndefined();
  });
});
