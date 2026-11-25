import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen,
  Bot,
  Clock,
  Gamepad2,
  Play,
  RotateCcw,
  Search,
  Settings,
  Users,
} from 'lucide-react';
import { preloadHubAssets } from '../../services/preloader';
import { VARIANT_CATALOG } from '../catalog';
import { hasVariantSave } from '../storage';
import { GameCategory, VariantId, VariantMetadata } from '../types';

interface HubHomePageProps {
  onSelectVariant: (variantId: VariantId) => void;
  onQuickPlayBot: () => void;
  onOpenGuide: (variantId: VariantId) => void;
  onOpenSettings: () => void;
}

const CATEGORIES: ('ALL' | GameCategory)[] = [
  'ALL',
  'CLASSIC UNO',
  'ACTION UNO',
  'STRATEGY UNO',
  'TEAM UNO',
  'PARTY & SOCIAL',
  'SPINOFF',
];

const DIFFICULTY_BADGE: Record<VariantMetadata['difficulty'], string> = {
  Mudah: 'bg-emerald-950/90 text-emerald-300 border-emerald-400/40',
  Menengah: 'bg-sky-950/90 text-sky-300 border-sky-400/40',
  Sulit: 'bg-amber-950/90 text-amber-300 border-amber-400/40',
  Ekstrem: 'bg-rose-950/90 text-rose-300 border-rose-400/40',
};

export const HubHomePage: React.FC<HubHomePageProps> = ({
  onSelectVariant,
  onQuickPlayBot,
  onOpenGuide,
  onOpenSettings,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'ALL' | GameCategory>('ALL');

  useEffect(() => {
    preloadHubAssets();
  }, []);

  const filteredModes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return VARIANT_CATALOG.filter((v) => {
      const matchCat = activeCategory === 'ALL' || v.category === activeCategory;
      const matchQuery =
        !q ||
        v.name.toLowerCase().includes(q) ||
        v.tagline.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        v.category.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
  }, [searchQuery, activeCategory]);

  const showFeatured = activeCategory === 'ALL' && searchQuery.trim() === '';

  const renderVariantCard = (variant: VariantMetadata, idx: number) => {
    const saved = hasVariantSave(variant.id);
    const playable = variant.status === 'AVAILABLE';
    const isFeatured = showFeatured && idx === 0;

    return (
      <motion.article
        key={variant.id}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: idx * 0.02, duration: 0.25 }}
        className={`group rounded-2xl bg-slate-900/95 border overflow-hidden flex flex-col transition-colors duration-200 hover:-translate-y-0.5 ${
          isFeatured
            ? 'sm:col-span-2 border-amber-400/50 shadow-lg'
            : 'border-slate-800 hover:border-amber-400/45 shadow-sm'
        }`}
      >
        <div
          className={`relative ${
            isFeatured ? 'h-44 sm:h-48' : 'h-36'
          } p-5 bg-gradient-to-br ${variant.accentGradient} flex flex-col justify-between overflow-hidden`}
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-slate-950/20" />
          <div className="pointer-events-none absolute -right-3 -bottom-5 font-display font-black italic text-8xl text-white/15 select-none">
            {String(idx + 1).padStart(2, '0')}
          </div>

          <div className="relative z-10 flex items-center justify-between gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-slate-950/85 text-[11px] font-display font-bold tracking-wide text-slate-100 border border-white/15">
              {variant.category}
            </span>
            {saved && (
              <span className="px-2.5 py-1 rounded-lg bg-emerald-400 text-slate-950 text-[11px] font-display font-black">
                Tersimpan
              </span>
            )}
          </div>

          <div className="relative z-10">
            <div className="text-xs font-bold text-slate-200 tracking-wide">
              {variant.badgeText}
            </div>
            <h2
              className={`font-display font-black italic text-white leading-tight ${
                isFeatured ? 'text-3xl sm:text-4xl' : 'text-2xl'
              }`}
            >
              {variant.name}
            </h2>
          </div>
        </div>

        <div className="p-5 flex-1 flex flex-col justify-between gap-4">
          <div className="space-y-2.5">
            <p className="text-xs font-bold text-amber-300">{variant.tagline}</p>
            <p className="text-sm text-slate-300 leading-relaxed">{variant.description}</p>

            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-semibold">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/90 text-slate-200 border border-slate-700">
                <Users className="w-3.5 h-3.5 text-sky-400" />
                {variant.minPlayers}–{variant.maxPlayers} Pemain
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/90 text-slate-200 border border-slate-700">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                {variant.estimatedDuration}
              </span>
              <span
                className={`px-2.5 py-1 rounded-lg border ${DIFFICULTY_BADGE[variant.difficulty]}`}
              >
                {variant.difficulty}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              disabled={!playable}
              onClick={() => onSelectVariant(variant.id)}
              className={`flex-1 min-h-11 py-2.5 px-4 rounded-xl font-display font-black text-sm tracking-wide flex items-center justify-center gap-2 transition active:scale-[0.98] ${
                playable
                  ? isFeatured || saved
                    ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                    : 'bg-slate-100 hover:bg-white text-slate-950'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {saved ? (
                <RotateCcw className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              {saved ? 'LANJUTKAN' : 'PLAY NOW'}
            </button>

            <button
              type="button"
              onClick={() => onOpenGuide(variant.id)}
              aria-label={`Panduan ${variant.name}`}
              title={`Panduan ${variant.name}`}
              className="min-h-11 min-w-11 p-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 flex items-center justify-center transition"
            >
              <BookOpen className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.article>
    );
  };

  return (
    <div className="min-h-screen table-felt text-slate-100 relative overflow-x-hidden">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-slate-950/85 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-amber-400 flex items-center justify-center border border-amber-200/60">
              <Gamepad2 className="w-5 h-5 text-slate-950" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display font-black italic text-xl sm:text-2xl tracking-tight leading-none text-white truncate">
                UNO <span className="text-amber-400">GAME HUB</span>
              </h1>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                {VARIANT_CATALOG.length} Mode Permainan UNO
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onQuickPlayBot}
              className="min-h-11 px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs sm:text-sm font-display font-black flex items-center justify-center gap-1.5 transition"
              title="Langsung main UNO Classic melawan Bot AI"
            >
              <Bot className="w-4 h-4" />
              <span>Main vs Bot</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenGuide('uno-classic')}
              aria-label="Buka Panduan Permainan"
              className="min-h-11 min-w-11 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs sm:text-sm font-bold text-slate-100 flex items-center justify-center gap-1.5 transition"
            >
              <BookOpen className="w-4 h-4 text-sky-400" />
              <span className="hidden sm:inline">Panduan</span>
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Buka Pengaturan Aplikasi"
              className="min-h-11 min-w-11 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs sm:text-sm font-bold text-slate-100 flex items-center justify-center gap-1.5 transition"
            >
              <Settings className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Pengaturan</span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <label htmlFor="hub-mode-search" className="sr-only">
              Cari mode permainan UNO
            </label>
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="hub-mode-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari mode UNO (Classic, Flip, No Mercy, DOS, ONO 99...)"
              className="w-full min-h-11 pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white placeholder:text-slate-400 focus:border-amber-400"
            />
          </div>
          <div className="inline-flex items-center gap-2 text-xs text-slate-300 font-semibold">
            <span>
              Mode Utama • Menampilkan <span className="text-white">{filteredModes.length}</span> dari{' '}
              <span className="text-amber-300 font-black">{VARIANT_CATALOG.length}</span> mode
            </span>
          </div>
        </div>

        <nav
          aria-label="Filter kategori mode permainan"
          className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1"
        >
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              aria-pressed={activeCategory === cat}
              onClick={() => setActiveCategory(cat)}
              className={`shrink-0 min-h-11 px-4 py-2 rounded-xl text-xs font-display font-bold border transition ${
                activeCategory === cat
                  ? 'bg-amber-400 text-slate-950 border-amber-300'
                  : 'bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800'
              }`}
            >
              {cat === 'ALL' ? `Semua Mode (${VARIANT_CATALOG.length})` : cat}
            </button>
          ))}
        </nav>

        {filteredModes.length === 0 ? (
          <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-8 text-center space-y-3">
            <p className="font-display font-bold text-base text-white">
              Tidak ada mode yang cocok dengan pencarianmu.
            </p>
            <p className="text-sm text-slate-300">
              Coba kata kunci lain atau tampilkan semua {VARIANT_CATALOG.length} mode permainan.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setActiveCategory('ALL');
              }}
              className="min-h-11 px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-black text-sm transition"
            >
              Tampilkan Semua Mode
            </button>
          </div>
        ) : (
          <section
            aria-label="Daftar mode permainan UNO"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {filteredModes.map((v, idx) => renderVariantCard(v, idx))}
          </section>
        )}
      </main>
    </div>
  );
};
