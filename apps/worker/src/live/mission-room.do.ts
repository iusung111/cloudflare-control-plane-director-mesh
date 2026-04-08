import type { MissionDelta } from "../../../../packages/contracts/src";
import { applyMissionDeltaToSnapshot } from "./mission-room.snapshot";

const SNAPSHOT_KEY = "mission:snapshot";

export class MissionRoomDurableObject {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);

      const snapshot = await this.state.storage.get<string>(SNAPSHOT_KEY);
      if (snapshot) {
        server.send(snapshot);
      }

      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === "POST" && url.pathname.endsWith("/snapshot")) {
      const body = await request.text();
      await this.state.storage.put(SNAPSHOT_KEY, body);
      this.broadcast(body);
      return new Response(null, { status: 204 });
    }

    if (request.method === "POST" && url.pathname.endsWith("/delta")) {
      const body = await request.text();
      await this.applyDelta(body);
      this.broadcast(body);
      return new Response(null, { status: 204 });
    }

    return new Response("MissionRoomDurableObject", { status: 200 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (String(message) === "snapshot") {
      const snapshot = await this.state.storage.get<string>(SNAPSHOT_KEY);
      if (snapshot) {
        ws.send(snapshot);
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    ws.close(1011, "mission_room_error");
  }

  private broadcast(payload: string): void {
    for (const socket of this.state.getWebSockets()) {
      socket.send(payload);
    }
  }

  private async applyDelta(payload: string): Promise<void> {
    const snapshotPayload = await this.state.storage.get<string>(SNAPSHOT_KEY);
    const nextSnapshot = applyMissionDeltaToSnapshot(snapshotPayload ?? null, payload);
    if (nextSnapshot) {
      await this.state.storage.put(SNAPSHOT_KEY, nextSnapshot);
    }
  }
}
