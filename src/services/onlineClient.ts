import { io, Socket } from 'socket.io-client';
import { GameState, OnlineRoomInfo, SlotPosition } from '../types/game';
import { getOrCreateSessionId } from './session';

/**
 * Resolves the multiplayer backend URL cleanly from Environment Variables:
 * - Uses VITE_SERVER_URL (or legacy VITE_MULTIPLAYER_URL) when set (e.g. Vercel frontend -> Render backend)
 * - In production without VITE_SERVER_URL: uses same-origin (single-URL Render/Railway deploy)
 * - In local dev: connects to port 3001 on the current hostname
 */
export function getServerBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_SERVER_URL || import.meta.env.VITE_MULTIPLAYER_URL || '').trim();
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }
  if (typeof window === 'undefined') return '';
  if (import.meta.env.PROD) {
    return window.location.origin;
  }
  return `${window.location.protocol}//${window.location.hostname}:3001`;
}

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(getServerBaseUrl(), {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.emit('leave_room');
    socket.disconnect();
    socket = null;
  }
}

export interface RoomActionResponse {
  ok: boolean;
  error?: string;
  room?: OnlineRoomInfo;
  playerId?: string;
  gameState?: GameState | null;
}

export function createOnlineRoom(
  playerName: string,
  totalRounds: number
): Promise<RoomActionResponse> {
  return new Promise((resolve) => {
    const s = getSocket();
    const sessionId = getOrCreateSessionId();
    const timeout = setTimeout(() => {
      resolve({
        ok: false,
        error: `Gagal terhubung ke server multiplayer (${getServerBaseUrl()}). Pastikan server aktif.`,
      });
    }, 6000);

    s.emit('create_room', { playerName, sessionId, totalRounds }, (res: RoomActionResponse) => {
      clearTimeout(timeout);
      resolve(res);
    });
  });
}

export function joinOnlineRoom(
  code: string,
  playerName: string
): Promise<RoomActionResponse> {
  return new Promise((resolve) => {
    const s = getSocket();
    const sessionId = getOrCreateSessionId();
    const timeout = setTimeout(() => {
      resolve({
        ok: false,
        error: `Gagal terhubung ke server multiplayer (${getServerBaseUrl()}). Pastikan server aktif.`,
      });
    }, 6000);

    s.emit('join_room', { code, playerName, sessionId }, (res: RoomActionResponse) => {
      clearTimeout(timeout);
      resolve(res);
    });
  });
}

export function reconnectOnlineRoom(code: string): Promise<RoomActionResponse> {
  return new Promise((resolve) => {
    const s = getSocket();
    const sessionId = getOrCreateSessionId();
    const timeout = setTimeout(() => {
      resolve({ ok: false });
    }, 4500);

    s.emit('reconnect_room', { code, sessionId }, (res: RoomActionResponse) => {
      clearTimeout(timeout);
      resolve(res);
    });
  });
}

export function updateOnlineRoomSettings(totalRounds: number): void {
  getSocket().emit('update_room_settings', { totalRounds });
}

export function startOnlineGame(): void {
  getSocket().emit('start_game');
}

export function sendOnlineAction(
  payload:
    | { type: 'flip_initial'; colIdx: number; pos: SlotPosition }
    | { type: 'take_source'; source: 'draw' | 'discard' }
    | { type: 'swap_slot'; colIdx: number; pos: SlotPosition }
    | { type: 'discard_drawn' }
    | { type: 'flip_after_discard'; colIdx: number; pos: SlotPosition }
    | { type: 'resolve_double_draw2'; targetIds: string[] }
    | { type: 'call_uno' }
    | { type: 'catch_uno' }
    | { type: 'next_round' }
    | { type: 'play_again' }
): void {
  getSocket().emit('game_action', payload);
}

export function subscribeOnlineEvents(handlers: {
  onRoomUpdated: (room: OnlineRoomInfo) => void;
  onGameState: (state: GameState) => void;
  onSocketReconnect?: () => void;
}): () => void {
  const s = getSocket();
  s.on('room_updated', handlers.onRoomUpdated);
  s.on('game_state', handlers.onGameState);
  const handleConnect = () => {
    handlers.onSocketReconnect?.();
  };
  s.on('connect', handleConnect);
  return () => {
    s.off('room_updated', handlers.onRoomUpdated);
    s.off('game_state', handlers.onGameState);
    s.off('connect', handleConnect);
  };
}
