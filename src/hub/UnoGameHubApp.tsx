import { useEffect, useRef, useState } from 'react';
import { App as UnoZeroApp } from '../App';
import {
  getHubRoomCodeFromUrl,
  getRoomCodeFromUrl,
  loadActiveHubRoomCode,
  saveActiveHubRoomCode,
  setHubRoomCodeInUrl,
} from '../services/session';
import { OnlinePlayerNotice } from '../types/game';
import { getVariantMetadata } from './catalog';
import { makeDefaultPlayers } from './engine/core';
import { HubGamePage } from './pages/HubGamePage';
import { HubHomePage } from './pages/HubHomePage';
import { HubHowToPlayPage } from './pages/HubHowToPlayPage';
import { HubOnlineLobbyPage } from './pages/HubOnlineLobbyPage';
import { HubSettingsPage } from './pages/HubSettingsPage';
import { HubVariantSetupPage } from './pages/HubVariantSetupPage';
import { getRuleset } from './rulesets';
import {
  createHubOnlineRoom,
  joinHubOnlineRoom,
  leaveHubOnlineRoom,
  reconnectHubOnlineRoom,
  sendHubOnlineAction,
  startHubOnlineGame,
  subscribeHubOnlineEvents,
  toggleHubReady,
  updateHubRoomSettings,
} from './services/hubOnlineClient';
import {
  clearVariantSave,
  loadVariantSave,
  recordVariantMatchHistory,
  saveVariantGame,
} from './storage';
import {
  AddOnPackId,
  DigitalToolId,
  HubGameState,
  HubOnlineAction,
  HubOnlineRoomInfo,
  VariantId,
  VariantSettings,
} from './types';

type HubScreen =
  | 'hub_home'
  | 'uno_zero'
  | 'variant_setup'
  | 'hub_online_lobby'
  | 'variant_game'
  | 'guide'
  | 'settings';

export function UnoGameHubApp() {
  const [screen, setScreen] = useState<HubScreen>(() => {
    if (getRoomCodeFromUrl()) return 'uno_zero';
    if (getHubRoomCodeFromUrl()) return 'hub_online_lobby';
    return 'hub_home';
  });
  const [returnScreen, setReturnScreen] = useState<HubScreen>('hub_home');
  const [selectedVariant, setSelectedVariant] = useState<VariantId>('uno-classic');
  const [pendingOnlineSettings, setPendingOnlineSettings] = useState<VariantSettings | undefined>(
    undefined
  );
  const [selectedPacks, setSelectedPacks] = useState<AddOnPackId[]>([]);
  const [selectedTools, setSelectedTools] = useState<DigitalToolId[]>([]);
  const [activeState, setActiveState] = useState<HubGameState | null>(null);

  // Server-authoritative Hub Online Room state
  const [hubRoom, setHubRoom] = useState<HubOnlineRoomInfo | null>(null);
  const [hubPlayerId, setHubPlayerId] = useState<string | null>(null);
  const [inviteHubCode, setInviteHubCode] = useState<string | null>(() => getHubRoomCodeFromUrl());
  const [hubOnlineError, setHubOnlineError] = useState<string | null>(null);
  const [hubOnlineLoading, setHubOnlineLoading] = useState(false);
  const [hubConnStatus, setHubConnStatus] = useState<
    'connected' | 'reconnecting' | 'disconnected'
  >('connected');
  const [hubNotice, setHubNotice] = useState<OnlinePlayerNotice | null>(null);

  const recordedMatchRef = useRef<string | null>(null);

  // Auto-reconnect on initial mount if URL has ?hubRoom=CODE or saved active Hub room
  useEffect(() => {
    if (getRoomCodeFromUrl()) return;
    const urlCode = getHubRoomCodeFromUrl();
    const savedCode = loadActiveHubRoomCode();
    const targetCode = urlCode || savedCode;
    if (!targetCode) return;

    let cancelled = false;
    (async () => {
      const res = await reconnectHubOnlineRoom(targetCode);
      if (cancelled) return;
      if (res.ok && res.room && res.playerId) {
        setHubRoom(res.room);
        setHubPlayerId(res.playerId);
        setSelectedVariant(res.room.variantId);
        saveActiveHubRoomCode(res.room.code);
        setHubRoomCodeInUrl(res.room.code);
        if (res.gameState) {
          setActiveState(res.gameState);
          setScreen('variant_game');
        } else {
          setScreen('hub_online_lobby');
        }
      } else if (urlCode) {
        setInviteHubCode(urlCode);
        setScreen('hub_online_lobby');
      } else {
        saveActiveHubRoomCode(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Subscribe to server-authoritative Hub Online events
  useEffect(() => {
    if (!hubRoom) return;
    const code = hubRoom.code;
    return subscribeHubOnlineEvents({
      onRoomUpdated: (updated) => {
        setHubRoom(updated);
        setSelectedVariant(updated.variantId);
      },
      onGameState: (incoming) => {
        setActiveState(incoming);
        setScreen('variant_game');
      },
      onPlayerNotice: (notice) => {
        setHubNotice(notice);
      },
      onConnectionChange: (status) => {
        setHubConnStatus(status);
      },
      onSocketReconnect: async () => {
        const res = await reconnectHubOnlineRoom(code);
        if (res.ok && res.room) {
          setHubRoom(res.room);
          if (res.gameState) setActiveState(res.gameState);
        }
      },
    });
  }, [hubRoom?.code]);

  // Auto-clear player notices after 4.5s
  useEffect(() => {
    if (!hubNotice) return;
    const t = setTimeout(() => setHubNotice(null), 4500);
    return () => clearTimeout(t);
  }, [hubNotice?.id]);

  // Auto-save active offline variant state (isolated per variant)
  useEffect(() => {
    if (!activeState) return;
    if (activeState.phase === 'game_over') {
      if (activeState.mode !== 'online') {
        clearVariantSave(activeState.variantId);
      }
      const lastRound = activeState.roundHistory[activeState.roundHistory.length - 1];
      const sig = `${activeState.variantId}-${activeState.startedAt}-${activeState.roundHistory.length}`;
      if (lastRound && recordedMatchRef.current !== sig) {
        recordedMatchRef.current = sig;
        recordVariantMatchHistory({
          id: sig,
          variantId: activeState.variantId,
          winnerName: lastRound.winnerName,
          players: activeState.players.map((p) => ({ name: p.name, score: p.score })),
          rounds: activeState.roundNumber,
          completedAt: Date.now(),
        });
      }
    } else if (activeState.mode !== 'online') {
      saveVariantGame(activeState);
    }
  }, [activeState]);

  const togglePack = (id: AddOnPackId) => {
    setSelectedPacks((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleTool = (id: DigitalToolId) => {
    setSelectedTools((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSelectVariant = (variantId: VariantId) => {
    setSelectedVariant(variantId);
    if (variantId === 'uno-zero') {
      setScreen('uno_zero');
    } else {
      setScreen('variant_setup');
    }
  };

  const handleOpenGuide = (variantId: VariantId) => {
    setSelectedVariant(variantId);
    setReturnScreen(screen);
    setScreen('guide');
  };

  const handleCreateHubRoom = async (
    playerName: string,
    variantId: Exclude<VariantId, 'uno-zero'>,
    settings: VariantSettings,
    fillWithBots: boolean,
    targetPlayerCount: number
  ) => {
    setHubOnlineError(null);
    setHubOnlineLoading(true);
    const res = await createHubOnlineRoom(
      playerName,
      variantId,
      settings,
      fillWithBots,
      targetPlayerCount
    );
    setHubOnlineLoading(false);
    if (!res.ok || !res.room || !res.playerId) {
      setHubOnlineError(res.error ?? 'Gagal membuat room online.');
      return;
    }
    setHubRoom(res.room);
    setHubPlayerId(res.playerId);
    setSelectedVariant(res.room.variantId);
    saveActiveHubRoomCode(res.room.code);
    setHubRoomCodeInUrl(res.room.code);
    setScreen('hub_online_lobby');
  };

  const handleJoinHubRoom = async (code: string, playerName: string) => {
    setHubOnlineError(null);
    setHubOnlineLoading(true);
    const res = await joinHubOnlineRoom(code, playerName);
    setHubOnlineLoading(false);
    if (!res.ok || !res.room || !res.playerId) {
      setHubOnlineError(res.error ?? 'Gagal bergabung ke room.');
      return;
    }
    setHubRoom(res.room);
    setHubPlayerId(res.playerId);
    setSelectedVariant(res.room.variantId);
    setInviteHubCode(null);
    saveActiveHubRoomCode(res.room.code);
    setHubRoomCodeInUrl(res.room.code);
    if (res.gameState) {
      setActiveState(res.gameState);
      setScreen('variant_game');
    } else {
      setScreen('hub_online_lobby');
    }
  };

  const handleStartHubOnlineGame = async () => {
    setHubOnlineError(null);
    const res = await startHubOnlineGame();
    if (!res.ok && res.error) {
      setHubOnlineError(res.error);
    }
  };

  const handleLeaveHubOnline = () => {
    leaveHubOnlineRoom();
    saveActiveHubRoomCode(null);
    setHubRoomCodeInUrl(null);
    setHubRoom(null);
    setHubPlayerId(null);
    setInviteHubCode(null);
    setHubOnlineError(null);
    setHubNotice(null);
    setActiveState(null);
    setScreen('hub_home');
  };

  const handleStartVariantGame = async (
    variantId: Exclude<VariantId, 'uno-zero'>,
    mode: 'local' | 'ai' | 'online',
    playerNames: string[],
    settings: VariantSettings,
    joinCode?: string
  ) => {
    const meta = getVariantMetadata(variantId);

    if (mode === 'online') {
      setPendingOnlineSettings(settings);
      setSelectedVariant(variantId);
      setHubOnlineError(null);
      if (joinCode && joinCode.trim().length >= 4) {
        await handleJoinHubRoom(joinCode.trim(), playerNames[0] || 'Pemain');
      } else {
        await handleCreateHubRoom(
          playerNames[0] || 'Host',
          variantId,
          settings,
          meta.minPlayers > 2,
          Math.max(meta.minPlayers, playerNames.length)
        );
      }
      return;
    }

    const ruleset = getRuleset(variantId);
    const playerInits = makeDefaultPlayers(playerNames, mode, meta.isTeamGame);
    const fresh = ruleset.initializeGame(playerInits, mode, settings);
    setHubRoom(null);
    setHubPlayerId(null);
    setActiveState(fresh);
    setScreen('variant_game');
  };

  const handleUpdateState = (updater: (prev: HubGameState) => HubGameState) => {
    setActiveState((prev) => {
      if (!prev) return prev;
      if (prev.mode === 'online') return prev; // Online is strictly server-authoritative!
      return updater(prev);
    });
  };

  const handleOnlineAction = (action: HubOnlineAction) => {
    sendHubOnlineAction(action);
  };

  const handleResumeVariant = (variantId: Exclude<VariantId, 'uno-zero'>) => {
    const saved = loadVariantSave(variantId);
    if (saved) {
      setHubRoom(null);
      setHubPlayerId(null);
      setActiveState(saved);
      setScreen('variant_game');
    }
  };

  if (screen === 'uno_zero') {
    return <UnoZeroApp onBackToHub={() => setScreen('hub_home')} />;
  }

  if (screen === 'settings') {
    return <HubSettingsPage onBack={() => setScreen('hub_home')} />;
  }

  if (screen === 'guide') {
    return (
      <HubHowToPlayPage
        initialVariantId={selectedVariant}
        onPlayVariant={(id) => handleSelectVariant(id)}
        onBack={() => setScreen(returnScreen)}
      />
    );
  }

  if (screen === 'hub_online_lobby') {
    const lobbyVariant: Exclude<VariantId, 'uno-zero'> =
      selectedVariant === 'uno-zero' ? 'uno-classic' : selectedVariant;
    return (
      <HubOnlineLobbyPage
        initialVariantId={lobbyVariant}
        initialSettings={pendingOnlineSettings}
        room={hubRoom}
        myPlayerId={hubPlayerId}
        prefillCode={inviteHubCode}
        error={hubOnlineError}
        loading={hubOnlineLoading}
        connectionStatus={hubConnStatus}
        notice={hubNotice}
        onCreateRoom={handleCreateHubRoom}
        onJoinRoom={handleJoinHubRoom}
        onToggleReady={() => toggleHubReady()}
        onUpdateRoomSettings={(patch) => updateHubRoomSettings(patch)}
        onStartGame={handleStartHubOnlineGame}
        onLeaveRoom={handleLeaveHubOnline}
        onBack={() => {
          setInviteHubCode(null);
          setHubRoomCodeInUrl(null);
          setScreen('hub_home');
        }}
      />
    );
  }

  if (screen === 'variant_setup' && selectedVariant !== 'uno-zero') {
    return (
      <HubVariantSetupPage
        variantId={selectedVariant}
        defaultPacks={selectedPacks}
        defaultTools={selectedTools}
        onStartNewGame={(mode, names, settings, joinCode) =>
          handleStartVariantGame(selectedVariant, mode, names, settings, joinCode)
        }
        onResumeSavedGame={() => handleResumeVariant(selectedVariant)}
        onOpenGuide={() => handleOpenGuide(selectedVariant)}
        onBack={() => setScreen('hub_home')}
      />
    );
  }

  if (screen === 'variant_game' && activeState && activeState.variantId !== 'uno-zero') {
    const vId = activeState.variantId;
    const isOnlineHost = Boolean(
      activeState.mode !== 'online' || (hubRoom && hubPlayerId && hubRoom.hostId === hubPlayerId)
    );
    return (
      <HubGamePage
        state={activeState}
        onlineRoomCode={hubRoom?.code ?? null}
        viewerPlayerId={activeState.mode === 'online' ? hubPlayerId : null}
        isOnlineHost={isOnlineHost}
        connectionStatus={hubConnStatus}
        onlineNotice={hubNotice}
        onUpdateState={handleUpdateState}
        onOnlineAction={handleOnlineAction}
        onExitToHub={() => {
          if (activeState.mode === 'online') {
            handleLeaveHubOnline();
          } else {
            setScreen('hub_home');
          }
        }}
        onRestartMatch={() => {
          if (activeState.mode === 'online') {
            sendHubOnlineAction({ type: 'play_again' });
            return;
          }
          const meta = getVariantMetadata(vId);
          const ruleset = getRuleset(vId);
          const names = activeState.players.map((p) => p.name);
          const inits = makeDefaultPlayers(names, activeState.mode, meta.isTeamGame);
          const next = ruleset.initializeGame(inits, activeState.mode, activeState.settings);
          setActiveState(next);
        }}
        onOpenGuide={() => handleOpenGuide(vId)}
      />
    );
  }

  return (
    <HubHomePage
      selectedPacks={selectedPacks}
      selectedTools={selectedTools}
      onTogglePack={togglePack}
      onToggleTool={toggleTool}
      onSelectVariant={handleSelectVariant}
      onOpenGuide={handleOpenGuide}
      onOpenSettings={() => setScreen('settings')}
    />
  );
}

export default UnoGameHubApp;
