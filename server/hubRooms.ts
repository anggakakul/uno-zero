import { Server, Socket } from 'socket.io';
import { getVariantMetadata } from '../src/hub/catalog';
import {
  applyHubOnlineAction,
  autoStepHubState,
  buildHubOnlinePlayerInits,
  sanitizeHubGameStateForPlayer,
} from '../src/hub/engine/hubActionEngine';
import { sanitizeAddOnPacksForVariant } from '../src/hub/expansions/addOnPacks';
import { getRuleset } from '../src/hub/rulesets';
import {
  HubGameState,
  HubOnlineAction,
  HubOnlineRoomInfo,
  VariantId,
  VariantSettings,
} from '../src/hub/types';
import { OnlinePlayerNotice } from '../src/types/game';

const HUB_TURN_TIMEOUT_MS = 30_000;
const HUB_DISCONNECT_GRACE_MS = 30_000;
const HUB_AI_STEP_MS = 750;
const HUB_ROOM_INACTIVE_TTL_MS = 30 * 60 * 1000;
const HUB_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

type HubVariantId = Exclude<VariantId, 'uno-zero'>;

interface HubServerPlayer {
  id: string;
  sessionId: string;
  socketId: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
}

interface HubServerSpectator {
  id: string;
  sessionId: string;
  socketId: string;
  name: string;
  connected: boolean;
  queuedForNextRound: boolean;
}

interface HubOnlineRoom {
  code: string;
  hostId: string;
  variantId: HubVariantId;
  settings: VariantSettings;
  fillWithBots: boolean;
  targetPlayerCount: number;
  started: boolean;
  players: HubServerPlayer[];
  spectators: HubServerSpectator[];
  state: HubGameState | null;
  turnTimer: ReturnType<typeof setTimeout> | null;
  aiTimer: ReturnType<typeof setTimeout> | null;
  tickInterval: ReturnType<typeof setInterval> | null;
  processedActionIds: Set<string>;
  lastActivityAt: number;
}

export interface HubRoomManager {
  registerSocket: (socket: Socket) => void;
  getActiveRoomCount: () => number;
  cleanup: () => void;
}

const VALID_HUB_VARIANTS = new Set<string>([
  'uno-classic',
  'uno-flip',
  'uno-flex',
  'uno-all-wild',
  'uno-no-mercy',
  'uno-teams',
  'uno-party',
  'uno-liars',
  'dos-mode',
  'ono-99',
]);

function isHubVariant(v: unknown): v is HubVariantId {
  return typeof v === 'string' && VALID_HUB_VARIANTS.has(v);
}

function makeNotice(
  type: OnlinePlayerNotice['type'],
  playerName: string,
  message: string
): OnlinePlayerNotice {
  return {
    id: `hn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    playerName,
    message,
    timestamp: Date.now(),
  };
}

export function createHubRoomManager(io: Server): HubRoomManager {
  const hubRooms = new Map<string, HubOnlineRoom>();
  const socketToHubRoom = new Map<string, { code: string; playerId: string }>();

  function genCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 5; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
    return hubRooms.has(out) ? genCode() : out;
  }

  function touchRoom(room: HubOnlineRoom) {
    room.lastActivityAt = Date.now();
  }

  function clearRoomTimers(room: HubOnlineRoom) {
    if (room.turnTimer) {
      clearTimeout(room.turnTimer);
      room.turnTimer = null;
    }
    if (room.aiTimer) {
      clearTimeout(room.aiTimer);
      room.aiTimer = null;
    }
    if (room.tickInterval) {
      clearInterval(room.tickInterval);
      room.tickInterval = null;
    }
  }

  function getRoomInfo(room: HubOnlineRoom): HubOnlineRoomInfo {
    const meta = getVariantMetadata(room.variantId);
    const totalExpected = room.fillWithBots
      ? Math.max(room.players.length, room.targetPlayerCount, meta.minPlayers)
      : room.players.length;
    return {
      code: room.code,
      hostId: room.hostId,
      variantId: room.variantId,
      settings: room.settings,
      fillWithBots: room.fillWithBots,
      targetPlayerCount: room.targetPlayerCount,
      started: room.started,
      players: room.players.map((p, idx) => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        connected: p.connected,
        ready: p.ready,
        teamId: meta.isTeamGame ? idx % (totalExpected === 6 ? 3 : 2) : undefined,
      })),
      spectators: room.spectators.map((s) => ({
        id: s.id,
        name: s.name,
        connected: s.connected,
        queuedForNextRound: s.queuedForNextRound,
      })),
    };
  }

  function broadcastRoomInfo(room: HubOnlineRoom) {
    io.to(`hub:${room.code}`).emit('hub:room_updated', getRoomInfo(room));
  }

  function emitNotice(room: HubOnlineRoom, notice: OnlinePlayerNotice) {
    io.to(`hub:${room.code}`).emit('hub:player_notice', notice);
  }

  function scheduleAutomation(room: HubOnlineRoom, resetTurnTimer: boolean) {
    if (room.aiTimer) {
      clearTimeout(room.aiTimer);
      room.aiTimer = null;
    }
    if (room.tickInterval) {
      clearInterval(room.tickInterval);
      room.tickInterval = null;
    }
    if (resetTurnTimer && room.turnTimer) {
      clearTimeout(room.turnTimer);
      room.turnTimer = null;
    }

    const state = room.state;
    if (!state || state.phase === 'round_over' || state.phase === 'game_over') {
      if (state) state.turnDeadline = null;
      clearRoomTimers(room);
      return;
    }

    // 1. AI Bot Turn or Prompt Automation (Server-Authoritative!)
    const promptActor = state.pendingPrompt
      ? state.players.find((p) => p.id === state.pendingPrompt?.actorId)
      : null;
    const activePlayer = state.players[state.currentPlayerIndex];
    const needsAI = promptActor ? promptActor.isAI : activePlayer?.isAI;

    if (needsAI) {
      state.turnDeadline = null;
      room.aiTimer = setTimeout(() => {
        if (!room.state) return;
        touchRoom(room);
        const next = autoStepHubState(room.state);
        if (next !== room.state) {
          room.state = next;
          broadcastGameState(room, true);
        }
      }, HUB_AI_STEP_MS);
      return;
    }

    // 2. Human Turn / Prompt Timeout (30s normal, or 30s reconnect grace period before Bot AI takes over)
    if (resetTurnTimer || !room.turnTimer) {
      if (room.turnTimer) clearTimeout(room.turnTimer);
      const actorForTimer = promptActor ?? activePlayer;
      const isDisconnected = actorForTimer && actorForTimer.connected === false;
      const timeoutMs = isDisconnected ? HUB_DISCONNECT_GRACE_MS : HUB_TURN_TIMEOUT_MS;
      state.turnDeadline = Date.now() + timeoutMs;

      if (isDisconnected && actorForTimer) {
        emitNotice(
          room,
          makeNotice(
            'disconnected',
            actorForTimer.name,
            `${actorForTimer.name} terputus. Grace period 30 detik sebelum Bot AI mengambil alih giliran.`
          )
        );
      }

      room.turnTimer = setTimeout(() => {
        if (!room.state) return;
        touchRoom(room);
        const next = autoStepHubState(room.state);
        if (next !== room.state) {
          room.state = next;
          broadcastGameState(room, true);
        }
      }, timeoutMs);
    }
  }

  function broadcastGameState(room: HubOnlineRoom, resetTimer = true) {
    if (!room.state) return;

    if (resetTimer) {
      scheduleAutomation(room, true);
    } else {
      scheduleAutomation(room, false);
    }

    for (const player of room.players) {
      const sock = io.sockets.sockets.get(player.socketId);
      if (sock) {
        const sanitized = sanitizeHubGameStateForPlayer(room.state, player.id);
        sock.emit('hub:game_state', sanitized);
      }
    }

    if (room.spectators.length > 0) {
      const spectatorState = sanitizeHubGameStateForPlayer(room.state, '__spectator__');
      for (const spec of room.spectators) {
        const sock = io.sockets.sockets.get(spec.socketId);
        if (sock) {
          sock.emit('hub:game_state', spectatorState);
        }
      }
    }
  }

  function getActiveRoomAndPlayer(
    socket: Socket
  ): { room: HubOnlineRoom; player: HubServerPlayer } | null {
    const link = socketToHubRoom.get(socket.id);
    if (!link) return null;
    const room = hubRooms.get(link.code);
    if (!room) return null;
    const player = room.players.find((p) => p.id === link.playerId);
    if (!player) return null;
    return { room, player };
  }

  function migrateHostIfNeeded(room: HubOnlineRoom, departingPlayerId: string) {
    if (room.hostId !== departingPlayerId) return;
    const nextHost =
      room.players.find((p) => p.id !== departingPlayerId && p.connected) ??
      room.players.find((p) => p.id !== departingPlayerId);
    if (!nextHost) return;
    for (const p of room.players) {
      p.isHost = p.id === nextHost.id;
    }
    room.hostId = nextHost.id;
    nextHost.ready = true;
    emitNotice(
      room,
      makeNotice('host_changed', nextHost.name, `${nextHost.name} sekarang menjadi Host room.`)
    );
  }

  function handleHubDisconnect(socket: Socket, explicitLeave: boolean) {
    const link = socketToHubRoom.get(socket.id);
    if (!link) return;
    socketToHubRoom.delete(socket.id);
    socket.leave(`hub:${link.code}`);

    const room = hubRooms.get(link.code);
    if (!room) return;

    const departingSpec = room.spectators.find((s) => s.id === link.playerId);
    if (departingSpec) {
      room.spectators = room.spectators.filter((s) => s.id !== link.playerId);
      broadcastRoomInfo(room);
      return;
    }

    const departing = room.players.find((p) => p.id === link.playerId);
    if (!departing) return;

    if (!room.started && explicitLeave) {
      const departingName = departing.name;
      room.players = room.players.filter((p) => p.id !== link.playerId);
      if (room.players.length === 0) {
        clearRoomTimers(room);
        hubRooms.delete(room.code);
        return;
      }
      migrateHostIfNeeded(room, link.playerId);
      emitNotice(
        room,
        makeNotice('left', departingName, `${departingName} keluar dari room.`)
      );
      broadcastRoomInfo(room);
      return;
    }

    // Reserve seat for reconnection
    if (departing.socketId === socket.id) {
      departing.connected = false;
    }

    if (explicitLeave) {
      migrateHostIfNeeded(room, link.playerId);
    }

    if (room.state) {
      room.state = {
        ...room.state,
        players: room.state.players.map((gp) =>
          gp.id === link.playerId ? { ...gp, connected: false } : gp
        ),
      };
      broadcastGameState(room, false);
    }

    emitNotice(
      room,
      makeNotice(
        explicitLeave ? 'left' : 'disconnected',
        departing.name,
        explicitLeave
          ? `${departing.name} meninggalkan pertandingan.`
          : `${departing.name} terputus koneksi. Menunggu sambung ulang...`
      )
    );
    broadcastRoomInfo(room);
  }

  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of hubRooms.entries()) {
      const idleMs = now - room.lastActivityAt;
      const allDisconnected = room.players.every((p) => !p.connected);
      const finished = room.state?.phase === 'game_over';
      if (
        idleMs > HUB_ROOM_INACTIVE_TTL_MS ||
        (allDisconnected && idleMs > 5 * 60 * 1000) ||
        (finished && idleMs > 15 * 60 * 1000)
      ) {
        clearRoomTimers(room);
        hubRooms.delete(code);
      }
    }
  }, HUB_CLEANUP_INTERVAL_MS);

  return {
    getActiveRoomCount: () => hubRooms.size,
    cleanup: () => {
      clearInterval(cleanupInterval);
      for (const room of hubRooms.values()) {
        clearRoomTimers(room);
      }
      hubRooms.clear();
      socketToHubRoom.clear();
    },
    registerSocket: (socket: Socket) => {
      socket.on(
        'hub:create_room',
        (
          payload: {
            playerName: string;
            sessionId?: string;
            variantId: VariantId;
            settings?: VariantSettings;
            fillWithBots?: boolean;
            targetPlayerCount?: number;
          },
          cb?: (res: {
            ok: boolean;
            error?: string;
            room?: HubOnlineRoomInfo;
            playerId?: string;
          }) => void
        ) => {
          if (!isHubVariant(payload?.variantId)) {
            cb?.({ ok: false, error: 'Mode UNO tidak valid.' });
            return;
          }

          // Leave any prior hub room on this socket
          if (socketToHubRoom.has(socket.id)) {
            handleHubDisconnect(socket, true);
          }

          const meta = getVariantMetadata(payload.variantId);
          const code = genCode();
          const sessionId =
            payload.sessionId?.trim() ||
            `hsess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const playerId = sessionId;

          const host: HubServerPlayer = {
            id: playerId,
            sessionId,
            socketId: socket.id,
            name: payload.playerName?.trim().slice(0, 20) || 'Host',
            isHost: true,
            connected: true,
            ready: true,
          };

          const mergedSettings: VariantSettings = {
            ...meta.defaultSettings,
            ...(payload.settings ?? {}),
          };
          const settings: VariantSettings = {
            ...mergedSettings,
            activePacks: sanitizeAddOnPacksForVariant(
              payload.variantId,
              mergedSettings.activePacks,
              true
            ),
          };

          const defaultTarget = Math.max(
            meta.minPlayers,
            Math.min(meta.maxPlayers, payload.targetPlayerCount ?? meta.minPlayers)
          );

          const room: HubOnlineRoom = {
            code,
            hostId: playerId,
            variantId: payload.variantId,
            settings,
            fillWithBots: Boolean(payload.fillWithBots),
            targetPlayerCount: defaultTarget,
            started: false,
            players: [host],
            spectators: [],
            state: null,
            turnTimer: null,
            aiTimer: null,
            tickInterval: null,
            processedActionIds: new Set(),
            lastActivityAt: Date.now(),
          };

          hubRooms.set(code, room);
          socketToHubRoom.set(socket.id, { code, playerId });
          socket.join(`hub:${code}`);
          cb?.({ ok: true, room: getRoomInfo(room), playerId });
        }
      );

      socket.on(
        'hub:join_room',
        (
          payload: { code: string; playerName: string; sessionId?: string },
          cb?: (res: {
            ok: boolean;
            error?: string;
            room?: HubOnlineRoomInfo;
            playerId?: string;
            role?: 'player' | 'spectator';
            gameState?: HubGameState | null;
          }) => void
        ) => {
          const code = payload?.code?.trim().toUpperCase();
          const room = code ? hubRooms.get(code) : undefined;
          if (!room) {
            cb?.({ ok: false, error: 'Room tidak ditemukan atau sudah kedaluwarsa.' });
            return;
          }

          const sessionId =
            payload.sessionId?.trim() ||
            `hsess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

          // Reconnect if sessionId already exists in room
          const existing = room.players.find((p) => p.sessionId === sessionId);
          if (existing) {
            existing.socketId = socket.id;
            existing.connected = true;
            if (payload.playerName?.trim()) {
              existing.name = payload.playerName.trim().slice(0, 20);
            }
            touchRoom(room);
            socketToHubRoom.set(socket.id, { code, playerId: existing.id });
            socket.join(`hub:${code}`);

            if (room.state) {
              room.state = {
                ...room.state,
                players: room.state.players.map((gp) =>
                  gp.id === existing.id ? { ...gp, connected: true } : gp
                ),
              };
              broadcastGameState(room, false);
            }
            emitNotice(
              room,
              makeNotice('reconnected', existing.name, `${existing.name} kembali terhubung!`)
            );
            broadcastRoomInfo(room);
            cb?.({
              ok: true,
              room: getRoomInfo(room),
              playerId: existing.id,
              gameState: room.state
                ? sanitizeHubGameStateForPlayer(room.state, existing.id)
                : null,
            });
            return;
          }

          const meta = getVariantMetadata(room.variantId);
          const mustSpectate = room.started || room.players.length >= meta.maxPlayers;

          if (mustSpectate) {
            if (socketToHubRoom.has(socket.id)) {
              handleHubDisconnect(socket, true);
            }
            const existingSpec = room.spectators.find((s) => s.sessionId === sessionId);
            const spec: HubServerSpectator = existingSpec
              ? Object.assign(existingSpec, {
                  socketId: socket.id,
                  connected: true,
                  name: payload.playerName?.trim().slice(0, 20) || existingSpec.name,
                })
              : {
                  id: sessionId,
                  sessionId,
                  socketId: socket.id,
                  name:
                    payload.playerName?.trim().slice(0, 20) ||
                    `Penonton ${room.spectators.length + 1}`,
                  connected: true,
                  queuedForNextRound: false,
                };
            if (!existingSpec) {
              room.spectators.push(spec);
            }
            touchRoom(room);
            socketToHubRoom.set(socket.id, { code, playerId: spec.id });
            socket.join(`hub:${code}`);
            emitNotice(
              room,
              makeNotice('joined', spec.name, `${spec.name} masuk sebagai penonton.`)
            );
            broadcastRoomInfo(room);
            cb?.({
              ok: true,
              room: getRoomInfo(room),
              playerId: spec.id,
              role: 'spectator',
              gameState: room.state
                ? sanitizeHubGameStateForPlayer(room.state, '__spectator__')
                : null,
            });
            return;
          }

          if (socketToHubRoom.has(socket.id)) {
            handleHubDisconnect(socket, true);
          }

          const playerId = sessionId;
          const player: HubServerPlayer = {
            id: playerId,
            sessionId,
            socketId: socket.id,
            name: payload.playerName?.trim().slice(0, 20) || `Pemain ${room.players.length + 1}`,
            isHost: false,
            connected: true,
            ready: false,
          };

          room.players.push(player);
          touchRoom(room);
          socketToHubRoom.set(socket.id, { code, playerId });
          socket.join(`hub:${code}`);
          emitNotice(
            room,
            makeNotice('joined', player.name, `${player.name} bergabung ke room.`)
          );
          broadcastRoomInfo(room);
          cb?.({ ok: true, room: getRoomInfo(room), playerId, gameState: null });
        }
      );

      socket.on(
        'hub:reconnect_room',
        (
          payload: { code: string; sessionId: string },
          cb?: (res: {
            ok: boolean;
            room?: HubOnlineRoomInfo;
            playerId?: string;
            role?: 'player' | 'spectator';
            gameState?: HubGameState | null;
          }) => void
        ) => {
          const code = payload?.code?.trim().toUpperCase();
          const room = code ? hubRooms.get(code) : undefined;
          if (!room) {
            cb?.({ ok: false });
            return;
          }
          const existing = room.players.find((p) => p.sessionId === payload.sessionId);
          if (!existing) {
            const existingSpec = room.spectators.find((s) => s.sessionId === payload.sessionId);
            if (!existingSpec) {
              cb?.({ ok: false });
              return;
            }
            existingSpec.socketId = socket.id;
            existingSpec.connected = true;
            touchRoom(room);
            socketToHubRoom.set(socket.id, { code, playerId: existingSpec.id });
            socket.join(`hub:${code}`);
            broadcastRoomInfo(room);
            cb?.({
              ok: true,
              room: getRoomInfo(room),
              playerId: existingSpec.id,
              role: 'spectator',
              gameState: room.state
                ? sanitizeHubGameStateForPlayer(room.state, '__spectator__')
                : null,
            });
            return;
          }

          existing.socketId = socket.id;
          existing.connected = true;
          touchRoom(room);
          socketToHubRoom.set(socket.id, { code, playerId: existing.id });
          socket.join(`hub:${code}`);

          if (room.state) {
            room.state = {
              ...room.state,
              players: room.state.players.map((gp) =>
                gp.id === existing.id ? { ...gp, connected: true } : gp
              ),
            };
            broadcastGameState(room, false);
          }
          emitNotice(
            room,
            makeNotice('reconnected', existing.name, `${existing.name} kembali terhubung!`)
          );
          broadcastRoomInfo(room);
          cb?.({
            ok: true,
            room: getRoomInfo(room),
            playerId: existing.id,
            gameState: room.state
              ? sanitizeHubGameStateForPlayer(room.state, existing.id)
              : null,
          });
        }
      );

      socket.on('hub:toggle_ready', (payload?: { ready?: boolean }) => {
        const ctx = getActiveRoomAndPlayer(socket);
        if (!ctx || ctx.room.started) return;
        const { room, player } = ctx;
        player.ready = typeof payload?.ready === 'boolean' ? payload.ready : !player.ready;
        touchRoom(room);
        broadcastRoomInfo(room);
      });

      socket.on(
        'hub:update_settings',
        (payload: {
          variantId?: VariantId;
          settings?: Partial<VariantSettings>;
          fillWithBots?: boolean;
          targetPlayerCount?: number;
        }) => {
          const ctx = getActiveRoomAndPlayer(socket);
          if (!ctx || !ctx.player.isHost || ctx.room.started) return;
          const { room } = ctx;

          if (payload.variantId && isHubVariant(payload.variantId)) {
            const newMeta = getVariantMetadata(payload.variantId);
            if (room.players.length <= newMeta.maxPlayers) {
              room.variantId = payload.variantId;
              const nextSettings: VariantSettings = {
                ...newMeta.defaultSettings,
                ...(payload.settings ?? {}),
              };
              room.settings = {
                ...nextSettings,
                activePacks: sanitizeAddOnPacksForVariant(
                  room.variantId,
                  nextSettings.activePacks,
                  true
                ),
              };
              room.targetPlayerCount = Math.max(
                newMeta.minPlayers,
                Math.min(newMeta.maxPlayers, payload.targetPlayerCount ?? newMeta.minPlayers)
              );
            }
          } else if (payload.settings) {
            const merged = { ...room.settings, ...payload.settings };
            room.settings = {
              ...merged,
              activePacks: sanitizeAddOnPacksForVariant(
                room.variantId,
                merged.activePacks,
                true
              ),
            };
          }

          if (typeof payload.fillWithBots === 'boolean') {
            room.fillWithBots = payload.fillWithBots;
          }

          if (typeof payload.targetPlayerCount === 'number') {
            const meta = getVariantMetadata(room.variantId);
            room.targetPlayerCount = Math.max(
              meta.minPlayers,
              Math.min(meta.maxPlayers, Math.floor(payload.targetPlayerCount))
            );
          }

          touchRoom(room);
          broadcastRoomInfo(room);
        }
      );

      socket.on(
        'hub:start_game',
        (cb?: (res: { ok: boolean; error?: string }) => void) => {
          const ctx = getActiveRoomAndPlayer(socket);
          if (!ctx) {
            cb?.({ ok: false, error: 'Kamu tidak berada dalam room.' });
            return;
          }
          const { room, player } = ctx;
          if (!player.isHost) {
            cb?.({ ok: false, error: 'Hanya Host yang dapat memulai permainan.' });
            return;
          }
          if (room.started) {
            cb?.({ ok: false, error: 'Permainan sudah dimulai.' });
            return;
          }

          const meta = getVariantMetadata(room.variantId);
          const connectedPlayers = room.players.filter((p) => p.connected);
          if (connectedPlayers.length < 2) {
            cb?.({ ok: false, error: 'Minimal 2 pemain online diperlukan untuk memulai.' });
            return;
          }

          const unreadyGuest = connectedPlayers.find((p) => !p.isHost && !p.ready);
          if (unreadyGuest) {
            cb?.({
              ok: false,
              error: `Menunggu ${unreadyGuest.name} menekan tombol Siap (Ready).`,
            });
            return;
          }

          if (!room.fillWithBots) {
            if (connectedPlayers.length < meta.minPlayers) {
              cb?.({
                ok: false,
                error: `${meta.name} membutuhkan minimal ${meta.minPlayers} pemain (atau aktifkan Isi dengan Bot AI).`,
              });
              return;
            }
            if (meta.isTeamGame && connectedPlayers.length % 2 !== 0) {
              cb?.({
                ok: false,
                error: `${meta.name} membutuhkan jumlah pemain genap (4, 6, atau 8) atau aktifkan Isi dengan Bot AI.`,
              });
              return;
            }
          }

          const playerInits = buildHubOnlinePlayerInits(
            connectedPlayers.map((p) => ({ id: p.id, name: p.name })),
            room.variantId,
            room.fillWithBots,
            room.targetPlayerCount
          );

          const ruleset = getRuleset(room.variantId);
          const safeSettings: VariantSettings = {
            ...room.settings,
            activePacks: sanitizeAddOnPacksForVariant(
              room.variantId,
              room.settings.activePacks,
              true
            ),
          };
          room.settings = safeSettings;
          const initialState = ruleset.initializeGame(playerInits, 'online', safeSettings);

          // Ensure every player has connected: true initially
          room.state = {
            ...initialState,
            players: initialState.players.map((gp) => ({ ...gp, connected: true })),
          };
          room.started = true;
          room.processedActionIds.clear();
          touchRoom(room);

          broadcastRoomInfo(room);
          broadcastGameState(room, true);
          cb?.({ ok: true });
        }
      );

      socket.on(
        'hub:game_action',
        (
          payload: { action: HubOnlineAction; actionId?: string },
          cb?: (res: { ok: boolean; error?: string }) => void
        ) => {
          const ctx = getActiveRoomAndPlayer(socket);
          if (!ctx || !ctx.room.state || !payload?.action) {
            cb?.({ ok: false, error: 'Aksi tidak valid.' });
            return;
          }

          const { room, player } = ctx;
          if (payload.actionId) {
            if (room.processedActionIds.has(payload.actionId)) {
              cb?.({ ok: true });
              return;
            }
            room.processedActionIds.add(payload.actionId);
            if (room.processedActionIds.size > 300) {
              const first = room.processedActionIds.values().next().value;
              if (first) room.processedActionIds.delete(first);
            }
          }

          const prev = room.state;
          if (!prev) {
            cb?.({ ok: false, error: 'Permainan belum dimulai.' });
            return;
          }
          touchRoom(room);

          // 1-Click Rematch: promote queued spectators into open slots before resetting match
          if (payload.action.type === 'play_again' && prev.phase === 'game_over' && player.isHost) {
            const meta = getVariantMetadata(room.variantId);
            const queuedSpecs = room.spectators.filter((s) => s.queuedForNextRound && s.connected);
            const openSlots = Math.max(0, meta.maxPlayers - room.players.length);
            const promoted = queuedSpecs.slice(0, openSlots);
            if (promoted.length > 0) {
              for (const spec of promoted) {
                room.players.push({
                  id: spec.id,
                  sessionId: spec.sessionId,
                  socketId: spec.socketId,
                  name: spec.name,
                  isHost: false,
                  connected: true,
                  ready: true,
                });
              }
              const promotedIds = new Set(promoted.map((s) => s.id));
              room.spectators = room.spectators.filter((s) => !promotedIds.has(s.id));
              emitNotice(
                room,
                makeNotice(
                  'joined',
                  promoted.map((s) => s.name).join(', '),
                  `${promoted.map((s) => s.name).join(', ')} bergabung dari antrean penonton!`
                )
              );
            }

            const ruleset = getRuleset(room.variantId);
            const playerInits = buildHubOnlinePlayerInits(
              room.players.map((p) => ({ id: p.id, name: p.name })),
              room.variantId,
              room.fillWithBots,
              room.targetPlayerCount
            );
            const fresh = ruleset.initializeGame(playerInits, 'online', room.settings);
            const connMap = new Map(room.players.map((p) => [p.id, p.connected]));
            room.state = {
              ...fresh,
              players: fresh.players.map((gp) => ({
                ...gp,
                connected: gp.isAI ? true : connMap.get(gp.id) ?? true,
              })),
            };
            broadcastRoomInfo(room);
            broadcastGameState(room, true);
            cb?.({ ok: true });
            return;
          }

          const updated = applyHubOnlineAction(prev, player.id, player.isHost, payload.action);
          if (updated !== prev) {
            // Preserve live connected status on players
            const connMap = new Map(room.players.map((p) => [p.id, p.connected]));
            room.state = {
              ...updated,
              players: updated.players.map((gp) => ({
                ...gp,
                connected: gp.isAI ? true : connMap.get(gp.id) ?? gp.connected ?? true,
              })),
            };
            const turnChanged =
              room.state.currentPlayerIndex !== prev.currentPlayerIndex ||
              room.state.phase !== prev.phase ||
              room.state.pendingPrompt?.actorId !== prev.pendingPrompt?.actorId;
            broadcastGameState(room, turnChanged);
            cb?.({ ok: true });
          } else {
            cb?.({ ok: false, error: 'Aksi ditolak oleh server (bukan giliran atau tidak sah).' });
          }
        }
      );

      socket.on(
        'hub:send_emote',
        (payload: { emoteId?: string; label?: string }) => {
          const ctx = getActiveRoomAndPlayer(socket);
          if (!ctx || !payload?.label) return;
          const { room, player } = ctx;
          const cleanLabel = String(payload.label).slice(0, 20);
          const cleanId = String(payload.emoteId ?? 'emote').slice(0, 20);
          io.to(`hub:${room.code}`).emit('hub:emote', {
            id: `em_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            playerId: player.id,
            playerName: player.name,
            emoteId: cleanId,
            label: cleanLabel,
          });
        }
      );

      socket.on('hub:toggle_spectator_queue', (payload?: { queued?: boolean }) => {
        const link = socketToHubRoom.get(socket.id);
        if (!link) return;
        const room = hubRooms.get(link.code);
        if (!room) return;
        const spec = room.spectators.find((s) => s.id === link.playerId);
        if (!spec) return;
        spec.queuedForNextRound =
          typeof payload?.queued === 'boolean' ? payload.queued : !spec.queuedForNextRound;
        touchRoom(room);
        broadcastRoomInfo(room);
      });

      socket.on('hub:leave_room', () => {
        handleHubDisconnect(socket, true);
      });

      socket.on('disconnect', () => {
        handleHubDisconnect(socket, false);
      });
    },
  };
}
