import React from 'react';
import { ArrowLeft, Flag, Layers, RotateCcw, Sliders } from 'lucide-react';
import {
  DEFAULT_DECK_CONFIG,
  DEFAULT_GAME_CONFIG,
  DeckConfig,
  GameConfig,
  HouseRules,
} from '../types/game';
import { getDeckTotalCount } from '../engine/deck';

interface SettingsPageProps {
  config: GameConfig;
  onChange: (next: GameConfig) => void;
  onBack: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ config, onChange, onBack }) => {
  const totalCards = getDeckTotalCount(config.deckConfig);

  const updateHouseRule = <K extends keyof HouseRules>(key: K, value: HouseRules[K]) => {
    onChange({
      ...config,
      houseRules: {
        ...config.houseRules,
        [key]: value,
      },
    });
  };

  const updateDeckField = (key: keyof DeckConfig, val: number) => {
    const clamped = Math.max(0, Math.min(10, Math.floor(val)));
    onChange({
      ...config,
      deckConfig: {
        ...config.deckConfig,
        [key]: clamped,
      },
    });
  };

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
            Kembali
          </button>
          <button
            type="button"
            onClick={() => onChange(DEFAULT_GAME_CONFIG)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-amber-300 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Default
          </button>
        </div>

        <div className="space-y-1">
          <h1 className="font-display text-3xl font-black text-white">Pengaturan &amp; Deck</h1>
          <p className="text-sm text-slate-400">
            Deck resmi UNO Zero berjumlah 112 kartu (84 kartu angka 0–6 + 28 kartu aksi).
          </p>
        </div>

        {/* Total Rounds */}
        <section className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
              <Flag className="w-5 h-5 text-emerald-400" />
              Jumlah Ronde Permainan
            </h2>
            <span className="font-display font-black text-lg text-emerald-300">
              {config.totalRounds} Ronde
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[3, 5, 9].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => onChange({ ...config, totalRounds: v })}
                className={`px-4 py-2 rounded-xl font-display font-bold text-sm cursor-pointer ${
                  config.totalRounds === v
                    ? 'bg-emerald-400 text-slate-950'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {v === 9 ? '9 Ronde (Resmi)' : `${v} Ronde (Cepat)`}
              </button>
            ))}
          </div>
        </section>

        {/* Rules */}
        <section className="rounded-3xl bg-slate-900/90 border border-amber-500/35 p-5 space-y-5">
          <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-amber-400" />
            Nilai Poin Resmi &amp; Aturan Tambahan
          </h2>

          <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-3.5 text-xs text-slate-300 grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
            <div><div className="font-bold text-white">Angka 0–6</div><div className="text-emerald-300 font-black">0–6 poin</div></div>
            <div><div className="font-bold text-white">Reverse</div><div className="text-amber-300 font-black">10 poin</div></div>
            <div><div className="font-bold text-white">Skip</div><div className="text-amber-300 font-black">11 poin</div></div>
            <div><div className="font-bold text-white">Draw Two</div><div className="text-amber-300 font-black">12 poin</div></div>
            <div><div className="font-bold text-white">Double +2</div><div className="text-rose-300 font-black">22 poin</div></div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-200">
              Kartu Reverse pada Mode 2 Pemain
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => updateHouseRule('reverseInTwoPlayers', 'reverse_only')}
                className={`p-3 rounded-2xl border text-left text-xs sm:text-sm cursor-pointer transition ${
                  config.houseRules.reverseInTwoPlayers === 'reverse_only'
                    ? 'bg-amber-400/15 border-amber-400 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400'
                }`}
              >
                <div className="font-bold">Hanya Ubah Arah (Default)</div>
                <div className="text-[11px] opacity-80">Arah berbalik, giliran ke lawan.</div>
              </button>
              <button
                type="button"
                onClick={() => updateHouseRule('reverseInTwoPlayers', 'act_as_skip')}
                className={`p-3 rounded-2xl border text-left text-xs sm:text-sm cursor-pointer transition ${
                  config.houseRules.reverseInTwoPlayers === 'act_as_skip'
                    ? 'bg-amber-400/15 border-amber-400 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400'
                }`}
              >
                <div className="font-bold">Berlaku Seperti Skip</div>
                <div className="text-[11px] opacity-80">Pemain yang sama langsung main lagi.</div>
              </button>
            </div>
          </div>
        </section>

        {/* Editable Deck Configuration */}
        <section className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-sky-400" />
                Komposisi Deck (Total 112 Kartu)
              </h2>
              <p className="text-xs text-slate-400">
                Resmi: 3 kartu per angka 0–6 per warna (84) + 28 kartu aksi = 112 kartu.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-sky-500/20 text-sky-300 font-display font-black text-sm">
                Total: {totalCards} Kartu
              </span>
              <button
                type="button"
                onClick={() => onChange({ ...config, deckConfig: DEFAULT_DECK_CONFIG })}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 cursor-pointer"
              >
                Reset Deck
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(
              [
                ['numbersPerColor', 'Kartu Angka 0–6 (per angka & warna)', 28],
                ['skipsPerColor', 'Kartu Skip (per warna)', 4],
                ['reversesPerColor', 'Kartu Reverse (per warna)', 4],
                ['draw2PerColor', 'Kartu Draw Two (per warna)', 4],
                ['doubleDraw2PerColor', 'Kartu Double Draw Two (per warna)', 4],
              ] as const
            ).map(([key, label, multiplier]) => (
              <div
                key={key}
                className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800"
              >
                <div>
                  <div className="text-xs sm:text-sm font-bold text-slate-200">{label}</div>
                  <div className="text-[11px] text-slate-400">
                    Subtotal: {config.deckConfig[key] * multiplier} kartu
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateDeckField(key, config.deckConfig[key] - 1)}
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 font-black text-white cursor-pointer"
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-display font-black text-base text-amber-300">
                    {config.deckConfig[key]}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateDeckField(key, config.deckConfig[key] + 1)}
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 font-black text-white cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
