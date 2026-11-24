import { useEffect, useRef, useState } from 'react';
import {
  GameConfig,
  GameMode,
  GameState,
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
import { HomePage } from './pages/HomePage';
import { SetupPage } from './pages/SetupPage';
import { OnlineLobbyPage } from './pages/OnlineLobbyPage';
import { GamePage } from './pages/GamePage';
import { RoundSummaryPage } from './pages/RoundSummaryPage';
import { VictoryPage } from './pages/VictoryPage';
import { ScoreboardPage } from './pages/ScoreboardPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { HowToPlayPage } from './pages/HowToPlayPage';
import { SettingsPage } from './pages/SettingsPage';
import { AboutPage } from './pages/AboutPage';

type Screen =
  | 'home'
  | 'setup_ai'
  | 'setup_local'
  | 'online_lobby'
  | 'game'
  | 'scoreboard'
  | 'leaderboard'
  | 'how_to_play'
  | 'settings'
  | 'about';

export function App() {
  const [config, setConfig] = useState<GameConfig>(() => loadSavedConfig());
  const [mode, setMode] = useState<GameMode>('local');
  const [gameState, setGameState] = useState<GameState | null>(() => loadSavedGame());
  const [screen, setScreen] = useState<Screen>('home');
  const [returnScreen, setReturnScreen] = useState<Screen>('home');

  const [onlineRoom, setOnlineRoom] = useState<OnlineRoomInfo | null>(null);
  const [onlinePlayerId, setOnlinePlayerId] = useState<string | null>(null);
  const [inviteRoomCode, setInviteRoomCode] = useState<string | null>(() => getRoomCodeFromUrl());
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [onlineLoading, setOnlineLoading] = useState(false);

  const recordedMatchIdRef = useRef<string | null>(null);

  useEffect(() => {
    saveConfig(config);
  }, [config]);

  useEffect(() => {
    if (gameState && mode !== 'online') {
      saveGame(gameState);
    }
  }, [gameState, mode]);

  // On initial mount: handle Invite Link (?room=ABCD) and Auto-Reconnect if refreshed mid-game!
  useEffect(() => {
    const urlRoom = getRoomCodeFromUrl();
    const savedRoom = loadActiveRoomCode();
    const targetCode = urlRoom || savedRoom;
    if (!targetCode) return;

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
        // Fresh guest opening an invite link -> take them straight to Online Lobby pre-filled!
        setInviteRoomCode(urlRoom);
        setScreen('online_lobby');
      } else {
        // Stale saved room no longer exists on server
        saveActiveRoomCode(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Record finished match to Leaderboard & play Victory Fanfare once per completed match
  useEffect(() => {
    if (!gameState || gameState.phase !== 'game_over') return;
    const lastRound = gameState.roundHistory[gameState.roundHistory.length - 1];
    const matchSignature = `${lastRound?.completedAt ?? ''}-${gameState.players.length}`;
    if (recordedMatchIdRef.current === matchSignature) return;
    recordedMatchIdRef.current = matchSignature;

    soundFX.playVictoryFanfare();

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

  // Subscribe to online Socket.IO events + handle automatic socket reconnection after brief drop
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

  // AI Bot Catch Human UNO! (80% chance after 3s)
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

  const openAuxiliaryScreen = (
    target: 'how_to_play' | 'settings' | 'about' | 'scoreboard' | 'leaderboard'
  ) => {
    setReturnScreen(screen);
    setScreen(target);
  };

  const handleStartOfflineMatch = (
    targetMode: 'ai' | 'local',
    players: PlayerInit[],
    dealerIndex: number
  ) => {
    setMode(targetMode);
    const fresh = createMatch(players, dealerIndex, config);
    setGameState(fresh);
    setScreen('game');
  };

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
    setScreen('home');
  };

  const handlePlayAgain = () => {
    if (mode === 'online') {
      sendOnlineAction({ type: 'play_again' });
      return;
    }
    if (!gameState) {
      setScreen('home');
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

  if (screen === 'home') {
    return (
      <HomePage
        hasSavedGame={Boolean(gameState && mode !== 'online' && gameState.phase !== 'setup')}
        onPlayAI={() => setScreen('setup_ai')}
        onPlayOnline={() => {
          setOnlineError(null);
          setScreen('online_lobby');
        }}
        onPlayLocal={() => setScreen('setup_local')}
        onResumeGame={() => {
          if (gameState) {
            const hasAI = gameState.players.some((p) => p.isAI);
            setMode(hasAI ? 'ai' : 'local');
            setScreen('game');
          }
        }}
        onLeaderboard={() => openAuxiliaryScreen('leaderboard')}
        onHowToPlay={() => openAuxiliaryScreen('how_to_play')}
        onSettings={() => openAuxiliaryScreen('settings')}
        onAbout={() => openAuxiliaryScreen('about')}
      />
    );
  }

  if (screen === 'leaderboard') {
    return <LeaderboardPage onBack={() => setScreen(returnScreen)} />;
  }

  if (screen === 'setup_ai' || screen === 'setup_local') {
    const setupMode = screen === 'setup_ai' ? 'ai' : 'local';
    return (
      <SetupPage
        mode={setupMode}
        config={config}
        onUpdateTotalRounds={(totalRounds) => setConfig((prev) => ({ ...prev, totalRounds }))}
        onStartGame={(players, dealerIndex) =>
          handleStartOfflineMatch(setupMode, players, dealerIndex)
        }
        onBack={() => setScreen('home')}
        onOpenHowToPlay={() => openAuxiliaryScreen('how_to_play')}
        onOpenSettings={() => openAuxiliaryScreen('settings')}
      />
    );
  }

  if (screen === 'online_lobby') {
    return (
      <OnlineLobbyPage
        room={onlineRoom}
        myPlayerId={onlinePlayerId}
        prefillCode={inviteRoomCode}
        error={onlineError}
        loading={onlineLoading}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onUpdateRounds={updateOnlineRoomSettings}
        onStartOnlineGame={startOnlineGame}
        onLeaveRoom={handleLeaveOnline}
        onBack={() => {
          setInviteRoomCode(null);
          setRoomCodeInUrl(null);
          setScreen('home');
        }}
      />
    );
  }

  if (screen === 'how_to_play') {
    return <HowToPlayPage onBack={() => setScreen(returnScreen)} />;
  }

  if (screen === 'settings') {
    return (
      <SettingsPage
        config={config}
        onChange={setConfig}
        onBack={() => setScreen(returnScreen)}
      />
    );
  }

  if (screen === 'about') {
    return <AboutPage onBack={() => setScreen(returnScreen)} />;
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
              setScreen('home');
            }
          }}
          onViewScoreboard={() => openAuxiliaryScreen('scoreboard')}
        />
      );
    }

    return (
      <GamePage
        mode={mode}
        state={gameState}
        viewerPlayerId={viewerPlayerId}
        roomCode={mode === 'online' ? onlineRoom?.code : null}
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
        onExitToMenu={() => {
          if (mode === 'online') handleLeaveOnline();
          else setScreen('home');
        }}
      />
    );
  }

  return null;
}

export default App;
