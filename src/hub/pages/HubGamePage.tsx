import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Clock,
  Hand,
  Megaphone,
  RotateCcw,
  ShieldAlert,
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
import { HubCardView } from '../components/HubCardView';
import { ModeSignatureHud } from '../components/ModeSignatureHud';
import { getModeTheme } from '../themes/modeThemes';
import {
  callHubUno,
  catchHubUno,
  confirmPassDevice,
  getColorLabel,
  getValidColorsForState,
} from '../engine/core';
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
  const [dosSelectedFirst, setDosSelectedFirst] = useState<string | null>(null);
  const [dosSelectedPile, setDosSelectedPile] = useState<number>(0);
  const [muted, setMuted] = useState(() => soundFX.isMuted());
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
    if (t === 'uno_call' || t === 'speed_play') soundFX.playUnoCall();
    else if (t === 'game_win' || t === 'round_end') soundFX.playVictoryFanfare();
    else if (t === 'uno_penalty' || t === 'eliminated' || t === 'timeout') {
      soundFX.playAlertBuzzer();
    } else if (t === 'flip' || t === 'power_flip' || t === 'flex') {
      soundFX.playColumnMatch();
    } else {
      soundFX.playCardSlide();
    }
  }, [state.lastEvent?.id]);

  // Reset per-turn toggles
  useEffect(() => {
    setUseFlexToggle(false);
    setDosSelectedFirst(null);
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

  // UNO Party (Number cards ONLY!) / Speed Pack Speed Jump-In exact match check
  const speedCutCard =
    (state.variantId === 'uno-party' || (state.speedPhaseTurns ?? 0) > 0) &&
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

    const move = {
      cardId,
      useFlex: state.variantId === 'uno-flex' ? useFlexToggle : undefined,
    };
    dispatchAction(
      { type: 'play_card', move },
      (prev) => ruleset.executeAction(prev, viewerPlayer.id, move)
    );
  };

  const handleDrawOrPass = () => {
    if (!isViewerTurn || !viewerPlayer) return;
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
            className="w-full min-h-12 py-3.5 px-5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-black text-base tracking-wide transition"
          >
            Lanjutkan &amp; Lihat Kartu Saya
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
              {lastRound.finalStandings && lastRound.finalStandings.length > 0
                ? lastRound.finalStandings.map((st, idx, arr) => {
                    const isLoser =
                      st.status === 'active' &&
                      idx === arr.length - 1 &&
                      st.handCount > 0;
                    const medal =
                      st.rank === 1 ? '🥇' : st.rank === 2 ? '🥈' : st.rank === 3 ? '🥉' : `#${st.rank}`;
                    return (
                      <div
                        key={st.playerId}
                        className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs sm:text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-display font-black text-amber-300 w-7">
                            {medal}
                          </span>
                          <span className="font-bold text-white">{st.playerName}</span>
                          {st.status === 'eliminated' && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/25 text-rose-300 text-[10px] font-black">
                              ☠️ MERCY OUT
                            </span>
                          )}
                          {isLoser && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/25 text-rose-300 text-[10px] font-black">
                              KALAH
                            </span>
                          )}
                        </div>
                        <div className="font-display font-black text-slate-300 text-xs">
                          {st.status === 'finished'
                            ? `Juara #${st.rank}`
                            : `Sisa ${st.handCount} kartu`}
                        </div>
                      </div>
                    );
                  })
                : lastRound.playerPoints.map((pp) => (
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
                        {pp.totalScore} pts
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

  return (
    <div className={`min-h-screen ${tableTheme} text-slate-100 flex flex-col justify-between transition-colors duration-300 relative overflow-x-hidden`}>
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

        <div className="flex items-center gap-2 shrink-0">
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
                className={`shrink-0 px-3 py-2 rounded-2xl border transition flex flex-col gap-1 min-w-[110px] ${
                  p.eliminated
                    ? 'bg-rose-950/60 border-rose-500/40 opacity-60'
                    : isCurrent
                    ? 'bg-amber-400/20 border-amber-400 shadow-lg'
                    : `bg-slate-900/75 ${teamBorder || 'border-white/10'}`
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    {isOnline && !p.isAI && (
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          p.connected === false ? 'bg-rose-500' : 'bg-emerald-400'
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
                  </div>
                  <div className="text-[10px] text-slate-300 flex items-center gap-2">
                    {p.eliminated ? (
                      <span className="text-rose-400 font-black">☠️ TERSINGKIR</span>
                    ) : p.isOut ? (
                      <span className="text-emerald-300 font-black">
                        {finishRank > 0 ? `🏅 JUARA #${finishRank}` : '✓ KELUAR'}
                      </span>
                    ) : (
                      <span className={nearMercy ? 'text-rose-300 font-black' : ''}>
                        {p.hand.length} kartu
                        {mercyLimit !== null ? ` / ${mercyLimit}` : ''}
                      </span>
                    )}
                    {p.powerActive !== undefined && (
                      <span className={p.powerActive ? 'text-emerald-300 font-black' : 'text-rose-300 font-black'}>
                        ⚡{p.powerActive ? 'ON' : 'OFF'}
                      </span>
                    )}
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
              </motion.div>
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
          <div className="flex items-center justify-center gap-5 sm:gap-8">
            <div className="flex flex-col items-center gap-1.5">
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

            <div className="flex flex-col items-center gap-1.5">
              <div
                className={
                  state.variantId === 'uno-liars'
                    ? 'p-2 rounded-3xl bg-violet-950/70 border border-violet-400/45 shadow-xl shadow-violet-500/20'
                    : ''
                }
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
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-950/80 border border-white/15 text-[11px] font-bold">
                <span className={`w-2.5 h-2.5 rounded-full ${COLOR_PILL_BG[state.activeColor]}`} />
                {state.variantId === 'uno-liars' && state.liarsTopClaim
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
                className="px-5 py-2 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 text-slate-950 font-display font-black text-xs shadow-xl flex items-center gap-1.5 cursor-pointer"
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
      </main>

      {viewerPlayer && (
        <section
          aria-label="Kartu di tangan pemain"
          className="px-3 sm:px-6 pb-5 pt-3 bg-slate-950/95 border-t border-slate-800"
        >
          <div className="max-w-5xl mx-auto space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
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
              </div>
              {state.variantId === 'uno-teams' && partner && (
                <span className="text-[11px] text-sky-300 font-bold flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {TEAM_NAMES[viewerPlayer.teamId ?? 0]} • Rekan: {partner.name} ({partner.hand.length})
                </span>
              )}
            </div>

            <div className="flex items-end gap-2 overflow-x-auto pb-2 pt-3 px-2 sm:px-1">
              {viewerPlayer.hand.map((card) => {
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
                      dimmed={isViewerTurn && !validation.valid}
                      onClick={() => handleCardClick(card.id)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

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
