import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  BookOpen,
  Clock,
  Eye,
  Hand,
  Info,
  Megaphone,
  ShieldAlert,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { OnlinePlayerNotice } from '../../types/game';
import { haptics } from '../../services/haptics';
import { soundFX } from '../../services/sound';
import { getVariantMetadata } from '../catalog';
import { HubCardView } from '../components/HubCardView';
import { ModeSignatureHud } from '../components/ModeSignatureHud';
import { DirectionOrbitRing, getActiveColorGlow } from '../components/DirectionOrbitRing';
import { AvatarTurnTimerRing } from '../components/AvatarTurnTimerRing';
import { RadialColorPicker } from '../components/RadialColorPicker';
import { ActiveRulesBadges } from '../components/ActiveRulesBadges';
import { QuickEmoteBar } from '../components/QuickEmoteBar';
import { ConnectionStatusBanner } from '../components/ConnectionStatusBanner';
import { PodiumSummaryCard } from '../components/PodiumSummaryCard';
import { sendHubEmote, subscribeHubEmotes } from '../services/hubOnlineClient';
import { getModeTheme } from '../themes/modeThemes';
import {
  callHubUno,
  catchHubUno,
  confirmPassDevice,
  getCardDisplayColor,
  getCardDisplayType,
  getCardDisplayValue,
  getColorLabel,
  getValidColorsForState,
} from '../engine/core';
import { useColorblindMode } from '../utils/colorblind';
import { DEFAULT_MERCY_LIMIT, applyOptionalMercyRule } from '../engine/houseRules';
import { resolveReflexRaceTap } from '../expansions/addOnPacks';
import { triggerComebackUnoCombo } from '../expansions/packSystemEngine';
import { getRuleset } from '../rulesets';
import { passAfterFlipDraw } from '../rulesets/unoFlip';
import { hasAnyLegalOnoMove, resolveOno99Config } from '../rulesets/ono99';
import { finishDosMatching } from '../rulesets/dosMode';
import { TEAM_NAMES, getPartner, passAfterTeamsDraw } from '../rulesets/unoTeams';
import { MERCY_LIMIT } from '../rulesets/unoNoMercy';
import { attemptSpeedPlayCutIn, passAfterPartyDraw, takePartyPileUp } from '../rulesets/unoParty';
import { challengeLiarsClaim, passAfterLiarsDraw } from '../rulesets/unoLiars';
import { HubCardColor, HubGameState, HubOnlineAction, VariantId } from '../types';

interface HubGamePageProps {
  state: HubGameState;
  onlineRoomCode?: string | null;
  viewerPlayerId?: string | null;
  isOnlineHost?: boolean;
  isSpectator?: boolean;
  spectatorCount?: number;
  spectatorQueued?: boolean;
  onToggleSpectatorQueue?: () => void;
  connectionStatus?: 'connected' | 'reconnecting' | 'disconnected';
  onlineNotice?: OnlinePlayerNotice | null;
  onUpdateState: (updater: (prev: HubGameState) => HubGameState) => void;
  onOnlineAction?: (action: HubOnlineAction) => void;
  onExitToHub: () => void;
  onRestartMatch: () => void;
  onOpenGuide: () => void;
}

const COLOR_PILL_BG: Record<HubCardColor, string> = {
  red: 'bg-red-500',
  yellow: 'bg-amber-400',
  green: 'bg-emerald-500',
  blue: 'bg-blue-500',
  pink: 'bg-pink-500',
  teal: 'bg-teal-500',
  orange: 'bg-orange-500',
  purple: 'bg-purple-600',
  wild: 'bg-gradient-to-r from-red-500 via-amber-400 to-blue-500',
};

export const HubGamePage: React.FC<HubGamePageProps> = ({
  state,
  onlineRoomCode,
  viewerPlayerId,
  isOnlineHost = true,
  isSpectator = false,
  spectatorCount = 0,
  spectatorQueued = false,
  onToggleSpectatorQueue,
  connectionStatus = 'connected',
  onlineNotice,
  onUpdateState,
  onOnlineAction,
  onExitToHub,
  onRestartMatch,
  onOpenGuide,
}) => {
  const variantId = state.variantId as Exclude<VariantId, 'uno-zero'>;
  const ruleset = getRuleset(variantId);
  const meta = getVariantMetadata(variantId);
  const isOnline = state.mode === 'online';

  const dispatchAction = (
    action: HubOnlineAction,
    localUpdater: (prev: HubGameState) => HubGameState
  ) => {
    if (isOnline) {
      onOnlineAction?.(action);
    } else {
      onUpdateState(localUpdater);
    }
  };

  const [useFlexToggle, setUseFlexToggle] = useState(false);
  const [dosSelectedFirst, setDosSelectedFirst] = useState<string | null>(null);
  const [dosSelectedPile, setDosSelectedPile] = useState<number>(0);
  const [muted, setMuted] = useState(() => soundFX.isMuted());
  const [onlineSecondsLeft, setOnlineSecondsLeft] = useState<number | null>(null);
  const [autoSortHand, setAutoSortHand] = useState(false);
  const [armedCardId, setArmedCardId] = useState<string | null>(null);
  const [penaltyShakeKey, setPenaltyShakeKey] = useState(0);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [activeEmotes, setActiveEmotes] = useState<Record<string, { id: string; label: string }>>({});

  const showEmoteForPlayer = (playerId: string, id: string, label: string) => {
    setActiveEmotes((prev) => ({ ...prev, [playerId]: { id, label } }));
    setTimeout(() => {
      setActiveEmotes((prev) => {
        if (prev[playerId]?.id !== id) return prev;
        const copy = { ...prev };
        delete copy[playerId];
        return copy;
      });
    }, 2400);
  };

  useEffect(() => {
    if (!isOnline) return;
    return subscribeHubEmotes((evt) => {
      showEmoteForPlayer(evt.playerId, evt.id, evt.label);
    });
  }, [isOnline]);

  useEffect(() => {
    if (!showRulesModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowRulesModal(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showRulesModal]);

  const handleSendEmote = (emoteId: string, label: string) => {
    if (!viewerPlayer) return;
    if (isOnline) {
      sendHubEmote(emoteId, label);
    } else {
      showEmoteForPlayer(viewerPlayer.id, `loc_${Date.now()}`, label);
    }
  };
  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false
  );
  const [colorblindMode, setColorblindMode] = useColorblindMode();

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(pointer: coarse)');
    const onChange = (e: MediaQueryListEvent) => setIsTouchDevice(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const currentPlayer = state.players[state.currentPlayerIndex];
  const viewerPlayer = isSpectator
    ? null
    : isOnline
    ? state.players.find((p) => p.id === viewerPlayerId) ?? state.players[0]
    : state.mode === 'ai'
    ? state.players.find((p) => !p.isAI) ?? state.players[0]
    : currentPlayer;

  const isViewerTurn =
    !isSpectator &&
    (state.phase === 'playing' || state.phase === 'party_pile_up') &&
    Boolean(viewerPlayer) &&
    currentPlayer?.id === viewerPlayer?.id;

  const isPromptForHuman = isSpectator
    ? false
    : isOnline
    ? Boolean(state.pendingPrompt && viewerPlayer && state.pendingPrompt.actorId === viewerPlayer.id)
    : Boolean(
        state.pendingPrompt &&
          state.players.find((p) => p.id === state.pendingPrompt?.actorId && !p.isAI)
      );

  // Live countdown timer for server-authoritative online turn deadline
  useEffect(() => {
    if (!isOnline || !state.turnDeadline) {
      setOnlineSecondsLeft(null);
      return;
    }
    const tick = () => {
      setOnlineSecondsLeft(Math.max(0, Math.ceil((state.turnDeadline! - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 300);
    return () => clearInterval(id);
  }, [isOnline, state.turnDeadline]);

  // Sound FX & subtle shake feedback on events
  useEffect(() => {
    if (!state.lastEvent) return;
    const t = state.lastEvent.type;
    const isPenaltyEvent =
      t === 'uno_penalty' ||
      t === 'eliminated' ||
      t === 'timeout' ||
      t.includes('draw2') ||
      t.includes('draw4') ||
      t.includes('draw5') ||
      t.includes('draw6') ||
      t.includes('draw10') ||
      t.includes('stack');

    if (t === 'uno_call' || t === 'speed_play') {
      soundFX.playUnoCall();
      haptics.unoCall();
    } else if (t === 'game_win' || t === 'round_end') {
      soundFX.playVictoryFanfare();
    } else if (isPenaltyEvent) {
      soundFX.playAlertBuzzer();
      haptics.penaltyHit();
      setPenaltyShakeKey((k) => k + 1);
    } else if (t === 'flip' || t === 'power_flip' || t === 'flex') {
      soundFX.playColumnMatch();
    } else {
      soundFX.playCardSlide();
    }
  }, [state.lastEvent?.id]);

  // Subtle haptic pulse when the viewer's turn begins
  useEffect(() => {
    if (isViewerTurn) {
      haptics.turnStart();
    }
  }, [isViewerTurn, state.currentPlayerIndex]);

  // Reset per-turn toggles
  useEffect(() => {
    setUseFlexToggle(false);
    setDosSelectedFirst(null);
    setArmedCardId(null);
  }, [state.currentPlayerIndex, state.roundNumber]);

  // Offline AI runs locally; online AI runs authoritatively on the server.
  useEffect(() => {
    if (!isPromptForHuman || state.pendingPrompt?.type !== 'color') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dispatchAction({ type: 'cancel_prompt' }, (prev) => ({
          ...prev,
          phase: 'playing',
          pendingPrompt: null,
        }));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPromptForHuman, state.pendingPrompt?.type]);

  useEffect(() => {
    if (isOnline) return;
    if (state.phase === 'round_over' || state.phase === 'game_over' || state.phase === 'pass_device') {
      return;
    }

    const promptActor = state.pendingPrompt
      ? state.players.find((p) => p.id === state.pendingPrompt?.actorId)
      : null;

    const needsAI = promptActor ? promptActor.isAI : currentPlayer?.isAI;
    if (!needsAI) return;

    const timer = setTimeout(() => {
      onUpdateState((prev) => {
        const pActor = prev.pendingPrompt
          ? prev.players.find((p) => p.id === prev.pendingPrompt?.actorId)
          : null;
        const curr = prev.players[prev.currentPlayerIndex];
        if (pActor && !pActor.isAI) return prev;
        if (!pActor && !curr?.isAI) return prev;

        const decision = ruleset.decideAIMove(prev);
        if (decision.type === 'resolve_prompt') {
          return ruleset.resolvePrompt(prev, decision.payload);
        }
        if (decision.type === 'draw') {
          return ruleset.handleDrawOrPass(prev, curr.id);
        }
        let working = prev;
        if (curr.hand.length === 2 && Math.random() < 0.85) {
          working = callHubUno(working, curr.id);
        }
        return ruleset.executeAction(working, curr.id, decision.move);
      });
    }, 900);

    return () => clearTimeout(timer);
  }, [
    state.phase,
    state.currentPlayerIndex,
    state.pendingPrompt?.actorId,
    state.pendingPrompt?.type,
    state.actionLog.length,
  ]);

  const modeTheme = getModeTheme(variantId, state.flipSide);
  const tableTheme = modeTheme.tableClass;

  const topDiscard = state.discardPile[state.discardPile.length - 1];
  const validColors = getValidColorsForState(state);

  // UNO Party / Speed Pack / Lobby House Rule Jump-In exact match check
  const speedCutCard =
    (state.variantId === 'uno-party' ||
      (state.speedPhaseTurns ?? 0) > 0 ||
      Boolean(state.settings.houseRuleJumpIn)) &&
    state.phase === 'playing' &&
    !isViewerTurn &&
    viewerPlayer &&
    topDiscard
      ? viewerPlayer.hand.find((c) =>
          state.variantId === 'uno-party'
            ? c.type === 'number' &&
              topDiscard.type === 'number' &&
              c.color === topDiscard.color &&
              c.value === topDiscard.value
            : c.color === topDiscard.color &&
              c.type === topDiscard.type &&
              (c.type !== 'number' || c.value === topDiscard.value)
        )
      : undefined;

  const executeCardPlay = (cardId: string) => {
    if (!isViewerTurn || !viewerPlayer) return;
    setArmedCardId(null);

    // DOS Mode: support discard_to_center stage, single match OR 2-card sum selection!
    if (state.variantId === 'dos-mode') {
      if (state.dosTurnState?.stage === 'discard_to_center') {
        dispatchAction(
          { type: 'play_card', move: { cardId } },
          (prev) => ruleset.executeAction(prev, viewerPlayer.id, { cardId })
        );
        setDosSelectedFirst(null);
        return;
      }
      if (dosSelectedFirst && dosSelectedFirst !== cardId) {
        const pairMove = {
          cardId: dosSelectedFirst,
          secondCardId: cardId,
          pileIndex: dosSelectedPile,
        };
        const pairValid = ruleset.validateMove(state, viewerPlayer.id, pairMove).valid;
        if (pairValid) {
          dispatchAction(
            { type: 'play_card', move: pairMove },
            (prev) => ruleset.executeAction(prev, viewerPlayer.id, pairMove)
          );
          setDosSelectedFirst(null);
          return;
        }
      }
      const singleMove = { cardId, pileIndex: dosSelectedPile };
      const singleValid = ruleset.validateMove(state, viewerPlayer.id, singleMove).valid;
      if (singleValid && !dosSelectedFirst) {
        dispatchAction(
          { type: 'play_card', move: singleMove },
          (prev) => ruleset.executeAction(prev, viewerPlayer.id, singleMove)
        );
      } else {
        setDosSelectedFirst(dosSelectedFirst === cardId ? null : cardId);
      }
      return;
    }

    const move = {
      cardId,
      useFlex: state.variantId === 'uno-flex' ? useFlexToggle : undefined,
    };
    dispatchAction(
      { type: 'play_card', move },
      (prev) => ruleset.executeAction(prev, viewerPlayer.id, move)
    );
  };

  const handleCardClick = (cardId: string) => {
    if (!isViewerTurn || !viewerPlayer) return;
    // On touch devices (non-DOS), require 2-step confirmation tap (or swipe up) to prevent misclicks.
    if (isTouchDevice && state.variantId !== 'dos-mode') {
      if (armedCardId !== cardId) {
        setArmedCardId(cardId);
        return;
      }
    }
    executeCardPlay(cardId);
  };

  const COLOR_SORT_ORDER: Record<string, number> = {
    red: 0,
    yellow: 1,
    green: 2,
    blue: 3,
    pink: 4,
    teal: 5,
    orange: 6,
    purple: 7,
    wild: 8,
  };

  const displayedHand = useMemo(() => {
    if (!viewerPlayer) return [];
    if (!autoSortHand) return viewerPlayer.hand;
    return [...viewerPlayer.hand].sort((a, b) => {
      const ca = COLOR_SORT_ORDER[getCardDisplayColor(a, state.flipSide)] ?? 9;
      const cb = COLOR_SORT_ORDER[getCardDisplayColor(b, state.flipSide)] ?? 9;
      if (ca !== cb) return ca - cb;
      const ta = getCardDisplayType(a, state.flipSide);
      const tb = getCardDisplayType(b, state.flipSide);
      if (ta === 'number' && tb === 'number') {
        return (getCardDisplayValue(a, state.flipSide) ?? 0) - (getCardDisplayValue(b, state.flipSide) ?? 0);
      }
      if (ta === 'number') return -1;
      if (tb === 'number') return 1;
      return ta.localeCompare(tb);
    });
  }, [viewerPlayer, autoSortHand, state.flipSide]);

  const handleDrawOrPass = () => {
    if (!isViewerTurn || !viewerPlayer) return;
    haptics.cardTap();
    dispatchAction(
      { type: 'draw_or_pass' },
      (prev) => ruleset.handleDrawOrPass(prev, viewerPlayer.id)
    );
  };

  // Desktop keyboard shortcuts during viewer's turn (ArrowLeft/Right, Enter/Space, D, U)
  useEffect(() => {
    if (!isViewerTurn || !viewerPlayer || showRulesModal || state.pendingPrompt) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = e.key;
      if (key === 'd' || key === 'D') {
        e.preventDefault();
        handleDrawOrPass();
        return;
      }

      if (key === 'u' || key === 'U') {
        if (
          !viewerPlayer.isOut &&
          !viewerPlayer.eliminated &&
          state.variantId !== 'ono-99' &&
          viewerPlayer.hand.length >= 1 &&
          viewerPlayer.hand.length <= 2 &&
          !viewerPlayer.calledUno
        ) {
          e.preventDefault();
          haptics.unoCall();
          dispatchAction({ type: 'call_uno' }, (prev) => callHubUno(prev, viewerPlayer.id));
        }
        return;
      }

      const playableIds = displayedHand
        .filter((card) =>
          state.variantId === 'dos-mode'
            ? true
            : ruleset.validateMove(state, viewerPlayer.id, {
                cardId: card.id,
                useFlex: state.variantId === 'uno-flex' ? useFlexToggle : undefined,
              }).valid
        )
        .map((c) => c.id);

      if (playableIds.length === 0) return;

      if (key === 'ArrowRight' || key === 'ArrowLeft') {
        e.preventDefault();
        const currIdx = armedCardId ? playableIds.indexOf(armedCardId) : -1;
        const nextIdx =
          key === 'ArrowRight'
            ? currIdx < 0
              ? 0
              : (currIdx + 1) % playableIds.length
            : currIdx <= 0
            ? playableIds.length - 1
            : currIdx - 1;
        setArmedCardId(playableIds[nextIdx]);
        haptics.cardTap();
        return;
      }

      if ((key === 'Enter' || key === ' ') && armedCardId && playableIds.includes(armedCardId)) {
        e.preventDefault();
        executeCardPlay(armedCardId);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isViewerTurn,
    viewerPlayer,
    showRulesModal,
    state.pendingPrompt,
    displayedHand,
    armedCardId,
    useFlexToggle,
    state,
  ]);

  // PASS & PLAY PRIVACY SCREEN
  if (state.phase === 'pass_device' && currentPlayer) {
    return (
      <div className={`min-h-screen ${tableTheme} flex items-center justify-center p-4 text-slate-100`}>
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md rounded-3xl bg-slate-950/90 border border-white/15 p-8 text-center space-y-5 shadow-2xl"
        >
          <div className="w-16 h-16 rounded-2xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center mx-auto">
            <Hand className="w-8 h-8 text-amber-300" />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-display font-bold uppercase tracking-widest text-amber-300">
              Pass &amp; Play • Privasi Kartu
            </p>
            <h2 className="font-display font-black italic text-3xl text-white">
              Giliran {currentPlayer.name}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300">
              Serahkan perangkat ke <strong>{currentPlayer.name}</strong> lalu tekan lanjutkan.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onUpdateState((prev) => confirmPassDevice(prev))}
            className="w-full min-h-12 py-3.5 px-5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-black text-base tracking-wide transition"
          >
            Lanjutkan &amp; Lihat Kartu Saya
          </button>
        </motion.div>
      </div>
    );
  }

  if (state.phase === 'round_over' || state.phase === 'game_over') {
    return (
      <PodiumSummaryCard
        state={state}
        meta={meta}
        tableTheme={tableTheme}
        isOnlineHost={isOnlineHost}
        isSpectator={isSpectator}
        spectatorQueued={spectatorQueued}
        onToggleSpectatorQueue={onToggleSpectatorQueue}
        onNextRound={() =>
          dispatchAction({ type: 'next_round' }, (prev) => ruleset.resetRound(prev))
        }
        onRematch={onRestartMatch}
        onExitToHub={onExitToHub}
      />
    );
  }

  const partner =
    state.variantId === 'uno-teams' && viewerPlayer
      ? getPartner(state.players, viewerPlayer.id)
      : undefined;

  return (
    <div className={`min-h-screen ${tableTheme} text-slate-100 flex flex-col justify-between transition-colors duration-300 relative overflow-x-hidden`}>
      {isOnline && <ConnectionStatusBanner status={connectionStatus} />}
      <header className={`relative z-20 px-3 sm:px-6 py-2.5 ${modeTheme.headerBgClass} border-b ${modeTheme.headerBorderClass} flex items-center justify-between gap-2`}>
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onExitToHub}
            aria-label="Kembali ke UNO Game Hub"
            title="Kembali ke UNO Game Hub"
            className="min-h-11 min-w-11 shrink-0 p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 flex items-center justify-center transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <span className="font-display font-black italic text-sm sm:text-base text-white truncate max-w-[180px] sm:max-w-none">
                {meta.name}
              </span>
              <span className={`hidden xs:inline-block px-2 py-0.5 rounded-lg bg-slate-900/90 border ${modeTheme.headerBorderClass} ${modeTheme.accentTextClass} text-[10px] font-display font-black uppercase`}>
                {modeTheme.signatureTag}
              </span>
              {onlineRoomCode && (
                <span className="px-2 py-0.5 rounded-lg bg-sky-950/90 border border-sky-400/50 text-sky-200 text-[10px] font-mono font-black">
                  ROOM: {onlineRoomCode}
                </span>
              )}
              {isOnline && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                    connectionStatus === 'connected'
                      ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-400/40'
                      : connectionStatus === 'reconnecting'
                      ? 'bg-amber-950/90 text-amber-200 border border-amber-400/40'
                      : 'bg-rose-950/90 text-rose-200 border border-rose-400/40'
                  }`}
                >
                  {connectionStatus === 'connected' ? (
                    <Wifi className="w-3 h-3" />
                  ) : (
                    <WifiOff className="w-3 h-3" />
                  )}
                  {connectionStatus === 'connected'
                    ? 'Online'
                    : connectionStatus === 'reconnecting'
                    ? 'Menghubungkan...'
                    : 'Offline'}
                </span>
              )}
              {isOnline && onlineSecondsLeft !== null && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black tabular-nums ${
                    onlineSecondsLeft <= 5
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-800 text-amber-300'
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  {onlineSecondsLeft}d
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-300 flex items-center gap-2">
              <span>Ronde {state.roundNumber}</span>
              <span>•</span>
              <span>{state.direction === 1 ? '↻ Searah' : '↺ Balik'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            aria-pressed={colorblindMode}
            onClick={() => setColorblindMode(!colorblindMode)}
            aria-label={colorblindMode ? 'Nonaktifkan Mode Buta Warna' : 'Aktifkan Mode Buta Warna'}
            title={colorblindMode ? 'Mode Buta Warna: Aktif' : 'Mode Buta Warna: Nonaktif'}
            className={`min-h-11 min-w-11 p-2.5 rounded-xl border flex items-center justify-center transition ${
              colorblindMode
                ? 'bg-amber-400 border-amber-300 text-slate-950'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowRulesModal(true)}
            aria-label="Lihat aturan aktif meja ini"
            title="Aturan Aktif"
            className="min-h-11 min-w-11 p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-300 flex items-center justify-center transition"
          >
            <Info className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onOpenGuide}
            aria-label={`Panduan ${meta.name}`}
            title={`Panduan ${meta.name}`}
            className="min-h-11 min-w-11 p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 flex items-center justify-center transition"
          >
            <BookOpen className="w-4 h-4 text-sky-400" />
          </button>
          <button
            type="button"
            onClick={() => setMuted(soundFX.toggleMute())}
            aria-label={muted ? 'Nyalakan Efek Suara' : 'Bisukan Efek Suara'}
            title={muted ? 'Nyalakan Efek Suara' : 'Bisukan Efek Suara'}
            className="min-h-11 min-w-11 p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 flex items-center justify-center transition"
          >
            {muted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </header>

      {/* Players Strip */}
      <section className="px-3 sm:px-6 pt-3">
        <div className="max-w-5xl mx-auto flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {state.players.map((p, idx) => {
            const isCurrent = idx === state.currentPlayerIndex;
            const isPartner = partner && p.id === partner.id;
            const mercyLimit =
              state.variantId === 'uno-no-mercy'
                ? MERCY_LIMIT
                : state.settings.mercyRuleEnabled
                ? state.settings.mercyCardLimit ?? DEFAULT_MERCY_LIMIT
                : null;
            const nearMercy = mercyLimit !== null && p.hand.length >= mercyLimit - 5;
            const finishRank = state.finishOrder ? state.finishOrder.indexOf(p.id) + 1 : 0;

            const mercyPct =
              mercyLimit !== null
                ? Math.min(100, Math.round((p.hand.length / mercyLimit) * 100))
                : 0;
            const teamBorder =
              state.variantId === 'uno-teams'
                ? p.teamId === 0
                  ? 'border-sky-400/55'
                  : p.teamId === 1
                  ? 'border-rose-400/55'
                  : 'border-emerald-400/55'
                : '';

            return (
              <motion.div
                key={p.id}
                animate={
                  nearMercy && !p.eliminated
                    ? { x: [0, -1.5, 1.5, -1, 1, 0] }
                    : undefined
                }
                transition={
                  nearMercy && !p.eliminated
                    ? { repeat: Infinity, duration: 1.4, repeatDelay: 0.6 }
                    : undefined
                }
                className={`relative shrink-0 px-3 py-2 rounded-2xl border transition flex flex-col gap-1 min-w-[110px] ${
                  p.eliminated
                    ? 'bg-rose-950/60 border-rose-500/40 opacity-60'
                    : isCurrent
                    ? 'bg-amber-400/20 border-amber-400 shadow-lg'
                    : `bg-slate-900/75 ${teamBorder || 'border-white/10'}`
                }`}
              >
                <AnimatePresence>
                  {activeEmotes[p.id] && (
                    <motion.div
                      key={activeEmotes[p.id].id}
                      initial={{ opacity: 0, y: 6, scale: 0.85 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.9 }}
                      className="pointer-events-none absolute -top-3 right-2 z-30 px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 font-display font-black text-[11px] shadow-lg border border-amber-200"
                    >
                      {activeEmotes[p.id].label}
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex items-center gap-2">
                  <AvatarTurnTimerRing
                    name={p.name}
                    isCurrent={isCurrent}
                    secondsLeft={isCurrent ? onlineSecondsLeft : null}
                    maxSeconds={30}
                    eliminated={p.eliminated}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {isOnline && !p.isAI && (
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            p.connected === false ? 'bg-rose-500' : 'bg-emerald-400'
                          }`}
                          title={p.connected === false ? 'Terputus' : 'Online'}
                        />
                      )}
                      <span className="font-display font-bold text-xs sm:text-sm text-white truncate max-w-[92px]">
                        {p.name}
                      </span>
                      {isOnline && p.connected === false && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-500/30 text-rose-200 text-[9px] font-black">
                          OFFLINE
                        </span>
                      )}
                      {isPartner && (
                        <span className="px-1.5 py-0.5 rounded bg-sky-500/30 text-sky-200 text-[9px] font-black">
                          REKAN
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-300 flex items-center gap-2">
                      {p.eliminated ? (
                        <span className="text-rose-400 font-black">TERSINGKIR</span>
                      ) : p.isOut ? (
                        <span className="text-emerald-300 font-black">
                          {finishRank > 0 ? `JUARA #${finishRank}` : 'KELUAR'}
                        </span>
                      ) : (
                        <span className={nearMercy ? 'text-rose-300 font-black' : ''}>
                          {p.hand.length} kartu
                          {mercyLimit !== null ? ` / ${mercyLimit}` : ''}
                        </span>
                      )}
                      {p.powerActive !== undefined && (
                        <span className={p.powerActive ? 'text-emerald-300 font-black' : 'text-rose-300 font-black'}>
                          {p.powerActive ? 'FLEX ON' : 'FLEX OFF'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Visual Mercy Meter Bar (No Mercy & Optional Mercy Rule) */}
                {mercyLimit !== null && !p.eliminated && !p.isOut && (
                  <div className="w-full h-1.5 rounded-full bg-slate-950/90 overflow-hidden border border-white/10">
                    <div
                      className={`h-full transition-all duration-300 ${
                        mercyPct >= 80
                          ? 'bg-rose-500'
                          : mercyPct >= 55
                          ? 'bg-amber-400'
                          : 'bg-emerald-400'
                      }`}
                      style={{ width: `${mercyPct}%` }}
                    />
                  </div>
                )}

                {state.unoVulnerablePlayerId === p.id &&
                  viewerPlayer &&
                  p.id !== viewerPlayer.id && (
                    <button
                      type="button"
                      onClick={() =>
                        dispatchAction({ type: 'catch_uno' }, (prev) =>
                          applyOptionalMercyRule(catchHubUno(prev, viewerPlayer.name))
                        )
                      }
                      className="mt-1 w-full min-h-9 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-display font-black text-[11px] flex items-center justify-center gap-1 shadow-md transition"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      CATCH! (+2)
                    </button>
                  )}
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Center Table Arena */}
      <motion.main
        key={`arena-${penaltyShakeKey}`}
        animate={penaltyShakeKey > 0 ? { x: [0, -6, 6, -4, 4, 0] } : undefined}
        transition={{ duration: 0.36 }}
        className="flex-1 flex flex-col items-center justify-center px-4 py-3 gap-3.5"
      >
        {onlineNotice && (
          <div className="max-w-xl w-full text-center px-4 py-2 rounded-2xl bg-sky-500/20 border border-sky-400/50 text-xs font-bold text-sky-100 shadow-lg">
            🔔 {onlineNotice.message}
          </div>
        )}
        {isOnline && state.pendingPrompt && !isPromptForHuman && (
          <div className="max-w-xl w-full text-center px-4 py-2 rounded-2xl bg-amber-500/15 border border-amber-400/40 text-xs font-bold text-amber-200">
            ⏳ Menunggu {state.players.find((p) => p.id === state.pendingPrompt?.actorId)?.name ?? 'pemain'} menyelesaikan aksi...
          </div>
        )}
        {/* Event Toast */}
        <AnimatePresence mode="wait">
          {state.lastEvent && (
            <motion.div
              key={state.lastEvent.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="max-w-xl w-full text-center px-4 py-2 rounded-2xl bg-slate-950/75 border border-white/15 text-xs sm:text-sm font-semibold text-amber-100 shadow-lg"
            >
              {state.lastEvent.message}
            </motion.div>
          )}
        </AnimatePresence>

        {/* MODE-SPECIFIC SIGNATURE HUD & VISUAL OVERLAYS */}
        <ModeSignatureHud
          state={state}
          dosSelectedCard={
            dosSelectedFirst
              ? viewerPlayer?.hand.find((c) => c.id === dosSelectedFirst) ?? null
              : null
          }
          dosSelectedPileIndex={dosSelectedPile}
        />

        {/* UNIFIED 7-PACK GLOBAL HUD STATUS BAR (UNO Classic Only) */}
        {state.variantId === 'uno-classic' &&
          ((state.settings.activePacks ?? []).some((p) =>
            p === 'speed-pack' || p === 'frenemies-pack' || p === 'comeback-pack'
          ) ||
            state.nemesisLink ||
            (state.speedLevel ?? 1) > 1) && (
          <div className="flex flex-wrap items-center justify-center gap-2 max-w-2xl">
            {(state.settings.activePacks ?? []).includes('speed-pack') && (
              <div
                className={`px-3 py-1 rounded-2xl border font-display font-black text-[11px] flex items-center gap-1.5 ${
                  (state.speedLevel ?? 1) >= 3
                    ? 'bg-rose-950/90 border-rose-400 text-rose-200'
                    : (state.speedLevel ?? 1) === 2
                    ? 'bg-amber-950/90 border-amber-400 text-amber-200'
                    : 'bg-emerald-950/85 border-emerald-400/60 text-emerald-200'
                }`}
              >
                <span>⚡ SPEED LVL {state.speedLevel ?? 1}/3</span>
                {state.pendingDrawCount > 0 && <span className="text-[9px] opacity-80">(PAUSED)</span>}
              </div>
            )}

            {state.nemesisLink && (
              <div className="px-3 py-1 rounded-2xl bg-rose-950/90 border border-rose-400 text-rose-200 font-display font-black text-[11px]">
                😈 NEMESIS: {state.nemesisLink.targetName} (+2 • {state.nemesisLink.chargesLeft}/2)
              </div>
            )}

            {(state.settings.activePacks ?? []).includes('comeback-pack') && viewerPlayer && (() => {
              const letters = state.comebackUnoProgress?.[viewerPlayer.id] ?? [];
              const ready =
                letters.includes('U') && letters.includes('N') && letters.includes('O') && viewerPlayer.hand.length > 1;
              return (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-2xl bg-slate-950/85 border border-amber-400/50 text-[11px] font-display font-black">
                  <span className="text-slate-400">COMEBACK:</span>
                  {(['U', 'N', 'O'] as const).map((l) => (
                    <span
                      key={l}
                      className={`px-1.5 py-0.5 rounded ${
                        letters.includes(l) ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {l}
                    </span>
                  ))}
                  {ready && isViewerTurn && (
                    <button
                      type="button"
                      onClick={() =>
                        dispatchAction(
                          { type: 'pack_comeback_uno_combo' },
                          (prev) => triggerComebackUnoCombo(prev, viewerPlayer.id)
                        )
                      }
                      className="ml-1 px-2.5 py-0.5 rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 text-slate-950 text-[10px] font-black cursor-pointer"
                    >
                      🌟 KOMBO U-N-O!
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Wild Reflex Race ("TAP CEPAT!") */}
        {state.reflexRaceActive && viewerPlayer && (
          <button
            type="button"
            onClick={() =>
              dispatchAction(
                { type: 'pack_reflex_race_tap' },
                (prev) => resolveReflexRaceTap(prev, viewerPlayer.id)
              )
            }
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-yellow-300 via-orange-500 to-rose-600 text-slate-950 font-display font-black text-base shadow-2xl cursor-pointer"
          >
            🏁 TAP CEPAT SEKARANG! (Hindari +2 Kartu!)
          </button>
        )}

        {/* Stack Warning */}
        {state.pendingDrawCount > 0 && (
          <div className="px-4 py-2 rounded-2xl bg-rose-600/90 border-2 border-rose-300 text-white font-display font-black text-xs sm:text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            TUMPUKAN PENALTI: +{state.pendingDrawCount} KARTU!
          </div>
        )}

        {/* UNO Party! Direction Tracker Card & Link Cards HUD */}
        {state.variantId === 'uno-party' && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="px-3.5 py-1.5 rounded-2xl bg-slate-950/85 border border-amber-400/50 text-amber-200 font-display font-black text-xs flex items-center gap-1.5 shadow-md">
              <span>{state.direction === 1 ? '↻' : '↺'}</span>
              <span>
                DIRECTION TRACKER: {state.direction === 1 ? 'SEARAH JARUM JAM' : 'BERLAWANAN ARAH'}
              </span>
            </div>
            {state.drawnTogetherPair ? (
              <div className="px-3.5 py-1.5 rounded-2xl bg-fuchsia-950/90 border border-fuchsia-400 text-fuchsia-200 font-display font-black text-xs flex items-center gap-1.5 shadow-md">
                <span>🔗 LINK CARDS:</span>
                <span>
                  {state.players.find((p) => p.id === state.drawnTogetherPair?.[0])?.name ?? 'P1'} ↔{' '}
                  {state.players.find((p) => p.id === state.drawnTogetherPair?.[1])?.name ?? 'P2'}
                </span>
              </div>
            ) : (
              <div className="px-3 py-1.5 rounded-2xl bg-slate-900/75 border border-white/10 text-slate-400 font-display font-bold text-[11px]">
                🔗 Link Cards: Di Meja (Belum Aktif)
              </div>
            )}
          </div>
        )}

        {/* UNO Party! Wild Pile Up Mini-Pile Banner */}
        {state.phase === 'party_pile_up' && state.partyPileUp && (
          <div className="w-full max-w-md px-4 py-3 rounded-3xl bg-indigo-950/90 border-2 border-amber-400 shadow-2xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <HubCardView
                card={state.partyPileUp.cards[state.partyPileUp.cards.length - 1]}
                size="sm"
              />
              <div className="space-y-0.5">
                <div className="text-[11px] font-display font-black uppercase tracking-wider text-amber-300">
                  📚 WILD PILE UP AKTIF! ({state.partyPileUp.cards.length} KARTU)
                </div>
                <div className="text-xs text-slate-200">
                  Tumpuk kartu warna{' '}
                  <strong className="text-white">{getColorLabel(state.partyPileUp.color)}</strong>{' '}
                  atau <strong>Wild</strong>!
                </div>
              </div>
            </div>
            {isViewerTurn && viewerPlayer && (
              <button
                type="button"
                onClick={() =>
                  dispatchAction(
                    { type: 'party_take_pile_up' },
                    (prev) => takePartyPileUp(prev, viewerPlayer.id)
                  )
                }
                className="shrink-0 px-3.5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-display font-black text-xs shadow-lg cursor-pointer"
              >
                Ambil +{state.partyPileUp.cards.length} Kartu
              </button>
            )}
          </div>
        )}

        {/* SPECIAL MODE CENTER ARENAS */}
        {state.variantId === 'ono-99' ? (
          <div className="flex flex-col items-center gap-3">
            {(() => {
              const total = state.onoTotal ?? 0;
              const pct = Math.min(100, Math.max(0, Math.round((total / 99) * 100)));
              const isCritical = total >= 85;
              const isWarning = total >= 70 && total < 85;
              return (
                <motion.div
                  key={total}
                  initial={{ scale: 0.94 }}
                  animate={{ scale: isCritical ? [1, 1.04, 1] : 1 }}
                  transition={isCritical ? { repeat: Infinity, duration: 0.9 } : { duration: 0.2 }}
                  className={`relative w-48 h-48 rounded-full border-4 flex flex-col items-center justify-center shadow-2xl transition-colors ${
                    isCritical
                      ? 'bg-rose-950/95 border-rose-400 shadow-rose-500/40'
                      : isWarning
                      ? 'bg-amber-950/90 border-amber-400 shadow-amber-500/30'
                      : 'bg-slate-950/90 border-emerald-400 shadow-emerald-500/20'
                  }`}
                >
                  <span className="text-[10px] font-display font-black uppercase tracking-widest text-amber-300">
                    TOTAL ONO 99
                  </span>
                  <span
                    className={`font-display font-black italic text-6xl leading-none my-1 ${
                      isCritical ? 'text-rose-200' : isWarning ? 'text-amber-200' : 'text-white'
                    }`}
                  >
                    {total}
                  </span>
                  <div className="w-28 h-2 rounded-full bg-slate-900 overflow-hidden border border-white/15 my-1">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isCritical ? 'bg-rose-500' : isWarning ? 'bg-amber-400' : 'bg-emerald-400'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-300 font-bold">
                    Batas: &lt; 99{' '}
                    {(state.onoMustPlayCount ?? 1) > 1 ? `• Wajib Main ${state.onoMustPlayCount}×!` : ''}
                  </span>
                </motion.div>
              );
            })()}
            {state.settings.ono99Edition === 'classic_1980s' && viewerPlayer && (
              <div className="text-xs font-display font-bold text-amber-300">
                Token Nyawa: {'❤️'.repeat(viewerPlayer.onoChips ?? 3)} ({viewerPlayer.onoChips ?? 3}/3)
              </div>
            )}
            {isViewerTurn &&
              viewerPlayer &&
              !hasAnyLegalOnoMove(
                viewerPlayer.hand,
                state.onoTotal ?? 0,
                resolveOno99Config(state.settings)
              ) && (
                <button
                  type="button"
                  onClick={handleDrawOrPass}
                  className="min-h-11 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-display font-black text-xs shadow-lg transition"
                >
                  Tidak Ada Kartu Aman (&lt; 99): Buka Kartu &amp; Tersingkir
                </button>
              )}
          </div>
        ) : state.variantId === 'dos-mode' && state.dosCenterPiles ? (
          <div className="flex flex-col items-center gap-3 w-full max-w-2xl">
            {state.dosTurnState?.stage === 'discard_to_center' && (
              <div className="px-4 py-2 rounded-xl bg-amber-400 text-slate-950 font-display font-black text-xs sm:text-sm shadow-lg">
                Refill selesai. Pilih {state.dosTurnState.pendingBonusDiscards} kartu di tangan untuk diletakkan ke Center Row.
              </div>
            )}
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-5">
              {state.dosCenterPiles.map((pile, pi) => {
                const top = pile[pile.length - 1];
                const active = dosSelectedPile === pi;
                const isMatched = Boolean(state.dosTurnState?.matchedPileIndices.includes(pi));
                return (
                  <button
                    key={pi}
                    type="button"
                    disabled={isMatched || state.dosTurnState?.stage === 'discard_to_center'}
                    onClick={() => setDosSelectedPile(pi)}
                    className={`p-3 rounded-3xl border-2 flex flex-col items-center gap-1.5 cursor-pointer transition ${
                      isMatched
                        ? 'bg-emerald-950/60 border-emerald-400/50 opacity-55 cursor-not-allowed'
                        : active
                        ? 'bg-cyan-400/20 border-cyan-300 shadow-xl'
                        : 'bg-slate-900/75 border-white/15 hover:border-white/40'
                    }`}
                  >
                    <span className="text-[10px] font-display font-black text-cyan-300">
                      {isMatched
                        ? `✓ PILE #${pi + 1} COCOK`
                        : `PILE #${pi + 1} (Target: ${top?.type === 'wild_number' ? '#' : top?.value ?? 2})`}
                    </span>
                    <HubCardView card={top} size="md" />
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {state.dosTurnState?.stage === 'matching' &&
              state.dosTurnState.matchedPileIndices.length > 0 ? (
                <button
                  type="button"
                  disabled={!isViewerTurn}
                  onClick={() =>
                    viewerPlayer &&
                    dispatchAction(
                      { type: 'dos_finish_matching' },
                      (prev) => finishDosMatching(prev, viewerPlayer.id)
                    )
                  }
                  className="px-4 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-display font-black cursor-pointer shadow-lg"
                >
                  ✅ SELESAI COCOKKAN ({state.dosTurnState.matchedPileIndices.length} Pile) → REFILL &amp; LANJUT
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!isViewerTurn || state.dosTurnState?.stage === 'discard_to_center'}
                  onClick={handleDrawOrPass}
                  className="px-4 py-2 rounded-xl bg-slate-900/90 border border-slate-600 text-xs font-bold cursor-pointer disabled:opacity-40"
                >
                  {state.dosTurnState?.mustDiscardToCenterIfNoMatch
                    ? 'Buang 1 Kartu ke Center Row'
                    : `Ambil 1 Kartu (${state.drawPile.length})`}
                </button>
              )}
              {dosSelectedFirst && state.dosTurnState?.stage !== 'discard_to_center' && (
                <span className="px-3 py-1.5 rounded-xl bg-amber-400/20 border border-amber-400 text-amber-200 text-xs font-bold">
                  Pilih kartu ke-2 untuk dijumlahkan ke Pile #{dosSelectedPile + 1}!
                </span>
              )}
            </div>
          </div>
        ) : (
          <div
            className="relative flex items-center justify-center gap-6 sm:gap-10 px-6 py-4 rounded-3xl transition-shadow duration-500"
            style={{
              boxShadow: `0 0 60px ${getActiveColorGlow(state.activeColor)}`,
            }}
          >
            <div className="flex flex-col items-center gap-1.5 z-10">
              <HubCardView
                variantId={variantId}
                faceDown
                flipSide={state.flipSide}
                size="md"
                onClick={isViewerTurn ? handleDrawOrPass : undefined}
              />
              <span className="text-[11px] font-bold text-slate-300">
                {state.pendingDrawCount > 0
                  ? `Ambil +${state.pendingDrawCount}`
                  : `Draw (${state.drawPile.length})`}
              </span>
            </div>

            <div className="flex flex-col items-center gap-2 z-10">
              <div className="relative">
                <DirectionOrbitRing
                  direction={state.direction}
                  activeColor={state.activeColor}
                />
                <div
                  className={
                    state.variantId === 'uno-liars'
                      ? 'relative z-10 p-2 rounded-3xl bg-violet-950/70 border border-violet-400/45 shadow-xl shadow-violet-500/20'
                      : 'relative z-10'
                  }
                >
                  <AnimatePresence mode="popLayout">
                    <motion.div
                      key={topDiscard?.id ?? 'empty'}
                      initial={{ scale: 1.16, y: -18, rotate: state.direction === 1 ? -5 : 5, opacity: 0 }}
                      animate={{ scale: 1, y: 0, rotate: 0, opacity: 1 }}
                      exit={{ scale: 0.9, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                    >
                      <HubCardView
                        variantId={variantId}
                        card={topDiscard}
                        faceDown={Boolean(
                          state.variantId === 'uno-liars' && (state.phase === 'liar_challenge' || state.liarsTopClaim)
                        )}
                        flipSide={state.flipSide}
                        size="md"
                      />
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
              <div className="relative z-10 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950/90 border border-white/15 text-xs font-bold">
                <span className={`w-2.5 h-2.5 rounded-full ${COLOR_PILL_BG[state.activeColor]}`} />
                {state.variantId === 'uno-liars' && state.liarsTopClaim
                  ? `Klaim: ${getColorLabel(state.liarsTopClaim.color)} ${
                      state.liarsTopClaim.type === 'number'
                        ? state.liarsTopClaim.value
                        : state.liarsTopClaim.type.toUpperCase()
                    }`
                  : getColorLabel(state.activeColor)}
              </div>
            </div>
          </div>
        )}

        {/* Action Strip */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {/* UNO Flip, UNO Teams, UNO Party & Liar's UNO Draw-Then-Play-Or-Pass Button */}
          {(state.variantId === 'uno-flip' ||
            state.variantId === 'uno-teams' ||
            state.variantId === 'uno-party' ||
            state.variantId === 'uno-liars') &&
            state.drawnPlayableCardId &&
            isViewerTurn &&
            viewerPlayer && (
              <button
                type="button"
                onClick={() =>
                  dispatchAction({ type: 'pass_after_draw' }, (prev) =>
                    prev.variantId === 'uno-teams'
                      ? passAfterTeamsDraw(prev, viewerPlayer.id)
                      : prev.variantId === 'uno-party'
                      ? passAfterPartyDraw(prev, viewerPlayer.id)
                      : prev.variantId === 'uno-liars'
                      ? passAfterLiarsDraw(prev, viewerPlayer.id)
                      : passAfterFlipDraw(prev, viewerPlayer.id)
                  )
                }
                className="px-4 py-2 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-amber-400/60 text-amber-200 font-display font-black text-xs shadow-lg cursor-pointer"
              >
                ⏭️ SIMPAN KARTU &amp; LEWATI GILIRAN
              </button>
            )}

          {/* Liar's UNO: Open Challenge button for ANY other player */}
          {state.variantId === 'uno-liars' &&
            state.phase === 'liar_challenge' &&
            state.liarClaim &&
            viewerPlayer &&
            viewerPlayer.id !== state.liarClaim.actorId &&
            viewerPlayer.id !== state.pendingPrompt?.actorId && (
              <button
                type="button"
                onClick={() =>
                  dispatchAction(
                    { type: 'challenge_liars' },
                    (prev) => challengeLiarsClaim(prev, viewerPlayer.id)
                  )
                }
                className="px-4 py-2 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-display font-black text-xs shadow-xl cursor-pointer"
              >
                🚨 TANTANG BOHONG! ({state.liarClaim.actorName})
              </button>
            )}

          {/* UNO Party / Speed Pack Speed Jump-In */}
          {speedCutCard && viewerPlayer && (
            <button
              type="button"
              onClick={() =>
                dispatchAction({ type: 'speed_jump_in', cardId: speedCutCard.id }, (prev) =>
                  attemptSpeedPlayCutIn(prev, viewerPlayer.id, speedCutCard.id)
                )
              }
              className="px-4 py-2 rounded-2xl bg-gradient-to-r from-yellow-300 to-rose-500 text-slate-950 font-display font-black text-xs shadow-xl flex items-center gap-1.5 cursor-pointer"
            >
              <Zap className="w-4 h-4 fill-current" />
              SPEED PLAY! POTONG GILIRAN!
            </button>
          )}

          {/* UNO Flex Interactive 2-Sided Power Card */}
          {state.variantId === 'uno-flex' && viewerPlayer && (
            <motion.button
              type="button"
              disabled={!viewerPlayer.powerActive || !isViewerTurn}
              onClick={() => setUseFlexToggle((v) => !v)}
              whileHover={viewerPlayer.powerActive && isViewerTurn ? { scale: 1.05 } : undefined}
              whileTap={viewerPlayer.powerActive && isViewerTurn ? { scale: 0.95 } : undefined}
              className={`px-4 py-2.5 rounded-2xl border-2 font-display font-black text-xs flex items-center gap-2 shadow-xl transition ${
                !viewerPlayer.powerActive
                  ? 'bg-gradient-to-r from-rose-950 to-red-950 border-rose-500/60 text-rose-300 cursor-not-allowed'
                  : useFlexToggle
                  ? 'bg-gradient-to-r from-emerald-400 via-lime-400 to-cyan-400 border-white text-slate-950 cursor-pointer ring-2 ring-emerald-300/60'
                  : 'bg-gradient-to-r from-emerald-600/30 to-teal-600/30 border-emerald-400 text-emerald-200 hover:bg-emerald-500/30 cursor-pointer'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                  viewerPlayer.powerActive
                    ? 'bg-emerald-400 text-slate-950'
                    : 'bg-rose-500 text-white'
                }`}
              >
                {viewerPlayer.powerActive ? '✓' : '✗'}
              </span>
              <Zap className="w-4 h-4" />
              {viewerPlayer.powerActive
                ? useFlexToggle
                  ? 'POWER CARD: MODE FLEX AKTIF ⚡'
                  : 'POWER CARD: HIJAU (Klik untuk FLEX)'
                : 'POWER CARD: MERAH (NONAKTIF)'}
            </motion.button>
          )}

          {/* UNO Call & Catch */}
          {viewerPlayer &&
            !viewerPlayer.isOut &&
            !viewerPlayer.eliminated &&
            state.variantId !== 'ono-99' &&
            viewerPlayer.hand.length >= 1 &&
            viewerPlayer.hand.length <= 2 &&
            !viewerPlayer.calledUno && (
              <button
                type="button"
                onClick={() =>
                  dispatchAction({ type: 'call_uno' }, (prev) => callHubUno(prev, viewerPlayer.id))
                }
                className="min-h-11 px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-black text-xs sm:text-sm uno-critical-pulse flex items-center gap-1.5 transition"
              >
                <Megaphone className="w-4 h-4" />
                {state.variantId === 'dos-mode' ? 'TERIAK DOS!' : 'TERIAK UNO!'}
              </button>
            )}

          {state.unoVulnerablePlayerId &&
            viewerPlayer &&
            state.unoVulnerablePlayerId !== viewerPlayer.id && (
              <button
                type="button"
                onClick={() =>
                  dispatchAction({ type: 'catch_uno' }, (prev) =>
                    applyOptionalMercyRule(catchHubUno(prev, viewerPlayer.name))
                  )
                }
                className="px-4 py-2 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-display font-black text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldAlert className="w-4 h-4" />
                TANGKAP UNO! (+2)
              </button>
            )}
        </div>
      </motion.main>

      {isSpectator ? (
        <section
          aria-label="Bar mode penonton"
          className="px-4 sm:px-6 pb-safe pt-3 bg-slate-950/95 border-t border-sky-400/35"
        >
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs sm:text-sm text-sky-200 font-semibold">
              <Eye className="w-4 h-4 text-sky-400 shrink-0" />
              <span>
                Mode Penonton Aktif ({spectatorCount} penonton) • Isi kartu pemain disembunyikan
              </span>
            </div>
            {onToggleSpectatorQueue && (
              <button
                type="button"
                aria-pressed={spectatorQueued}
                onClick={onToggleSpectatorQueue}
                className={`min-h-11 px-4 py-2 rounded-xl font-display font-black text-xs transition shrink-0 ${
                  spectatorQueued
                    ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950'
                    : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                }`}
              >
                {spectatorQueued
                  ? 'Terdaftar untuk Ronde Berikutnya'
                  : 'Ikut Main di Ronde Berikutnya'}
              </button>
            )}
          </div>
        </section>
      ) : (
        viewerPlayer && (
        <section
          aria-label="Kartu di tangan pemain"
          className="px-3 sm:px-6 pb-safe pt-3 bg-slate-950/95 border-t border-slate-800"
        >
          <div className="max-w-5xl mx-auto space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display font-black text-white">
                  Tangan {viewerPlayer.name} ({viewerPlayer.hand.length} kartu)
                </span>
                {isViewerTurn ? (
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-400 text-slate-950 text-[11px] font-black">
                    Giliranmu
                  </span>
                ) : (
                  <span className="text-slate-300">Menunggu {currentPlayer?.name}...</span>
                )}
                {isTouchDevice && armedCardId && (
                  <span className="text-[11px] font-bold text-emerald-300">
                    Tap sekali lagi atau geser ke atas untuk buang
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {state.variantId === 'uno-teams' && partner && (
                  <span className="text-[11px] text-sky-300 font-bold flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {TEAM_NAMES[viewerPlayer.teamId ?? 0]} • Rekan: {partner.name} ({partner.hand.length})
                  </span>
                )}
                <QuickEmoteBar onSendEmote={handleSendEmote} />
                <button
                  type="button"
                  aria-pressed={autoSortHand}
                  onClick={() => setAutoSortHand((prev) => !prev)}
                  className={`min-h-9 px-3 py-1.5 rounded-lg border text-[11px] font-display font-bold inline-flex items-center gap-1.5 transition ${
                    autoSortHand
                      ? 'bg-amber-400 text-slate-950 border-amber-300'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
                  }`}
                  title="Urutkan kartu berdasarkan warna dan nilai"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  {autoSortHand ? 'Urut: Warna & Nilai' : 'Urutkan'}
                </button>
              </div>
            </div>

            <div className="flex items-end gap-2 overflow-x-auto pb-2 pt-7 px-2 sm:px-1">
              {displayedHand.map((card) => {
                const validation = isViewerTurn
                  ? state.variantId === 'dos-mode'
                    ? { valid: true }
                    : ruleset.validateMove(state, viewerPlayer.id, {
                        cardId: card.id,
                        useFlex: state.variantId === 'uno-flex' ? useFlexToggle : undefined,
                      })
                  : { valid: false };

                return (
                  <div key={card.id} className="shrink-0">
                    <HubCardView
                      card={card}
                      flipSide={state.flipSide}
                      size="md"
                      playable={validation.valid}
                      selected={dosSelectedFirst === card.id}
                      armed={armedCardId === card.id && validation.valid}
                      dimmed={isViewerTurn && !validation.valid}
                      onClick={() => handleCardClick(card.id)}
                      onSwipeUp={() => executeCardPlay(card.id)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ))}

      <AnimatePresence>
        {showRulesModal && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Aturan aktif ${meta.name}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowRulesModal(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-5 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    Info Meja
                  </div>
                  <h3 className="font-display font-black text-lg text-white">
                    Aturan Aktif • {meta.name}
                  </h3>
                </div>
                <button
                  type="button"
                  aria-label="Tutup info aturan"
                  onClick={() => setShowRulesModal(false)}
                  className="min-h-11 min-w-11 p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ActiveRulesBadges
                variantId={state.variantId}
                settings={state.settings}
                playerCount={state.players.length}
              />
              <p className="text-xs text-slate-300 leading-relaxed">{meta.description}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isPromptForHuman && state.pendingPrompt && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="hub-prompt-modal-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.94, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    Aksi Interaktif
                  </div>
                  <h3
                    id="hub-prompt-modal-title"
                    className="font-display font-black text-base sm:text-lg text-white mt-0.5"
                  >
                    {state.pendingPrompt.message}
                  </h3>
                </div>
                {state.pendingPrompt.type === 'color' && (
                  <button
                    type="button"
                    aria-label="Tutup dialog pilih warna"
                    onClick={() =>
                      dispatchAction({ type: 'cancel_prompt' }, (prev) => ({
                        ...prev,
                        phase: 'playing',
                        pendingPrompt: null,
                      }))
                    }
                    className="min-h-11 min-w-11 p-2.5 rounded-xl bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700 flex items-center justify-center transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Radial 4-Quadrant Wild Color Picker */}
              {(state.pendingPrompt.type === 'color' || state.pendingPrompt.type === 'roulette_color') && (
                <RadialColorPicker
                  colors={validColors}
                  onSelect={(col) =>
                    dispatchAction({ type: 'resolve_prompt', payload: { color: col } }, (prev) =>
                      ruleset.resolvePrompt(prev, { color: col })
                    )
                  }
                />
              )}

              {/* UNO Flip, UNO Flex & UNO Party Wild Draw Challenge Modal */}
              {(state.pendingPrompt.type === 'flip_wild_challenge' ||
                state.pendingPrompt.type === 'flex_wild4_challenge' ||
                state.pendingPrompt.type === 'party_wild4_challenge') && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      dispatchAction(
                        { type: 'resolve_prompt', payload: { challengeChoice: 'trust' } },
                        (prev) => ruleset.resolvePrompt(prev, { challengeChoice: 'trust' })
                      )
                    }
                    className="py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-display font-black text-xs sm:text-sm cursor-pointer"
                  >
                    ✅ TERIMA PENALTI
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      dispatchAction(
                        { type: 'resolve_prompt', payload: { challengeChoice: 'challenge' } },
                        (prev) => ruleset.resolvePrompt(prev, { challengeChoice: 'challenge' })
                      )
                    }
                    className="py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-display font-black text-xs sm:text-sm cursor-pointer"
                  >
                    ⚔️ TANTANG! (CHALLENGE)
                  </button>
                </div>
              )}

              {/* Liar's UNO Wild Liar's Challenge Modal (Challenge opponents 1-by-1 or stop) */}
              {state.pendingPrompt.type === 'liars_wild_challenge' && state.wildLiarsChallenge && (
                <div className="space-y-3">
                  <div className="text-xs font-bold text-amber-200">
                    Warna Diminta: <strong>{getColorLabel(state.wildLiarsChallenge.chosenColor)}</strong> (Kartu Wild TIDAK dihitung!)
                  </div>
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {state.wildLiarsChallenge.submissions.map((sub) => (
                      <div
                        key={sub.playerId}
                        className="p-3 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-between gap-2"
                      >
                        <div>
                          <div className="font-display font-bold text-sm text-white">{sub.playerName}</div>
                          <div className="text-[11px] text-slate-300">
                            {sub.status === 'pending'
                              ? '🃏 1 kartu tertutup siap ditantang'
                              : sub.status === 'caught_lying'
                              ? '🚨 Ketahuan bohong (+1 kartu)'
                              : '😎 Jujur!'}
                          </div>
                        </div>
                        {sub.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() =>
                              dispatchAction(
                                {
                                  type: 'resolve_prompt',
                                  payload: { targetPlayerId: sub.playerId },
                                },
                                (prev) =>
                                  ruleset.resolvePrompt(prev, { targetPlayerId: sub.playerId })
                              )
                            }
                            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-display font-black text-xs cursor-pointer"
                          >
                            🚨 TANTANG
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      dispatchAction(
                        { type: 'resolve_prompt', payload: { challengeChoice: 'trust' } },
                        (prev) =>
                          ruleset.resolvePrompt(prev, { challengeChoice: 'trust' })
                      )
                    }
                    className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-black text-xs sm:text-sm cursor-pointer"
                  >
                    ✅ BERHENTI MENANTANG (BUANG SISA KARTU)
                  </button>
                </div>
              )}

              {/* Liar's UNO Challenge Modal */}
              {state.pendingPrompt.type === 'liar_claim' && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      dispatchAction(
                        { type: 'resolve_prompt', payload: { challengeChoice: 'trust' } },
                        (prev) => ruleset.resolvePrompt(prev, { challengeChoice: 'trust' })
                      )
                    }
                    className="py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-black text-sm cursor-pointer"
                  >
                    ✅ PERCAYA
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      dispatchAction(
                        { type: 'resolve_prompt', payload: { challengeChoice: 'challenge' } },
                        (prev) => ruleset.resolvePrompt(prev, { challengeChoice: 'challenge' })
                      )
                    }
                    className="py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-display font-black text-sm cursor-pointer"
                  >
                    🚨 TANTANG! (BOHONG!)
                  </button>
                </div>
              )}

              {/* Target Player Picker */}
              {(state.pendingPrompt.type === 'target_swap' ||
                state.pendingPrompt.type === 'target_draw2' ||
                state.pendingPrompt.type === 'target_draw4' ||
                state.pendingPrompt.type === 'target_point_taken' ||
                state.pendingPrompt.type === 'target_drawn_together' ||
                state.pendingPrompt.type === 'target_alliance' ||
                state.pendingPrompt.type === 'target_betrayal') && (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {state.players
                    .filter((p) => p.id !== state.pendingPrompt?.actorId && !p.eliminated && !p.isOut)
                    .map((target) => (
                      <button
                        key={target.id}
                        type="button"
                        onClick={() =>
                          dispatchAction(
                            {
                              type: 'resolve_prompt',
                              payload: { targetPlayerId: target.id },
                            },
                            (prev) =>
                              ruleset.resolvePrompt(prev, { targetPlayerId: target.id })
                          )
                        }
                        className="w-full p-3.5 rounded-2xl bg-slate-800 hover:bg-amber-400 hover:text-slate-950 border border-slate-700 font-display font-bold text-sm flex items-center justify-between cursor-pointer transition"
                      >
                        <span>{target.name}</span>
                        <span className="text-xs opacity-80">{target.hand.length} kartu</span>
                      </button>
                    ))}
                </div>
              )}

              {/* Pass Card Picker for UNO Teams */}
              {state.pendingPrompt.type === 'pass_to_partner' && viewerPlayer && (
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                  {viewerPlayer.hand.map((c) => (
                    <div key={c.id} className="shrink-0">
                      <HubCardView
                        card={c}
                        size="sm"
                        playable
                        onClick={() =>
                          dispatchAction(
                            { type: 'resolve_prompt', payload: { passCardId: c.id } },
                            (prev) => ruleset.resolvePrompt(prev, { passCardId: c.id })
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
