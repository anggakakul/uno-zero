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
      <div className="w-full max-w-xl space-y-6">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="rounded-3xl bg-slate-900/90 border-2 border-amber-400/60 p-7 text-center shadow-2xl space-y-3"
        >
          <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-amber-300 via-yellow-400 to-orange-500 flex items-center justify-center shadow-xl shadow-amber-500/30">
            <Trophy className="w-10 h-10 text-slate-950" strokeWidth={2.5} />
          </div>
          <span className="inline-block px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 text-xs font-extrabold tracking-widest uppercase">
            {state.config.totalRounds} Ronde Selesai
          </span>
          <h1 className="font-display text-4xl sm:text-5xl font-black text-white">
            {winnerLabel}
          </h1>
          <p className="text-sm sm:text-base text-slate-300">
            Pemenang UNO ZERO dengan total skor paling rendah:{' '}
            <strong className="text-emerald-300 text-lg">{lowestScore} poin</strong>!
          </p>
        </motion.div>

        <section className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-3">
          <h2 className="font-display font-bold text-base text-slate-200">
            Peringkat Akhir (Skor Terendah → Tertinggi)
          </h2>
          <div className="space-y-2">
            {ranked.map((player, idx) => {
              const isWinner = player.totalScore === lowestScore;
              return (
                <div
                  key={player.id}
                  className={`flex items-center justify-between px-4 py-3 rounded-2xl border ${
                    isWinner
                      ? 'bg-emerald-500/15 border-emerald-400/50'
                      : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-8 h-8 rounded-xl font-display font-black text-sm flex items-center justify-center ${
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
                    className={`font-display font-black text-lg ${
                      isWinner ? 'text-emerald-300' : 'text-slate-300'
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
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:from-amber-300 hover:to-rose-400 text-slate-950 font-display font-black text-lg flex items-center justify-center gap-2 shadow-xl cursor-pointer transition active:scale-[0.98]"
          >
            <RotateCcw className="w-5 h-5" />
            MAIN LAGI
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onViewScoreboard}
              className="py-3.5 px-5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-300 font-display font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <ClipboardList className="w-4 h-4" />
              LIHAT SCOREBOARD
            </button>
            <button
              type="button"
              onClick={onMainMenu}
              className="py-3.5 px-5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-display font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Home className="w-4 h-4" />
              KEMBALI KE MENU UTAMA
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
