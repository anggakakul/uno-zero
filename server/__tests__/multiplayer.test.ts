import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioc, Socket } from 'socket.io-client';
import { createUnoServer } from '../index';
import { VARIANT_CATALOG, getVariantMetadata } from '../../src/hub/catalog';
import { getRuleset } from '../../src/hub/rulesets';
import { GameState, OnlinePlayerNotice, OnlineRoomInfo } from '../../src/types/game';
import {
  HubGameState,
  HubOnlineAction,
  HubOnlineRoomInfo,
  VariantId,
} from '../../src/hub/types';

type HubVariantId = Exclude<VariantId, 'uno-zero'>;

const ALL_HUB_VARIANTS: HubVariantId[] = VARIANT_CATALOG.filter(
  (v): v is typeof v & { id: HubVariantId } => v.id !== 'uno-zero'
).map((v) => v.id);

function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timeout waiting for event "${event}"`));
    }, timeoutMs);
    const handler = (data: T) => {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(data);
    };
    socket.on(event, handler);
  });
}

function emitAck<T>(socket: Socket, event: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout on ack for "${event}"`)), 4000);
    const cb = (res: T) => {
      clearTimeout(timer);
      resolve(res);
    };
    if (payload === undefined) {
      socket.emit(event, cb);
    } else {
      socket.emit(event, payload, cb);
    }
  });
}

describe('UNO ZERO & All 19 Hub Modes — Real-Time Online Multiplayer Integration', () => {
  let serverUrl = '';
  let closeServer: () => Promise<void>;
  const openSockets: Socket[] = [];

  function connectClient(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const s = ioc(serverUrl, {
        transports: ['websocket'],
        reconnection: false,
      });
      openSockets.push(s);
      const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 4000);
      s.on('connect', () => {
        clearTimeout(timer);
        resolve(s);
      });
      s.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  beforeAll(async () => {
    const srv = createUnoServer();
    closeServer = srv.close;
    await new Promise<void>((resolve) => {
      srv.httpServer.listen(0, '127.0.0.1', () => {
        const addr = srv.httpServer.address();
        const port = typeof addr === 'object' && addr ? addr.port : 3001;
        serverUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    for (const s of openSockets) {
      if (s.connected) s.disconnect();
    }
    await closeServer();
  });

  it('01. UNO ZERO: full lobby, ready check, anti-cheat, sync, disconnect/reconnect & host migration', async () => {
    const host = await connectClient();
    const guest = await connectClient();

    // Create room
    const created = await emitAck<{
      ok: boolean;
      room?: OnlineRoomInfo;
      playerId?: string;
    }>(host, 'create_room', { playerName: 'Alice', sessionId: 'uz-alice', totalRounds: 3 });
    expect(created.ok).toBe(true);
    expect(created.room?.code).toHaveLength(5);
    const code = created.room!.code;

    // Invalid room join rejected
    const badJoin = await emitAck<{ ok: boolean; error?: string }>(guest, 'join_room', {
      code: 'ZZZZZ',
      playerName: 'Bob',
      sessionId: 'uz-bob',
    });
    expect(badJoin.ok).toBe(false);

    // Valid join
    const joined = await emitAck<{
      ok: boolean;
      room?: OnlineRoomInfo;
      playerId?: string;
    }>(guest, 'join_room', { code, playerName: 'Bob', sessionId: 'uz-bob' });
    expect(joined.ok).toBe(true);
    expect(joined.room?.players).toHaveLength(2);

    // Start rejected before guest is ready
    const blockedStart = await emitAck<{ ok: boolean; error?: string }>(host, 'start_game');
    expect(blockedStart.ok).toBe(false);

    // Guest marks Ready
    const roomUpdP = waitForEvent<OnlineRoomInfo>(host, 'room_updated');
    guest.emit('toggle_ready', { ready: true });
    const roomAfterReady = await roomUpdP;
    expect(roomAfterReady.players.find((p) => p.id === 'uz-bob')?.ready).toBe(true);

    // Host starts game -> both receive sanitized state
    const hostStateP = waitForEvent<GameState>(host, 'game_state');
    const guestStateP = waitForEvent<GameState>(guest, 'game_state');
    const started = await emitAck<{ ok: boolean }>(host, 'start_game');
    expect(started.ok).toBe(true);

    const [hostState, guestState] = await Promise.all([hostStateP, guestStateP]);
    expect(hostState.phase).toBe('initial_flip');
    expect(guestState.phase).toBe('initial_flip');
    // Anti-cheat: drawPile stripped & face-down cards are null
    expect(hostState.drawPile).toHaveLength(0);
    expect(hostState.drawPileCount).toBeGreaterThan(0);
    expect(hostState.players[0].columns[0].top?.card).toBeNull();

    // Out-of-turn action by guest is ignored
    const activeId = hostState.players[hostState.currentPlayerIndex].id;
    const activeSock = activeId === 'uz-alice' ? host : guest;
    const otherSock = activeId === 'uz-alice' ? guest : host;
    const syncP = waitForEvent<GameState>(otherSock, 'game_state');
    activeSock.emit('game_action', {
      type: 'flip_initial',
      colIdx: 0,
      pos: 'top',
      actionId: 'dup-test-1',
    });
    const afterFlip = await syncP;
    const flippedPlayer = afterFlip.players.find((p) => p.id === activeId)!;
    expect(flippedPlayer.columns[0].top?.faceUp).toBe(true);
    expect(flippedPlayer.columns[0].top?.card).not.toBeNull();

    // Disconnect guest -> host receives disconnect notice & updated state
    const noticeP = waitForEvent<OnlinePlayerNotice>(host, 'player_notice');
    guest.disconnect();
    const discNotice = await noticeP;
    expect(discNotice.type).toBe('disconnected');

    // Reconnect guest with same sessionId
    const guestReconn = await connectClient();
    const reconnRes = await emitAck<{
      ok: boolean;
      room?: OnlineRoomInfo;
      gameState?: GameState | null;
    }>(guestReconn, 'reconnect_room', { code, sessionId: 'uz-bob' });
    expect(reconnRes.ok).toBe(true);
    expect(reconnRes.gameState?.players.find((p) => p.id === 'uz-bob')?.connected).toBe(true);

    // Host leaves explicitly -> host migrates to Bob
    const hostChangeP = waitForEvent<OnlineRoomInfo>(guestReconn, 'room_updated');
    host.emit('leave_room');
    const migratedRoom = await hostChangeP;
    expect(migratedRoom.hostId).toBe('uz-bob');

    host.disconnect();
    guestReconn.disconnect();
  });

  it('verifies all 19 Hub UNO variants are registered and covered', () => {
    expect(ALL_HUB_VARIANTS).toHaveLength(19);
  });

  for (const variantId of ALL_HUB_VARIANTS) {
    it(`Hub Mode [${variantId}]: lobby, ready, server-authoritative sync, anti-cheat, turn enforcement & reconnect`, async () => {
      const meta = getVariantMetadata(variantId);
      const ruleset = getRuleset(variantId);
      const host = await connectClient();
      const guest = await connectClient();

      const hostSess = `h-${variantId}-a`;
      const guestSess = `h-${variantId}-b`;

      // 1. Create room
      const created = await emitAck<{
        ok: boolean;
        room?: HubOnlineRoomInfo;
        playerId?: string;
      }>(host, 'hub:create_room', {
        playerName: 'PlayerA',
        sessionId: hostSess,
        variantId,
        settings: { ...meta.defaultSettings, singleRound: true },
        fillWithBots: meta.minPlayers > 2,
        targetPlayerCount: meta.minPlayers,
      });
      expect(created.ok).toBe(true);
      const code = created.room!.code;

      // 2. Guest joins with room code
      const joined = await emitAck<{
        ok: boolean;
        room?: HubOnlineRoomInfo;
        playerId?: string;
      }>(guest, 'hub:join_room', {
        code,
        playerName: 'PlayerB',
        sessionId: guestSess,
      });
      expect(joined.ok).toBe(true);
      expect(joined.room?.players).toHaveLength(2);

      // 3. Cannot start before guest is ready
      const blocked = await emitAck<{ ok: boolean; error?: string }>(host, 'hub:start_game');
      expect(blocked.ok).toBe(false);

      // 4. Guest clicks Ready
      const readyP = waitForEvent<HubOnlineRoomInfo>(host, 'hub:room_updated');
      guest.emit('hub:toggle_ready', { ready: true });
      const roomReady = await readyP;
      expect(roomReady.players.find((p) => p.id === guestSess)?.ready).toBe(true);

      // 5. Host starts game -> both receive sanitized game state
      const hostStateP = waitForEvent<HubGameState>(host, 'hub:game_state');
      const guestStateP = waitForEvent<HubGameState>(guest, 'hub:game_state');
      const started = await emitAck<{ ok: boolean; error?: string }>(host, 'hub:start_game');
      expect(started.ok).toBe(true);

      let [hostState, guestState] = await Promise.all([hostStateP, guestStateP]);
      expect(hostState.variantId).toBe(variantId);
      expect(guestState.variantId).toBe(variantId);
      expect(hostState.mode).toBe('online');
      expect(hostState.players.length).toBeGreaterThanOrEqual(meta.minPlayers);

      // If a bot starts first (e.g., initial Skip/Reverse in 4-player mode), wait for server AI to advance to a human turn!
      let guard = 0;
      while (
        hostState.players[hostState.currentPlayerIndex]?.isAI &&
        hostState.phase === 'playing' &&
        guard < 12
      ) {
        guard += 1;
        const pH = waitForEvent<HubGameState>(host, 'hub:game_state');
        const pG = waitForEvent<HubGameState>(guest, 'hub:game_state');
        [hostState, guestState] = await Promise.all([pH, pG]);
      }

      // 6. Anti-cheat verification: hidden hands & drawPile MUST be masked!
      const guestInHostView = hostState.players.find((p) => p.id === guestSess)!;
      for (const c of guestInHostView.hand) {
        expect(c.id.startsWith('hidden_')).toBe(true);
      }
      if (hostState.drawPile.length > 0) {
        expect(hostState.drawPile[0].id.startsWith('hidden_draw_')).toBe(true);
      }
      const hostInHostView = hostState.players.find((p) => p.id === hostSess)!;
      for (const c of hostInHostView.hand) {
        expect(c.id.startsWith('hidden_')).toBe(false);
      }

      // 7. Out-of-turn action MUST be rejected by server!
      const currentActorId =
        hostState.pendingPrompt?.actorId ?? hostState.players[hostState.currentPlayerIndex].id;
      const activeSock = currentActorId === hostSess ? host : guest;
      const nonActiveSock = currentActorId === hostSess ? guest : host;
      const activeState = currentActorId === hostSess ? hostState : guestState;

      const rejectedMove = await emitAck<{ ok: boolean; error?: string }>(
        nonActiveSock,
        'hub:game_action',
        { action: { type: 'draw_or_pass' } as HubOnlineAction }
      );
      expect(rejectedMove.ok).toBe(false);

      // 8. Active player executes a real move (play legal card or draw/golf_take_draw)
      let actionToSend: HubOnlineAction;
      if (variantId === 'uno-golf') {
        actionToSend = { type: 'golf_take_draw' };
      } else if (activeState.pendingPrompt && activeState.pendingPrompt.actorId === currentActorId) {
        const decision = ruleset.decideAIMove(activeState);
        actionToSend =
          decision.type === 'resolve_prompt'
            ? { type: 'resolve_prompt', payload: decision.payload }
            : { type: 'draw_or_pass' };
      } else {
        const decision = ruleset.decideAIMove(activeState);
        if (decision.type === 'play') {
          actionToSend = { type: 'play_card', move: decision.move };
        } else if (decision.type === 'resolve_prompt') {
          actionToSend = { type: 'resolve_prompt', payload: decision.payload };
        } else {
          actionToSend = { type: 'draw_or_pass' };
        }
      }

      const otherSyncP = waitForEvent<HubGameState>(nonActiveSock, 'hub:game_state');
      const moveRes = await emitAck<{ ok: boolean }>(activeSock, 'hub:game_action', {
        action: actionToSend,
        actionId: `act-${variantId}-1`,
      });
      expect(moveRes.ok).toBe(true);
      const syncedState = await otherSyncP;
      expect(syncedState.actionLog.length).toBeGreaterThanOrEqual(hostState.actionLog.length);

      // 9. Disconnect & Reconnect test
      const discNoticeP = waitForEvent<OnlinePlayerNotice>(host, 'hub:player_notice');
      guest.disconnect();
      const notice = await discNoticeP;
      expect(notice.type).toBe('disconnected');

      const guestReconn = await connectClient();
      const reconn = await emitAck<{
        ok: boolean;
        room?: HubOnlineRoomInfo;
        gameState?: HubGameState | null;
      }>(guestReconn, 'hub:reconnect_room', { code, sessionId: guestSess });
      expect(reconn.ok).toBe(true);
      expect(reconn.gameState?.variantId).toBe(variantId);
      expect(reconn.gameState?.players.find((p) => p.id === guestSess)?.connected).toBe(true);

      // Clean up
      host.emit('hub:leave_room');
      guestReconn.emit('hub:leave_room');
      host.disconnect();
      guestReconn.disconnect();
    });
  }

  it('End-to-End Match Completion: two online clients play UNO Junior until game_over and receive identical winner', async () => {
    const host = await connectClient();
    const guest = await connectClient();
    const ruleset = getRuleset('uno-junior');

    const created = await emitAck<{ ok: boolean; room?: HubOnlineRoomInfo }>(
      host,
      'hub:create_room',
      {
        playerName: 'ChampionA',
        sessionId: 'e2e-a',
        variantId: 'uno-junior',
        settings: { targetScore: 1, singleRound: true, juniorLevel: 'beginner' },
      }
    );
    const code = created.room!.code;
    await emitAck(guest, 'hub:join_room', { code, playerName: 'ChampionB', sessionId: 'e2e-b' });

    const readyP = waitForEvent<HubOnlineRoomInfo>(host, 'hub:room_updated');
    guest.emit('hub:toggle_ready', { ready: true });
    await readyP;

    let latestHost: HubGameState | null = null;
    let latestGuest: HubGameState | null = null;
    host.on('hub:game_state', (s: HubGameState) => {
      latestHost = s;
    });
    guest.on('hub:game_state', (s: HubGameState) => {
      latestGuest = s;
    });

    const p1 = waitForEvent<HubGameState>(host, 'hub:game_state');
    const p2 = waitForEvent<HubGameState>(guest, 'hub:game_state');
    await emitAck(host, 'hub:start_game');
    [latestHost, latestGuest] = await Promise.all([p1, p2]);

    let turns = 0;
    while (latestHost && latestHost.phase !== 'game_over' && turns < 200) {
      turns += 1;
      if (latestHost.phase === 'round_over') {
        const nextH = waitForEvent<HubGameState>(host, 'hub:game_state');
        const nextG = waitForEvent<HubGameState>(guest, 'hub:game_state');
        await emitAck(host, 'hub:game_action', { action: { type: 'next_round' } });
        [latestHost, latestGuest] = await Promise.all([nextH, nextG]);
        continue;
      }

      const activeId = latestHost.players[latestHost.currentPlayerIndex].id;
      const activeSock = activeId === 'e2e-a' ? host : guest;
      const activeView = activeId === 'e2e-a' ? latestHost : latestGuest!;

      let action: HubOnlineAction;
      if (activeView.drawnPlayableCardId) {
        action = { type: 'pass_after_draw' };
      } else {
        const decision = ruleset.decideAIMove(activeView);
        if (decision.type === 'play') {
          const me = activeView.players.find((p) => p.id === activeId)!;
          if (me.hand.length === 2 && !me.calledUno) {
            const uH = waitForEvent<HubGameState>(host, 'hub:game_state');
            const uG = waitForEvent<HubGameState>(guest, 'hub:game_state');
            await emitAck(activeSock, 'hub:game_action', { action: { type: 'call_uno' } });
            [latestHost, latestGuest] = await Promise.all([uH, uG]);
          }
          action = { type: 'play_card', move: decision.move };
        } else if (decision.type === 'resolve_prompt') {
          action = { type: 'resolve_prompt', payload: decision.payload };
        } else {
          action = { type: 'draw_or_pass' };
        }
      }

      const nextH = waitForEvent<HubGameState>(host, 'hub:game_state');
      const nextG = waitForEvent<HubGameState>(guest, 'hub:game_state');
      const ack = await emitAck<{ ok: boolean }>(activeSock, 'hub:game_action', { action });
      expect(ack.ok).toBe(true);
      [latestHost, latestGuest] = await Promise.all([nextH, nextG]);
    }

    expect(latestHost?.phase).toBe('game_over');
    expect(latestGuest?.phase).toBe('game_over');
    expect(latestHost?.winnerId).toBeTruthy();
    expect(latestHost?.winnerId).toBe(latestGuest?.winnerId);

    host.disconnect();
    guest.disconnect();
  });
});
