import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Bot,
  CheckCircle2,
  Globe,
  History,
  Layers,
  Play,
  RotateCcw,
  Trash2,
  Users,
} from 'lucide-react';
import { getVariantMetadata } from '../catalog';
import {
  DEFAULT_MERCY_LIMIT,
  resolveWinConditionMode,
  supportsEliminationMode,
  supportsOptionalMercyRule,
  supportsWinConditionSelector,
} from '../engine/houseRules';
import {
  isAddOnPackSupported,
  sanitizeAddOnPacksForVariant,
} from '../expansions/addOnPacks';
import { ADDON_PACKS_CATALOG } from '../expansions/catalog';
import { ADDON_PRESET_MODES } from '../expansions/packSystemEngine';
import { TEAM_NAMES } from '../rulesets/unoTeams';
import {
  clearVariantSave,
  hasVariantSave,
  loadHubPreferences,
  loadVariantHistory,
  loadVariantSettings,
  saveVariantSettings,
} from '../storage';
import { AddOnPackId, VariantId, VariantSettings, WinConditionMode } from '../types';

interface HubVariantSetupPageProps {
  variantId: VariantId;
  onStartNewGame: (
    mode: 'local' | 'ai' | 'online',
    playerNames: string[],
    settings: VariantSettings,
    onlineCode?: string
  ) => void;
  onResumeSavedGame: () => void;
  onOpenGuide: () => void;
  onBack: () => void;
}

export const HubVariantSetupPage: React.FC<HubVariantSetupPageProps> = ({
  variantId,
  onStartNewGame,
  onResumeSavedGame,
  onOpenGuide,
  onBack,
}) => {
  const meta = getVariantMetadata(variantId);
  const prefs = loadHubPreferences();
  const [savedExists, setSavedExists] = useState(() => hasVariantSave(variantId));
  const history = loadVariantHistory(variantId);

  const [mode, setMode] = useState<'ai' | 'local' | 'online'>('ai');
  const [onlineRoomCode, setOnlineRoomCode] = useState('');
  const [playerCount, setPlayerCount] = useState<number>(
    meta.isTeamGame ? 4 : Math.max(meta.minPlayers, 3)
  );
  const [names, setNames] = useState<string[]>(() => {
    const arr: string[] = [prefs.defaultPlayerName || 'Kamu'];
    for (let i = 1; i < meta.maxPlayers; i += 1) {
      arr.push(`Pemain ${i + 1}`);
    }
    return arr;
  });

  const supportsExpansions = isAddOnPackSupported(variantId);

  const [settings, setSettings] = useState<VariantSettings>(() => {
    const loaded = loadVariantSettings(variantId, meta.defaultSettings);
    const initialPacks = supportsExpansions ? loaded.activePacks ?? [] : [];
    return {
      ...loaded,
      activePacks: sanitizeAddOnPacksForVariant(variantId, initialPacks),
    };
  });

  // Auto-reset activePacks whenever variantId switches to a non-UNO Classic mode
  useEffect(() => {
    if (!supportsExpansions) {
      setSettings((prev) => {
        if ((prev.activePacks ?? []).length === 0) return prev;
        const cleared: VariantSettings = { ...prev, activePacks: [] };
        saveVariantSettings(variantId, cleared);
        return cleared;
      });
    }
  }, [variantId, supportsExpansions]);

  const validPlayerCounts = meta.isTeamGame
    ? [4, 6, 8]
    : Array.from(
        { length: meta.maxPlayers - meta.minPlayers + 1 },
        (_, i) => meta.minPlayers + i
      );

  const updateSetting = <K extends keyof VariantSettings>(key: K, value: VariantSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      const sanitized: VariantSettings = {
        ...next,
        activePacks: sanitizeAddOnPacksForVariant(variantId, next.activePacks),
      };
      saveVariantSettings(variantId, sanitized);
      return sanitized;
    });
  };

  const togglePack = (id: AddOnPackId) => {
    if (!supportsExpansions) return;
    const curr = settings.activePacks ?? [];
    const next = curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id];
    updateSetting('activePacks', next);
  };

  const activeWinMode = resolveWinConditionMode(settings, playerCount, variantId);
  const canUseElimination = supportsEliminationMode(variantId) && playerCount >= 3;

  // Auto-fallback from elimination if playerCount drops below 3
  useEffect(() => {
    if (settings.winConditionMode === 'elimination' && !canUseElimination) {
      setSettings((prev) => {
        const next: VariantSettings = {
          ...prev,
          winConditionMode: 'quick_single',
          singleRound: true,
        };
        saveVariantSettings(variantId, next);
        return next;
      });
    }
  }, [canUseElimination, settings.winConditionMode, variantId]);

  const setWinConditionMode = (winMode: WinConditionMode) => {
    if (winMode === 'elimination' && !canUseElimination) return;
    setSettings((prev) => {
      const next: VariantSettings = {
        ...prev,
        winConditionMode: winMode,
        singleRound: winMode === 'quick_single',
        targetScore: winMode === 'classic_points' ? prev.targetScore || 500 : prev.targetScore,
      };
      saveVariantSettings(variantId, next);
      return next;
    });
  };

  const handleStart = () => {
    const activeNames = names.slice(0, playerCount).map((n, idx) => {
      if (mode === 'ai' && idx > 0) {
        return n.startsWith('Pemain ') ? `Bot ${idx}` : n;
      }
      return n.trim() || `Pemain ${idx + 1}`;
    });
    const resolvedWinMode = resolveWinConditionMode(settings, playerCount, variantId);
    const safeSettings: VariantSettings = {
      ...settings,
      winConditionMode: resolvedWinMode,
      singleRound: resolvedWinMode === 'quick_single',
      activePacks: sanitizeAddOnPacksForVariant(variantId, settings.activePacks, true),
    };
    saveVariantSettings(variantId, safeSettings);
    onStartNewGame(mode, activeNames, safeSettings, onlineRoomCode.trim().toUpperCase() || undefined);
  };

  return (
    <div className="min-h-screen table-felt text-slate-100 px-4 py-6 sm:py-10">
      <main className="max-w-3xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="min-h-11 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-sm font-bold flex items-center gap-2 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Hub
          </button>

          <button
            type="button"
            onClick={onOpenGuide}
            className="min-h-11 px-4 py-2 rounded-xl bg-sky-950/90 hover:bg-sky-900 border border-sky-400/40 text-sky-200 text-sm font-bold flex items-center gap-2 transition"
          >
            <BookOpen className="w-4 h-4" />
            Panduan {meta.name}
          </button>
        </div>

        <div
          className={`rounded-2xl p-6 bg-gradient-to-br ${meta.accentGradient} shadow-lg relative overflow-hidden`}
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/60 to-slate-950/35" />
          <div className="pointer-events-none absolute -right-5 -bottom-7 font-display font-black italic text-9xl text-white/15 select-none">
            {meta.number}
          </div>
          <div className="relative z-10 space-y-1.5">
            <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-950/85 border border-white/15 text-slate-100 text-xs font-bold tracking-wide">
              {meta.category} • {meta.badgeText}
            </span>
            <h1 className="font-display font-black italic text-3xl sm:text-4xl text-white">
              {meta.name}
            </h1>
            <p className="text-sm font-medium text-slate-100 max-w-xl leading-relaxed">
              {meta.description}
            </p>
          </div>
        </div>

        {savedExists && (
          <div className="rounded-2xl bg-emerald-950/70 border border-emerald-400/45 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display font-bold text-emerald-200 text-sm">
                Ada Permainan {meta.name} Tersimpan
              </h2>
              <p className="text-xs text-emerald-100/90">
                Lanjutkan pertandingan terakhirmu atau mulai baru di bawah.
              </p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onResumeSavedGame}
                className="flex-1 sm:flex-none min-h-11 px-4 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-display font-black text-xs flex items-center justify-center gap-1.5 transition"
              >
                <RotateCcw className="w-4 h-4" />
                Lanjutkan
              </button>
              <button
                type="button"
                aria-label={`Hapus permainan ${meta.name} tersimpan`}
                title="Hapus permainan tersimpan"
                onClick={() => {
                  clearVariantSave(variantId);
                  setSavedExists(false);
                }}
                className="min-h-11 min-w-11 p-2.5 rounded-xl bg-slate-900 hover:bg-rose-950 border border-slate-700 text-slate-200 flex items-center justify-center transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <section className="rounded-2xl bg-slate-900/95 border border-slate-800 p-5 sm:p-6 space-y-6 shadow-lg">
          <div className="space-y-2.5">
            <div className="text-xs font-display font-bold uppercase tracking-wider text-slate-300">
              Mode Bermain
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setMode('ai')}
                className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                  mode === 'ai'
                    ? 'bg-amber-400/20 border-amber-400 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400'
                }`}
              >
                <Bot className="w-5 h-5 text-amber-400 mb-1" />
                <div className="font-display font-black text-xs sm:text-sm">VS BOT AI</div>
                <div className="text-[10px] opacity-80">Lawan AI cerdas</div>
              </button>

              <button
                type="button"
                onClick={() => setMode('local')}
                className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                  mode === 'local'
                    ? 'bg-emerald-400/20 border-emerald-400 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400'
                }`}
              >
                <Users className="w-5 h-5 text-emerald-400 mb-1" />
                <div className="font-display font-black text-xs sm:text-sm">PASS &amp; PLAY</div>
                <div className="text-[10px] opacity-80">1 perangkat, privasi kartu</div>
              </button>

              <button
                type="button"
                onClick={() => setMode('online')}
                className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                  mode === 'online'
                    ? 'bg-sky-400/20 border-sky-400 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400'
                }`}
              >
                <Globe className="w-5 h-5 text-sky-400 mb-1" />
                <div className="font-display font-black text-xs sm:text-sm">ONLINE MULTIPLAYER</div>
                <div className="text-[10px] opacity-80">Lobi real-time &amp; anti-cheat</div>
              </button>
            </div>

            {mode === 'online' && (
              <div className="p-3.5 rounded-2xl bg-sky-950/40 border border-sky-400/30 space-y-2 text-xs">
                <p className="text-sky-200 font-semibold">
                  Masukkan Kode Room untuk bergabung, atau kosongkan untuk membuat Room baru sebagai Host!
                </p>
                <input
                  type="text"
                  value={onlineRoomCode}
                  onChange={(e) => setOnlineRoomCode(e.target.value)}
                  placeholder="Kode Room (opsional, misal: AB12C)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white uppercase font-mono text-sm"
                />
              </div>
            )}
          </div>

          <div className="space-y-2.5">
            <div className="text-xs font-display font-bold uppercase tracking-wider text-slate-300">
              Jumlah Pemain ({meta.minPlayers}–{meta.maxPlayers})
            </div>
            <div className="flex flex-wrap gap-2">
              {validPlayerCounts.map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  aria-pressed={playerCount === cnt}
                  onClick={() => setPlayerCount(cnt)}
                  className={`min-h-11 min-w-11 px-3.5 py-2 rounded-xl font-display font-black text-xs sm:text-sm border transition ${
                    playerCount === cnt
                      ? 'bg-amber-400 text-slate-950 border-amber-300'
                      : 'bg-slate-950/70 text-slate-200 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {cnt}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-display font-bold uppercase tracking-wider text-slate-300">
              Daftar Pemain
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
              {Array.from({ length: playerCount }).map((_, idx) => {
                const isBot = mode === 'ai' && idx > 0;
                const teamId = meta.isTeamGame ? idx % (playerCount === 6 ? 3 : 2) : undefined;
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-2 bg-slate-950/70 border border-slate-800 rounded-xl px-3 min-h-11"
                  >
                    <label
                      htmlFor={`setup-player-name-${idx}`}
                      className="text-xs font-bold text-slate-400 w-6 shrink-0"
                    >
                      #{idx + 1}
                    </label>
                    <input
                      id={`setup-player-name-${idx}`}
                      type="text"
                      value={isBot && names[idx]?.startsWith('Pemain ') ? `Bot ${idx}` : names[idx] ?? `Pemain ${idx + 1}`}
                      onChange={(e) => {
                        const copy = [...names];
                        copy[idx] = e.target.value;
                        setNames(copy);
                      }}
                      className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm text-white font-semibold py-2"
                    />
                    {isBot && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 text-[9px] font-bold">
                        AI
                      </span>
                    )}
                    {teamId !== undefined && (
                      <span className="px-1.5 py-0.5 rounded bg-sky-500/25 text-sky-300 text-[9px] font-bold">
                        {TEAM_NAMES[teamId]}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {(supportsWinConditionSelector(variantId) || supportsOptionalMercyRule(variantId)) && (
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div className="text-xs font-display font-bold uppercase tracking-wider text-sky-300">
                Kondisi Kemenangan &amp; House Rules
              </div>

              {supportsWinConditionSelector(variantId) && (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      {
                        id: 'classic_points' as const,
                        title: 'Mode Klasik (Poin)',
                        desc: `Kumpulkan poin sisa lawan hingga ${settings.targetScore || 500} pts`,
                        disabled: false,
                      },
                      {
                        id: 'quick_single' as const,
                        title: 'Mode Cepat (1 Ronde)',
                        desc: 'Pemain pertama habis kartu langsung menang!',
                        disabled: false,
                      },
                      {
                        id: 'elimination' as const,
                        title: 'Mode Eliminasi',
                        desc: supportsEliminationMode(variantId)
                          ? canUseElimination
                            ? 'Main sampai sisa 1 pemain (Juara 1, 2, dst.)'
                            : 'Butuh minimal 3 pemain'
                          : 'Tidak tersedia untuk mode Tim',
                        disabled: !canUseElimination,
                      },
                    ].map((opt) => {
                      const active = activeWinMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={opt.disabled}
                          onClick={() => setWinConditionMode(opt.id)}
                          className={`p-3 rounded-xl border text-left transition ${
                            opt.disabled
                              ? 'bg-slate-950/40 border-slate-800 text-slate-600 cursor-not-allowed opacity-60'
                              : active
                              ? 'bg-sky-400/20 border-sky-400 text-white cursor-pointer shadow-md'
                              : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-sky-400/40 cursor-pointer'
                          }`}
                        >
                          <div className="text-xs font-display font-black">{opt.title}</div>
                          <div className="text-[10px] opacity-80 leading-snug mt-0.5">{opt.desc}</div>
                        </button>
                      );
                    })}
                  </div>

                  {activeWinMode === 'classic_points' && (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800">
                      <span className="text-xs font-bold text-slate-300">Target Poin Kemenangan</span>
                      <div className="flex items-center gap-2">
                        {[200, 300, 500].map((pts) => (
                          <button
                            key={pts}
                            type="button"
                            aria-pressed={(settings.targetScore || 500) === pts}
                            onClick={() => updateSetting('targetScore', pts)}
                            className={`min-h-11 min-w-11 px-3 py-1.5 rounded-lg text-xs font-display font-black transition ${
                              (settings.targetScore || 500) === pts
                                ? 'bg-sky-400 text-slate-950'
                                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                            }`}
                          >
                            {pts}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {supportsOptionalMercyRule(variantId) && (
                <div className="p-3.5 rounded-xl bg-rose-950/35 border border-rose-500/35 space-y-2.5">
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <div>
                      <div className="text-xs font-display font-black text-rose-200">
                        Mercy Rule (Opsional)
                      </div>
                      <div className="text-xs text-rose-100/85">
                        Pemain langsung tersingkir dari ronde jika memegang {settings.mercyCardLimit ?? DEFAULT_MERCY_LIMIT} kartu atau lebih.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(settings.mercyRuleEnabled)}
                      onChange={(e) => {
                        updateSetting('mercyRuleEnabled', e.target.checked);
                        if (e.target.checked && !settings.mercyCardLimit) {
                          updateSetting('mercyCardLimit', DEFAULT_MERCY_LIMIT);
                        }
                      }}
                      className="w-5 h-5 accent-rose-500 shrink-0"
                    />
                  </label>
                  {settings.mercyRuleEnabled && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-rose-500/20">
                      <span className="text-xs font-bold text-rose-200">Batas Maksimal Kartu:</span>
                      <div className="flex items-center gap-2">
                        {[20, 25, 30].map((lim) => (
                          <button
                            key={lim}
                            type="button"
                            aria-pressed={(settings.mercyCardLimit ?? DEFAULT_MERCY_LIMIT) === lim}
                            onClick={() => updateSetting('mercyCardLimit', lim)}
                            className={`min-h-11 px-3 py-1.5 rounded-lg text-xs font-display font-black transition ${
                              (settings.mercyCardLimit ?? DEFAULT_MERCY_LIMIT) === lim
                                ? 'bg-rose-500 text-white'
                                : 'bg-slate-900 text-rose-200 hover:bg-slate-800'
                            }`}
                          >
                            {lim} Kartu
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ADD-ON EXPANSION PACKS (ONLY RENDERED FOR UNO CLASSIC) */}
          {supportsExpansions && (
            <div className="space-y-2.5 pt-2 border-t border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-display font-bold uppercase tracking-wider flex items-center gap-1.5 text-amber-300">
                  <Layers className="w-4 h-4" />
                  Add-On Expansion Packs ({(settings.activePacks ?? []).length} aktif)
                </label>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-wide bg-amber-400/20 text-amber-300 border border-amber-400/40">
                  KHUSUS UNO CLASSIC • 16 KARTU/PACK
                </span>
              </div>

              {/* 3 Curated Preset Modes */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {ADDON_PRESET_MODES.map((preset) => {
                  const isPresetActive =
                    (settings.activePacks ?? []).length === preset.packs.length &&
                    preset.packs.every((pid) => (settings.activePacks ?? []).includes(pid));
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.description}
                      onClick={() => {
                        updateSetting('activePacks', [...preset.packs]);
                        updateSetting('targetScore', preset.recommendedTargetScore);
                        updateSetting('singleRound', preset.recommendedSingleRound);
                      }}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        isPresetActive
                          ? 'bg-gradient-to-br from-amber-400/25 to-orange-500/20 border-amber-400 text-white'
                          : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-amber-400/50'
                      }`}
                    >
                      <div className="text-[9px] font-black text-amber-300">{preset.badge}</div>
                      <div className="text-[11px] font-display font-black">{preset.name}</div>
                      <div className="text-[9px] opacity-75 leading-snug mt-0.5">{preset.description}</div>
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ADDON_PACKS_CATALOG.map((pack) => {
                  const active = (settings.activePacks ?? []).includes(pack.id);
                  return (
                    <button
                      key={pack.id}
                      type="button"
                      onClick={() => togglePack(pack.id)}
                      title={pack.description}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-start justify-between gap-2 ${
                        active
                          ? 'bg-amber-400/15 border-amber-400 text-white'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-800/60'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-display font-black">{pack.name}</div>
                        <div className="text-[10px] opacity-80 leading-snug mt-0.5">
                          {pack.cardsAdded.join(' • ')}
                        </div>
                      </div>
                      <CheckCircle2
                        className={`w-4 h-4 shrink-0 ${active ? 'text-amber-400' : 'text-slate-700'}`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {variantId === 'uno-zero' && (
            <div className="space-y-2.5 pt-2 border-t border-slate-800">
              <div className="text-xs font-display font-bold uppercase tracking-wider text-amber-300">
                Jumlah Ronde UNO ZERO (Skor Terendah Menang)
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { rounds: 3, label: '3 Ronde', sub: 'Cepat' },
                  { rounds: 5, label: '5 Ronde', sub: 'Sedang' },
                  { rounds: 9, label: '9 Ronde', sub: 'Standar Resmi' },
                ] as const).map((opt) => (
                  <button
                    key={opt.rounds}
                    type="button"
                    aria-pressed={(settings.targetScore || 9) === opt.rounds}
                    onClick={() => updateSetting('targetScore', opt.rounds)}
                    className={`min-h-11 p-3 rounded-xl border text-center transition ${
                      (settings.targetScore || 9) === opt.rounds
                        ? 'bg-amber-400 text-slate-950 border-amber-300 font-black'
                        : 'bg-slate-950/70 text-slate-200 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <div className="text-xs font-display font-black">{opt.label}</div>
                    <div className="text-[11px] opacity-85">{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {variantId === 'ono-99' && (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="text-xs font-display font-bold uppercase tracking-wider text-amber-300">
                Edisi Aturan ONO 99
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {([
                  { id: '2022', label: 'EDISI 2022 (RESMI)', sub: '112 Kartu • Eliminasi Langsung • Total ≥ 0' },
                  { id: 'classic_1980s', label: 'CLASSIC 1980s', sub: '3 Token Nyawa • Total Boleh Negatif' },
                ] as const).map((ed) => (
                  <button
                    key={ed.id}
                    type="button"
                    aria-pressed={(settings.ono99Edition ?? '2022') === ed.id}
                    onClick={() => updateSetting('ono99Edition', ed.id)}
                    className={`min-h-11 p-3 rounded-xl border text-left transition ${
                      (settings.ono99Edition ?? '2022') === ed.id
                        ? 'bg-amber-400 text-slate-950 border-amber-300 font-black'
                        : 'bg-slate-950/70 text-slate-200 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <div className="text-xs font-display uppercase">{ed.label}</div>
                    <div className="text-[11px] opacity-85">{ed.sub}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleStart}
            className="w-full min-h-12 py-3.5 px-5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-black text-base sm:text-lg tracking-wide flex items-center justify-center gap-2 active:scale-[0.98] transition"
          >
            <Play className="w-5 h-5 fill-current" />
            PLAY NOW • {meta.name}
          </button>
        </section>

        {history.length > 0 && (
          <section className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-display font-bold uppercase tracking-wider text-slate-300">
              <History className="w-4 h-4 text-amber-400" />
              Riwayat {meta.name}
            </div>
            {history.slice(0, 4).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between text-xs bg-slate-950/70 border border-slate-800 rounded-xl px-3.5 py-2.5"
              >
                <span className="font-bold text-amber-300">{item.winnerName}</span>
                <span className="text-slate-400">
                  {new Date(item.completedAt).toLocaleDateString('id-ID')}
                </span>
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  );
};
