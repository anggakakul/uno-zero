import { useEffect, useRef, useState } from 'react';
import {
  GameConfig,
  GameMode,
  GameState,
  OnlinePlayerNotice,
  OnlineRoomInfo,
  SlotPosition,
} from './types/game';
import {
  PlayerInit,
  callUno,
  catchUno,
  createMatch,
  discardDrawnCard,
  flipGridCardAfterDiscard,
  flipInitialCard,
  getRankedPlayers,
  resolveDoubleDrawTwo,
  startNewRound,
  swapWithGridSlot,
  takeFromPile,
} from './engine/gameEngine';
import { decideAIMove } from './engine/ai';
import {
  clearSavedGame,
  loadSavedConfig,
  loadSavedGame,
  saveConfig,
  saveGame,
} from './engine/storage';
import {
  createOnlineRoom,
  disconnectSocket,
  joinOnlineRoom,
  reconnectOnlineRoom,
  sendOnlineAction,
  startOnlineGame,
  subscribeOnlineEvents,
  toggleOnlineReady,
  updateOnlineRoomSettings,
} from './services/onlineClient';
import {
  getRoomCodeFromUrl,
  loadActiveRoomCode,
  saveActiveRoomCode,
  setRoomCodeInUrl,
} from './services/session';
import { submitGlobalMatchResults } from './services/leaderboard';
import { soundFX } from './services/sound';
import { recordVariantMatchHistory } from './hub/storage';
import { OnlineLobbyPage } from './pages/OnlineLobbyPage';
import { GamePage } from './pages/GamePage';
import { RoundSummaryPage } from './pages/RoundSummaryPage';
import { VictoryPage } from './pages/VictoryPage';
import { ScoreboardPage } from './pages/ScoreboardPage';

export interface UnoZeroLaunchIntent {
  action: 'start_ai' | 'start_local' | 'resume' | 'online';
  playerNames?: string[];
  totalRounds?: number;
  joinCode?: string;
}

type Screen = 'online_lobby' | 'game' | 'scoreboard';

interface AppProps {
  launchIntent?: UnoZeroLaunchIntent;
  onOpenGuide?: () => void;
  onBackToHub?: () => void;
}

export function App({ launchIntent, onOpenGuide, onBackToHub }: AppProps = {}) {
  const [config] = useState<GameConfig>(() => {
    const base = loadSavedConfig();
    if (launchIntent?.totalRounds) {
      return { ...base, totalRounds: launchIntent.totalRounds };
    }
    return base;
  });

  const [mode, setMode] = useState<GameMode>(() => {
    if (launchIntent?.action === 'online') return 'online';
    if (launchIntent?.action === 'start_ai') return 'ai';
    if (launchIntent?.action === 'start_local') return 'local';
    const saved = loadSavedGame();
    if (saved?.players.some((p) => p.isAI)) return 'ai';
    return 'local';
  });

  const [gameState, setGameState] = useState<GameState | null>(() => {
    if (launchIntent?.action === 'start_ai' || launchIntent?.action === 'start_local') {
      const names = launchIntent.playerNames ?? ['Kamu', 'Bot 1', 'Bot 2'];
      const isAi = launchIntent.action === 'start_ai';
      const players: PlayerInit[] = names.map((name, idx) => ({
        id: `p-${idx + 1}`,
        name: name.trim() || (isAi && idx > 0 ? `Bot ${idx}` : `Pemain ${idx + 1}`),
        isAI: isAi && idx > 0,
      }));
      const base = loadSavedConfig();
      const matchConfig: GameConfig = {
        ...base,
        totalRounds: launchIntent.totalRounds ?? base.totalRounds,
      };
      return createMatch(players, 0, matchConfig);
    }
    if (launchIntent?.action === 'resume') {
      return loadSavedGame();
    }
    return loadSavedGame();
  });

  const [screen, setScreen] = useState<Screen>(() =>
    launchIntent?.action === 'online' ? 'online_lobby' : 'game'
  );
  const [returnScreen, setReturnScreen] = useState<Screen>('game');

  const [onlineRoom, setOnlineRoom] = useState<OnlineRoomInfo | null>(null);
  const [onlinePlayerId, setOnlinePlayerId] = useState<string | null>(null);
  const [inviteRoomCode, setInviteRoomCode] = useState<string | null>(
    () => launchIntent?.joinCode ?? getRoomCodeFromUrl()
  );
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    'connected' | 'reconnecting' | 'disconnected'
  >('connected');
  const [onlineNotice, setOnlineNotice] = useState<OnlinePlayerNotice | null>(null);

  const recordedMatchIdRef = useRef<string | null>(null);
  const autoOnlineStartedRef = useRef(false);

  const exitToHub = () => {
    if (onBackToHub) {
      onBackToHub();
    }
  };

  useEffect(() => {
    saveConfig(config);
  }, [config]);

  useEffect(() => {
    if (gameState && mode !== 'online') {
      saveGame(gameState);
    }
  }, [gameState, mode]);

  // Handle Invite Link (?room=ABCD), Auto-Reconnect, or direct Online launch from Hub Setup
  useEffect(() => {
    const urlRoom = getRoomCodeFromUrl();
    const savedRoom = loadActiveRoomCode();
    const targetCode = urlRoom || savedRoom;

    if (targetCode) {
      let cancelled = false;
      (async () => {
        const res = await reconnectOnlineRoom(targetCode);
        if (cancelled) return;
        if (res.ok && res.room && res.playerId) {
          setMode('online');
          setOnlineRoom(res.room);
          setOnlinePlayerId(res.playerId);
          saveActiveRoomCode(res.room.code);
          setRoomCodeInUrl(res.room.code);
          if (res.gameState) {
            setGameState(res.gameState);
            setScreen('game');
          } else {
            setScreen('online_lobby');
          }
        } else if (urlRoom) {
          setInviteRoomCode(urlRoom);
          setScreen('online_lobby');
        } else {
          saveActiveRoomCode(null);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    if (launchIntent?.action === 'online' && !autoOnlineStartedRef.current) {
      autoOnlineStartedRef.current = true;
      const hostName = launchIntent.playerNames?.[0] || 'Host';
      const rounds = launchIntent.totalRounds ?? config.totalRounds;
      if (launchIntent.joinCode && launchIntent.joinCode.trim().length >= 4) {
        void handleJoinRoom(launchIntent.joinCode.trim(), hostName);
      } else {
        void handleCreateRoom(hostName, rounds);
      }
    }
  }, []);

  // Record finished match to Hub history & global leaderboard once per completed match
  useEffect(() => {
    if (!gameState || gameState.phase !== 'game_over') return;
    const lastRound = gameState.roundHistory[gameState.roundHistory.length - 1];
    const matchSignature = `${lastRound?.completedAt ?? ''}-${gameState.players.length}`;
    if (recordedMatchIdRef.current === matchSignature) return;
    recordedMatchIdRef.current = matchSignature;

    soundFX.playVictoryFanfare();

    const ranked = getRankedPlayers(gameState.players);
    const lowestScore = ranked[0]?.totalScore ?? 0;
    const winnerNames = ranked
      .filter((p) => p.totalScore === lowestScore)
      .map((p) => p.name)
      .join(' & ');

    recordVariantMatchHistory({
      id: `uno-zero-${matchSignature}`,
      variantId: 'uno-zero',
      winnerName: winnerNames || ranked[0]?.name || 'Pemenang',
      players: gameState.players.map((p) => ({ name: p.name, score: p.totalScore })),
      rounds: gameState.roundNumber,
      completedAt: Date.now(),
    });

    if (mode !== 'online') {
      const winnerSet = new Set(gameState.winnerIds);
      const humanResults = gameState.players
        .filter((p) => !p.isAI)
        .map((p) => ({
          playerName: p.name,
          score: p.totalScore,
          won: winnerSet.has(p.id),
        }));
      if (humanResults.length > 0) {
        submitGlobalMatchResults(humanResults);
      }
    }
  }, [gameState?.phase, gameState?.roundHistory.length, mode]);

  useEffect(() => {
    if (!onlineRoom) return;
    const roomCode = onlineRoom.code;
    const unsub = subscribeOnlineEvents({
      onRoomUpdated: (room) => {
        setOnlineRoom(room);
      },
      onGameState: (state) => {
        setGameState(state);
        setScreen('game');
      },
      onPlayerNotice: (notice) => {
        setOnlineNotice(notice);
      },
      onConnectionChange: (status) => {
        setConnectionStatus(status);
      },
      onSocketReconnect: async () => {
        const res = await reconnectOnlineRoom(roomCode);
        if (res.ok && res.room) {
          setOnlineRoom(res.room);
          if (res.gameState) setGameState(res.gameState);
        }
      },
    });
    return unsub;
  }, [onlineRoom?.code]);

  useEffect(() => {
    if (!onlineNotice) return;
    const t = setTimeout(() => setOnlineNotice(null), 4500);
    return () => clearTimeout(t);
  }, [onlineNotice?.id]);

  // AI Bot Turn Automation (1.15s delay per step)
  useEffect(() => {
    if (mode !== 'ai' || screen !== 'game' || !gameState) return;
    if (
      gameState.phase !== 'initial_flip' &&
      gameState.phase !== 'playing' &&
      gameState.phase !== 'choose_double_draw2_target'
    ) {
      return;
    }

    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    if (!activePlayer?.isAI) return;

    const timer = setTimeout(() => {
      setGameState((prev) => {
        if (!prev) return prev;
        const curr = prev.players[prev.currentPlayerIndex];
        if (!curr?.isAI) return prev;

        const decision = decideAIMove(prev);
        if (!decision) return prev;

        let next = prev;
        if (decision.action === 'flip_initial') {
          next = flipInitialCard(next, decision.colIdx, decision.pos);
        } else if (decision.action === 'take_source') {
          next = takeFromPile(next, decision.source);
        } else if (decision.action === 'swap_slot') {
          if (decision.callUnoFirst) next = callUno(next, curr.id);
          next = swapWithGridSlot(next, decision.colIdx, decision.pos);
        } else if (decision.action === 'discard_drawn') {
          next = discardDrawnCard(next);
        } else if (decision.action === 'flip_after_discard') {
          if (decision.callUnoFirst) next = callUno(next, curr.id);
          next = flipGridCardAfterDiscard(next, decision.colIdx, decision.pos);
        } else if (decision.action === 'resolve_double_draw2') {
          next = resolveDoubleDrawTwo(next, decision.targetIds);
        }
        return next;
      });
    }, 1150);

    return () => clearTimeout(timer);
  }, [
    mode,
    screen,
    gameState?.phase,
    gameState?.turnStep,
    gameState?.currentPlayerIndex,
    gameState?.roundNumber,
  ]);

  // AI Bot Catch Human UNO (80% chance after 3s)
  useEffect(() => {
    if (mode !== 'ai' || screen !== 'game' || !gameState?.unoVulnerability) return;
    const vuln = gameState.unoVulnerability;
    const vulnPlayer = gameState.players.find((p) => p.id === vuln.playerId);
    if (!vulnPlayer || vulnPlayer.isAI) return;

    const timer = setTimeout(() => {
      setGameState((prev) => {
        if (!prev || prev.unoVulnerability?.playerId !== vuln.playerId) return prev;
        if (Math.random() < 0.8) {
          const catcherBot = prev.players.find((p) => p.isAI);
          return catchUno(prev, catcherBot?.name ?? 'Bot AI');
        }
        return prev;
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, [mode, screen, gameState?.unoVulnerability?.playerId, gameState?.unoVulnerability?.createdAt]);

  const handleCreateRoom = async (playerName: string, totalRounds: number) => {
    setOnlineError(null);
    setOnlineLoading(true);
    const res = await createOnlineRoom(playerName, totalRounds);
    setOnlineLoading(false);
    if (!res.ok || !res.room || !res.playerId) {
      setOnlineError(res.error ?? 'Gagal membuat room.');
      return;
    }
    setMode('online');
    setOnlineRoom(res.room);
    setOnlinePlayerId(res.playerId);
    saveActiveRoomCode(res.room.code);
    setRoomCodeInUrl(res.room.code);
  };

  const handleJoinRoom = async (code: string, playerName: string) => {
    setOnlineError(null);
    setOnlineLoading(true);
    const res = await joinOnlineRoom(code, playerName);
    setOnlineLoading(false);
    if (!res.ok || !res.room || !res.playerId) {
      setOnlineError(res.error ?? 'Gagal bergabung ke room.');
      return;
    }
    setMode('online');
    setOnlineRoom(res.room);
    setOnlinePlayerId(res.playerId);
    setInviteRoomCode(null);
    saveActiveRoomCode(res.room.code);
    setRoomCodeInUrl(res.room.code);
    if (res.gameState) {
      setGameState(res.gameState);
      setScreen('game');
    }
  };

  const handleLeaveOnline = () => {
    disconnectSocket();
    saveActiveRoomCode(null);
    setRoomCodeInUrl(null);
    setOnlineRoom(null);
    setOnlinePlayerId(null);
    setInviteRoomCode(null);
    setOnlineError(null);
    setGameState(null);
    setMode('local');
    exitToHub();
  };

  const handlePlayAgain = () => {
    if (mode === 'online') {
      sendOnlineAction({ type: 'play_again' });
      return;
    }
    if (!gameState) {
      exitToHub();
      return;
    }
    const players: PlayerInit[] = gameState.players.map((p) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
    }));
    const nextDealer = (gameState.dealerIndex + 1) % players.length;
    setGameState(createMatch(players, nextDealer, config));
    setScreen('game');
  };

  if (screen === 'online_lobby') {
    return (
      <OnlineLobbyPage
        room={onlineRoom}
        myPlayerId={onlinePlayerId}
        prefillCode={inviteRoomCode}
        error={onlineError}
        loading={onlineLoading}
        connectionStatus={connectionStatus}
        notice={onlineNotice}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onToggleReady={() => toggleOnlineReady()}
        onUpdateRounds={updateOnlineRoomSettings}
        onStartOnlineGame={async () => {
          setOnlineError(null);
          const res = await startOnlineGame();
          if (!res.ok && res.error) setOnlineError(res.error);
        }}
        onLeaveRoom={handleLeaveOnline}
        onBack={() => {
          setInviteRoomCode(null);
          setRoomCodeInUrl(null);
          exitToHub();
        }}
      />
    );
  }

  if (screen === 'scoreboard' && gameState) {
    return <ScoreboardPage state={gameState} onBack={() => setScreen(returnScreen)} />;
  }

  if (screen === 'game' && gameState) {
    const viewerPlayerId =
      mode === 'online'
        ? onlinePlayerId
        : mode === 'ai'
        ? gameState.players.find((p) => !p.isAI)?.id ?? gameState.players[0].id
        : null;

    const isOnlineHost = Boolean(
      mode !== 'online' || (onlineRoom && onlinePlayerId && onlineRoom.hostId === onlinePlayerId)
    );

    if (gameState.phase === 'round_over') {
      return (
        <RoundSummaryPage
          state={gameState}
          canStartNextRound={isOnlineHost}
          onNextRound={() => {
            if (mode === 'online') {
              sendOnlineAction({ type: 'next_round' });
            } else {
              setGameState((prev) => (prev ? startNewRound(prev) : prev));
            }
          }}
        />
      );
    }

    if (gameState.phase === 'game_over') {
      return (
        <VictoryPage
          state={gameState}
          onPlayAgain={handlePlayAgain}
          onMainMenu={() => {
            if (mode === 'online') {
              handleLeaveOnline();
            } else {
              clearSavedGame();
              setGameState(null);
              exitToHub();
            }
          }}
          onViewScoreboard={() => {
            setReturnScreen('game');
            setScreen('scoreboard');
          }}
        />
      );
    }

    return (
      <GamePage
        mode={mode}
        state={gameState}
        viewerPlayerId={viewerPlayerId}
        roomCode={mode === 'online' ? onlineRoom?.code : null}
        connectionStatus={connectionStatus}
        onlineNotice={onlineNotice}
        onFlipInitial={(colIdx: number, pos: SlotPosition) => {
          if (mode === 'online') sendOnlineAction({ type: 'flip_initial', colIdx, pos });
          else setGameState((prev) => (prev ? flipInitialCard(prev, colIdx, pos) : prev));
        }}
        onTakeFromPile={(source: 'draw' | 'discard') => {
          if (mode === 'online') sendOnlineAction({ type: 'take_source', source });
          else setGameState((prev) => (prev ? takeFromPile(prev, source) : prev));
        }}
        onSwapWithSlot={(colIdx: number, pos: SlotPosition) => {
          if (mode === 'online') sendOnlineAction({ type: 'swap_slot', colIdx, pos });
          else setGameState((prev) => (prev ? swapWithGridSlot(prev, colIdx, pos) : prev));
        }}
        onDiscardDrawn={() => {
          if (mode === 'online') sendOnlineAction({ type: 'discard_drawn' });
          else setGameState((prev) => (prev ? discardDrawnCard(prev) : prev));
        }}
        onFlipAfterDiscard={(colIdx: number, pos: SlotPosition) => {
          if (mode === 'online') sendOnlineAction({ type: 'flip_after_discard', colIdx, pos });
          else setGameState((prev) => (prev ? flipGridCardAfterDiscard(prev, colIdx, pos) : prev));
        }}
        onResolveDoubleDrawTwo={(targetIds: string[]) => {
          if (mode === 'online') sendOnlineAction({ type: 'resolve_double_draw2', targetIds });
          else setGameState((prev) => (prev ? resolveDoubleDrawTwo(prev, targetIds) : prev));
        }}
        onCallUno={() => {
          if (mode === 'online') sendOnlineAction({ type: 'call_uno' });
          else setGameState((prev) => (prev ? callUno(prev, viewerPlayerId ?? undefined) : prev));
        }}
        onCatchUno={() => {
          if (mode === 'online') sendOnlineAction({ type: 'catch_uno' });
          else setGameState((prev) => (prev ? catchUno(prev) : prev));
        }}
        onOpenGuide={onOpenGuide}
        onExitToMenu={() => {
          if (mode === 'online') handleLeaveOnline();
          else exitToHub();
        }}
      />
    );
  }

  return null;
}

export default App;
