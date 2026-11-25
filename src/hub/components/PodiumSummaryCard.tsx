import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Clock, Crown, Flame, Layers, RotateCcw, Trophy, Zap } from 'lucide-react';
import { HubGameState, VariantMetadata } from '../types';

interface PodiumSummaryCardProps {
  state: HubGameState;
  meta: VariantMetadata;
  tableTheme: string;
  isOnlineHost: boolean;
  isSpectator?: boolean;
  spectatorQueued?: boolean;
  onToggleSpectatorQueue?: () => void;
  onNextRound: () => void;
  onRematch: () => void;
  onExitToHub: () => void;
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(1, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return mins > 0 ? `${mins}m ${secs}d` : `${secs} detik`;
}

export const PodiumSummaryCard: React.FC<PodiumSummaryCardProps> = ({
  state,
  meta,
  tableTheme,
  isOnlineHost,
  isSpectator = false,
  spectatorQueued = false,
  onToggleSpectatorQueue,
  onNextRound,
  onRematch,
  onExitToHub,
}) => {
  const lastRound = state.roundHistory[state.roundHistory.length - 1];
  const isGameOver = state.phase === 'game_over';

  const durationLabel = useMemo(() => {
    const endTs = state.lastEvent?.timestamp ?? Date.now();
    const diff = Math.max(1000, endTs - (state.startedAt || endTs));
    return formatDuration(diff);
  }, [state.startedAt, state.lastEvent?.timestamp]);

  const rankedPlayers = useMemo(() => {
    if (lastRound?.finalStandings && lastRound.finalStandings.length > 0) {
      return lastRound.finalStandings.map((st) => ({
        id: st.playerId,
        name: st.playerName,
        score: st.score,
        rank: st.rank,
        eliminated: st.status === 'eliminated',
        handCount: st.handCount,
      }));
    }
    const sorted = [...state.players].sort((a, b) => {
      if (a.id === lastRound?.winnerId) return -1;
      if (b.id === lastRound?.winnerId) return 1;
      if (b.score !== a.score) return b.score - a.score;
      return a.hand.length - b.hand.length;
    });
    return sorted.map((p, idx) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      rank: idx + 1,
      eliminated: Boolean(p.eliminated),
      handCount: p.hand.length,
    }));
  }, [lastRound, state.players]);

  const funStats = useMemo(() => {
    const drawCounts: Record<string, number> = {};
    const actionCounts: Record<string, number> = {};

    for (const evt of state.actionLog) {
      const msg = evt.message;
      const actor = state.players.find((p) => msg.includes(p.name));
      if (!actor) continue;

      if (
        evt.type.includes('draw') ||
        evt.type === 'uno_penalty' ||
        msg.toLowerCase().includes('mengambil') ||
        msg.toLowerCase().includes('ambil')
      ) {
        drawCounts[actor.name] = (drawCounts[actor.name] ?? 0) + 1;
      }

      if (
        evt.type !== 'play' &&
        evt.type !== 'draw' &&
        evt.type !== 'start' &&
        evt.type !== 'round_end' &&
        evt.type !== 'game_win'
      ) {
        actionCounts[actor.name] = (actionCounts[actor.name] ?? 0) + 1;
      }
    }

    const topDrawer = Object.entries(drawCounts).sort((a, b) => b[1] - a[1])[0];
    const topAction = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0];

    return {
      topDrawer: topDrawer ? `${topDrawer[0]} (${topDrawer[1]}x)` : 'Belum ada',
      topAction: topAction ? `${topAction[0]} (${topAction[1]}x)` : 'Belum ada',
      totalMoves: state.actionLog.length,
    };
  }, [state.actionLog, state.players]);

  const podiumOrder = [rankedPlayers[1], rankedPlayers[0], rankedPlayers[2]].filter(Boolean);

  return (
    <div className={`min-h-screen ${tableTheme} flex items-center justify-center p-4 text-slate-100`}>
      <motion.main
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl rounded-2xl bg-slate-950/95 border border-amber-400/40 p-5 sm:p-7 space-y-5 shadow-2xl"
      >
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center mx-auto">
            <Trophy className="w-7 h-7" />
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-amber-300">
            {isGameOver ? `Juara ${meta.name}` : `Ronde ${state.roundNumber} Selesai`}
          </div>
          <h1 className="font-display font-black italic text-3xl sm:text-4xl text-white">
            {lastRound?.winnerName ?? rankedPlayers[0]?.name ?? 'Pemenang'}
          </h1>
          {lastRound?.reason && (
            <p className="text-xs sm:text-sm text-slate-300">{lastRound.reason}</p>
          )}
        </div>

        {/* Visual Top 3 Podium */}
        {podiumOrder.length >= 2 && (
          <div className="grid grid-cols-3 items-end gap-2 pt-2">
            {podiumOrder.map((p) => {
              const isFirst = p.rank === 1;
              const isSecond = p.rank === 2;
              return (
                <div
                  key={p.id}
                  className={`rounded-xl border p-2.5 text-center flex flex-col items-center justify-end gap-1 ${
                    isFirst
                      ? 'bg-amber-400/20 border-amber-400 min-h-[104px]'
                      : isSecond
                      ? 'bg-slate-900 border-slate-600 min-h-[84px]'
                      : 'bg-slate-900/70 border-slate-800 min-h-[72px]'
                  }`}
                >
                  {isFirst && <Crown className="w-4 h-4 text-amber-300" />}
                  <span className="font-display font-black text-xs text-amber-300">#{p.rank}</span>
                  <span className="font-display font-bold text-xs sm:text-sm text-white truncate max-w-full">
                    {p.name}
                  </span>
                  <span className="text-[11px] font-bold text-slate-300 tabular-nums">
                    {p.score} pt
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Fun Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-0.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3 text-sky-400" /> Durasi
            </div>
            <div className="font-display font-black text-xs sm:text-sm text-white">
              {durationLabel} ({funStats.totalMoves} aksi)
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-0.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Layers className="w-3 h-3 text-rose-400" /> Paling Banyak Tarik
            </div>
            <div className="font-display font-black text-xs sm:text-sm text-white truncate">
              {funStats.topDrawer}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-0.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-400" /> Raja Kartu Aksi
            </div>
            <div className="font-display font-black text-xs sm:text-sm text-white truncate">
              {funStats.topAction}
            </div>
          </div>
        </div>

        {/* Full Standings List */}
        <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
          {rankedPlayers.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-900/90 border border-slate-800 text-xs sm:text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-display font-black text-amber-300 w-6">#{p.rank}</span>
                <span className="font-bold text-white truncate">{p.name}</span>
                {p.eliminated && (
                  <span className="px-1.5 py-0.5 rounded bg-rose-950 border border-rose-500/40 text-rose-300 text-[10px] font-black">
                    Gugur
                  </span>
                )}
              </div>
              <span className="font-display font-black text-amber-300 tabular-nums shrink-0">
                {p.score} pt
              </span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-1">
          {isSpectator ? (
            <div className="space-y-2">
              {onToggleSpectatorQueue && (
                <button
                  type="button"
                  onClick={onToggleSpectatorQueue}
                  className={`w-full min-h-12 py-3 px-5 rounded-xl font-display font-black text-sm flex items-center justify-center gap-2 transition ${
                    spectatorQueued
                      ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950'
                      : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                  }`}
                >
                  <Flame className="w-4 h-4" />
                  {spectatorQueued
                    ? 'Terdaftar untuk Ronde Berikutnya'
                    : 'Ikut Main di Ronde Berikutnya'}
                </button>
              )}
              <div className="text-center text-xs text-slate-300">
                Menunggu Host memulai {isGameOver ? 'Rematch' : 'Ronde Berikutnya'}...
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              {isGameOver ? (
                isOnlineHost ? (
                  <button
                    type="button"
                    onClick={onRematch}
                    className="flex-1 min-h-12 py-3 px-5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-black text-sm flex items-center justify-center gap-2 transition"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Main Lagi (1-Klik Rematch)
                  </button>
                ) : (
                  <div className="flex-1 min-h-12 px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-slate-200 flex items-center justify-center text-center">
                    Menunggu Host memulai Main Lagi...
                  </div>
                )
              ) : isOnlineHost ? (
                <button
                  type="button"
                  onClick={onNextRound}
                  className="flex-1 min-h-12 py-3 px-5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-black text-sm flex items-center justify-center gap-2 transition"
                >
                  Lanjut Ronde {state.roundNumber + 1}
                </button>
              ) : (
                <div className="flex-1 min-h-12 px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-slate-200 flex items-center justify-center text-center">
                  Menunggu Host memulai Ronde {state.roundNumber + 1}...
                </div>
              )}

              <button
                type="button"
                onClick={onExitToHub}
                className="min-h-12 px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-100 font-display font-bold text-sm transition"
              >
                Kembali ke Hub
              </button>
            </div>
          )}
        </div>
      </motion.main>
    </div>
  );
};
