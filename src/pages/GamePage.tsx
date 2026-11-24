import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ClipboardList,
  Clock,
  EyeOff,
  History,
  Home,
  Layers,
  Lock,
  RotateCcw,
  RotateCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { GameMode, GameState, OnlinePlayerNotice, SlotPosition } from '../types/game';
import { canTakeFromDiscardPile, countFaceDownCards, isActionCard } from '../engine/rules';
import { soundFX } from '../services/sound';
import { UnoCard } from '../components/UnoCard';
import { PlayerGrid } from '../components/PlayerGrid';
import { OpponentMiniBoard } from '../components/OpponentMiniBoard';
import { ActionOverlayBanner } from '../components/ActionOverlayBanner';
import { ToastBanner } from '../components/ToastBanner';
import { ScorepadTable } from '../components/ScorepadTable';
import { DoubleDrawTwoModal } from '../components/DoubleDrawTwoModal';

interface GamePageProps {
  mode: GameMode;
  state: GameState;
  viewerPlayerId: string | null;
  roomCode?: string | null;
  connectionStatus?: 'connected' | 'reconnecting' | 'disconnected';
  onlineNotice?: OnlinePlayerNotice | null;
  onFlipInitial: (colIdx: number, pos: SlotPosition) => void;
  onTakeFromPile: (source: 'draw' | 'discard') => void;
  onSwapWithSlot: (colIdx: number, pos: SlotPosition) => void;
  onDiscardDrawn: () => void;
  onFlipAfterDiscard: (colIdx: number, pos: SlotPosition) => void;
  onResolveDoubleDrawTwo: (targetIds: string[]) => void;
  onCallUno: () => void;
  onCatchUno: () => void;
  onExitToMenu: () => void;
}

export const GamePage: React.FC<GamePageProps> = ({
  mode,
  state,
  viewerPlayerId,
  roomCode,
  connectionStatus = 'connected',
  onlineNotice,
  onFlipInitial,
  onTakeFromPile,
  onSwapWithSlot,
  onDiscardDrawn,
  onFlipAfterDiscard,
  onResolveDoubleDrawTwo,
  onCallUno,
  onCatchUno,
  onExitToMenu,
}) => {
  const [showScorepad, setShowScorepad] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [inspectPlayerId, setInspectPlayerId] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [muted, setMuted] = useState<boolean>(() => soundFX.isMuted());
  const lastSoundEventIdRef = useRef<string | null>(null);

  // Trigger Web Audio SFX reactively on each new game event
  useEffect(() => {
    const evt = state.lastEvent;
    if (!evt || evt.id === lastSoundEventIdRef.current) return;
    lastSoundEventIdRef.current = evt.id;

    switch (evt.type) {
      case 'draw':
      case 'swap':
      case 'discard':
      case 'flip':
      case 'reshuffle':
        soundFX.playCardSlide();
        break;
      case 'column_match':
        soundFX.playColumnMatch();
        break;
      case 'draw2':
      case 'double_draw2':
      case 'uno_penalty':
      case 'timeout':
        soundFX.playAlertBuzzer();
        break;
      case 'uno_call':
        soundFX.playUnoCall();
        break;
      case 'game_win':
        soundFX.playVictoryFanfare();
        break;
      default:
        break;
    }
  }, [state.lastEvent?.id]);

  // Live 20s countdown timer for Online Multiplayer
  useEffect(() => {
    if (!state.turnDeadline) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const diff = Math.max(0, Math.ceil((state.turnDeadline! - Date.now()) / 1000));
      setSecondsLeft(diff);
    };
    tick();
    const id = setInterval(tick, 300);
    return () => clearInterval(id);
  }, [state.turnDeadline]);

  const handleToggleMute = () => {
    const next = soundFX.toggleMute();
    setMuted(next);
  };

  const activePlayer = state.players[state.currentPlayerIndex];
  const isAITurn = Boolean(activePlayer?.isAI);

  const dockPlayer =
    mode === 'local'
      ? activePlayer
      : state.players.find((p) => p.id === viewerPlayerId) ?? activePlayer;

  const opponents = state.players.filter((p) => p.id !== dockPlayer.id);

  const isMyTurn =
    mode === 'local'
      ? true
      : Boolean(viewerPlayerId && activePlayer && activePlayer.id === viewerPlayerId && !isAITurn);

  const topDiscard = state.discardPile[state.discardPile.length - 1] ?? null;
  const drawPileCount = state.drawPileCount ?? state.drawPile.length;
  const dockFaceDownCount = countFaceDownCards(dockPlayer.columns);

  const canChooseSource = isMyTurn && state.phase === 'playing' && state.turnStep === 'choose_source';
  const discardBlockedByAction = Boolean(topDiscard && isActionCard(topDiscard));
  const canTakeDiscard = canChooseSource && canTakeFromDiscardPile(state.discardPile);
  const isResolvingDrawn = state.phase === 'playing' && state.turnStep === 'resolve_drawn';
  const isMustFlip = isMyTurn && state.phase === 'playing' && state.turnStep === 'must_flip';
  const isInitialFlip = isMyTurn && state.phase === 'initial_flip';

  const gridInteractionMode =
    isInitialFlip || isMustFlip
      ? 'flip_face_down'
      : isMyTurn && isResolvingDrawn
      ? 'swap_any'
      : 'none';

  const handleGridSlotSelect = (colIdx: number, pos: SlotPosition) => {
    if (!isMyTurn) return;
    if (state.phase === 'initial_flip') {
      onFlipInitial(colIdx, pos);
    } else if (state.turnStep === 'resolve_drawn') {
      onSwapWithSlot(colIdx, pos);
    } else if (state.turnStep === 'must_flip') {
      onFlipAfterDiscard(colIdx, pos);
    }
  };

  const amVulnerable = Boolean(
    state.unoVulnerability &&
      (mode === 'local' || state.unoVulnerability.playerId === viewerPlayerId)
  );
  const canCatchOther = Boolean(
    state.unoVulnerability &&
      (mode === 'local' || state.unoVulnerability.playerId !== viewerPlayerId)
  );
  const canArmMyUno =
    isMyTurn &&
    state.phase === 'playing' &&
    (dockFaceDownCount === 2 || dockFaceDownCount === 1) &&
    !state.unoArmed &&
    !dockPlayer.hasCalledUno;

  const showUnoButton = canArmMyUno || amVulnerable || (isMyTurn && state.unoArmed);

  const inspectedPlayer = inspectPlayerId
    ? state.players.find((p) => p.id === inspectPlayerId) ?? null
    : null;

  const instructionText = isAITurn
    ? `${activePlayer.name} (AI) sedang mengambil keputusan...`
    : !isMyTurn
    ? `Menunggu giliran ${activePlayer.name}...`
    : state.phase === 'initial_flip'
    ? `Ketuk 1 kartu TERTUTUP di grid untuk dibuka di awal ronde.`
    : canChooseSource
    ? discardBlockedByAction
      ? `Kartu Aksi di tumpukan buangan tidak dapat diambil — wajib ambil dari Draw Pile.`
      : `Pilih ambil 1 kartu dari Draw Pile atau Discard Pile.`
    : isResolvingDrawn
    ? state.drawnFrom === 'discard'
      ? `Wajib tukar kartu dari Discard Pile dengan 1 kartu di grid.`
      : `Ketuk 1 kartu di grid untuk tukar, ATAU buang & buka 1 kartu tertutup.`
    : isMustFlip
    ? `Wajib ketuk 1 kartu TERTUTUP di grid untuk dibuka!`
    : '';

  return (
    <div className="min-h-screen table-felt flex flex-col justify-between text-slate-100 relative overflow-x-hidden">
      {/* Dramatic Center Action Pop-up Banner */}
      <ActionOverlayBanner event={state.lastEvent} />

      {/* Top Navigation & Controls Bar */}
      <header className="w-full px-3 sm:px-5 py-2 bg-slate-950/80 backdrop-blur-md border-b border-emerald-500/15 flex items-center justify-between gap-2 z-20">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExitToMenu}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 cursor-pointer"
            title="Menu Utama"
          >
            <Home className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-display font-black italic text-sm sm:text-base text-white">
                UNO <span className="text-amber-400">ZERO</span>
              </span>
              <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-[11px] font-black text-amber-300">
                R{state.roundNumber}/{state.config.totalRounds}
              </span>
              {roomCode && (
                <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-[10px] font-black text-sky-300">
                  {roomCode}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-slate-400">
              {state.direction === 1 ? (
                <>
                  <RotateCw className="w-3 h-3 text-emerald-400" />
                  Searah Jarum Jam
                </>
              ) : (
                <>
                  <RotateCcw className="w-3 h-3 text-violet-400" />
                  Berlawanan Jarum Jam
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {mode === 'online' && (
            <div
              className={`hidden sm:inline-flex items-center gap-1 px-2 py-1.5 rounded-xl border text-[11px] font-bold ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                  : connectionStatus === 'reconnecting'
                  ? 'bg-amber-500/20 border-amber-400/50 text-amber-200 animate-pulse'
                  : 'bg-rose-500/20 border-rose-400/50 text-rose-200'
              }`}
            >
              {connectionStatus === 'connected' ? (
                <Wifi className="w-3.5 h-3.5" />
              ) : (
                <WifiOff className="w-3.5 h-3.5" />
              )}
              {connectionStatus === 'connected'
                ? 'Online'
                : connectionStatus === 'reconnecting'
                ? 'Reconnecting...'
                : 'Offline'}
            </div>
          )}
          {secondsLeft !== null && (
            <div
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-display font-black ${
                secondsLeft <= 5
                  ? 'bg-rose-600/30 border-rose-400 text-rose-200 animate-pulse'
                  : 'bg-slate-900 border-slate-700 text-amber-300'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              {secondsLeft}d
            </div>
          )}

          {/* Speaker Mute / Unmute Button */}
          <button
            type="button"
            onClick={handleToggleMute}
            className={`p-2 rounded-xl border cursor-pointer transition ${
              muted
                ? 'bg-slate-900 border-slate-800 text-slate-500'
                : 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/25'
            }`}
            title={muted ? 'Nyalakan Efek Suara' : 'Bisukan Efek Suara'}
            aria-label={muted ? 'Nyalakan Efek Suara' : 'Bisukan Efek Suara'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => setShowScorepad(true)}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-amber-300 cursor-pointer"
          >
            <ClipboardList className="w-4 h-4" />
            <span className="hidden sm:inline">Scorepad</span>
          </button>
          <button
            type="button"
            onClick={() => setShowLog(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-sky-300 cursor-pointer"
            title="Riwayat"
          >
            <History className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Opponents Live Mini-Grids Strip (Top & Sides) */}
      <section className="w-full px-2.5 sm:px-5 pt-2.5 z-10">
        <div className="flex items-start gap-2 sm:gap-3 overflow-x-auto no-scrollbar pb-1 justify-start sm:justify-center">
          {opponents.map((opp) => {
            const isOppActive = state.players[state.currentPlayerIndex]?.id === opp.id;
            const isOppVuln = state.unoVulnerability?.playerId === opp.id;
            return (
              <OpponentMiniBoard
                key={opp.id}
                player={opp}
                isActive={isOppActive}
                isVulnerable={isOppVuln}
                onInspect={() => setInspectPlayerId(opp.id)}
              />
            );
          })}
        </div>
      </section>

      {/* Center Table: Draw Pile + Discard Pile + Active Drawn Card */}
      <main className="flex-1 flex flex-col items-center justify-center px-3 py-2 gap-2.5 z-10">
        {onlineNotice && (
          <div className="max-w-xl w-full text-center px-4 py-1.5 rounded-xl bg-sky-500/20 border border-sky-400/50 text-xs font-bold text-sky-100">
            🔔 {onlineNotice.message}
          </div>
        )}
        <div className="max-w-xl w-full flex justify-center min-h-[36px]">
          <ToastBanner event={state.lastEvent} />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-5 sm:gap-10">
          {/* Draw Pile */}
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={`relative p-1.5 rounded-3xl transition ${
                canChooseSource
                  ? 'ring-2 ring-amber-400/80 bg-amber-400/10 shadow-[0_0_28px_rgba(251,191,36,0.3)]'
                  : ''
              }`}
            >
              {drawPileCount > 2 && (
                <div className="absolute inset-2 translate-x-1.5 translate-y-1.5 rounded-2xl bg-amber-600/35 border border-amber-300/30" />
              )}
              <UnoCard
                faceDown
                size="md"
                highlighted={canChooseSource}
                badgeText={canChooseSource ? 'AMBIL' : undefined}
                onClick={canChooseSource ? () => onTakeFromPile('draw') : undefined}
              />
            </div>
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-950/60 border border-slate-700/60 text-[11px] font-bold text-slate-200">
              <Layers className="w-3 h-3 text-amber-400" />
              <span>Draw ({drawPileCount})</span>
            </div>
          </div>

          {/* Discard Pile */}
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={`relative p-1.5 rounded-3xl transition ${
                canTakeDiscard
                  ? 'ring-2 ring-emerald-400/80 bg-emerald-400/10 shadow-[0_0_28px_rgba(52,211,153,0.3)]'
                  : canChooseSource && discardBlockedByAction
                  ? 'ring-2 ring-rose-500/60 bg-rose-950/35'
                  : ''
              }`}
            >
              {topDiscard ? (
                <AnimatePresence mode="popLayout">
                  <motion.div
                    key={topDiscard.id}
                    initial={{ scale: 1.18, y: -22, rotate: -6, opacity: 0 }}
                    animate={{ scale: 1, y: 0, rotate: 0, opacity: 1 }}
                    exit={{ scale: 0.88, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 20 }}
                    className="relative"
                  >
                    <UnoCard
                      card={topDiscard}
                      size="md"
                      playable={canTakeDiscard}
                      dimmed={canChooseSource && discardBlockedByAction}
                      highlighted={canTakeDiscard}
                      badgeText={canTakeDiscard ? 'AMBIL' : undefined}
                      onClick={canTakeDiscard ? () => onTakeFromPile('discard') : undefined}
                    />
                    {canChooseSource && discardBlockedByAction && (
                      <div
                        className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-950/45"
                        title="Kartu Aksi di tumpukan buangan tidak dapat diambil"
                      >
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-600/95 border border-rose-300/70 text-[10px] font-display font-black text-white shadow-lg">
                          <Lock className="w-3 h-3" />
                          TERKUNCI
                        </span>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              ) : (
                <div className="w-22 h-32 sm:w-24 sm:h-36 rounded-2xl border-2 border-dashed border-slate-700 flex items-center justify-center text-xs text-slate-500">
                  Kosong
                </div>
              )}
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-950/60 border border-slate-700/60 text-[11px] font-bold text-slate-200">
              Discard ({state.discardPile.length})
            </span>
          </div>

          {/* Held Drawn Card */}
          {isResolvingDrawn && (state.drawnCard || state.hasHiddenDrawnCard) && (
            <motion.div
              initial={{ scale: 0.82, x: -16, opacity: 0 }}
              animate={{ scale: 1, x: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22 }}
              className="flex flex-col items-center gap-2 p-3 rounded-3xl bg-slate-950/90 border-2 border-amber-400 shadow-2xl shadow-amber-400/25"
            >
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">
                {isMyTurn ? 'Kartu Diambil' : `Kartu ${activePlayer.name}`}
              </span>
              <UnoCard
                card={state.drawnCard ?? undefined}
                faceDown={!state.drawnCard}
                size="md"
                highlighted
              />
              {isMyTurn && state.drawnFrom === 'draw' && (
                <button
                  type="button"
                  onClick={onDiscardDrawn}
                  className="mt-0.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-display font-bold text-xs flex items-center gap-1.5 shadow cursor-pointer transition active:scale-95"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Buang &amp; Buka 1 Kartu
                </button>
              )}
            </motion.div>
          )}
        </div>

        {/* Visual Indicator when Discard Pile is locked because top card is an Action Card */}
        {canChooseSource && discardBlockedByAction && (
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-rose-950/80 border border-rose-500/60 text-rose-200 text-xs font-bold shadow">
            <Lock className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>Kartu Aksi di tumpukan buangan tidak dapat diambil — ambil dari Draw Pile.</span>
          </div>
        )}
      </main>

      {/* Bottom Dock: Main Player Grid + Flanking UNO! & Catch Buttons */}
      <section
        className={`w-full bg-slate-950/85 backdrop-blur-lg border-t px-2.5 sm:px-5 pt-2.5 pb-4 z-20 transition ${
          isMyTurn ? 'border-amber-400/50 shadow-[0_-8px_32px_rgba(251,191,36,0.12)]' : 'border-slate-800/90'
        }`}
      >
        <div className="max-w-5xl mx-auto space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2">
              <span
                className={`px-3 py-1 rounded-xl font-display font-black text-xs sm:text-sm ${
                  isMyTurn
                    ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/25'
                    : 'bg-slate-800 text-slate-200'
                }`}
              >
                {dockPlayer.name} (2×{dockPlayer.columns.length}) • {dockPlayer.totalScore}p
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-slate-300 font-semibold">
                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                {dockFaceDownCount} tutup
              </span>
            </div>
            <p className="text-xs sm:text-sm font-semibold text-amber-200">{instructionText}</p>
          </div>

          {/* Grid flanked by UNO! (right) and Catch (left) on desktop, clean responsive stack on phone */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-3">
            {/* Left Side: Catch / Tantang Button */}
            {canCatchOther && state.unoVulnerability && (
              <div className="shrink-0 order-1 md:order-1">
                <button
                  type="button"
                  onClick={onCatchUno}
                  className="px-4 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-display font-black text-xs sm:text-sm flex items-center gap-2 shadow-xl shadow-rose-600/40 animate-pulse cursor-pointer transition active:scale-95"
                >
                  <ShieldAlert className="w-5 h-5" />
                  TANTANG / CATCH! ({state.unoVulnerability.playerName})
                </button>
              </div>
            )}

            {/* Center: Main Player Responsive 2xN Grid */}
            <div className="flex-1 w-full order-2">
              <PlayerGrid
                columns={dockPlayer.columns}
                eliminatedCount={dockPlayer.eliminatedColumnsThisRound}
                cardSize="md"
                interactionMode={gridInteractionMode}
                onSelectSlot={handleGridSlotSelect}
              />
            </div>

            {/* Right Side: UNO! Button */}
            {showUnoButton && (
              <div className="shrink-0 order-1 md:order-3">
                <button
                  type="button"
                  onClick={onCallUno}
                  disabled={isMyTurn && state.unoArmed && !amVulnerable}
                  className={`px-6 py-3.5 rounded-2xl font-display font-black text-base tracking-wide flex items-center gap-2 shadow-xl transition active:scale-95 ${
                    isMyTurn && state.unoArmed && !amVulnerable
                      ? 'bg-emerald-500/30 border-2 border-emerald-400 text-emerald-200 cursor-default'
                      : 'bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:from-amber-300 hover:to-rose-400 text-slate-950 shadow-orange-500/40 animate-bounce cursor-pointer'
                  }`}
                >
                  <Sparkles className="w-5 h-5" />
                  {isMyTurn && state.unoArmed && !amVulnerable ? 'UNO! ✓' : 'UNO!'}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Double Draw Two Target Modal */}
      {isMyTurn && state.phase === 'choose_double_draw2_target' && (
        <DoubleDrawTwoModal
          actorName={activePlayer.name}
          opponents={state.players.filter((p) => p.id !== activePlayer.id)}
          onConfirm={onResolveDoubleDrawTwo}
        />
      )}

      {/* Opponent Grid Zoom Inspector Modal */}
      {inspectedPlayer && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-slate-900 border border-slate-700 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-black text-white">
                  Grid {inspectedPlayer.name} (2×{inspectedPlayer.columns.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Total Skor: {inspectedPlayer.totalScore} • Kartu tertutup:{' '}
                  {countFaceDownCards(inspectedPlayer.columns)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectPlayerId(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <PlayerGrid
              columns={inspectedPlayer.columns}
              eliminatedCount={inspectedPlayer.eliminatedColumnsThisRound}
              cardSize="sm"
              interactionMode="none"
            />
          </div>
        </div>
      )}

      {/* Scorepad Modal */}
      {showScorepad && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-[88vh] overflow-y-auto space-y-3">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowScorepad(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm cursor-pointer"
              >
                <X className="w-4 h-4" />
                Tutup Scorepad
              </button>
            </div>
            <ScorepadTable
              players={state.players}
              roundHistory={state.roundHistory}
              totalRounds={state.config.totalRounds}
              currentRoundNumber={state.roundNumber}
            />
          </div>
        </div>
      )}

      {/* Action History Modal */}
      {showLog && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg max-h-[80vh] rounded-3xl bg-slate-900 border border-slate-700 p-5 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-black text-white flex items-center gap-2">
                <History className="w-5 h-5 text-sky-400" />
                Riwayat Permainan
              </h3>
              <button
                type="button"
                onClick={() => setShowLog(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto space-y-2 pr-1">
              {state.actionLog.map((evt) => (
                <div
                  key={evt.id}
                  className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 text-xs sm:text-sm text-slate-200"
                >
                  {evt.message}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
