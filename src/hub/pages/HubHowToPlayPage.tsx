import React, { useState } from 'react';
import { ArrowLeft, BookOpen, CheckCircle2, Play, ShieldAlert } from 'lucide-react';
import { VARIANT_CATALOG, getVariantMetadata } from '../catalog';
import { VariantId } from '../types';

interface HubHowToPlayPageProps {
  initialVariantId: VariantId;
  onPlayVariant: (id: VariantId) => void;
  onBack: () => void;
}

export const HubHowToPlayPage: React.FC<HubHowToPlayPageProps> = ({
  initialVariantId,
  onPlayVariant,
  onBack,
}) => {
  const [selectedId, setSelectedId] = useState<VariantId>(initialVariantId);
  const meta = getVariantMetadata(selectedId);
  const g = meta.guide;

  return (
    <div className="min-h-screen table-felt text-slate-100 px-4 py-6 sm:py-10">
      <main className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="min-h-11 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-sm font-bold flex items-center gap-2 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali
          </button>

          <button
            type="button"
            onClick={() => onPlayVariant(selectedId)}
            className="min-h-11 px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-black text-xs sm:text-sm flex items-center gap-2 transition"
          >
            <Play className="w-4 h-4 fill-current" />
            Mainkan {meta.name}
          </button>
        </div>

        <nav
          aria-label="Pilih panduan mode permainan"
          className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1"
        >
          {VARIANT_CATALOG.map((v, idx) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={v.id === selectedId}
              onClick={() => setSelectedId(v.id)}
              className={`shrink-0 min-h-11 px-3.5 py-2 rounded-xl text-xs font-display font-bold border transition ${
                v.id === selectedId
                  ? 'bg-amber-400 text-slate-950 border-amber-300'
                  : 'bg-slate-900 text-slate-200 border-slate-800 hover:bg-slate-800'
              }`}
            >
              {String(idx + 1).padStart(2, '0')}. {v.name}
            </button>
          ))}
        </nav>

        <article className="rounded-2xl bg-slate-900/95 border border-slate-800 p-6 sm:p-8 space-y-6 shadow-lg">
          <div className="border-b border-slate-800 pb-5">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300 tracking-wide mb-1">
              <BookOpen className="w-4 h-4" />
              Panduan Resmi • {meta.category}
            </div>
            <h1 className="font-display font-black italic text-3xl sm:text-4xl text-white">
              Cara Bermain {meta.name}
            </h1>
            <p className="text-sm text-slate-300 mt-1">{meta.tagline}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
              <h2 className="font-display font-bold text-amber-300 text-sm">1. Tujuan Permainan</h2>
              <p className="text-sm text-slate-200 leading-relaxed">{g.objective}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
              <h2 className="font-display font-bold text-sky-300 text-sm">2. Jumlah Pemain</h2>
              <p className="text-sm text-slate-200 leading-relaxed">{g.players}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
              <h2 className="font-display font-bold text-emerald-300 text-sm">3. Komponen Kartu</h2>
              <p className="text-sm text-slate-200 leading-relaxed">{g.components}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
              <h2 className="font-display font-bold text-purple-300 text-sm">4. Persiapan Permainan</h2>
              <p className="text-sm text-slate-200 leading-relaxed">{g.setup}</p>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="font-display font-bold text-white text-base">5. Cara Bermain</h2>
            <ol className="space-y-2 list-decimal list-inside text-sm text-slate-200">
              {g.howToPlay.map((step, i) => (
                <li key={i} className="leading-relaxed">
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <div className="space-y-2.5">
            <h2 className="font-display font-bold text-white text-base">6. Fungsi Kartu Spesial</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {g.specialCards.map((sc, i) => (
                <div
                  key={i}
                  className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1"
                >
                  <div className="font-display font-bold text-amber-300 text-sm">
                    {sc.name}
                  </div>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{sc.effect}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="font-display font-bold text-white text-base">7. Mekanisme Khusus</h2>
            <ul className="space-y-1.5 text-sm text-slate-200">
              {g.specialMechanics.map((m, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/35 space-y-1">
              <h2 className="font-display font-bold text-rose-300 text-sm flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4" /> 8. Aturan Penalti
              </h2>
              <ul className="text-xs sm:text-sm text-rose-100 space-y-1">
                {g.penalties.map((p, i) => (
                  <li key={i}>• {p}</li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
              <h2 className="font-display font-bold text-amber-300 text-sm">9. Perhitungan Skor</h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{g.scoring}</p>
            </div>

            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/35 space-y-1">
              <h2 className="font-display font-bold text-emerald-300 text-sm">10. Menentukan Pemenang</h2>
              <p className="text-xs sm:text-sm text-emerald-100 leading-relaxed">{g.winning}</p>
            </div>
          </div>

          <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-4 space-y-2 text-xs sm:text-sm">
            <div className="font-display font-bold text-slate-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Klasifikasi Sumber Aturan
            </div>
            <p className="text-slate-300">
              <strong className="text-emerald-300">Aturan Resmi:</strong> {g.ruleClassification.official}
            </p>
            {g.ruleClassification.digitalAdaptation && (
              <p className="text-slate-300">
                <strong className="text-sky-300">Adaptasi Digital:</strong>{' '}
                {g.ruleClassification.digitalAdaptation}
              </p>
            )}
            {g.ruleClassification.optionalHouseRules && (
              <p className="text-slate-300">
                <strong className="text-amber-300">Aturan Tambahan:</strong>{' '}
                {g.ruleClassification.optionalHouseRules}
              </p>
            )}
          </div>
        </article>
      </main>
    </div>
  );
};
