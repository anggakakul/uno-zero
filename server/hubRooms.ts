import { Server, Socket } from 'socket.io';
import { HubGameState, VariantId, VariantSettings } from '../src/hub/types';

interface HubOnlineRoom {
  code: string;
  hostSocketId: string;
  variantId: VariantId;
  settings: VariantSettings;
  state: HubGameState | null;
  players: { socketId: string; name: string }[];
}

const hubRooms = new Map<string, HubOnlineRoom>();

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 5; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return hubRooms.has(out) ? genCode() : out;
}

/**
 * Registers real-time UNO GAME HUB room synchronization events on the existing Socket.IO server
 * without touching any UNO ZERO room events!
 */
export function registerHubRoomHandlers(io: Server, socket: Socket): void {
  socket.on(
    'hub:create_room',
    (
      payload: { playerName: string; variantId: VariantId; settings: VariantSettings; initialState: HubGameState },
      cb?: (res: { ok: boolean; code?: string; error?: string }) => void
    ) => {
      const code = genCode();
      const room: HubOnlineRoom = {
        code,
        hostSocketId: socket.id,
        variantId: payload.variantId,
        settings: payload.settings,
        state: payload.initialState,
        players: [{ socketId: socket.id, name: payload.playerName }],
      };
      hubRooms.set(code, room);
      socket.join(`hub:${code}`);
      cb?.({ ok: true, code });
    }
  );

  socket.on(
    'hub:join_room',
    (
      payload: { code: string; playerName: string },
      cb?: (res: { ok: boolean; state?: HubGameState | null; error?: string }) => void
    ) => {
      const code = payload.code.trim().toUpperCase();
      const room = hubRooms.get(code);
      if (!room) {
        cb?.({ ok: false, error: 'Room Hub tidak ditemukan.' });
        return;
      }
      if (!room.players.some((p) => p.socketId === socket.id)) {
        room.players.push({ socketId: socket.id, name: payload.playerName });
      }
      socket.join(`hub:${code}`);
      io.to(`hub:${code}`).emit('hub:players_updated', room.players);
      cb?.({ ok: true, state: room.state });
    }
  );

  socket.on('hub:sync_state', (payload: { code: string; state: HubGameState }) => {
    const room = hubRooms.get(payload.code.trim().toUpperCase());
    if (!room) return;
    room.state = payload.state;
    socket.to(`hub:${room.code}`).emit('hub:state_updated', payload.state);
  });
}
