import React from 'react';
import { Crown, Trophy } from 'lucide-react';
import { Player, RoundRecord } from '../types/game';

interface ScorepadTableProps {
  players: Player[];
  roundHistory: RoundRecord[];
  totalRounds: number;
  currentRoundNumber?: number;
}

/**
 * Official Mattel Games UNO Zero 9-round Golf Scorepad (R1 - R9 + = TOTAL).
 * Automatically sorted from LOWEST total score (Rank #1) to HIGHEST.
 */
export const ScorepadTable: React.FC<ScorepadTableProps> = ({
  players,
  roundHistory,
  totalRounds,
  currentRoundNumber,
}) => {
  const sortedPlayers = [...players].sort((a, b) => a.totalScore - b.totalScore);
  const minScore = sortedPlayers.length > 0 ? sortedPlayers[0].totalScore : 0;
  const roundNumbers = Array.from({ length: totalRounds }, (_, i) => i + 1);

  return (
    <div className="rounded-3xl bg-white text-slate-900 shadow-2xl border-4 border-slate-200 overflow-hidden">
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-red-600 to-amber-500 font-display font-black italic text-sm tracking-tight shadow">
            UNO ZERO
          </div>
          <span className="font-display font-bold text-sm sm:text-base tracking-wide">
            SCOREPAD ({totalRounds} RONDE)
          </span>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold">
          Urutan: Skor Terendah (#1) → Tertinggi
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs sm:text-sm">
          <thead>
            <tr className="bg-slate-100 border-b-2 border-slate-300">
              <th className="py-2.5 px-3 font-display font-extrabold text-slate-700 sticky left-0 bg-slate-100 z-10 min-w-[140px] border-r border-slate-300">
                Peringkat &amp; Pemain
              </th>
              {roundNumbers.map((r) => {
                const isActive =
                  currentRoundNumber === r && !roundHistory.some((rh) => rh.roundNumber === r);
                return (
                  <th
                    key={r}
                    className={`py-2.5 px-2.5 text-center font-display font-extrabold border-r border-slate-200 min-w-[44px] ${
                      isActive ? 'bg-sky-100 text-sky-800' : 'text-slate-700'
                    }`}
                  >
                    R{r}
                  </th>
                );
              })}
              <th className="py-2.5 px-3 text-center font-display font-black text-slate-900 bg-amber-100 min-w-[74px]">
                TOTAL
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((player, idx) => {
              const isLeader = player.totalScore === minScore;
              return (
                <tr
                  key={player.id}
                  className={`border-b border-slate-200 ${
                    isLeader ? 'bg-emerald-50/70' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'
                  }`}
                >
                  <td
                    className={`py-2.5 px-3 font-bold border-r border-slate-300 sticky left-0 z-10 ${
                      isLeader ? 'bg-emerald-50' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-6 h-6 rounded-lg text-[10px] font-display font-black flex items-center justify-center shrink-0 ${
                          isLeader ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-white'
                        }`}
                      >
                        #{idx + 1}
                      </span>
                      <span className="truncate max-w-[100px]">{player.name}</span>
                      {isLeader && (
                        <Crown className="w-4 h-4 text-emerald-600 shrink-0" aria-label="Peringkat 1" />
                      )}
                    </div>
                  </td>

                  {roundNumbers.map((r) => {
                    const record = roundHistory.find((rh) => rh.roundNumber === r);
                    const entry = record?.scores.find((s) => s.playerId === player.id);
                    const isActive = currentRoundNumber === r && !record;

                    return (
                      <td
                        key={r}
                        className={`py-2 px-2 text-center border-r border-slate-200 font-display font-bold ${
                          isActive ? 'bg-sky-50/70 text-sky-600' : 'text-slate-800'
                        }`}
                      >
                        {entry ? (
                          <span
                            className={
                              entry.points === 0 ? 'text-emerald-600 font-black' : 'text-slate-800'
                            }
                          >
                            {entry.points}
                          </span>
                        ) : isActive ? (
                          <span className="text-[10px] font-bold text-sky-500">•</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}

                  <td
                    className={`py-2.5 px-3 text-center font-display font-black text-base ${
                      isLeader
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-50/80 text-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>{player.totalScore}</span>
                      {isLeader && <Trophy className="w-3.5 h-3.5 text-emerald-600" />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
