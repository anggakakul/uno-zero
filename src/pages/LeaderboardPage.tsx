import React, { useEffect, useState } from 'react';
import { ArrowLeft, Crown, Globe, HardDrive, Medal, RefreshCw, Trophy } from 'lucide-react';
import {
  LeaderboardEntry,
  fetchGlobalLeaderboard,
  loadLocalLeaderboard,
} from '../services/leaderboard';

interface LeaderboardPageProps {
  onBack: () => void;
}

export const LeaderboardPage: React.FC<LeaderboardPageProps> = ({ onBack }) => {
  const [tab, setTab] = useState<'global' | 'local'>('global');
  const [globalEntries, setGlobalEntries] = useState<LeaderboardEntry[]>([]);
  const [localEntries, setLocalEntries] = useState<LeaderboardEntry[]>(() =>
    loadLocalLeaderboard()
  );
  const [serverOnline, setServerOnline] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);

  const loadGlobal = async () => {
    setLoading(true);
    const res = await fetchGlobalLeaderboard();
    setGlobalEntries(res.entries);
    setServerOnline(res.online);
    setLocalEntries(loadLocalLeaderboard());
    setLoading(false);
  };

  useEffect(() => {
    loadGlobal();
  }, []);

  const top10 = (tab === 'global' ? globalEntries : localEntries).slice(0, 10);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-6 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sm font-semibold text-slate-200 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Menu Utama
          </button>
          <button
            type="button"
            onClick={loadGlobal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-amber-300 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Segarkan
          </button>
        </div>

        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/15 text-amber-300 text-xs font-bold">
            <Trophy className="w-3.5 h-3.5" />
            Top 10 Pemain Terbaik UNO ZERO
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-black text-white">Leaderboard</h1>
          <p className="text-sm text-slate-400">
            Peringkat berdasarkan <strong>rata-rata skor terendah</strong> dan{' '}
            <strong>total kemenangan</strong>.
          </p>
        </div>

        {/* Global / Local Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-slate-900 border border-slate-800">
          <button
            type="button"
            onClick={() => setTab('global')}
            className={`py-2.5 px-4 rounded-xl font-display font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition ${
              tab === 'global'
                ? 'bg-sky-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Globe className="w-4 h-4" />
            Global (Server)
          </button>
          <button
            type="button"
            onClick={() => setTab('local')}
            className={`py-2.5 px-4 rounded-xl font-display font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition ${
              tab === 'local'
                ? 'bg-emerald-400 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            Lokal (Perangkat Ini)
          </button>
        </div>

        {tab === 'global' && !serverOnline && (
          <div className="rounded-2xl bg-amber-950/40 border border-amber-500/40 px-4 py-3 text-xs text-amber-200">
            Server online tidak terjangkau—menampilkan cadangan data Leaderboard Lokal.
          </div>
        )}

        {/* Leaderboard Table */}
        <div className="rounded-3xl bg-slate-900/90 border border-slate-800 overflow-hidden shadow-2xl">
          {top10.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <Medal className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="font-display font-bold text-slate-300">Belum ada data pertandingan</p>
              <p className="text-xs text-slate-500">
                Selesaikan satu pertandingan penuh untuk mencatat skor terbaikmu di Leaderboard!
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-800/80 text-slate-300 font-display">
                  <tr>
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">Nama Pemain</th>
                    <th className="py-3 px-3 text-center">Menang</th>
                    <th className="py-3 px-3 text-center">Main</th>
                    <th className="py-3 px-3 text-center">Win Rate</th>
                    <th className="py-3 px-3 text-center">Skor Terbaik</th>
                    <th className="py-3 px-4 text-right">Rata-rata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {top10.map((entry, idx) => {
                    const isTop3 = idx < 3;
                    return (
                      <tr
                        key={`${entry.playerName}-${idx}`}
                        className={idx === 0 ? 'bg-amber-400/10' : 'hover:bg-slate-800/40'}
                      >
                        <td className="py-3 px-4 font-display font-black">
                          <span
                            className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs ${
                              idx === 0
                                ? 'bg-amber-400 text-slate-950'
                                : idx === 1
                                ? 'bg-slate-300 text-slate-950'
                                : idx === 2
                                ? 'bg-orange-500 text-slate-950'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {idx + 1}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-white">
                          <div className="flex items-center gap-1.5">
                            <span>{entry.playerName}</span>
                            {isTop3 && idx === 0 && <Crown className="w-4 h-4 text-amber-400" />}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-emerald-300">
                          {entry.wins}
                        </td>
                        <td className="py-3 px-3 text-center text-slate-300">
                          {entry.gamesPlayed}
                        </td>
                        <td className="py-3 px-3 text-center font-semibold text-sky-300">
                          {entry.winRate}%
                        </td>
                        <td className="py-3 px-3 text-center font-display font-black text-amber-300">
                          {entry.bestScore}
                        </td>
                        <td className="py-3 px-4 text-right font-display font-black text-white">
                          {entry.avgScore}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
