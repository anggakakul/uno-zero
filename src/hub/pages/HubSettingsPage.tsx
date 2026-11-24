import React, { useState } from 'react';
import { ArrowLeft, Trash2, Volume2, VolumeX } from 'lucide-react';
import { soundFX } from '../../services/sound';
import { VARIANT_CATALOG } from '../catalog';
import {
  clearVariantSave,
  hasVariantSave,
  loadHubPreferences,
  saveHubPreferences,
} from '../storage';

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
      <div className="max-w-2xl mx-auto space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="px-3.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-sm font-bold flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke UNO Game Hub
        </button>

        <div className="rounded-3xl bg-slate-900/90 border border-white/10 p-6 space-y-6 shadow-2xl">
          <div>
            <h1 className="font-display font-black italic text-3xl text-white">
              Pengaturan Aplikasi
            </h1>
            <p className="text-xs text-slate-400">
              Kelola preferensi umum, audio, dan data tersimpan terisolasi per varian UNO.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
              <div>
                <div className="font-display font-bold text-sm text-white">Efek Suara (SFX)</div>
                <div className="text-xs text-slate-400">
                  Suara kartu, UNO call, Launcher Attack, dan alarm Overload.
                </div>
              </div>
              <button
                type="button"
                onClick={toggleSound}
                className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer ${
                  muted
                    ? 'bg-slate-800 text-slate-400 border border-slate-700'
                    : 'bg-emerald-400 text-slate-950'
                }`}
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                {muted ? 'Mati' : 'Aktif'}
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
              <label className="font-display font-bold text-sm text-white block">
                Nama Pemain Default
              </label>
              <input
                type="text"
                value={prefs.defaultPlayerName}
                onChange={(e) => {
                  const updated = { ...prefs, defaultPlayerName: e.target.value };
                  setPrefs(updated);
                  saveHubPreferences(updated);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-slate-800">
            <h2 className="font-display font-bold text-xs uppercase tracking-wider text-slate-400">
              Data Permainan Tersimpan (Terisolasi per Varian)
            </h2>
            <div className="space-y-2">
              {VARIANT_CATALOG.filter((v) => v.id !== 'uno-zero').map((v) => {
                const exists = hasVariantSave(v.id);
                return (
                  <div
                    key={v.id}
                    className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs"
                  >
                    <span className="font-bold text-slate-200">{v.name}</span>
                    {exists ? (
                      <button
                        type="button"
                        onClick={() => {
                          clearVariantSave(v.id);
                          forceRefresh((n) => n + 1);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Hapus Save
                      </button>
                    ) : (
                      <span className="text-slate-500">Kosong</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
