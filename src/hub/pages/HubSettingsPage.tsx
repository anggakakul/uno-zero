import React, { useState } from 'react';
import { ArrowLeft, Eye, Trash2, Volume2, VolumeX } from 'lucide-react';
import { soundFX } from '../../services/sound';
import { VARIANT_CATALOG } from '../catalog';
import {
  clearVariantSave,
  hasVariantSave,
  loadHubPreferences,
  saveHubPreferences,
} from '../storage';
import { ColorblindSymbol } from '../utils/colorblind';

interface HubSettingsPageProps {
  onBack: () => void;
}

export const HubSettingsPage: React.FC<HubSettingsPageProps> = ({ onBack }) => {
  const [prefs, setPrefs] = useState(() => loadHubPreferences());
  const [muted, setMuted] = useState(() => soundFX.isMuted());
  const [, forceRefresh] = useState(0);

  const toggleSound = () => {
    const nextMuted = soundFX.toggleMute();
    setMuted(nextMuted);
    const updated = { ...prefs, soundEnabled: !nextMuted };
    setPrefs(updated);
    saveHubPreferences(updated);
  };

  return (
    <div className="min-h-screen table-felt text-slate-100 px-4 py-6 sm:py-10">
      <main className="max-w-2xl mx-auto space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-sm font-bold flex items-center gap-2 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke UNO Game Hub
        </button>

        <section className="rounded-2xl bg-slate-900/95 border border-slate-800 p-6 space-y-6 shadow-lg">
          <div>
            <h1 className="font-display font-black italic text-3xl text-white">
              Pengaturan Aplikasi
            </h1>
            <p className="text-sm text-slate-300 mt-1">
              Kelola preferensi umum, audio, dan data tersimpan untuk setiap mode UNO.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-950/70 border border-slate-800">
              <div>
                <div className="font-display font-bold text-sm text-white">Efek Suara (SFX)</div>
                <div className="text-xs text-slate-300">
                  Suara kartu, efek aksi, panggilan UNO, dan fanfare kemenangan.
                </div>
              </div>
              <button
                type="button"
                aria-pressed={!muted}
                onClick={toggleSound}
                className={`min-h-11 px-4 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition shrink-0 ${
                  muted
                    ? 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
                    : 'bg-emerald-400 hover:bg-emerald-300 text-slate-950'
                }`}
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                {muted ? 'Mati' : 'Aktif'}
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="font-display font-bold text-sm text-white flex items-center gap-1.5">
                    <Eye className="w-4 h-4 text-amber-400" />
                    Mode Buta Warna (Colorblind Mode)
                  </div>
                  <div className="text-xs text-slate-300">
                    Tampilkan simbol geometris unik di sudut setiap kartu sesuai warnanya.
                  </div>
                </div>
                <button
                  type="button"
                  aria-pressed={Boolean(prefs.colorblindMode)}
                  onClick={() => {
                    const updated = { ...prefs, colorblindMode: !prefs.colorblindMode };
                    setPrefs(updated);
                    saveHubPreferences(updated);
                  }}
                  className={`min-h-11 px-4 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition shrink-0 ${
                    prefs.colorblindMode
                      ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                      : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  <Eye className="w-4 h-4" />
                  {prefs.colorblindMode ? 'Aktif' : 'Nonaktif'}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80 text-[11px] font-semibold">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-600/25 border border-red-400/40 text-red-200">
                  <ColorblindSymbol color="red" size={12} /> Merah
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/25 border border-amber-400/40 text-amber-200">
                  <ColorblindSymbol color="yellow" size={12} /> Kuning
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600/25 border border-emerald-400/40 text-emerald-200">
                  <ColorblindSymbol color="green" size={12} /> Hijau
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600/25 border border-blue-400/40 text-blue-200">
                  <ColorblindSymbol color="blue" size={12} /> Biru
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
              <label
                htmlFor="hub-default-player-name"
                className="font-display font-bold text-sm text-white block"
              >
                Nama Pemain Default
              </label>
              <input
                id="hub-default-player-name"
                type="text"
                value={prefs.defaultPlayerName}
                onChange={(e) => {
                  const updated = { ...prefs, defaultPlayerName: e.target.value };
                  setPrefs(updated);
                  saveHubPreferences(updated);
                }}
                className="w-full min-h-11 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white placeholder:text-slate-400 focus:border-amber-400"
              />
            </div>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-slate-800">
            <h2 className="font-display font-bold text-xs uppercase tracking-wider text-slate-300">
              Data Permainan Tersimpan (Terisolasi per Varian)
            </h2>
            <div className="space-y-2">
              {VARIANT_CATALOG.map((v) => {
                const exists = hasVariantSave(v.id);
                return (
                  <div
                    key={v.id}
                    className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs sm:text-sm"
                  >
                    <span className="font-bold text-slate-200">{v.name}</span>
                    {exists ? (
                      <button
                        type="button"
                        onClick={() => {
                          clearVariantSave(v.id);
                          forceRefresh((n) => n + 1);
                        }}
                        className="min-h-11 px-3.5 py-2 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-200 font-bold flex items-center gap-1.5 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Hapus Save
                      </button>
                    ) : (
                      <span className="text-slate-400 text-xs font-medium">Kosong</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
