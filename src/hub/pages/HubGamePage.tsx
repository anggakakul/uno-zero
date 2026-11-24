import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Clock,
  Flame,
  Hand,
  Megaphone,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { OnlinePlayerNotice } from '../../types/game';
import { soundFX } from '../../services/sound';
import { getVariantMetadata } from '../catalog';
import { DigitalToolWidgets } from '../components/DigitalToolWidgets';
import { HubCardView } from '../components/HubCardView';
import {
  callHubUno,
  catchHubUno,
  confirmPassDevice,
  getColorLabel,
  getValidColorsForState,
} from '../engine/core';
import { resolveFlashReflex, triggerOverchargeBlast } from '../expansions/digitalTools';
import { resolveReflexRaceTap } from '../expansions/addOnPacks';
import { triggerComebackUnoCombo } from '../expansions/packSystemEngine';
import { getRuleset } from '../rulesets';
import { catchAttackUno } from '../rulesets/unoAttack';
import { passAfterFlipDraw } from '../rulesets/unoFlip';
import { hasAnyLegalOnoMove, resolveOno99Config } from '../rulesets/ono99';
import { finishDosMatching } from '../rulesets/dosMode';
import { passAfterExpressDraw } from '../rulesets/unoExpress';
import { passAfterJuniorDraw } from '../rulesets/unoJunior';
import { passAfterTeamsDraw } from '../rulesets/unoTeams';
import {
  DARE_LISTS_BY_CATEGORY,
  QUICK_CUSTOM_RULES,
  breakEmojiHold,
  maintainEmojiExpression,
} from '../rulesets/unoDareEmoji';
import {
  MAX_HOUSE_RULES,
  PRESET_HOUSE_RULES,
  attemptHouseRemixJumpIn,
  completeRuleQTE,
} from '../rulesets/unoHouseRemix';
import { MERCY_LIMIT } from '../rulesets/unoNoMercy';
import { attemptSpeedPlayCutIn, passAfterPartyDraw, takePartyPileUp } from '../rulesets/unoParty';
import { challengeLiarsClaim, passAfterLiarsDraw } from '../rulesets/unoLiars';
import {
  GOLF_TOTAL_ROUNDS,
  catchGolfUno,
  countFaceDownGolfCards,
  golfDiscardDrawn,
  golfTakeDiscard,
  golfTakeDraw,
  isGolfActionCard,
} from '../rulesets/unoGolf';
import {
  commitRummyTurn,
  findAvailableMeld,
  passAfterRummyDraw,
  playRummyMeld,
  revertRummyTurn,
} from '../rulesets/unoRummyUp';
import { TEAM_NAMES, getPartner } from '../rulesets/unoTeams';
import { handleTriplePlayTimeout } from '../rulesets/unoTriplePlay';
import { HubCardColor, HubGameState, HubOnlineAction, VariantId } from '../types';

interface HubGamePageProps {
  state: HubGameState;
  onlineRoomCode?: string | null;
  viewerPlayerId?: string | null;
  isOnlineHost?: boolean;
  connectionStatus?: 'connected' | 'reconnecting' | 'disconnected';
  onlineNotice?: OnlinePlayerNotice | null;
  onUpdateState: (updater: (prev: HubGameState) => HubGameState) => void;
  onOnlineAction?: (action: HubOnlineAction) => void;
  onExitToHub: () => void;
  onRestartMatch: () => void;
  onOpenGuide: () => void;
}

const COLOR_BUTTON_STYLE: Record<HubCardColor, string> = {
  red: 'bg-red-600 hover:bg-red-500 border-red-300',
  yellow: 'bg-amber-400 hover:bg-amber-300 text-slate-950 border-amber-200',
  green: 'bg-emerald-600 hover:bg-emerald-500 border-emerald-300',
  blue: 'bg-blue-600 hover:bg-blue-500 border-blue-300',
  pink: 'bg-pink-600 hover:bg-pink-500 border-pink-300',
  teal: 'bg-teal-600 hover:bg-teal-500 border-teal-300',
  orange: 'bg-orange-500 hover:bg-orange-400 border-orange-200',
  purple: 'bg-purple-700 hover:bg-purple-600 border-purple-300',
  wild: 'bg-slate-700 border-slate-400',
};

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
  const [selectedTriplePile, setSelectedTriplePile] = useState<number | null>(null);
  const [tippoSide, setTippoSide] = useState<'left' | 'right'>('left');
  const [dosSelectedFirst, setDosSelectedFirst] = useState<string | null>(null);
  const [dosSelectedPile, setDosSelectedPile] = useState<number>(0);
  const [golfDoubleFirst, setGolfDoubleFirst] = useState<string | null>(null);
  const [customRuleInput, setCustomRuleInput] = useState('');
  const [gameChangerSlot, setGameChangerSlot] = useState<number>(0);
  const [gameChangerColor, setGameChangerColor] = useState<HubCardColor>('red');
  const [showDareList, setShowDareList] = useState(false);
  const [darePickNum, setDarePickNum] = useState<number>(1);
  const [darePickColor, setDarePickColor] = useState<HubCardColor>('red');
  const [emojiStackCardId, setEmojiStackCardId] = useState<string>('');
  const [muted, setMuted] = useState(() => soundFX.isMuted());
  const [launcherShaking, setLauncherShaking] = useState(false);
  const [onlineSecondsLeft, setOnlineSecondsLeft] = useState<number | null>(null);

  const currentPlayer = state.players[state.currentPlayerIndex];
  const viewerPlayer = isOnline
    ? state.players.find((p) => p.id === viewerPlayerId) ?? state.players[0]
    : state.mode === 'ai'
    ? state.players.find((p) => !p.isAI) ?? state.players[0]
    : currentPlayer;

  const isViewerTurn =
    (state.phase === 'playing' || state.phase === 'party_pile_up') &&
    viewerPlayer &&
    currentPlayer?.id === viewerPlayer.id;

  const isPromptForHuman = isOnline
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

  // Sound FX feedback on events
  useEffect(() => {
    if (!state.lastEvent) return;
    const t = state.lastEvent.type;
    if (t === 'launcher_safe') soundFX.playLauncherSafeClick();
    else if (t === 'launcher_blast') soundFX.playLauncherBlast(state.lastAttackResult?.cardsLaunched ?? 3);
    else if (t === 'overload') soundFX.playOverloadSiren();
    else if (t === 'wild_clear') soundFX.playColumnMatch();
    else if (t === 'uno_call' || t === 'speed_play') soundFX.playUnoCall();
    else if (t === 'game_win' || t === 'round_end' || t === 'rummy_meld') soundFX.playVictoryFanfare();
    else if (
      t === 'uno_penalty' ||
      t === 'eliminated' ||
      t === 'timeout' ||
      t === 'tippo_fall' ||
      t === 'flash_fail'
    ) {
      soundFX.playAlertBuzzer();
    } else if (t === 'flip' || t === 'power_flip' || t === 'flex' || t === 'uno_spin' || t === 'uno_jackpot') {
      soundFX.playColumnMatch();
    } else {
      soundFX.playCardSlide();
    }
  }, [state.lastEvent?.id]);

  // Reset per-turn toggles
  useEffect(() => {
    setUseFlexToggle(false);
    setSelectedTriplePile(null);
    setDosSelectedFirst(null);
    setGolfDoubleFirst(null);
  }, [state.currentPlayerIndex, state.roundNumber]);

  // AI Automation (offline only — online AI runs authoritatively on server!)
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
        const shouldCallUno =
          prev.variantId === 'uno-golf'
            ? countFaceDownGolfCards(curr.golfSlots) === 2
            : curr.hand.length === 2;
        if (shouldCallUno && Math.random() < 0.85) {
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

  // UNO Triple Play 7-second Timer Mode countdown (offline only — server handles online!)
  useEffect(() => {
    if (
      isOnline ||
      state.variantId !== 'uno-triple-play' ||
      state.settings.triplePlayMode !== 'timer' ||
      state.phase !== 'playing' ||
      currentPlayer?.isAI
    ) {
      return;
    }
    const interval = setInterval(() => {
      onUpdateState((prev) => {
        if (prev.phase !== 'playing' || prev.turnTimerSeconds === undefined) return prev;
        if (prev.turnTimerSeconds <= 1) return handleTriplePlayTimeout(prev);
        soundFX.playTriplePlayTick(prev.turnTimerSeconds <= 4);
        return { ...prev, turnTimerSeconds: prev.turnTimerSeconds - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [state.variantId, state.settings.triplePlayMode, state.phase, state.currentPlayerIndex]);

  // UNO House Rules QTE AI Auto-Reaction (offline only — server handles online!)
  useEffect(() => {
    if (isOnline) return;
    if (state.phase !== 'house_rule_qte' || !state.activeRuleQTE) return;
    const pendingAIs = state.players.filter(
      (p) => p.isAI && !state.activeRuleQTE?.completedPlayerIds.includes(p.id)
    );
    if (pendingAIs.length === 0) return;

    const timer = setTimeout(() => {
      onUpdateState((prev) => {
        if (prev.phase !== 'house_rule_qte' || !prev.activeRuleQTE) return prev;
        const nextAI = prev.players.find(
          (p) => p.isAI && !prev.activeRuleQTE?.completedPlayerIds.includes(p.id)
        );
        return nextAI ? completeRuleQTE(prev, nextAI.id) : prev;
      });
    }, 900);
    return () => clearTimeout(timer);
  }, [state.phase, state.activeRuleQTE?.completedPlayerIds.length]);

  // UNO Flash Reflex Timer countdown (offline only — server handles online!)
  useEffect(() => {
    if (isOnline) return;
    const flash = state.toolState?.flashActive;
    if (!flash || state.phase !== 'playing') return;
    const interval = setInterval(() => {
      onUpdateState((prev) => {
        const f = prev.toolState?.flashActive;
        if (!f) return prev;
        if (f.secondsLeft <= 1) {
          return resolveFlashReflex(prev, f.targetPlayerId, false);
        }
        return {
          ...prev,
          toolState: {
            ...prev.toolState!,
            flashActive: { ...f, secondsLeft: f.secondsLeft - 1 },
          },
        };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [state.toolState?.flashActive?.targetPlayerId, state.phase]);

  const tableTheme =
    state.variantId === 'uno-flip'
      ? state.flipSide === 'dark'
        ? 'theme-flip-dark'
        : 'theme-flip-light'
      : meta.tableThemeClass;

  const topDiscard = state.discardPile[state.discardPile.length - 1];
  const validColors = getValidColorsForState(state);

  // UNO Party (Number cards ONLY!) / Speed Pack / House Remix Speed Jump-In exact match check
  const speedCutCard =
    (state.variantId === 'uno-party' ||
      (state.variantId === 'uno-house-remix' &&
        Boolean(state.houseRemixConfig?.speedJumpIn) &&
        state.pendingDrawCount === 0) ||
      (state.speedPhaseTurns ?? 0) > 0) &&
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

  // UNO Rummy-Up available meld check (supports 14-tile rack + 4 Starting Tiles on table!)
  const availableMeld =
    state.variantId === 'uno-rummy-up' && isViewerTurn && viewerPlayer
      ? findAvailableMeld(viewerPlayer.hand, false, state.rummyMelds ?? [])
      : null;

  const handleCardClick = (cardId: string) => {
    if (!isViewerTurn || !viewerPlayer) return;

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

    if (state.variantId === 'uno-triple-play' && state.triplePiles) {
      const targetPile =
        selectedTriplePile !== null
          ? selectedTriplePile
          : state.triplePiles.findIndex(
              (p, idx) =>
                p.lit &&
                ruleset.validateMove(state, viewerPlayer.id, { cardId, pileIndex: idx }).valid
            );
      if (targetPile < 0) return;
      const move = { cardId, pileIndex: targetPile, tippoSide };
      dispatchAction(
        { type: 'play_card', move },
        (prev) => ruleset.executeAction(prev, viewerPlayer.id, move)
      );
      return;
    }

    const move = {
      cardId,
      useFlex: state.variantId === 'uno-flex' ? useFlexToggle : undefined,
      tippoSide,
    };
    dispatchAction(
      { type: 'play_card', move },
      (prev) => ruleset.executeAction(prev, viewerPlayer.id, move)
    );
  };

  const handleDrawOrLauncher = () => {
    if (!isViewerTurn || !viewerPlayer) return;
    if (state.variantId === 'uno-attack' || (state.settings.activeTools ?? []).includes('uno-blast')) {
      setLauncherShaking(true);
      setTimeout(() => setLauncherShaking(false), 500);
    }
    dispatchAction(
      { type: 'draw_or_pass' },
      (prev) => ruleset.handleDrawOrPass(prev, viewerPlayer.id)
    );
  };

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
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 font-display font-black text-base tracking-wide shadow-xl cursor-pointer"
          >
            CONTINUE — LIHAT KARTU SAYA
          </button>
        </motion.div>
      </div>
    );
  }

  // ROUND OVER / GAME OVER OVERLAY
  if (state.phase === 'round_over' || state.phase === 'game_over') {
    const lastRound = state.roundHistory[state.roundHistory.length - 1];
    const isGameOver = state.phase === 'game_over';

    return (
      <div className={`min-h-screen ${tableTheme} flex items-center justify-center p-4 text-slate-100`}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg rounded-3xl bg-slate-950/90 border border-amber-400/35 p-6 sm:p-8 space-y-6 shadow-2xl"
        >
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-full bg-amber-400/20 border border-amber-400/50 flex items-center justify-center mx-auto">
              <Trophy className="w-8 h-8 text-amber-300" />
            </div>
            <div className="text-xs font-bold uppercase tracking-widest text-amber-300">
              {isGameOver ? `JUARA ${meta.name}!` : `RONDE ${state.roundNumber} SELESAI`}
            </div>
            <h2 className="font-display font-black italic text-3xl text-white">
              {lastRound?.winnerName ?? 'Pemenang'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300">{lastRound?.reason}</p>
          </div>

          {lastRound && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {lastRound.playerPoints.map((pp) => (
                <div
                  key={pp.playerId}
                  className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs sm:text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{pp.playerName}</span>
                    {pp.eliminated && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-500/25 text-rose-300 text-[10px] font-black">
                        KNOCK OUT
                      </span>
                    )}
                  </div>
                  <div className="font-display font-black text-amber-300">
                    {state.variantId === 'uno-junior'
                      ? pp.handPoints === 0
                        ? '🏆 JUARA!'
                        : `Sisa ${pp.handPoints} kartu`
                      : `${pp.totalScore} pts`}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5">
            {!isGameOver ? (
              isOnlineHost ? (
                <button
                  type="button"
                  onClick={() =>
                    dispatchAction({ type: 'next_round' }, (prev) => ruleset.resetRound(prev))
                  }
                  className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-500 text-slate-950 font-display font-black text-sm cursor-pointer"
                >
                  LANJUT RONDE {state.roundNumber + 1}
                </button>
              ) : (
                <div className="flex-1 py-3.5 px-4 rounded-2xl bg-slate-900 border border-slate-700 text-slate-300 text-center font-display font-bold text-xs sm:text-sm">
                  Menunggu Host memulai Ronde {state.roundNumber + 1}...
                </div>
              )
            ) : isOnlineHost ? (
              <button
                type="button"
                onClick={onRestartMatch}
                className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 font-display font-black text-sm flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                MAIN LAGI
              </button>
            ) : (
              <div className="flex-1 py-3.5 px-4 rounded-2xl bg-slate-900 border border-slate-700 text-slate-300 text-center font-display font-bold text-xs sm:text-sm">
                Menunggu Host memulai ulang...
              </div>
            )}
            <button
              type="button"
              onClick={onExitToHub}
              className="py-3.5 px-5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-display font-bold text-sm cursor-pointer"
            >
              Ke UNO Hub
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const partner =
    state.variantId === 'uno-teams' && viewerPlayer
      ? getPartner(state.players, viewerPlayer.id)
      : undefined;

  const isBlastActive =
    state.variantId === 'uno-attack' || (state.settings.activeTools ?? []).includes('uno-blast');

  return (
    <div className={`min-h-screen ${tableTheme} text-slate-100 flex flex-col justify-between transition-colors duration-500`}>
      {/* Top HUD */}
      <header className="px-3 sm:px-6 py-3 bg-slate-950/70 backdrop-blur-md border-b border-white/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExitToHub}
            className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-display font-black italic text-sm sm:text-base text-white">
                {meta.name}
              </span>
              {onlineRoomCode && (
                <span className="px-2 py-0.5 rounded-full bg-sky-500/25 border border-sky-400/50 text-sky-200 text-[10px] font-mono font-black">
                  ROOM: {onlineRoomCode}
                </span>
              )}
              {isOnline && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    connectionStatus === 'connected'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : connectionStatus === 'reconnecting'
                      ? 'bg-amber-500/25 text-amber-200 animate-pulse'
                      : 'bg-rose-500/25 text-rose-200'
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
                    ? 'Reconnecting...'
                    : 'Offline'}
                </span>
              )}
              {isOnline && onlineSecondsLeft !== null && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black ${
                    onlineSecondsLeft <= 5
                      ? 'bg-rose-500/30 text-rose-200 animate-pulse'
                      : 'bg-slate-800 text-amber-300'
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  {onlineSecondsLeft}s
                </span>
              )}
              {state.variantId === 'uno-flip' && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    state.flipSide === 'dark' ? 'bg-fuchsia-500 text-white' : 'bg-amber-300 text-slate-950'
                  }`}
                >
                  {state.flipSide === 'dark' ? '🌙 DARK' : '☀️ LIGHT'}
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-2">
              <span>Ronde {state.roundNumber}</span>
              <span>•</span>
              <span>{state.direction === 1 ? '↻ Searah' : '↺ Balik'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenGuide}
            className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-sky-400" />
          </button>
          <button
            type="button"
            onClick={() => setMuted(soundFX.toggleMute())}
            className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 cursor-pointer"
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
            const nearMercy = state.variantId === 'uno-no-mercy' && p.hand.length >= 20;

            return (
              <div
                key={p.id}
                className={`shrink-0 px-3 py-2 rounded-2xl border transition flex items-center gap-2.5 ${
                  p.eliminated
                    ? 'bg-rose-950/60 border-rose-500/40 opacity-60'
                    : isCurrent
                    ? 'bg-amber-400/20 border-amber-400 shadow-lg'
                    : 'bg-slate-900/75 border-white/10'
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    {isOnline && !p.isAI && (
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          p.connected === false ? 'bg-rose-500 animate-pulse' : 'bg-emerald-400'
                        }`}
                        title={p.connected === false ? 'Terputus' : 'Online'}
                      />
                    )}
                    <span className="font-display font-bold text-xs sm:text-sm text-white">
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
                    {state.toolState?.powerHolderId === p.id && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-400 text-slate-950 text-[9px] font-black">
                        🛡️ POWER
                      </span>
                    )}
                    {state.emojiChallenge?.targetId === p.id && (
                      <span className="px-1.5 py-0.5 rounded bg-pink-500 text-white text-[9px] font-black animate-pulse">
                        {state.emojiChallenge.emoji} HOLD
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-300 flex items-center gap-2">
                    {p.eliminated ? (
                      <span className="text-rose-400 font-black">☠️ TERSINGKIR</span>
                    ) : p.isOut ? (
                      <span className="text-emerald-300 font-black">✓ KELUAR</span>
                    ) : state.variantId === 'uno-golf' ? (
                      <span>
                        {countFaceDownGolfCards(p.golfSlots)} tertutup •{' '}
                        {Math.ceil((p.golfSlots?.length ?? 0) / 2)} kol ({p.score}pt)
                      </span>
                    ) : (
                      <span className={nearMercy ? 'text-rose-300 font-black' : ''}>
                        {p.hand.length} kartu
                        {state.variantId === 'uno-no-mercy' ? ` / ${MERCY_LIMIT}` : ''}
                      </span>
                    )}
                    {state.variantId === 'uno-hearts' && (
                      <span className="text-rose-300 font-bold">❤️ {p.heartsPenalty ?? 0}</span>
                    )}
                    {p.powerActive !== undefined && (
                      <span className={p.powerActive ? 'text-emerald-300 font-black' : 'text-rose-300 font-black'}>
                        ⚡{p.powerActive ? 'ON' : 'OFF'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Center Table Arena */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-3 gap-3.5">
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

        {/* DIGITAL TABLE TOOLS WIDGET BAR */}
        <DigitalToolWidgets
          state={state}
          tippoSide={tippoSide}
          onChangeTippoSide={setTippoSide}
          onPressFlashReflex={() => {
            if (state.toolState?.flashActive) {
              dispatchAction(
                { type: 'tool_flash_reflex' },
                (prev) =>
                  resolveFlashReflex(prev, state.toolState!.flashActive!.targetPlayerId, true)
              );
            }
          }}
          onTriggerOvercharge={(level) => {
            if (viewerPlayer && isViewerTurn) {
              dispatchAction(
                { type: 'tool_overcharge_blast', level },
                (prev) => triggerOverchargeBlast(prev, viewerPlayer.id, level)
              );
            }
          }}
        />

        {/* UNIFIED 7-PACK GLOBAL HUD STATUS BAR (Speedometer, Nemesis Link, U-N-O Letter Progress) */}
        {((state.settings.activePacks ?? []).some((p) =>
          p === 'speed-pack' || p === 'frenemies-pack' || p === 'comeback-pack'
        ) ||
          state.nemesisLink ||
          (state.speedLevel ?? 1) > 1) && (
          <div className="flex flex-wrap items-center justify-center gap-2 max-w-2xl">
            {(state.settings.activePacks ?? []).includes('speed-pack') && (
              <div
                className={`px-3 py-1 rounded-2xl border font-display font-black text-[11px] flex items-center gap-1.5 ${
                  (state.speedLevel ?? 1) >= 3
                    ? 'bg-rose-950/90 border-rose-400 text-rose-200 animate-pulse'
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
                      className="ml-1 px-2.5 py-0.5 rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 text-slate-950 text-[10px] font-black animate-bounce cursor-pointer"
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
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-yellow-300 via-orange-500 to-rose-600 text-slate-950 font-display font-black text-base shadow-2xl animate-bounce cursor-pointer"
          >
            🏁 TAP CEPAT SEKARANG! (Hindari +2 Kartu!)
          </button>
        )}

        {/* Stack Warning */}
        {state.pendingDrawCount > 0 && (
          <div className="px-4 py-2 rounded-2xl bg-rose-600/90 border-2 border-rose-300 text-white font-display font-black text-xs sm:text-sm animate-pulse flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            TUMPUKAN PENALTI: +{state.pendingDrawCount} KARTU!
          </div>
        )}

        {/* UNO House Rules & Remix: 5-Slot Rule Tracker Panel */}
        {state.variantId === 'uno-house-remix' && (
          <div className="w-full max-w-2xl px-3 py-2 rounded-2xl bg-slate-950/80 border border-amber-400/35 space-y-1.5">
            <div className="text-[10px] font-display font-black uppercase tracking-wider text-amber-300 flex items-center justify-between">
              <span>📜 RULE TRACKER PANEL ({(state.houseRuleSlots ?? []).length}/{MAX_HOUSE_RULES} SLOT AKTIF)</span>
              <span className="text-slate-400">
                {state.houseRemixConfig?.stackingMode !== 'off' ? '🔥 Stack ' : ''}
                {state.houseRemixConfig?.reverseOnDraw ? '🔄 Rev-Draw ' : ''}
                {state.houseRemixConfig?.multiCardPlay ? '🃏 Multi ' : ''}
                {state.houseRemixConfig?.speedJumpIn ? '⚡ Jump-In' : ''}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {Array.from({ length: MAX_HOUSE_RULES }).map((_, idx) => {
                const slot = state.houseRuleSlots?.[idx];
                const isTriggered = state.activeRuleQTE?.rule.slotIndex === idx;
                return (
                  <div
                    key={idx}
                    className={`p-1.5 rounded-xl border text-center transition ${
                      isTriggered
                        ? 'bg-amber-400 text-slate-950 border-white animate-pulse'
                        : slot
                        ? 'bg-slate-900 border-amber-400/50 text-white'
                        : 'bg-slate-950/50 border-slate-800 text-slate-500'
                    }`}
                  >
                    <div className="text-[9px] font-display font-black">
                      {slot ? `ANGKA #${slot.triggerNumber}` : `SLOT ${idx + 1}`}
                    </div>
                    <div className="text-[9px] leading-tight line-clamp-2 mt-0.5 font-semibold">
                      {slot ? slot.title : 'Kosong'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* UNO House Rules Active QTE Reaction Button */}
        {state.phase === 'house_rule_qte' && state.activeRuleQTE && viewerPlayer && (
          <button
            type="button"
            disabled={state.activeRuleQTE.completedPlayerIds.includes(viewerPlayer.id)}
            onClick={() =>
              dispatchAction(
                { type: 'house_complete_qte' },
                (prev) => completeRuleQTE(prev, viewerPlayer.id)
              )
            }
            className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-amber-300 via-orange-500 to-rose-600 text-slate-950 font-display font-black text-sm sm:text-base shadow-2xl animate-bounce cursor-pointer disabled:opacity-50"
          >
            {state.activeRuleQTE.completedPlayerIds.includes(viewerPlayer.id)
              ? '✅ REAKSI TERCATAT! Menunggu pemain paling lambat...'
              : `${state.activeRuleQTE.rule.actionLabel} — "${state.activeRuleQTE.rule.title}" (Hindari +1!)`}
          </button>
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
              <div className="px-3.5 py-1.5 rounded-2xl bg-fuchsia-950/90 border border-fuchsia-400 text-fuchsia-200 font-display font-black text-xs flex items-center gap-1.5 shadow-md animate-pulse">
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

        {/* UNO Dare! & Emoji: Collapsible Dare List (1-10) + Emoji Hold Report Bar */}
        {state.variantId === 'uno-dare-emoji' && (
          <div className="w-full max-w-2xl space-y-2">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setShowDareList((v) => !v)}
                className="px-3.5 py-1.5 rounded-2xl bg-pink-950/85 hover:bg-pink-900 border border-pink-400/60 text-pink-200 font-display font-black text-xs cursor-pointer"
              >
                📋 {showDareList ? 'Tutup' : 'Buka'} Dare List (1–10 • {(state.settings.dareCategory ?? 'family').toUpperCase()})
              </button>
              {(state.activeHouseRules ?? []).length > 0 && (
                <div className="px-3 py-1.5 rounded-2xl bg-amber-950/80 border border-amber-400/50 text-amber-200 text-[11px] font-bold">
                  ✍️ Aturan Ronde: {state.activeHouseRules?.[state.activeHouseRules.length - 1]}
                </div>
              )}
            </div>

            {showDareList && (
              <div className="p-3 rounded-2xl bg-slate-950/90 border border-pink-400/40 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] max-h-48 overflow-y-auto">
                {(DARE_LISTS_BY_CATEGORY[state.settings.dareCategory ?? 'family'] ?? DARE_LISTS_BY_CATEGORY.family).map(
                  (txt, i) => (
                    <div key={i} className="px-2.5 py-1.5 rounded-xl bg-slate-900/90 text-slate-200">
                      <span className="font-display font-black text-pink-300">#{i + 1}</span> {txt}
                    </div>
                  )
                )}
              </div>
            )}

            {state.emojiChallenge && viewerPlayer && state.emojiChallenge.targetId !== viewerPlayer.id && (
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    dispatchAction(
                      { type: 'dare_break_emoji' },
                      (prev) => breakEmojiHold(prev, viewerPlayer.name)
                    )
                  }
                  className="px-4 py-2 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-display font-black text-xs shadow-lg cursor-pointer"
                >
                  💥 LAPORKAN EKSPRESI {state.emojiChallenge.targetName} PECAH! ({state.emojiChallenge.emoji} → +4 KARTU)
                </button>
              </div>
            )}
          </div>
        )}

        {/* UNO Emoji Expression Challenge Banner */}
        {state.emojiChallenge && viewerPlayer && state.emojiChallenge.targetId === viewerPlayer.id && !state.emojiChallenge.maintained && (
          <button
            type="button"
            onClick={() =>
              dispatchAction(
                { type: 'dare_maintain_emoji' },
                (prev) => maintainEmojiExpression(prev, viewerPlayer.id)
              )
            }
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-yellow-300 to-pink-500 text-slate-950 font-display font-black text-xs sm:text-sm shadow-xl animate-bounce cursor-pointer"
          >
            {state.emojiChallenge.emoji} PERTAHANKAN EKSPRESI: {state.emojiChallenge.label}! (Klik Sekarang)
          </button>
        )}

        {/* UNO Triple Play Timer */}
        {state.variantId === 'uno-triple-play' &&
          state.settings.triplePlayMode === 'timer' &&
          state.turnTimerSeconds !== undefined && (
            <div className="w-full max-w-md space-y-1">
              <div className="flex items-center justify-between text-xs font-display font-black">
                <span className="flex items-center gap-1 text-amber-300">
                  <Clock className="w-3.5 h-3.5" /> TIMER MODE
                </span>
                <span className={state.turnTimerSeconds <= 3 ? 'text-rose-400 animate-pulse' : 'text-white'}>
                  {state.turnTimerSeconds}s
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-900 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    state.turnTimerSeconds <= 2 ? 'bg-rose-500' : 'bg-lime-400'
                  }`}
                  style={{ width: `${(state.turnTimerSeconds / 7) * 100}%` }}
                />
              </div>
            </div>
          )}

        {/* SPECIAL MODE CENTER ARENAS */}
        {state.variantId === 'uno-golf' ? (
          <div className="flex flex-col items-center gap-3.5 w-full max-w-xl">
            <div className="text-xs font-display font-bold text-emerald-300">
              ⛳ RONDE {state.roundNumber}/{state.settings.singleRound ? 1 : GOLF_TOTAL_ROUNDS} •{' '}
              {state.golfDrawnCard
                ? state.golfDrawnCard.source === 'discard'
                  ? 'Langkah 2: Klik kartu TERTUTUP di grid untuk menukar!'
                  : 'Langkah 2: Klik kartu di grid untuk menukar ATAU buang ke Discard!'
                : 'Langkah 1: Pilih Draw Pile atau Discard Pile!'}
            </div>

            {state.golfDrawnCard ? (
              <div className="w-full p-4 rounded-3xl bg-emerald-950/85 border-2 border-emerald-400 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <HubCardView card={state.golfDrawnCard.card} size="md" />
                  <div className="space-y-1">
                    <div className="text-[11px] font-display font-black uppercase tracking-wider text-emerald-300">
                      KARTU DIAMBIL ({state.golfDrawnCard.source === 'draw' ? 'DRAW PILE' : 'DISCARD PILE'})
                    </div>
                    <p className="text-xs text-slate-200 max-w-xs">
                      {state.golfDrawnCard.source === 'discard'
                        ? 'Wajib ditukar dengan salah satu kartu TERTUTUP (face-down) di grid-mu.'
                        : 'Klik kartu mana saja di grid (terbuka/tertutup) untuk menukar, atau buang langsung.'}
                    </p>
                  </div>
                </div>
                {isViewerTurn && viewerPlayer && state.golfDrawnCard.source === 'draw' && (
                  <button
                    type="button"
                    onClick={() =>
                      dispatchAction(
                        { type: 'golf_discard_drawn' },
                        (prev) => golfDiscardDrawn(prev, viewerPlayer.id)
                      )
                    }
                    className="shrink-0 px-4 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-display font-black text-xs shadow-lg cursor-pointer"
                  >
                    🗑️ BUANG KE DISCARD
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center gap-6">
                <div className="flex flex-col items-center gap-1.5">
                  <HubCardView
                    faceDown
                    size="md"
                    playable={Boolean(isViewerTurn && !state.golfDrawnCard)}
                    onClick={
                      isViewerTurn && viewerPlayer
                        ? () =>
                            dispatchAction(
                              { type: 'golf_take_draw' },
                              (prev) => golfTakeDraw(prev, viewerPlayer.id)
                            )
                        : undefined
                    }
                  />
                  <span className="text-[11px] font-bold text-emerald-200">
                    📥 Ambil Draw ({state.drawPile.length})
                  </span>
                </div>

                <div className="flex flex-col items-center gap-1.5">
                  <HubCardView
                    card={topDiscard}
                    size="md"
                    playable={Boolean(
                      isViewerTurn && !state.golfDrawnCard && topDiscard && !isGolfActionCard(topDiscard)
                    )}
                    dimmed={Boolean(isViewerTurn && topDiscard && isGolfActionCard(topDiscard))}
                    onClick={
                      isViewerTurn && viewerPlayer && topDiscard && !isGolfActionCard(topDiscard)
                        ? () =>
                            dispatchAction(
                              { type: 'golf_take_discard' },
                              (prev) => golfTakeDiscard(prev, viewerPlayer.id)
                            )
                        : undefined
                    }
                  />
                  <span className="text-[11px] font-bold text-slate-300">
                    {topDiscard && isGolfActionCard(topDiscard)
                      ? '🚫 Action Card (Terkunci)'
                      : '♻️ Ambil Discard'}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : state.variantId === 'ono-99' ? (
          <div className="flex flex-col items-center gap-3">
            <div
              className={`w-44 h-44 rounded-full border-4 flex flex-col items-center justify-center shadow-2xl transition-colors ${
                (state.onoTotal ?? 0) >= 85
                  ? 'bg-rose-950/90 border-rose-400 animate-pulse'
                  : 'bg-slate-950/85 border-amber-400'
              }`}
            >
              <span className="text-[11px] font-display font-bold uppercase tracking-widest text-amber-300">
                TOTAL ONO 99
              </span>
              <span className="font-display font-black italic text-6xl text-white">
                {state.onoTotal ?? 0}
              </span>
              <span className="text-[11px] text-slate-400 font-bold">
                Batas: &lt; 99 (Maks 98){' '}
                {(state.onoMustPlayCount ?? 1) > 1 ? `• Wajib Main ${state.onoMustPlayCount}×!` : ''}
              </span>
            </div>
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
                  onClick={handleDrawOrLauncher}
                  className="px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-display font-black text-xs shadow-xl animate-pulse cursor-pointer"
                >
                  💥 Tidak Ada Kartu Aman (&lt; 99) — Buka Kartu &amp; Tersingkir
                </button>
              )}
          </div>
        ) : state.variantId === 'dos-mode' && state.dosCenterPiles ? (
          <div className="flex flex-col items-center gap-3 w-full max-w-2xl">
            {state.dosTurnState?.stage === 'discard_to_center' && (
              <div className="px-4 py-2 rounded-2xl bg-amber-400 text-slate-950 font-display font-black text-xs sm:text-sm animate-bounce shadow-xl">
                🌈 REFILL SELESAI! Klik {state.dosTurnState.pendingBonusDiscards} kartu di tanganmu untuk diletakkan ke Center Row!
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
                  onClick={handleDrawOrLauncher}
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
        ) : state.variantId === 'uno-hearts' ? (
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-display font-bold text-rose-200">
              <span>
                TRICK AKTIF{' '}
                {state.heartsLeadColor
                  ? `• Warna Pembuka: ${getColorLabel(state.heartsLeadColor)}`
                  : '• Mainkan kartu pembuka'}
              </span>
              {state.heartsTrickReversed && (
                <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black animate-pulse">
                  🔄 TRICK REVERSE: TERENDAH MENANG!
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 min-h-[120px] px-6 py-4 rounded-3xl bg-slate-950/60 border border-white/10">
              {(state.heartsTrick ?? []).length === 0 ? (
                <span className="text-xs text-slate-400">Belum ada kartu di trick ini</span>
              ) : (
                (state.heartsTrick ?? []).map((t) => (
                  <div key={t.playerId} className="flex flex-col items-center gap-1">
                    <HubCardView card={t.card} size="sm" />
                    <span className="text-[10px] font-bold text-slate-300">{t.playerName}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : state.variantId === 'uno-triple-play' && state.triplePiles ? (
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-wrap items-center justify-center gap-3">
              {state.triplePiles.map((pile, idx) => {
                const top = pile.cards[pile.cards.length - 1];
                const pressureColor =
                  pile.pressure <= 2 ? 'bg-emerald-400 text-slate-950' : pile.pressure <= 4 ? 'bg-amber-400 text-slate-950' : 'bg-rose-500 text-white animate-pulse';
                return (
                  <button
                    key={pile.id}
                    type="button"
                    disabled={!pile.lit}
                    onClick={() => setSelectedTriplePile(selectedTriplePile === idx ? null : idx)}
                    className={`p-3 rounded-3xl border-2 flex flex-col items-center gap-1.5 transition ${
                      pile.lit
                        ? selectedTriplePile === idx
                          ? 'bg-lime-400/20 border-lime-300 cursor-pointer'
                          : 'bg-slate-900/80 border-amber-300/70 cursor-pointer'
                        : 'bg-slate-950/60 border-slate-800 opacity-40 cursor-not-allowed'
                    }`}
                  >
                    <span className="text-[10px] font-black">
                      PILE #{idx + 1} • {pile.lit ? 'MENYALA' : 'MATI'}
                    </span>
                    <HubCardView card={top} size="sm" />
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${pressureColor}`}>
                      Tekanan: {pile.pressure}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={!isViewerTurn}
              onClick={handleDrawOrLauncher}
              className="px-4 py-2 rounded-xl bg-slate-900/90 border border-slate-600 text-xs font-bold cursor-pointer disabled:opacity-40"
            >
              Ambil 1 Kartu ({state.drawPile.length})
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-5 sm:gap-8">
            {isBlastActive ? (
              <motion.button
                type="button"
                disabled={!isViewerTurn}
                onClick={handleDrawOrLauncher}
                animate={launcherShaking ? { x: [-6, 6, -5, 5, 0] } : {}}
                className="w-32 sm:w-36 p-4 rounded-3xl bg-gradient-to-br from-orange-500 via-red-600 to-rose-700 border-2 border-amber-300 shadow-2xl disabled:opacity-45 flex flex-col items-center gap-1.5 cursor-pointer"
              >
                <Flame className="w-8 h-8 text-amber-200" />
                <span className="font-display font-black text-xs text-white">
                  {state.settings.blastExtreme ? 'NO MERCY BLAST' : 'CARD LAUNCHER'}
                </span>
                <span className="text-[10px] text-amber-100/90">
                  {state.lastAttackResult
                    ? state.lastAttackResult.cardsLaunched === 0
                      ? 'KLIK! AMAN (0 kartu)'
                      : `Terakhir: +${state.lastAttackResult.cardsLaunched}${state.lastAttackResult.halfStuck ? ' (Macet!)' : ''}`
                    : 'Tekan Peluncur'}
                </span>
              </motion.button>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <HubCardView
                  faceDown
                  flipSide={state.flipSide}
                  size="md"
                  onClick={isViewerTurn ? handleDrawOrLauncher : undefined}
                />
                <span className="text-[11px] font-bold text-slate-300">
                  {state.variantId === 'uno-junior'
                    ? `📥 Ambil Kartu (${state.drawPile.length})`
                    : state.pendingDrawCount > 0
                    ? `Ambil +${state.pendingDrawCount}`
                    : `Draw (${state.drawPile.length})`}
                </span>
              </div>
            )}

            <div className="flex flex-col items-center gap-1.5">
              <HubCardView
                card={topDiscard}
                faceDown={Boolean(
                  state.variantId === 'uno-liars' && (state.phase === 'liar_challenge' || state.liarsTopClaim)
                )}
                flipSide={state.flipSide}
                size="md"
              />
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-950/80 border border-white/15 text-[11px] font-bold">
                <span className={`w-2.5 h-2.5 rounded-full ${COLOR_PILL_BG[state.activeColor]}`} />
                {state.variantId === 'uno-junior'
                  ? `🎯 Cocokkan: ${getColorLabel(state.activeColor)}`
                  : state.variantId === 'uno-liars' && state.liarsTopClaim
                  ? `🎭 Klaim: ${getColorLabel(state.liarsTopClaim.color)} ${
                      state.liarsTopClaim.type === 'number'
                        ? state.liarsTopClaim.value
                        : state.liarsTopClaim.type.toUpperCase()
                    }`
                  : getColorLabel(state.activeColor)}
              </div>
            </div>
          </div>
        )}

        {/* UNO Rummy-Up Table Melds */}
        {state.variantId === 'uno-rummy-up' && state.rummyMelds && state.rummyMelds.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2 max-w-3xl">
            {state.rummyMelds.slice(-4).map((m) => (
              <div key={m.id} className="px-2.5 py-1.5 rounded-xl bg-slate-950/75 border border-emerald-400/35 flex items-center gap-1 text-[10px]">
                <span className="font-black text-emerald-300 uppercase">{m.kind}:</span>
                {m.cards.map((c) => (
                  <span key={c.id} className="px-1.5 py-0.5 rounded bg-slate-800 text-white font-bold">
                    {c.value}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Action Strip */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {/* UNO Flip, UNO Teams, UNO Junior, UNO Party, Liar's UNO, UNO Express & Rummy-Up Draw-Then-Play-Or-Pass Button */}
          {(state.variantId === 'uno-flip' ||
            state.variantId === 'uno-teams' ||
            state.variantId === 'uno-junior' ||
            state.variantId === 'uno-party' ||
            state.variantId === 'uno-liars' ||
            state.variantId === 'uno-express' ||
            state.variantId === 'uno-rummy-up') &&
            state.drawnPlayableCardId &&
            isViewerTurn &&
            viewerPlayer && (
              <button
                type="button"
                onClick={() =>
                  dispatchAction({ type: 'pass_after_draw' }, (prev) =>
                    prev.variantId === 'uno-teams'
                      ? passAfterTeamsDraw(prev, viewerPlayer.id)
                      : prev.variantId === 'uno-junior'
                      ? passAfterJuniorDraw(prev, viewerPlayer.id)
                      : prev.variantId === 'uno-party'
                      ? passAfterPartyDraw(prev, viewerPlayer.id)
                      : prev.variantId === 'uno-liars'
                      ? passAfterLiarsDraw(prev, viewerPlayer.id)
                      : prev.variantId === 'uno-express'
                      ? passAfterExpressDraw(prev, viewerPlayer.id)
                      : prev.variantId === 'uno-rummy-up'
                      ? passAfterRummyDraw(prev, viewerPlayer.id)
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
                className="px-4 py-2 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-display font-black text-xs shadow-xl animate-pulse cursor-pointer"
              >
                🚨 TANTANG BOHONG! ({state.liarClaim.actorName})
              </button>
            )}

          {/* UNO Party / Speed Pack / House Remix Speed Jump-In */}
          {speedCutCard && viewerPlayer && (
            <button
              type="button"
              onClick={() =>
                dispatchAction({ type: 'speed_jump_in', cardId: speedCutCard.id }, (prev) =>
                  prev.variantId === 'uno-house-remix'
                    ? attemptHouseRemixJumpIn(prev, viewerPlayer.id, speedCutCard.id)
                    : attemptSpeedPlayCutIn(prev, viewerPlayer.id, speedCutCard.id)
                )
              }
              className="px-4 py-2 rounded-2xl bg-gradient-to-r from-yellow-300 to-rose-500 text-slate-950 font-display font-black text-xs shadow-xl animate-pulse flex items-center gap-1.5 cursor-pointer"
            >
              <Zap className="w-4 h-4 fill-current" />
              SPEED PLAY! POTONG GILIRAN!
            </button>
          )}

          {/* UNO Rummy-Up Meld, End Turn & Revert Transaction Actions */}
          {availableMeld && viewerPlayer && (
            <button
              type="button"
              onClick={() =>
                dispatchAction(
                  { type: 'rummy_play_meld' },
                  (prev) => playRummyMeld(prev, viewerPlayer.id)
                )
              }
              className="px-4 py-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-500 text-slate-950 font-display font-black text-xs shadow-xl cursor-pointer"
            >
              🀄 TURUNKAN MELD {availableMeld.kind.toUpperCase()} ({availableMeld.cards.length} TILE)!
            </button>
          )}
          {state.variantId === 'uno-rummy-up' && state.rummyTransaction && isViewerTurn && viewerPlayer && (
            <>
              <button
                type="button"
                onClick={() =>
                  dispatchAction(
                    { type: 'rummy_commit_turn' },
                    (prev) => commitRummyTurn(prev, viewerPlayer.id)
                  )
                }
                className="px-4 py-2 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-black text-xs shadow-lg cursor-pointer"
              >
                ✅ SELESAI GILIRAN ({state.rummyTransaction.rackTileIdsPlayed.length}/4 Tile)
              </button>
              <button
                type="button"
                onClick={() =>
                  dispatchAction(
                    { type: 'rummy_revert_turn' },
                    (prev) => revertRummyTurn(prev, viewerPlayer.id)
                  )
                }
                className="px-3.5 py-2 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-display font-bold text-xs cursor-pointer"
              >
                ↩️ REVERT
              </button>
            </>
          )}

          {/* UNO Flex Power Card */}
          {state.variantId === 'uno-flex' && viewerPlayer && (
            <button
              type="button"
              disabled={!viewerPlayer.powerActive || !isViewerTurn}
              onClick={() => setUseFlexToggle((v) => !v)}
              className={`px-4 py-2 rounded-2xl border-2 font-display font-black text-xs flex items-center gap-1.5 cursor-pointer ${
                !viewerPlayer.powerActive
                  ? 'bg-rose-950/80 border-rose-500/50 text-rose-300 cursor-not-allowed'
                  : useFlexToggle
                  ? 'bg-emerald-400 border-white text-slate-950'
                  : 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
              }`}
            >
              <Zap className="w-4 h-4" />
              {viewerPlayer.powerActive ? (useFlexToggle ? 'FLEX AKTIF ⚡' : 'POWER HIJAU (Klik FLEX)') : 'POWER MERAH'}
            </button>
          )}

          {/* UNO Call & Catch */}
          {viewerPlayer &&
            state.variantId !== 'ono-99' &&
            state.variantId !== 'uno-hearts' &&
            (state.variantId === 'uno-golf'
              ? countFaceDownGolfCards(viewerPlayer.golfSlots) >= 1 &&
                countFaceDownGolfCards(viewerPlayer.golfSlots) <= 2
              : viewerPlayer.hand.length <= 2) &&
            !viewerPlayer.calledUno && (
              <button
                type="button"
                onClick={() =>
                  dispatchAction({ type: 'call_uno' }, (prev) => callHubUno(prev, viewerPlayer.id))
                }
                className="px-5 py-2 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 text-slate-950 font-display font-black text-xs shadow-xl animate-bounce flex items-center gap-1.5 cursor-pointer"
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
                    prev.variantId === 'uno-attack'
                      ? catchAttackUno(prev, viewerPlayer.name)
                      : prev.variantId === 'uno-golf'
                      ? catchGolfUno(prev, viewerPlayer.name)
                      : catchHubUno(prev, viewerPlayer.name)
                  )
                }
                className="px-4 py-2 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-display font-black text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldAlert className="w-4 h-4" />
                {state.variantId === 'uno-attack'
                  ? 'TANGKAP UNO! (PELUNCUR 2×)'
                  : state.variantId === 'uno-golf'
                  ? 'TANGKAP UNO! (+2 KARTU GRID)'
                  : 'TANGKAP UNO! (+2)'}
              </button>
            )}
        </div>
      </main>

      {/* Player Hand Dock (OR UNO Golf 2x3 Grid!) */}
      {viewerPlayer && (
        <section className="px-3 sm:px-6 pb-5 pt-3 bg-slate-950/75 backdrop-blur-md border-t border-white/10">
          <div className="max-w-5xl mx-auto space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-display font-black text-white">
                  {state.variantId === 'uno-golf'
                    ? `Grid Golf ${viewerPlayer.name}`
                    : `Tangan ${viewerPlayer.name} (${viewerPlayer.hand.length} kartu)`}
                </span>
                {isViewerTurn ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-400 text-slate-950 text-[10px] font-black">
                    GILIRANMU!
                  </span>
                ) : (
                  <span className="text-slate-400">Menunggu {currentPlayer?.name}...</span>
                )}
              </div>
              {state.variantId === 'uno-teams' && partner && (
                <span className="text-[11px] text-sky-300 font-bold flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {TEAM_NAMES[viewerPlayer.teamId ?? 0]} • Rekan: {partner.name} ({partner.hand.length})
                </span>
              )}
            </div>

            {state.variantId === 'uno-golf' && viewerPlayer.golfSlots ? (
              <div className="flex items-start justify-center gap-3 overflow-x-auto pb-2 pt-1">
                {Array.from({ length: Math.ceil(viewerPlayer.golfSlots.length / 2) }).map((_, colIdx) => {
                  const topIdx = colIdx * 2;
                  const botIdx = colIdx * 2 + 1;
                  const topSlot = viewerPlayer.golfSlots?.[topIdx];
                  const botSlot = viewerPlayer.golfSlots?.[botIdx];
                  const canSwapSlot = (slot?: { faceUp: boolean }) =>
                    Boolean(
                      isViewerTurn &&
                        state.golfDrawnCard &&
                        slot &&
                        (state.golfDrawnCard.source === 'draw' || !slot.faceUp)
                    );
                  return (
                    <motion.div
                      key={`golf-col-${colIdx}-${topSlot?.card.id ?? 'x'}`}
                      layout
                      className="shrink-0 flex flex-col items-center gap-2 p-2 rounded-2xl bg-slate-900/60 border border-white/10"
                    >
                      <span className="text-[9px] font-display font-bold uppercase text-emerald-300/80">
                        Kolom {colIdx + 1}
                      </span>
                      {topSlot && (
                        <HubCardView
                          card={topSlot.card}
                          faceDown={!topSlot.faceUp}
                          size="sm"
                          playable={canSwapSlot(topSlot)}
                          dimmed={Boolean(
                            isViewerTurn && state.golfDrawnCard && !canSwapSlot(topSlot)
                          )}
                          onClick={() =>
                            canSwapSlot(topSlot) &&
                            dispatchAction(
                              {
                                type: 'play_card',
                                move: { cardId: topSlot.card.id, golfSlotIndex: topIdx },
                              },
                              (prev) =>
                                ruleset.executeAction(prev, viewerPlayer.id, {
                                  cardId: topSlot.card.id,
                                  golfSlotIndex: topIdx,
                                })
                            )
                          }
                        />
                      )}
                      {botSlot && (
                        <HubCardView
                          card={botSlot.card}
                          faceDown={!botSlot.faceUp}
                          size="sm"
                          playable={canSwapSlot(botSlot)}
                          dimmed={Boolean(
                            isViewerTurn && state.golfDrawnCard && !canSwapSlot(botSlot)
                          )}
                          onClick={() =>
                            canSwapSlot(botSlot) &&
                            dispatchAction(
                              {
                                type: 'play_card',
                                move: { cardId: botSlot.card.id, golfSlotIndex: botIdx },
                              },
                              (prev) =>
                                ruleset.executeAction(prev, viewerPlayer.id, {
                                  cardId: botSlot.card.id,
                                  golfSlotIndex: botIdx,
                                })
                            )
                          }
                        />
                      )}
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-end gap-1.5 sm:gap-2 overflow-x-auto pb-2 pt-3 px-1">
                {viewerPlayer.hand.map((card) => {
                  const validation = isViewerTurn
                    ? state.variantId === 'dos-mode'
                      ? { valid: true }
                      : ruleset.validateMove(state, viewerPlayer.id, {
                          cardId: card.id,
                          useFlex: state.variantId === 'uno-flex' ? useFlexToggle : undefined,
                          pileIndex:
                            state.variantId === 'uno-triple-play' && selectedTriplePile !== null
                              ? selectedTriplePile
                              : undefined,
                        })
                    : { valid: false };

                  return (
                    <div key={card.id} className="shrink-0">
                      <HubCardView
                        card={card}
                        flipSide={state.flipSide}
                        size={state.variantId === 'uno-junior' ? 'lg' : 'md'}
                        playable={validation.valid}
                        selected={dosSelectedFirst === card.id}
                        dimmed={isViewerTurn && !validation.valid}
                        onClick={() => handleCardClick(card.id)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* INTERACTIVE PROMPT MODALS */}
      <AnimatePresence>
        {isPromptForHuman && state.pendingPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.92, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md rounded-3xl bg-slate-900 border border-white/15 p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    Aksi Interaktif
                  </div>
                  <h3 className="font-display font-black text-base sm:text-lg text-white mt-0.5">
                    {state.pendingPrompt.message}
                  </h3>
                </div>
                {state.pendingPrompt.type === 'color' && (
                  <button
                    type="button"
                    onClick={() =>
                      dispatchAction({ type: 'cancel_prompt' }, (prev) => ({
                        ...prev,
                        phase: 'playing',
                        pendingPrompt: null,
                      }))
                    }
                    className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Color Picker */}
              {(state.pendingPrompt.type === 'color' || state.pendingPrompt.type === 'roulette_color') && (
                <div className="grid grid-cols-2 gap-3">
                  {validColors.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() =>
                        dispatchAction({ type: 'resolve_prompt', payload: { color: col } }, (prev) =>
                          ruleset.resolvePrompt(prev, { color: col })
                        )
                      }
                      className={`py-4 rounded-2xl border-2 font-display font-black text-base text-white shadow-lg cursor-pointer ${COLOR_BUTTON_STYLE[col]}`}
                    >
                      {getColorLabel(col)}
                    </button>
                  ))}
                </div>
              )}

              {/* UNO Flip, UNO Flex, UNO Party & House Rules Wild Draw Challenge Modal */}
              {(state.pendingPrompt.type === 'flip_wild_challenge' ||
                state.pendingPrompt.type === 'flex_wild4_challenge' ||
                state.pendingPrompt.type === 'party_wild4_challenge' ||
                state.pendingPrompt.type === 'house_wild4_challenge') && (
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

              {/* UNO Dare! Prompt Modal (with Combo Lock warning & exact +2/+4 penalty) */}
              {state.pendingPrompt.type === 'dare_action' && (
                <div className="space-y-3">
                  {state.darePrompt?.comboLock && (
                    <div className="p-3 rounded-2xl bg-rose-950/90 border-2 border-rose-400 text-rose-200 text-xs font-bold">
                      🔒 COMBO LOCK AKTIF! Kamu sedang dalam status Emoji Hold ({state.emojiChallenge?.emoji}). Selesaikan Dare TANPA memecahkan ekspresimu, atau kena penalti +4 kartu!
                    </div>
                  )}
                  {state.darePrompt && (
                    <div className="p-3 rounded-2xl bg-slate-950/80 border border-pink-400/40 text-xs sm:text-sm text-pink-100 font-semibold">
                      🔥 Tantangan #{state.darePrompt.dareNumber}: {state.darePrompt.dareText}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        dispatchAction(
                          { type: 'resolve_prompt', payload: { challengeChoice: 'complete_dare' } },
                          (prev) =>
                            ruleset.resolvePrompt(prev, { challengeChoice: 'complete_dare' })
                        )
                      }
                      className="py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-black text-xs sm:text-sm cursor-pointer"
                    >
                      ✅ BERHASIL DARE!
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        dispatchAction(
                          { type: 'resolve_prompt', payload: { challengeChoice: 'skip_dare' } },
                          (prev) =>
                            ruleset.resolvePrompt(prev, { challengeChoice: 'skip_dare' })
                        )
                      }
                      className="py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-display font-black text-xs sm:text-sm cursor-pointer"
                    >
                      😅 GAGAL / AMBIL +{state.darePrompt?.penaltyDraw ?? 2}
                    </button>
                  </div>
                </div>
              )}

              {/* Wild Dare Picker Modal (Pick color + Dare #1-10) */}
              {state.pendingPrompt.type === 'wild_dare_pick' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-2">
                    {validColors.map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => setDarePickColor(col)}
                        className={`py-2 rounded-xl border-2 font-display font-black text-xs text-white cursor-pointer ${
                          COLOR_BUTTON_STYLE[col]
                        } ${darePickColor === col ? 'ring-2 ring-white scale-105' : 'opacity-70'}`}
                      >
                        {getColorLabel(col)}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1 max-h-44 overflow-y-auto">
                    {(DARE_LISTS_BY_CATEGORY[state.settings.dareCategory ?? 'family'] ?? DARE_LISTS_BY_CATEGORY.family).map(
                      (txt, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setDarePickNum(idx + 1)}
                          className={`w-full text-left px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer ${
                            darePickNum === idx + 1
                              ? 'bg-pink-500/25 border-pink-400 text-white'
                              : 'bg-slate-800 border-slate-700 text-slate-300'
                          }`}
                        >
                          #{idx + 1} — {txt}
                        </button>
                      )
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      dispatchAction(
                        {
                          type: 'resolve_prompt',
                          payload: {
                            color: darePickColor,
                            textValue: String(darePickNum),
                          },
                        },
                        (prev) =>
                          ruleset.resolvePrompt(prev, {
                            color: darePickColor,
                            textValue: String(darePickNum),
                          })
                      )
                    }
                    className="w-full py-3 rounded-2xl bg-pink-500 hover:bg-pink-400 text-white font-display font-black text-sm cursor-pointer"
                  >
                    🔥 KIRIM WILD DARE #{darePickNum}!
                  </button>
                </div>
              )}

              {/* Wild Emoji Picker Modal (Pick 1 Emoji Number card to stack + color) */}
              {state.pendingPrompt.type === 'wild_emoji_pick' && viewerPlayer && (
                <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-2">
                    {validColors.map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => setDarePickColor(col)}
                        className={`py-2 rounded-xl border-2 font-display font-black text-xs text-white cursor-pointer ${
                          COLOR_BUTTON_STYLE[col]
                        } ${darePickColor === col ? 'ring-2 ring-white scale-105' : 'opacity-70'}`}
                      >
                        {getColorLabel(col)}
                      </button>
                    ))}
                  </div>
                  <div className="text-[11px] font-bold text-amber-300">
                    Pilih 1 kartu angka (0–9) dari tanganmu untuk ditumpuk:
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {viewerPlayer.hand
                      .filter((c) => c.type === 'number')
                      .map((c) => (
                        <div key={c.id} className="shrink-0">
                          <HubCardView
                            card={c}
                            size="sm"
                            playable
                            selected={emojiStackCardId === c.id}
                            onClick={() => setEmojiStackCardId(c.id)}
                          />
                        </div>
                      ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const picked =
                        emojiStackCardId ||
                        viewerPlayer.hand.find((c) => c.type === 'number')?.id;
                      setEmojiStackCardId('');
                      dispatchAction(
                        {
                          type: 'resolve_prompt',
                          payload: {
                            color: darePickColor,
                            passCardId: picked,
                          },
                        },
                        (prev) =>
                          ruleset.resolvePrompt(prev, {
                            color: darePickColor,
                            passCardId: picked,
                          })
                      );
                    }}
                    className="w-full py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-black text-sm cursor-pointer"
                  >
                    😜 AKTIFKAN EMOJI HOLD!
                  </button>
                </div>
              )}

              {/* Wild Customizable Rule Modal (Quick presets / custom text + color) */}
              {state.pendingPrompt.type === 'wild_custom_rule' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-2">
                    {validColors.map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => setDarePickColor(col)}
                        className={`py-2 rounded-xl border-2 font-display font-black text-xs text-white cursor-pointer ${
                          COLOR_BUTTON_STYLE[col]
                        } ${darePickColor === col ? 'ring-2 ring-white scale-105' : 'opacity-70'}`}
                      >
                        {getColorLabel(col)}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    {QUICK_CUSTOM_RULES.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() =>
                          dispatchAction(
                            {
                              type: 'resolve_prompt',
                              payload: { color: darePickColor, textValue: preset },
                            },
                            (prev) =>
                              ruleset.resolvePrompt(prev, { color: darePickColor, textValue: preset })
                          )
                        }
                        className="w-full text-left px-3 py-2 rounded-xl bg-slate-800 hover:bg-amber-400 hover:text-slate-950 text-xs font-bold cursor-pointer"
                      >
                        ✍️ {preset}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customRuleInput}
                      onChange={(e) => setCustomRuleInput(e.target.value)}
                      placeholder="Atau tulis aturan kustom sendiri..."
                      className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const txt = customRuleInput.trim();
                        setCustomRuleInput('');
                        dispatchAction(
                          {
                            type: 'resolve_prompt',
                            payload: { color: darePickColor, textValue: txt },
                          },
                          (prev) =>
                            ruleset.resolvePrompt(prev, { color: darePickColor, textValue: txt })
                        );
                      }}
                      className="px-3.5 py-2 rounded-xl bg-amber-400 text-slate-950 font-black text-xs cursor-pointer"
                    >
                      SIMPAN
                    </button>
                  </div>
                </div>
              )}

              {/* UNO House Rules Add A Rule Modal */}
              {state.pendingPrompt.type === 'add_rule' && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    {PRESET_HOUSE_RULES.map((preset) => (
                      <button
                        key={preset.title}
                        type="button"
                        onClick={() =>
                          dispatchAction(
                            {
                              type: 'resolve_prompt',
                              payload: { textValue: preset.title, color: state.activeColor },
                            },
                            (prev) =>
                              ruleset.resolvePrompt(prev, { textValue: preset.title, color: state.activeColor })
                          )
                        }
                        className="w-full text-left px-3 py-2 rounded-xl bg-slate-800 hover:bg-amber-400 hover:text-slate-950 text-xs font-bold cursor-pointer transition"
                      >
                        📜 {preset.title}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customRuleInput}
                      onChange={(e) => setCustomRuleInput(e.target.value)}
                      placeholder="Atau tulis aturan kustom sendiri..."
                      className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!customRuleInput.trim()) return;
                        const txt = customRuleInput.trim();
                        setCustomRuleInput('');
                        dispatchAction(
                          {
                            type: 'resolve_prompt',
                            payload: { textValue: txt, color: state.activeColor },
                          },
                          (prev) =>
                            ruleset.resolvePrompt(prev, { textValue: txt, color: state.activeColor })
                        );
                      }}
                      className="px-3.5 py-2 rounded-xl bg-amber-400 text-slate-950 font-black text-xs cursor-pointer"
                    >
                      AKTIFKAN
                    </button>
                  </div>
                </div>
              )}

              {/* UNO House Rules Wild Game Changer Modal (Replace 1 active rule + pick color) */}
              {state.pendingPrompt.type === 'house_game_changer' && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="text-[11px] font-bold text-amber-300">1. Pilih Slot Aturan yang Ingin Diganti:</div>
                    <div className="space-y-1.5">
                      {(state.houseRuleSlots ?? []).map((slot, sIdx) => (
                        <button
                          key={slot.slotIndex}
                          type="button"
                          onClick={() => setGameChangerSlot(sIdx)}
                          className={`w-full text-left px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer ${
                            gameChangerSlot === sIdx
                              ? 'bg-amber-400/20 border-amber-400 text-white'
                              : 'bg-slate-800 border-slate-700 text-slate-300'
                          }`}
                        >
                          Angka #{slot.triggerNumber}: {slot.title}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] font-bold text-amber-300">2. Pilih Warna Berikutnya:</div>
                    <div className="grid grid-cols-4 gap-2">
                      {validColors.map((col) => (
                        <button
                          key={col}
                          type="button"
                          onClick={() => setGameChangerColor(col)}
                          className={`py-2 rounded-xl border-2 font-display font-black text-xs text-white cursor-pointer ${
                            COLOR_BUTTON_STYLE[col]
                          } ${gameChangerColor === col ? 'ring-2 ring-white scale-105' : 'opacity-70'}`}
                        >
                          {getColorLabel(col)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customRuleInput}
                      onChange={(e) => setCustomRuleInput(e.target.value)}
                      placeholder="Tulis aturan pengganti (opsional)..."
                      className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const txt = customRuleInput.trim();
                        setCustomRuleInput('');
                        dispatchAction(
                          {
                            type: 'resolve_prompt',
                            payload: {
                              passCardId: String(gameChangerSlot),
                              color: gameChangerColor,
                              textValue: txt || undefined,
                            },
                          },
                          (prev) =>
                            ruleset.resolvePrompt(prev, {
                              passCardId: String(gameChangerSlot),
                              color: gameChangerColor,
                              textValue: txt || undefined,
                            })
                        );
                      }}
                      className="px-3.5 py-2 rounded-xl bg-amber-400 text-slate-950 font-black text-xs cursor-pointer"
                    >
                      GANTI!
                    </button>
                  </div>
                </div>
              )}

              {/* UNO Golf Double Draw 2 Target Modal (1 player +4 OR 2 players +2 each) */}
              {state.pendingPrompt.type === 'golf_double_draw2' && (
                <div className="space-y-2.5">
                  {golfDoubleFirst && (
                    <div className="px-3 py-2 rounded-xl bg-amber-400/20 border border-amber-400 text-amber-200 text-xs font-bold">
                      Target #1 dipilih! Klik tombol "+2" pada pemain ke-2 (atau klik "+4" untuk fokus 1 pemain).
                    </div>
                  )}
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {state.players
                      .filter((p) => p.id !== state.pendingPrompt?.actorId && !p.eliminated)
                      .map((target, _, opponents) => (
                        <div
                          key={target.id}
                          className={`p-3 rounded-2xl border flex items-center justify-between gap-2 ${
                            golfDoubleFirst === target.id
                              ? 'bg-amber-400/20 border-amber-400'
                              : 'bg-slate-800 border-slate-700'
                          }`}
                        >
                          <div>
                            <div className="font-display font-bold text-sm text-white">{target.name}</div>
                            <div className="text-[11px] text-slate-300">
                              {countFaceDownGolfCards(target.golfSlots)} tertutup • {target.score} pts
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setGolfDoubleFirst(null);
                                dispatchAction(
                                  {
                                    type: 'resolve_prompt',
                                    payload: { targetPlayerId: target.id },
                                  },
                                  (prev) =>
                                    ruleset.resolvePrompt(prev, { targetPlayerId: target.id })
                                );
                              }}
                              className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-display font-black text-xs cursor-pointer"
                            >
                              🎯 +4
                            </button>
                            {opponents.length >= 2 && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!golfDoubleFirst) {
                                    setGolfDoubleFirst(target.id);
                                  } else if (golfDoubleFirst === target.id) {
                                    setGolfDoubleFirst(null);
                                  } else {
                                    const first = golfDoubleFirst;
                                    setGolfDoubleFirst(null);
                                    dispatchAction(
                                      {
                                        type: 'resolve_prompt',
                                        payload: {
                                          targetPlayerId: first,
                                          secondTargetPlayerId: target.id,
                                        },
                                      },
                                      (prev) =>
                                        ruleset.resolvePrompt(prev, {
                                          targetPlayerId: first,
                                          secondTargetPlayerId: target.id,
                                        })
                                    );
                                  }
                                }}
                                className={`px-3 py-2 rounded-xl font-display font-black text-xs cursor-pointer ${
                                  golfDoubleFirst === target.id
                                    ? 'bg-amber-400 text-slate-950'
                                    : 'bg-sky-600 hover:bg-sky-500 text-white'
                                }`}
                              >
                                {golfDoubleFirst === target.id ? '✓ +2' : '👥 +2'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Target Player Picker */}
              {(state.pendingPrompt.type === 'target_swap' ||
                state.pendingPrompt.type === 'target_draw2' ||
                state.pendingPrompt.type === 'target_draw4' ||
                state.pendingPrompt.type === 'target_attack' ||
                state.pendingPrompt.type === 'target_give_away' ||
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

              {/* UNO Rummy-Up Multi-Word Tile Effect Chooser Modal */}
              {state.pendingPrompt.type === 'rummy_choose_effect' && state.rummyTransaction && (
                <div className="space-y-2">
                  {state.rummyTransaction.triggeredActionTiles
                    .filter((t, idx, arr) => arr.findIndex((x) => x.type === t.type) === idx)
                    .map((tile) => (
                      <button
                        key={tile.id}
                        type="button"
                        onClick={() =>
                          dispatchAction(
                            { type: 'resolve_prompt', payload: { passCardId: tile.id } },
                            (prev) => ruleset.resolvePrompt(prev, { passCardId: tile.id })
                          )
                        }
                        className="w-full p-3 rounded-2xl bg-slate-800 hover:bg-amber-400 hover:text-slate-950 border border-slate-700 font-display font-black text-xs sm:text-sm cursor-pointer transition"
                      >
                        ⚡ AKTIFKAN EFEK: {tile.type.toUpperCase()} {tile.value ? `(#${tile.value})` : ''}
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
