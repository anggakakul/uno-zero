import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Server, Socket } from 'socket.io';
import {
  DEFAULT_GAME_CONFIG,
  GameState,
  OnlineRoomInfo,
  SlotPosition,
} from '../src/types/game';
import {
  autoPlayTimeoutTurn,
  callUno,
  catchUno,
  createMatch,
  discardDrawnCard,
  flipGridCardAfterDiscard,
  flipInitialCard,
  resolveDoubleDrawTwo,
  sanitizeGameStateForPlayer,
  startNewRound,
  swapWithGridSlot,
  takeFromPile,
} from '../src/engine/gameEngine';
import { getGlobalLeaderboard, recordGlobalLeaderboard } from './leaderboardStore';

const PORT = Number(process.env.PORT ?? 3001);
const TURN_TIMEOUT_MS = 20_000;
const ROOM_INACTIVE_TTL_MS = 30 * 60 * 1000; // 30 minutes auto-cleanup
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Run every 5 minutes
const DIST_DIR = path.resolve(process.cwd(), 'dist');

// Configurable CORS origins via env (comma-separated) or '*' for public hosting
const CORS_ORIGINS_RAW = process.env.CORS_ORIGINS?.trim();
const ALLOWED_ORIGINS = CORS_ORIGINS_RAW
  ? CORS_ORIGINS_RAW.split(',').map((s) => s.trim())
  : '*';

interface ServerPlayer {
  id: string;
  sessionId: string;
  socketId: string;
  name: string;
  isHost: boolean;
  connected: boolean;
}

interface Room {
  code: string;
  hostId: string;
  totalRounds: number;
  started: boolean;
  players: ServerPlayer[];
  gameState: GameState | null;
  turnTimer: ReturnType<typeof setTimeout> | null;
  leaderboardRecordedForMatch: boolean;
  lastActivityAt: number;
}

const rooms = new Map<string, Room>();
const socketToRoom = new Map<string, { code: string; playerId: string }>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function touchRoom(room: Room) {
  room.lastActivityAt = Date.now();
}

function getRoomInfo(room: Room): OnlineRoomInfo {
  return {
    code: room.code,
    hostId: room.hostId,
    totalRounds: room.totalRounds,
    started: room.started,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      connected: p.connected,
    })),
  };
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function applyCorsHeaders(req: http.IncomingMessage, res: http.ServerResponse) {
  const reqOrigin = req.headers.origin;
  if (ALLOWED_ORIGINS === '*') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (reqOrigin && ALLOWED_ORIGINS.includes(reqOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', reqOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const httpServer = http.createServer(async (req, res) => {
  applyCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlPath = (req.url ?? '/').split('?')[0];

  if (urlPath === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'uno-zero-multiplayer',
        activeRooms: rooms.size,
      })
    );
    return;
  }

  if (urlPath === '/api/leaderboard' && req.method === 'GET') {
    const data = await getGlobalLeaderboard();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
    return;
  }

  if (urlPath === '/api/leaderboard' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body) as {
          results?: { playerName: string; score: number; won: boolean }[];
        };
        const entries = await recordGlobalLeaderboard(parsed.results ?? []);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, entries }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false }));
      }
    });
    return;
  }

  // Serve built SPA static assets if dist/ exists (enables single-URL deploy on Render/Railway!)
  if (fs.existsSync(DIST_DIR) && req.method === 'GET') {
    const safeRel = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    let filePath = path.join(DIST_DIR, safeRel === '/' ? 'index.html' : safeRel);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      // SPA fallback so /?room=ABCD or any sub-route never 404s
      filePath = path.join(DIST_DIR, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', service: 'uno-zero-multiplayer' }));
});

const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
  },
});

function clearRoomTimer(room: Room) {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
}

function scheduleTurnTimer(room: Room) {
  clearRoomTimer(room);
  const state = room.gameState;
  if (
    !state ||
    state.phase === 'round_over' ||
    state.phase === 'game_over' ||
    state.phase === 'setup'
  ) {
    if (state) state.turnDeadline = null;
    return;
  }

  state.turnDeadline = Date.now() + TURN_TIMEOUT_MS;
  room.turnTimer = setTimeout(() => {
    if (!room.gameState) return;
    touchRoom(room);
    room.gameState = autoPlayTimeoutTurn(room.gameState);
    broadcastGameState(room);
  }, TURN_TIMEOUT_MS);
}

function broadcastRoomInfo(room: Room) {
  io.to(room.code).emit('room_updated', getRoomInfo(room));
}

function broadcastGameState(room: Room, resetTimer = true) {
  if (!room.gameState) return;

  if (room.gameState.phase === 'game_over' && !room.leaderboardRecordedForMatch) {
    room.leaderboardRecordedForMatch = true;
    const winnerSet = new Set(room.gameState.winnerIds);
    void recordGlobalLeaderboard(
      room.gameState.players.map((p) => ({
        playerName: p.name,
        score: p.totalScore,
        won: winnerSet.has(p.id),
      }))
    );
  }

  if (resetTimer) {
    scheduleTurnTimer(room);
  }

  for (const player of room.players) {
    const sock = io.sockets.sockets.get(player.socketId);
    if (sock) {
      const sanitized = sanitizeGameStateForPlayer(room.gameState, player.id);
      sock.emit('game_state', sanitized);
    }
  }
}

function getActiveRoomAndPlayer(socket: Socket): { room: Room; player: ServerPlayer } | null {
  const link = socketToRoom.get(socket.id);
  if (!link) return null;
  const room = rooms.get(link.code);
  if (!room) return null;
  const player = room.players.find((p) => p.id === link.playerId);
  if (!player) return null;
  return { room, player };
}

// Auto-cleanup inactive or finished rooms (> 30 minutes)
setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const [code, room] of rooms.entries()) {
    const idleMs = now - room.lastActivityAt;
    const allDisconnected = room.players.every((p) => !p.connected);
    const finished = room.gameState?.phase === 'game_over';

    if (idleMs > ROOM_INACTIVE_TTL_MS || (allDisconnected && idleMs > 5 * 60 * 1000) || (finished && idleMs > 15 * 60 * 1000)) {
      clearRoomTimer(room);
      rooms.delete(code);
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`[UNO ZERO Cleanup] Menghapus ${removed} room tidak aktif. Sisa room: ${rooms.size}`);
  }
}, CLEANUP_INTERVAL_MS);

io.on('connection', (socket) => {
  socket.on(
    'create_room',
    (
      payload: { playerName: string; sessionId?: string; totalRounds?: number },
      cb?: (res: { ok: boolean; error?: string; room?: OnlineRoomInfo; playerId?: string }) => void
    ) => {
      const code = generateRoomCode();
      const sessionId = payload.sessionId?.trim() || `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const playerId = sessionId;
      const host: ServerPlayer = {
        id: playerId,
        sessionId,
        socketId: socket.id,
        name: payload.playerName?.trim() || 'Host',
        isHost: true,
        connected: true,
      };
      const room: Room = {
        code,
        hostId: playerId,
        totalRounds: [3, 5, 9].includes(payload.totalRounds ?? 9) ? (payload.totalRounds ?? 9) : 9,
        started: false,
        players: [host],
        gameState: null,
        turnTimer: null,
        leaderboardRecordedForMatch: false,
        lastActivityAt: Date.now(),
      };
      rooms.set(code, room);
      socketToRoom.set(socket.id, { code, playerId });
      socket.join(code);
      cb?.({ ok: true, room: getRoomInfo(room), playerId });
    }
  );

  socket.on(
    'join_room',
    (
      payload: { code: string; playerName: string; sessionId?: string },
      cb?: (res: {
        ok: boolean;
        error?: string;
        room?: OnlineRoomInfo;
        playerId?: string;
        gameState?: GameState | null;
      }) => void
    ) => {
      const code = payload.code?.trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        cb?.({ ok: false, error: 'Room tidak ditemukan atau sudah kedaluwarsa.' });
        return;
      }

      const sessionId = payload.sessionId?.trim() || `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Check if this sessionId is ALREADY in the room (auto-reconnect!)
      const existing = room.players.find((p) => p.sessionId === sessionId);
      if (existing) {
        existing.socketId = socket.id;
        existing.connected = true;
        if (payload.playerName?.trim()) {
          existing.name = payload.playerName.trim();
        }
        touchRoom(room);
        socketToRoom.set(socket.id, { code, playerId: existing.id });
        socket.join(code);
        if (room.gameState) {
          room.gameState = {
            ...room.gameState,
            players: room.gameState.players.map((gp) =>
              gp.id === existing.id ? { ...gp, connected: true } : gp
            ),
          };
          broadcastGameState(room, false);
        }
        broadcastRoomInfo(room);
        cb?.({
          ok: true,
          room: getRoomInfo(room),
          playerId: existing.id,
          gameState: room.gameState
            ? sanitizeGameStateForPlayer(room.gameState, existing.id)
            : null,
        });
        return;
      }

      if (room.started) {
        cb?.({ ok: false, error: 'Permainan di room ini sudah dimulai.' });
        return;
      }
      if (room.players.length >= 8) {
        cb?.({ ok: false, error: 'Room sudah penuh (maksimal 8 pemain).' });
        return;
      }

      const playerId = sessionId;
      const player: ServerPlayer = {
        id: playerId,
        sessionId,
        socketId: socket.id,
        name: payload.playerName?.trim() || `Pemain ${room.players.length + 1}`,
        isHost: false,
        connected: true,
      };
      room.players.push(player);
      touchRoom(room);
      socketToRoom.set(socket.id, { code, playerId });
      socket.join(code);
      broadcastRoomInfo(room);
      cb?.({ ok: true, room: getRoomInfo(room), playerId, gameState: null });
    }
  );

  // Explicit reconnect handler when user refreshes browser mid-game
  socket.on(
    'reconnect_room',
    (
      payload: { code: string; sessionId: string },
      cb?: (res: {
        ok: boolean;
        room?: OnlineRoomInfo;
        playerId?: string;
        gameState?: GameState | null;
      }) => void
    ) => {
      const code = payload.code?.trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        cb?.({ ok: false });
        return;
      }
      const existing = room.players.find((p) => p.sessionId === payload.sessionId);
      if (!existing) {
        cb?.({ ok: false });
        return;
      }
      existing.socketId = socket.id;
      existing.connected = true;
      touchRoom(room);
      socketToRoom.set(socket.id, { code, playerId: existing.id });
      socket.join(code);

      if (room.gameState) {
        room.gameState = {
          ...room.gameState,
          players: room.gameState.players.map((gp) =>
            gp.id === existing.id ? { ...gp, connected: true } : gp
          ),
        };
        broadcastGameState(room, false);
      }
      broadcastRoomInfo(room);
      cb?.({
        ok: true,
        room: getRoomInfo(room),
        playerId: existing.id,
        gameState: room.gameState
          ? sanitizeGameStateForPlayer(room.gameState, existing.id)
          : null,
      });
    }
  );

  socket.on('update_room_settings', (payload: { totalRounds: number }) => {
    const ctx = getActiveRoomAndPlayer(socket);
    if (!ctx || !ctx.player.isHost || ctx.room.started) return;
    if ([3, 5, 9].includes(payload.totalRounds)) {
      ctx.room.totalRounds = payload.totalRounds;
      touchRoom(ctx.room);
      broadcastRoomInfo(ctx.room);
    }
  });

  socket.on('start_game', () => {
    const ctx = getActiveRoomAndPlayer(socket);
    if (!ctx || !ctx.player.isHost) return;
    if (ctx.room.players.length < 2) return;

    ctx.room.started = true;
    ctx.room.leaderboardRecordedForMatch = false;
    touchRoom(ctx.room);
    ctx.room.gameState = createMatch(
      ctx.room.players.map((p) => ({ id: p.id, name: p.name, isAI: false })),
      0,
      { ...DEFAULT_GAME_CONFIG, totalRounds: ctx.room.totalRounds }
    );
    broadcastRoomInfo(ctx.room);
    broadcastGameState(ctx.room, true);
  });

  socket.on('game_action', (payload: { type: string; [key: string]: unknown }) => {
    const ctx = getActiveRoomAndPlayer(socket);
    if (!ctx || !ctx.room.gameState) return;

    const { room, player } = ctx;
    const state = room.gameState;
    const activePlayer = state.players[state.currentPlayerIndex];
    touchRoom(room);

    if (payload.type === 'call_uno') {
      room.gameState = callUno(state, player.id);
      broadcastGameState(room, false);
      return;
    }

    if (payload.type === 'catch_uno') {
      if (state.unoVulnerability && state.unoVulnerability.playerId !== player.id) {
        room.gameState = catchUno(state, player.name);
        broadcastGameState(room, false);
      }
      return;
    }

    if (payload.type === 'next_round') {
      if (state.phase === 'round_over' && player.isHost) {
        room.gameState = startNewRound(state);
        broadcastGameState(room, true);
      }
      return;
    }

    if (payload.type === 'play_again') {
      if (state.phase === 'game_over' && player.isHost) {
        room.leaderboardRecordedForMatch = false;
        room.gameState = createMatch(
          room.players.map((p) => ({ id: p.id, name: p.name, isAI: false })),
          (state.dealerIndex + 1) % room.players.length,
          state.config
        );
        broadcastGameState(room, true);
      }
      return;
    }

    if (!activePlayer || activePlayer.id !== player.id) return;

    let updated = state;
    if (payload.type === 'flip_initial') {
      updated = flipInitialCard(state, Number(payload.colIdx), payload.pos as SlotPosition);
    } else if (payload.type === 'take_source') {
      updated = takeFromPile(state, payload.source as 'draw' | 'discard');
    } else if (payload.type === 'swap_slot') {
      updated = swapWithGridSlot(state, Number(payload.colIdx), payload.pos as SlotPosition);
    } else if (payload.type === 'discard_drawn') {
      updated = discardDrawnCard(state);
    } else if (payload.type === 'flip_after_discard') {
      updated = flipGridCardAfterDiscard(state, Number(payload.colIdx), payload.pos as SlotPosition);
    } else if (payload.type === 'resolve_double_draw2') {
      updated = resolveDoubleDrawTwo(state, (payload.targetIds as string[]) ?? []);
    }

    if (updated !== state) {
      room.gameState = updated;
      const turnChanged =
        updated.currentPlayerIndex !== state.currentPlayerIndex ||
        updated.phase !== state.phase;
      broadcastGameState(room, turnChanged);
    }
  });

  socket.on('leave_room', () => {
    handleDisconnect(socket, true);
  });

  socket.on('disconnect', () => {
    handleDisconnect(socket, false);
  });
});

function handleDisconnect(socket: Socket, explicitLeave: boolean) {
  const link = socketToRoom.get(socket.id);
  if (!link) return;
  socketToRoom.delete(socket.id);

  const room = rooms.get(link.code);
  if (!room) return;

  if (!room.started && explicitLeave) {
    room.players = room.players.filter((p) => p.id !== link.playerId);
    if (room.players.length === 0) {
      clearRoomTimer(room);
      rooms.delete(room.code);
      return;
    }
    if (room.hostId === link.playerId) {
      room.players[0].isHost = true;
      room.hostId = room.players[0].id;
    }
    broadcastRoomInfo(room);
    return;
  }

  // Keep player's seat reserved for seamless auto-reconnect on browser refresh / temporary drop!
  const p = room.players.find((pl) => pl.id === link.playerId);
  if (p && p.socketId === socket.id) {
    p.connected = false;
  }
  if (room.gameState) {
    room.gameState = {
      ...room.gameState,
      players: room.gameState.players.map((gp) =>
        gp.id === link.playerId ? { ...gp, connected: false } : gp
      ),
    };
    broadcastGameState(room, false);
  }
  broadcastRoomInfo(room);
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[UNO ZERO Server] Berjalan di port ${PORT} (CORS: ${ALLOWED_ORIGINS})`);
});
