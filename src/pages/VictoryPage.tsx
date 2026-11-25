import React from 'react';
import { motion } from 'framer-motion';
import { ClipboardList, Crown, Home, RotateCcw, Trophy } from 'lucide-react';
import { GameState } from '../types/game';
import { getRankedPlayers } from '../engine/gameEngine';

interface VictoryPageProps {
  state: GameState;
  onPlayAgain: () => void;
  onMainMenu: () => void;
  onViewScoreboard: () => void;
}

export const VictoryPage: React.FC<VictoryPageProps> = ({
  state,
  onPlayAgain,
  onMainMenu,
  onViewScoreboard,
}) => {
  const ranked = getRankedPlayers(state.players);
  const lowestScore = ranked[0]?.totalScore ?? 0;
  const winners = ranked.filter((p) => p.totalScore === lowestScore);
  const winnerLabel = winners.map((w) => w.name).join(' & ');

  return (
    <div className="min-h-screen table-felt text-slate-100 py-10 px-4 flex flex-col items-center justify-center">
      <main className="w-full max-w-xl space-y-6">
        <motion.div
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="rounded-2xl bg-slate-950/90 border border-amber-400/45 p-7 text-center shadow-xl space-y-3"
        >
          <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-400 flex items-center justify-center">
            <Trophy className="w-8 h-8 text-slate-950" strokeWidth={2.5} />
          </div>
          <span className="inline-block px-3 py-1 rounded-lg bg-amber-950/80 border border-amber-400/40 text-amber-300 text-xs font-bold tracking-wider uppercase">
            UNO ZERO • {state.config.totalRounds} Ronde Selesai
          </span>
          <h1 className="font-display italic text-4xl sm:text-5xl font-black text-white">
            {winnerLabel}
          </h1>
          <p className="text-sm sm:text-base text-slate-300">
            Pemenang UNO ZERO dengan total skor terendah:{' '}
            <strong className="text-emerald-300 text-lg tabular-nums">{lowestScore} poin</strong>.
          </p>
        </motion.div>

        <section className="rounded-2xl bg-slate-950/90 border border-slate-800 p-5 space-y-3">
          <h2 className="font-display font-bold text-sm uppercase tracking-wider text-slate-300">
            Peringkat Akhir (Skor Terendah ke Tertinggi)
          </h2>
          <div className="space-y-2">
            {ranked.map((player, idx) => {
              const isWinner = player.totalScore === lowestScore;
              return (
                <div
                  key={player.id}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
                    isWinner
                      ? 'bg-emerald-950/60 border-emerald-400/50'
                      : 'bg-slate-900/90 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-8 h-8 rounded-lg font-display font-black text-sm flex items-center justify-center ${
                        isWinner
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      #{idx + 1}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-display font-bold text-base text-white">
                        {player.name}
                      </span>
                      {isWinner && <Crown className="w-4 h-4 text-amber-400" />}
                    </div>
                  </div>
                  <span
                    className={`font-display font-black text-lg tabular-nums ${
                      isWinner ? 'text-emerald-300' : 'text-slate-200'
                    }`}
                  >
                    {player.totalScore} poin
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={onPlayAgain}
            className="w-full min-h-12 py-3.5 px-6 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-black text-base flex items-center justify-center gap-2 transition active:scale-[0.98]"
          >
            <RotateCcw className="w-5 h-5" />
            Main Lagi
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onViewScoreboard}
              className="min-h-11 py-3 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-300 font-display font-bold text-sm flex items-center justify-center gap-2 transition"
            >
              <ClipboardList className="w-4 h-4" />
              Lihat Scoreboard
            </button>
            <button
              type="button"
              onClick={onMainMenu}
              className="min-h-11 py-3 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-100 font-display font-bold text-sm flex items-center justify-center gap-2 transition"
            >
              <Home className="w-4 h-4" />
              Kembali ke Hub
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
