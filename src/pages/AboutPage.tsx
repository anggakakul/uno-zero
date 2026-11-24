import React from 'react';
import { ArrowLeft, CheckCircle2, Info, Shield } from 'lucide-react';

interface AboutPageProps {
  onBack: () => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sm font-semibold text-slate-200 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali
        </button>

        <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-6 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-bold">
            <Info className="w-3.5 h-3.5" />
            Tentang Aplikasi
          </div>
          <h1 className="font-display text-3xl font-black text-white">
            UNO ZERO Digital Card Game
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Adaptasi digital permainan kartu <strong>Mattel Games UNO Zero (Model JHH48)</strong>{' '}
            bergaya <strong>Golf 2×3 Grid</strong> selama <strong>9 ronde</strong>. Pemain
            mengeliminasi pasangan kolom vertikal (angka atau warna sama) dan memanfaatkan kartu
            aksi Skip, Reverse, Draw Two, serta Double Draw Two untuk meraih{' '}
            <strong>total skor terendah</strong>.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {[
              'Formasi Grid 2×3 (6 kartu tertutup) & buka 1 kartu awal',
              'Eliminasi kolom vertikal otomatis (warna / angka sama = 0 poin)',
              'Kartu Aksi: Skip, Reverse, Draw Two (+1 kolom), Double Draw Two',
              'Seruan UNO! (sisa 1 tertutup) & Tantang/Catch (+2 kartu tertutup)',
              'Papan Skor Akumulasi 9 Ronde otomatis',
              'Simpan progres & konfigurasi di Local Storage',
            ].map((item) => (
              <div
                key={item}
                className="flex items-start gap-2 p-3 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs sm:text-sm text-slate-200"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-4 flex items-start gap-2.5 text-xs text-slate-400">
            <Shield className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <span>
              UNO dan UNO Zero adalah merek dagang dari Mattel, Inc. Aplikasi web ini dibuat sebagai
              implementasi permainan digital interaktif.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
