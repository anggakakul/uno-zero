import { io, Socket } from 'socket.io-client';
import { getServerBaseUrl } from '../../services/onlineClient';
import { getOrCreateSessionId } from '../../services/session';
import { OnlinePlayerNotice } from '../../types/game';
import {
  HubGameState,
  HubOnlineAction,
  HubOnlineRoomInfo,
  VariantId,
  VariantSettings,
} from '../types';

let hubSocket: Socket | null = null;
let hubActionSeq = 0;

function nextHubActionId(): string {
  hubActionSeq += 1;
  return `ha_${Date.now().toString(36)}_${hubActionSeq}`;
}

export function getHubSocket(): Socket {
  if (!hubSocket) {
    hubSocket = io(getServerBaseUrl(), {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling'],
    });
  }
  if (!hubSocket.connected) {
    hubSocket.connect();
  }
  return hubSocket;
}

export function leaveHubOnlineRoom(): void {
  if (hubSocket) {
    hubSocket.emit('hub:leave_room');
    hubSocket.disconnect();
    hubSocket = null;
  }
}

export interface HubRoomActionResponse {
  ok: boolean;
  error?: string;
  room?: HubOnlineRoomInfo;
  playerId?: string;
  role?: 'player' | 'spectator';
  gameState?: HubGameState | null;
}

export function createHubOnlineRoom(
  playerName: string,
  variantId: Exclude<VariantId, 'uno-zero'>,
  settings: VariantSettings,
  fillWithBots = false,
  targetPlayerCount?: number
): Promise<HubRoomActionResponse> {
  return new Promise((resolve) => {
    const sock = getHubSocket();
    const sessionId = getOrCreateSessionId();
    const timer = setTimeout(() => {
      resolve({
        ok: false,
        error: `Gagal terhubung ke server multiplayer (${getServerBaseUrl()}). Pastikan server aktif.`,
      });
    }, 6000);

    sock.emit(
      'hub:create_room',
      { playerName, sessionId, variantId, settings, fillWithBots, targetPlayerCount },
      (res: HubRoomActionResponse) => {
        clearTimeout(timer);
        resolve(res);
      }
    );
  });
}

export function joinHubOnlineRoom(
  code: string,
  playerName: string
): Promise<HubRoomActionResponse> {
  return new Promise((resolve) => {
    const sock = getHubSocket();
    const sessionId = getOrCreateSessionId();
    const timer = setTimeout(() => {
      resolve({
        ok: false,
        error: `Gagal terhubung ke server multiplayer (${getServerBaseUrl()}). Pastikan server aktif.`,
      });
    }, 6000);

    sock.emit(
      'hub:join_room',
      { code: code.trim().toUpperCase(), playerName, sessionId },
      (res: HubRoomActionResponse) => {
        clearTimeout(timer);
        resolve(res);
      }
    );
  });
}

export function reconnectHubOnlineRoom(code: string): Promise<HubRoomActionResponse> {
  return new Promise((resolve) => {
    const sock = getHubSocket();
    const sessionId = getOrCreateSessionId();
    const timer = setTimeout(() => resolve({ ok: false }), 4500);

    sock.emit(
      'hub:reconnect_room',
      { code: code.trim().toUpperCase(), sessionId },
      (res: HubRoomActionResponse) => {
        clearTimeout(timer);
        resolve(res);
      }
    );
  });
}

export function toggleHubReady(ready?: boolean): void {
  getHubSocket().emit('hub:toggle_ready', typeof ready === 'boolean' ? { ready } : undefined);
}

export function toggleHubSpectatorQueue(queued?: boolean): void {
  getHubSocket().emit(
    'hub:toggle_spectator_queue',
    typeof queued === 'boolean' ? { queued } : undefined
  );
}

export function updateHubRoomSettings(payload: {
  variantId?: Exclude<VariantId, 'uno-zero'>;
  settings?: Partial<VariantSettings>;
  fillWithBots?: boolean;
  targetPlayerCount?: number;
}): void {
  getHubSocket().emit('hub:update_settings', payload);
}

export function startHubOnlineGame(): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const sock = getHubSocket();
    const timer = setTimeout(
      () => resolve({ ok: false, error: 'Server tidak merespons.' }),
      5000
    );
    sock.emit('hub:start_game', (res: { ok: boolean; error?: string }) => {
      clearTimeout(timer);
      resolve(res ?? { ok: true });
    });
  });
}

export interface HubEmoteEvent {
  id: string;
  playerId: string;
  playerName: string;
  emoteId: string;
  label: string;
}

export function sendHubEmote(emoteId: string, label: string): void {
  getHubSocket().emit('hub:send_emote', { emoteId, label });
}

export function subscribeHubEmotes(onEmote: (evt: HubEmoteEvent) => void): () => void {
  const sock = getHubSocket();
  sock.on('hub:emote', onEmote);
  return () => {
    sock.off('hub:emote', onEmote);
  };
}

export function sendHubOnlineAction(action: HubOnlineAction): void {
  getHubSocket().emit('hub:game_action', {
    action,
    actionId: nextHubActionId(),
  });
}

export function subscribeHubOnlineEvents(handlers: {
  onRoomUpdated: (room: HubOnlineRoomInfo) => void;
  onGameState: (state: HubGameState) => void;
  onPlayerNotice?: (notice: OnlinePlayerNotice) => void;
  onSocketReconnect?: () => void;
  onConnectionChange?: (status: 'connected' | 'reconnecting' | 'disconnected') => void;
}): () => void {
  const sock = getHubSocket();
  sock.on('hub:room_updated', handlers.onRoomUpdated);
  sock.on('hub:game_state', handlers.onGameState);
  if (handlers.onPlayerNotice) {
    sock.on('hub:player_notice', handlers.onPlayerNotice);
  }
  const handleConnect = () => {
    handlers.onConnectionChange?.('connected');
    handlers.onSocketReconnect?.();
  };
  const handleDisconnect = () => {
    handlers.onConnectionChange?.('reconnecting');
  };
  const handleConnectError = () => {
    handlers.onConnectionChange?.('disconnected');
  };
  sock.on('connect', handleConnect);
  sock.on('disconnect', handleDisconnect);
  sock.on('connect_error', handleConnectError);

  return () => {
    sock.off('hub:room_updated', handlers.onRoomUpdated);
    sock.off('hub:game_state', handlers.onGameState);
    if (handlers.onPlayerNotice) {
      sock.off('hub:player_notice', handlers.onPlayerNotice);
    }
    sock.off('connect', handleConnect);
    sock.off('disconnect', handleDisconnect);
    sock.off('connect_error', handleConnectError);
  };
}
