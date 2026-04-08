import type { MissionDelta } from "../../../contracts/src";

const socketsByMission = new Map<string, Set<WebSocket>>();

export function registerMissionSocket(missionId: string, socket: WebSocket): void {
  const sockets = socketsByMission.get(missionId) ?? new Set<WebSocket>();
  sockets.add(socket);
  socketsByMission.set(missionId, sockets);
}

export function unregisterMissionSocket(missionId: string, socket: WebSocket): void {
  const sockets = socketsByMission.get(missionId);
  if (!sockets) {
    return;
  }

  sockets.delete(socket);
  if (sockets.size === 0) {
    socketsByMission.delete(missionId);
  }
}

export function broadcastMissionDelta(missionId: string, delta: MissionDelta): void {
  const sockets = socketsByMission.get(missionId);
  if (!sockets) {
    return;
  }

  const payload = JSON.stringify(delta);
  for (const socket of sockets) {
    try {
      socket.send(payload);
    } catch {
      unregisterMissionSocket(missionId, socket);
    }
  }
}
