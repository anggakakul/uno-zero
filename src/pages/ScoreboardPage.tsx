import React from 'react';
import { ArrowLeft, CheckCircle2, Flag } from 'lucide-react';
import { GameState } from '../types/game';
import { ScorepadTable } from '../components/ScorepadTable';

interface ScoreboardPageProps {
  state: GameState;
  onBack: () => void;
}

export const ScoreboardPage: React.FC<ScoreboardPageProps> = ({ state, onBack }) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-6 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sm font-semibold text-slate-200 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali
          </button>
          <span className="text-xs font-bold text-slate-400">
            Ronde Selesai: {state.roundHistory.length} / {state.config.totalRounds}
          </span>
        </div>

        <div className="space-y-1">
          <h1 className="font-display text-3xl font-black text-white">
            Papan Skor Akumulasi {state.config.totalRounds} Ronde
          </h1>
          <p className="text-sm text-slate-400">
            Ringkasan lengkap skor setiap ronde, kolom tereliminasi, dan total akumulasi pemain.
          </p>
        </div>

        <ScorepadTable
          players={state.players}
          roundHistory={state.roundHistory}
          totalRounds={state.config.totalRounds}
        />

        <section className="space-y-3">
          <h2 className="font-display text-lg font-extrabold text-white">
            Detail Riwayat per Ronde
          </h2>
          {state.roundHistory.length === 0 ? (
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 text-sm text-slate-400">
              Belum ada ronde yang selesai.
            </div>
          ) : (
            <div className="space-y-3">
              {[...state.roundHistory].reverse().map((round) => (
                <div
                  key={round.roundNumber}
                  className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-800 font-display font-black text-xs text-white">
                        Ronde {round.roundNumber}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-bold text-emerald-300">
                        <Flag className="w-4 h-4" />
                        Pemicu Akhir Ronde: {round.triggerPlayerName}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {round.scores.map((s) => (
                      <div
                        key={s.playerId}
                        className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs"
                      >
                        <div className="font-bold text-white truncate">{s.playerName}</div>
                        <div className="text-amber-300 font-display font-black">
                          +{s.points} poin
                        </div>
                        {s.eliminatedColumnsCount > 0 && (
                          <div className="text-[10px] text-emerald-300 flex items-center gap-0.5 mt-0.5">
                            <CheckCircle2 className="w-3 h-3" />
                            {s.eliminatedColumnsCount} kol cocok
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
