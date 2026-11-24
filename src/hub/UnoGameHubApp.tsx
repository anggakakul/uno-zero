import { useEffect, useRef, useState } from 'react';
import { App as UnoZeroApp } from '../App';
import { getRoomCodeFromUrl } from '../services/session';
import { getVariantMetadata } from './catalog';
import { makeDefaultPlayers } from './engine/core';
import { HubGamePage } from './pages/HubGamePage';
import { HubHomePage } from './pages/HubHomePage';
import { HubHowToPlayPage } from './pages/HubHowToPlayPage';
import { HubSettingsPage } from './pages/HubSettingsPage';
import { HubVariantSetupPage } from './pages/HubVariantSetupPage';
import { getRuleset } from './rulesets';
import {
  broadcastHubState,
  createHubOnlineRoom,
  joinHubOnlineRoom,
  subscribeHubState,
} from './services/hubOnlineClient';
import {
  clearVariantSave,
  loadVariantSave,
  recordVariantMatchHistory,
  saveVariantGame,
} from './storage';
import { AddOnPackId, DigitalToolId, HubGameState, VariantId, VariantSettings } from './types';

type HubScreen = 'hub_home' | 'uno_zero' | 'variant_setup' | 'variant_game' | 'guide' | 'settings';

export function UnoGameHubApp() {
  const [screen, setScreen] = useState<HubScreen>(() =>
    getRoomCodeFromUrl() ? 'uno_zero' : 'hub_home'
  );
  const [returnScreen, setReturnScreen] = useState<HubScreen>('hub_home');
  const [selectedVariant, setSelectedVariant] = useState<VariantId>('uno-classic');
  const [selectedPacks, setSelectedPacks] = useState<AddOnPackId[]>([]);
  const [selectedTools, setSelectedTools] = useState<DigitalToolId[]>([]);
  const [activeState, setActiveState] = useState<HubGameState | null>(null);
  const [onlineRoomCode, setOnlineRoomCode] = useState<string | null>(null);
  const recordedMatchRef = useRef<string | null>(null);

  // Subscribe to real-time Hub Online state updates
  useEffect(() => {
    if (!onlineRoomCode) return;
    return subscribeHubState((incoming) => {
      setActiveState(incoming);
    });
  }, [onlineRoomCode]);

  // Auto-save active variant state (isolated per variant)
  useEffect(() => {
    if (!activeState) return;
    if (activeState.phase === 'game_over') {
      clearVariantSave(activeState.variantId);
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
    } else {
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

  const handleStartVariantGame = async (
    variantId: Exclude<VariantId, 'uno-zero'>,
    mode: 'local' | 'ai' | 'online',
    playerNames: string[],
    settings: VariantSettings,
    joinCode?: string
  ) => {
    const meta = getVariantMetadata(variantId);
    const ruleset = getRuleset(variantId);

    if (mode === 'online' && joinCode) {
      const joined = await joinHubOnlineRoom(joinCode, playerNames[0] || 'Pemain');
      if (joined.ok && joined.state) {
        setOnlineRoomCode(joinCode);
        setActiveState(joined.state);
        setScreen('variant_game');
        return;
      }
    }

    const effectiveMode = mode === 'online' ? 'local' : mode;
    const playerInits = makeDefaultPlayers(playerNames, effectiveMode, meta.isTeamGame);
    const fresh = ruleset.initializeGame(playerInits, mode, settings);

    if (mode === 'online') {
      const created = await createHubOnlineRoom(playerNames[0] || 'Host', variantId, settings, fresh);
      setOnlineRoomCode(created.ok && created.code ? created.code : null);
    } else {
      setOnlineRoomCode(null);
    }

    setActiveState(fresh);
    setScreen('variant_game');
  };

  const handleUpdateState = (updater: (prev: HubGameState) => HubGameState) => {
    setActiveState((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      if (onlineRoomCode && next !== prev) {
        broadcastHubState(onlineRoomCode, next);
      }
      return next;
    });
  };

  const handleResumeVariant = (variantId: Exclude<VariantId, 'uno-zero'>) => {
    const saved = loadVariantSave(variantId);
    if (saved) {
      setOnlineRoomCode(null);
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
    return (
      <HubGamePage
        state={activeState}
        onlineRoomCode={onlineRoomCode}
        onUpdateState={handleUpdateState}
        onExitToHub={() => {
          setOnlineRoomCode(null);
          setScreen('hub_home');
        }}
        onRestartMatch={() => {
          const meta = getVariantMetadata(vId);
          const ruleset = getRuleset(vId);
          const names = activeState.players.map((p) => p.name);
          const modeForInit = activeState.mode === 'online' ? 'local' : activeState.mode;
          const inits = makeDefaultPlayers(names, modeForInit, meta.isTeamGame);
          const next = ruleset.initializeGame(inits, activeState.mode, activeState.settings);
          setActiveState(next);
          if (onlineRoomCode) broadcastHubState(onlineRoomCode, next);
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
