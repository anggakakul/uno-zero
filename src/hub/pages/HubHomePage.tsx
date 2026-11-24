import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Cpu,
  Gamepad2,
  Layers,
  Play,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Users,
  Wand2,
} from 'lucide-react';
import { VARIANT_CATALOG } from '../catalog';
import { ADDON_PACKS_CATALOG, DIGITAL_TOOLS_CATALOG } from '../expansions/catalog';
import { hasVariantSave } from '../storage';
import {
  AddOnPackId,
  DigitalToolId,
  GameCategory,
  VariantId,
  VariantMetadata,
} from '../types';

interface HubHomePageProps {
  selectedPacks: AddOnPackId[];
  selectedTools: DigitalToolId[];
  onTogglePack: (packId: AddOnPackId) => void;
  onToggleTool: (toolId: DigitalToolId) => void;
  onSelectVariant: (variantId: VariantId) => void;
  onOpenGuide: (variantId: VariantId) => void;
  onOpenSettings: () => void;
}

type LobbyTab = 'modes' | 'tools' | 'packs' | 'spinoff';

const CATEGORIES: ('ALL' | GameCategory)[] = [
  'ALL',
  'CLASSIC UNO',
  'STRATEGY UNO',
  'ACTION UNO',
  'PARTY & SOCIAL',
  'TEAM UNO',
  'FAMILY UNO',
  'SPECIAL UNO',
];

const DIFFICULTY_BADGE: Record<VariantMetadata['difficulty'], string> = {
  Mudah: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/35',
  Menengah: 'bg-sky-500/20 text-sky-300 border-sky-400/35',
  Sulit: 'bg-amber-500/20 text-amber-300 border-amber-400/35',
  Ekstrem: 'bg-rose-500/20 text-rose-300 border-rose-400/35',
};

export const HubHomePage: React.FC<HubHomePageProps> = ({
  selectedPacks,
  selectedTools,
  onTogglePack,
  onToggleTool,
  onSelectVariant,
  onOpenGuide,
  onOpenSettings,
}) => {
  const [activeTab, setActiveTab] = useState<LobbyTab>('modes');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'ALL' | GameCategory>('ALL');

  const mainModes = useMemo(
    () => VARIANT_CATALOG.filter((v) => !v.isSpinoff),
    []
  );
  const spinoffModes = useMemo(
    () => VARIANT_CATALOG.filter((v) => v.isSpinoff),
    []
  );

  const filteredMainModes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return mainModes.filter((v) => {
      const matchCat = activeCategory === 'ALL' || v.category === activeCategory;
      const matchQuery =
        !q ||
        v.name.toLowerCase().includes(q) ||
        v.tagline.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        v.category.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
  }, [mainModes, searchQuery, activeCategory]);

  const renderVariantCard = (variant: VariantMetadata, idx: number) => {
    const saved = hasVariantSave(variant.id);
    const playable = variant.status === 'AVAILABLE';

    return (
      <motion.article
        key={variant.id}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: idx * 0.025 }}
        className="group rounded-3xl bg-slate-900/85 border border-white/10 hover:border-amber-400/45 overflow-hidden flex flex-col shadow-xl transition-all duration-200 hover:-translate-y-1"
      >
        <div
          className={`relative h-36 p-5 bg-gradient-to-br ${variant.accentGradient} flex flex-col justify-between overflow-hidden`}
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/75 via-black/15 to-transparent" />
          <div className="pointer-events-none absolute -right-4 -bottom-6 font-display font-black italic text-8xl text-white/15 select-none">
            {variant.number}
          </div>

          <div className="relative z-10 flex items-center justify-between gap-2">
            <span className="px-2.5 py-1 rounded-full bg-slate-950/75 backdrop-blur text-[10px] font-display font-extrabold tracking-wider text-white border border-white/20">
              {variant.category}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/90 text-slate-950 text-[10px] font-black tracking-wider">
              {variant.status}
            </span>
          </div>

          <div className="relative z-10">
            <div className="text-[11px] font-bold text-white/90 tracking-wide uppercase">
              {variant.badgeText}
            </div>
            <h3 className="font-display font-black italic text-2xl text-white drop-shadow leading-tight">
              {variant.name}
            </h3>
          </div>
        </div>

        <div className="p-5 flex-1 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <p className="text-xs font-bold text-amber-300">{variant.tagline}</p>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {variant.description}
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-semibold">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/90 text-slate-200 border border-slate-700/80">
                <Users className="w-3.5 h-3.5 text-sky-400" />
                {variant.minPlayers}–{variant.maxPlayers} Pemain
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/90 text-slate-200 border border-slate-700/80">
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
              className={`flex-1 py-3 px-4 rounded-2xl font-display font-black text-sm tracking-wide flex items-center justify-center gap-2 transition cursor-pointer ${
                playable
                  ? `bg-gradient-to-r ${variant.accentGradient} text-slate-950 shadow-lg hover:brightness-110 active:scale-[0.98]`
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              {saved ? (
                <RotateCcw className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              {saved ? 'MAIN / LANJUT' : 'PLAY NOW'}
            </button>

            <button
              type="button"
              onClick={() => onOpenGuide(variant.id)}
              title={`Panduan ${variant.name}`}
              className="p-3 rounded-2xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer transition"
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
      <div className="pointer-events-none fixed -top-32 -left-24 w-96 h-96 rounded-full bg-red-600/15 blur-3xl" />
      <div className="pointer-events-none fixed top-1/3 -right-24 w-96 h-96 rounded-full bg-indigo-500/15 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-32 left-1/3 w-96 h-96 rounded-full bg-amber-500/10 blur-3xl" />

      {/* Top Navigation */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-slate-950/75 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 via-amber-400 to-rose-600 flex items-center justify-center shadow-lg shadow-orange-500/25 border border-white/30">
              <Gamepad2 className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <h1 className="font-display font-black italic text-xl sm:text-2xl tracking-tight leading-none text-white">
                UNO{' '}
                <span className="bg-gradient-to-r from-amber-300 via-orange-400 to-rose-500 bg-clip-text text-transparent">
                  GAME HUB
                </span>
              </h1>
              <p className="text-[11px] text-slate-400 font-medium">
                {VARIANT_CATALOG.length} Mode • 6 Alat Meja • 7 Add-On Packs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(selectedPacks.length > 0 || selectedTools.length > 0) && (
              <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-400/35 text-emerald-300 text-xs font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                {selectedTools.length} Alat • {selectedPacks.length} Pack Aktif
              </span>
            )}
            <button
              type="button"
              onClick={() => onOpenGuide('uno-classic')}
              className="px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-xs sm:text-sm font-bold text-slate-200 flex items-center gap-1.5 cursor-pointer transition"
            >
              <BookOpen className="w-4 h-4 text-sky-400" />
              <span className="hidden sm:inline">Panduan</span>
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-xs sm:text-sm font-bold text-slate-200 flex items-center gap-1.5 cursor-pointer transition"
            >
              <Settings className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Pengaturan</span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* 4 Lobby Category Tabs */}
        <nav className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { id: 'modes' as const, label: 'Mode Utama', count: mainModes.length, icon: Gamepad2 },
            { id: 'tools' as const, label: 'Alat Meja', count: selectedTools.length, icon: Cpu },
            { id: 'packs' as const, label: 'Add-On Packs', count: selectedPacks.length, icon: Layers },
            { id: 'spinoff' as const, label: 'Spinoff (DOS & 99)', count: spinoffModes.length, icon: Wand2 },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`p-3.5 rounded-2xl border font-display font-black text-xs sm:text-sm flex items-center justify-between gap-2 cursor-pointer transition ${
                  active
                    ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 border-amber-300 shadow-lg shadow-amber-400/20'
                    : 'bg-slate-900/85 text-slate-200 border-white/10 hover:bg-slate-800'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    active ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-amber-300'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </nav>

        {/* TAB 1: MODE UTAMA */}
        {activeTab === 'modes' && (
          <div className="space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari mode UNO (Party, Liar's, Rummy, Flip, No Mercy...)"
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-900/90 border border-slate-700/80 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>
              <div className="text-xs text-slate-400 font-semibold">
                Menampilkan <span className="text-white">{filteredMainModes.length}</span> dari{' '}
                {mainModes.length} mode utama
              </div>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-display font-bold border cursor-pointer transition ${
                    activeCategory === cat
                      ? 'bg-amber-400 text-slate-950 border-amber-300'
                      : 'bg-slate-900/80 text-slate-300 border-slate-700/80 hover:bg-slate-800'
                  }`}
                >
                  {cat === 'ALL' ? 'SEMUA MODE' : cat}
                </button>
              ))}
            </div>

            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredMainModes.map((v, idx) => renderVariantCard(v, idx))}
            </section>
          </div>
        )}

        {/* TAB 2: SIMULASI ALAT BANTU DIGITAL */}
        {activeTab === 'tools' && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-900/80 border border-white/10 p-4 text-xs sm:text-sm text-slate-300">
              Centang <strong>Alat Bantu Digital</strong> di bawah untuk langsung mengaktifkannya di
              meja permainan mode UNO pilihanmu!
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {DIGITAL_TOOLS_CATALOG.map((tool) => {
                const enabled = selectedTools.includes(tool.id);
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => onToggleTool(tool.id)}
                    className={`text-left rounded-3xl p-5 border-2 transition cursor-pointer flex flex-col justify-between gap-3 ${
                      enabled
                        ? 'bg-slate-900 border-emerald-400 shadow-xl shadow-emerald-500/15'
                        : 'bg-slate-900/75 border-white/10 hover:border-amber-400/50'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black text-slate-950 bg-gradient-to-r ${tool.accent}`}
                        >
                          {tool.shortTag}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-black ${
                            enabled ? 'text-emerald-400' : 'text-slate-500'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          {enabled ? 'AKTIF' : 'NONAKTIF'}
                        </span>
                      </div>
                      <h3 className="font-display font-black text-lg text-white">{tool.name}</h3>
                      <p className="text-xs text-slate-300 leading-relaxed">{tool.description}</p>
                    </div>
                    <div className="text-[11px] font-semibold text-amber-300 bg-slate-950/70 rounded-xl px-3 py-2 border border-white/5">
                      {tool.mechanicSummary}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: ADD-ON EXPANSION PACKS */}
        {activeTab === 'packs' && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-900/80 border border-white/10 p-4 text-xs sm:text-sm text-slate-300">
              Kombinasikan <strong>Add-On Expansion Packs</strong> di bawah — kartu-kartu ekspansi
              akan disuntikkan secara modular ke dek pertandinganmu!
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ADDON_PACKS_CATALOG.map((pack) => {
                const enabled = selectedPacks.includes(pack.id);
                return (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => onTogglePack(pack.id)}
                    className={`text-left rounded-3xl p-5 border-2 transition cursor-pointer flex flex-col justify-between gap-3 ${
                      enabled
                        ? 'bg-slate-900 border-amber-400 shadow-xl shadow-amber-500/15'
                        : 'bg-slate-900/75 border-white/10 hover:border-amber-400/40'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black text-slate-950 bg-gradient-to-r ${pack.accent}`}
                        >
                          {pack.shortTag}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-black ${
                            enabled ? 'text-amber-300' : 'text-slate-500'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          {enabled ? 'DIPASANG' : 'TAMBAH'}
                        </span>
                      </div>
                      <h3 className="font-display font-black text-lg text-white">{pack.name}</h3>
                      <p className="text-xs text-slate-300 leading-relaxed">{pack.description}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {pack.cardsAdded.map((c) => (
                        <span
                          key={c}
                          className="px-2 py-0.5 rounded-lg bg-slate-950/80 border border-slate-700 text-[10px] font-bold text-slate-200"
                        >
                          + {c}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: SPINOFF MODES */}
        {activeTab === 'spinoff' && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-900/80 border border-white/10 p-4 text-xs sm:text-sm text-slate-300">
              <strong>Spinoff Modes:</strong> Permainan kartu resmi terpisah dengan mekanisme unik
              (<strong>DOS</strong> penjumlahan 2 kartu &amp; <strong>ONO 99</strong> hitung
              kumulatif ≤ 99)!
            </div>
            <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {spinoffModes.map((v, idx) => renderVariantCard(v, idx))}
            </section>
          </div>
        )}
      </main>
    </div>
  );
};
