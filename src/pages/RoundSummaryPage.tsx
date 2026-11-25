import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, Trophy } from 'lucide-react';
import { GameState } from '../types/game';
import { PlayerGrid } from '../components/PlayerGrid';
import { ScorepadTable } from '../components/ScorepadTable';

interface RoundSummaryPageProps {
  state: GameState;
  canStartNextRound?: boolean;
  onNextRound: () => void;
}

export const RoundSummaryPage: React.FC<RoundSummaryPageProps> = ({
  state,
  canStartNextRound = true,
  onNextRound,
}) => {
  const latestRound = state.roundHistory[state.roundHistory.length - 1];
  if (!latestRound) return null;

  const lowestRoundPts = Math.min(...latestRound.scores.map((s) => s.points));
  const lowestPlayer = state.players.find((p) => p.id === latestRound.lowestRoundPlayerId);

  return (
    <div className="min-h-screen table-felt text-slate-100 py-8 px-4">
      <main className="max-w-5xl mx-auto space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-slate-950/90 border border-emerald-400/40 p-6 text-center space-y-2 shadow-lg"
        >
          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-400 text-slate-950 flex items-center justify-center">
            <Trophy className="w-7 h-7" />
          </div>
          <span className="inline-block text-xs font-bold uppercase tracking-wider text-emerald-300">
            Ronde {latestRound.roundNumber} dari {state.config.totalRounds} Selesai
          </span>
          <h1 className="font-display text-3xl sm:text-4xl font-black italic text-white">
            Semua Kartu {latestRound.triggerPlayerName} Terbuka
          </h1>
          <p className="text-sm text-slate-300">
            Skor terendah ronde ini diraih oleh{' '}
            <strong className="text-emerald-300">
              {lowestPlayer?.name ?? ''} ({lowestRoundPts} poin)
            </strong>{' '}
            dan akan memulai giliran pertama di ronde berikutnya.
          </p>
        </motion.div>

        <section className="space-y-3">
          <h2 className="font-display text-lg font-extrabold text-white">
            Hasil Grid Akhir Ronde {latestRound.roundNumber}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {state.players.map((player) => {
              const entry = latestRound.scores.find((s) => s.playerId === player.id);
              const pts = entry?.points ?? 0;
              const isBestRound = pts === lowestRoundPts;

              return (
                <div
                  key={player.id}
                  className={`rounded-3xl p-4 border space-y-3 ${
                    isBestRound
                      ? 'bg-emerald-950/35 border-emerald-500/50'
                      : 'bg-slate-900/90 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="font-display font-bold text-base text-white">
                        {player.name}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>Akumulasi: {player.totalScore} poin</span>
                        {(entry?.eliminatedColumnsCount ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-emerald-300 font-bold">
                            <CheckCircle2 className="w-3 h-3" />
                            {entry?.eliminatedColumnsCount} kol tereliminasi
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-xl font-display font-black text-sm ${
                        isBestRound
                          ? 'bg-emerald-400 text-slate-950'
                          : 'bg-slate-800 text-amber-300'
                      }`}
                    >
                      +{pts} Poin
                    </span>
                  </div>

                  <PlayerGrid
                    columns={player.columns}
                    eliminatedCount={entry?.eliminatedColumnsCount ?? 0}
                    cardSize="xs"
                    interactionMode="none"
                  />
                </div>
              );
            })}
          </div>
        </section>

        <ScorepadTable
          players={state.players}
          roundHistory={state.roundHistory}
          totalRounds={state.config.totalRounds}
        />

        <div className="pt-2">
          {canStartNextRound ? (
            <button
              type="button"
              onClick={onNextRound}
              className="w-full min-h-12 py-3.5 px-6 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-black text-base sm:text-lg tracking-wide flex items-center justify-center gap-2 transition active:scale-[0.98]"
            >
              Lanjut ke Ronde {state.roundNumber + 1} / {state.config.totalRounds}
              <ArrowRight className="w-5 h-5" />
            </button>
          ) : (
            <div className="text-center py-3.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-300 font-semibold">
              Menunggu Host memulai Ronde {state.roundNumber + 1}...
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
