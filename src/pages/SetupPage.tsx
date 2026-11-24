import React, { useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Dices,
  Flag,
  Play,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { GameConfig } from '../types/game';
import { getDeckTotalCount } from '../engine/deck';
import { INITIAL_CARDS_PER_PLAYER, PlayerInit } from '../engine/gameEngine';

interface SetupPageProps {
  mode: 'ai' | 'local';
  config: GameConfig;
  onUpdateTotalRounds: (rounds: number) => void;
  onStartGame: (players: PlayerInit[], dealerIndex: number) => void;
  onBack: () => void;
  onOpenHowToPlay: () => void;
  onOpenSettings: () => void;
}

const DEFAULT_NAMES = [
  'Kamu',
  'Budi',
  'Citra',
  'Dina',
  'Eko',
  'Fani',
  'Gilang',
  'Hana',
];

const BOT_NAMES = [
  'Bot Alpha',
  'Bot Nova',
  'Bot Vega',
  'Bot Orion',
  'Bot Lynx',
  'Bot Atlas',
  'Bot Echo',
];

export const SetupPage: React.FC<SetupPageProps> = ({
  mode,
  config,
  onUpdateTotalRounds,
  onStartGame,
  onBack,
  onOpenHowToPlay,
  onOpenSettings,
}) => {
  const isAI = mode === 'ai';
  const [humanName, setHumanName] = useState('Kamu');
  const [botCount, setBotCount] = useState(2); // 1 to 7 bots
  const [localCount, setLocalCount] = useState(3); // 2 to 8 players
  const [names, setNames] = useState<string[]>(DEFAULT_NAMES);
  const [dealerIndex, setDealerIndex] = useState<number>(0);

  const totalPlayers = isAI ? botCount + 1 : localCount;
  const deckTotal = getDeckTotalCount(config.deckConfig);
  const minCardsNeeded = totalPlayers * INITIAL_CARDS_PER_PLAYER + 1;
  const deckEnough = deckTotal >= minCardsNeeded;
  const safeDealer = Math.min(dealerIndex, totalPlayers - 1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deckEnough) return;

    if (isAI) {
      const players: PlayerInit[] = [
        { id: 'player-1', name: humanName.trim() || 'Kamu', isAI: false },
        ...Array.from({ length: botCount }, (_, i) => ({
          id: `bot-${i + 1}`,
          name: BOT_NAMES[i],
          isAI: true,
        })),
      ];
      onStartGame(players, safeDealer);
      return;
    }

    const players: PlayerInit[] = names.slice(0, localCount).map((n, i) => ({
      id: `player-${i + 1}`,
      name: n.trim() || `Pemain ${i + 1}`,
      isAI: false,
    }));
    onStartGame(players, safeDealer);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sm font-semibold text-slate-200 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Menu
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenHowToPlay}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs sm:text-sm font-semibold text-sky-300 cursor-pointer"
            >
              <BookOpen className="w-4 h-4" />
              Petunjuk
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs sm:text-sm font-semibold text-amber-300 cursor-pointer"
            >
              <Settings className="w-4 h-4" />
              Deck &amp; Skor
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <h1 className="font-display text-3xl font-black text-white flex items-center gap-2.5">
            {isAI ? <Bot className="w-7 h-7 text-amber-400" /> : <Users className="w-7 h-7 text-emerald-400" />}
            {isAI ? 'Single-Player vs Bot AI Cerdas' : 'Persiapan Mode Lokal'}
          </h1>
          <p className="text-sm text-slate-400">
            {isAI
              ? 'Pilih 1 hingga 7 Bot AI strategis yang mampu mengincar kartu rendah, eliminasi kolom, dan menangkap UNO!'
              : 'Atur 2–8 pemain, nama, dealer, dan target ronde.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {isAI ? (
            <>
              <section className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-3">
                <label className="font-display font-bold text-base text-white">Nama Kamu</label>
                <input
                  type="text"
                  maxLength={18}
                  value={humanName}
                  onChange={(e) => setHumanName(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-700 text-white font-semibold focus:border-amber-400 focus:outline-none"
                />
              </section>

              <section className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 font-display font-bold text-base text-white">
                    <Bot className="w-5 h-5 text-amber-400" />
                    Jumlah Bot AI Lawan
                  </label>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-400/15 text-amber-300">
                    1 Kamu + {botCount} Bot ({totalPlayers} Pemain)
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setBotCount(n);
                        setDealerIndex(0);
                      }}
                      className={`py-2.5 rounded-xl font-display font-black text-base transition cursor-pointer ${
                        botCount === n
                          ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/25'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <>
              <section className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 font-display font-bold text-base text-white">
                    <Users className="w-5 h-5 text-amber-400" />
                    Jumlah Pemain
                  </label>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-400/15 text-amber-300">
                    {localCount} Pemain • Grid 2×3
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setLocalCount(n);
                        if (dealerIndex >= n) setDealerIndex(0);
                      }}
                      className={`py-2.5 rounded-xl font-display font-black text-base transition cursor-pointer ${
                        localCount === n
                          ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/25'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display font-bold text-base text-white">
                    Nama Pemain &amp; Dealer
                  </h2>
                  <button
                    type="button"
                    onClick={() => setDealerIndex(Math.floor(Math.random() * localCount))}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-amber-300 cursor-pointer"
                  >
                    <Dices className="w-4 h-4" />
                    Acak Dealer
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {names.slice(0, localCount).map((name, idx) => {
                    const isDealer = safeDealer === idx;
                    return (
                      <div
                        key={idx}
                        className={`flex items-center gap-2 p-2.5 rounded-2xl border ${
                          isDealer
                            ? 'bg-amber-400/10 border-amber-400/50'
                            : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <span className="w-7 h-7 rounded-xl bg-slate-800 text-slate-200 font-display font-bold text-xs flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          maxLength={18}
                          value={name}
                          onChange={(e) =>
                            setNames((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
                          }
                          className="w-full bg-transparent text-sm font-semibold text-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setDealerIndex(idx)}
                          className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                            isDealer ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {isDealer ? 'DEALER' : 'Dealer'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          {/* Total Rounds */}
          <section className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 font-display font-bold text-base text-white">
                <Flag className="w-5 h-5 text-emerald-400" />
                Target Ronde
              </label>
              <span className="font-display font-black text-xl text-emerald-300">
                {config.totalRounds} Ronde
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[3, 5, 9].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => onUpdateTotalRounds(val)}
                  className={`px-4 py-2 rounded-xl font-display font-bold text-sm cursor-pointer ${
                    config.totalRounds === val
                      ? 'bg-emerald-400 text-slate-950'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  {val === 9 ? '9 Ronde (Resmi)' : `${val} Ronde (Cepat)`}
                </button>
              ))}
            </div>
          </section>

          <div className="rounded-2xl p-4 border bg-slate-900/70 border-slate-800 text-xs sm:text-sm text-slate-300 flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
            <div>
              <strong>Deck Resmi 112 Kartu:</strong> 84 kartu angka (0–6) + 28 kartu aksi (Skip,
              Reverse, Draw Two, Double Draw Two). Pemain dengan skor terendah tiap ronde otomatis
              memulai ronde berikutnya!
            </div>
          </div>

          <button
            type="submit"
            disabled={!deckEnough}
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:from-amber-300 hover:to-rose-400 disabled:opacity-40 text-slate-950 font-display font-black text-xl tracking-wide shadow-2xl flex items-center justify-center gap-2.5 cursor-pointer transition active:scale-[0.98]"
          >
            <Play className="w-6 h-6 fill-slate-950" />
            MULAI PERMAINAN
          </button>
        </form>
      </div>
    </div>
  );
};
