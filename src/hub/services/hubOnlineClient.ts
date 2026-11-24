import { io, Socket } from 'socket.io-client';
import { HubGameState, VariantId, VariantSettings } from '../types';

const SERVER_URL =
  (import.meta.env.VITE_ONLINE_SERVER_URL as string | undefined) ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');

let hubSocket: Socket | null = null;

function getHubSocket(): Socket {
  if (!hubSocket) {
    hubSocket = io(SERVER_URL, { autoConnect: true, reconnectionAttempts: 4 });
  }
  if (!hubSocket.connected) hubSocket.connect();
  return hubSocket;
}

export function createHubOnlineRoom(
  playerName: string,
  variantId: VariantId,
  settings: VariantSettings,
  initialState: HubGameState
): Promise<{ ok: boolean; code?: string; error?: string }> {
  return new Promise((resolve) => {
    const sock = getHubSocket();
    const timer = setTimeout(() => resolve({ ok: false, error: 'Server online tidak merespons (offline fallback aktif).' }), 2500);
    sock.emit('hub:create_room', { playerName, variantId, settings, initialState }, (res: { ok: boolean; code?: string; error?: string }) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

export function joinHubOnlineRoom(
  code: string,
  playerName: string
): Promise<{ ok: boolean; state?: HubGameState | null; error?: string }> {
  return new Promise((resolve) => {
    const sock = getHubSocket();
    const timer = setTimeout(() => resolve({ ok: false, error: 'Server online tidak merespons.' }), 2500);
    sock.emit('hub:join_room', { code, playerName }, (res: { ok: boolean; state?: HubGameState | null; error?: string }) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

export function broadcastHubState(code: string, state: HubGameState): void {
  if (!hubSocket?.connected) return;
  hubSocket.emit('hub:sync_state', { code, state });
}

export function subscribeHubState(onState: (state: HubGameState) => void): () => void {
  const sock = getHubSocket();
  sock.on('hub:state_updated', onState);
  return () => {
    sock.off('hub:state_updated', onState);
  };
}
