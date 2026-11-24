import React, { useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Bot,
  CheckCircle2,
  Cpu,
  Globe,
  History,
  Layers,
  Play,
  RotateCcw,
  Trash2,
  Users,
} from 'lucide-react';
import { getVariantMetadata } from '../catalog';
import { ADDON_PACKS_CATALOG, DIGITAL_TOOLS_CATALOG } from '../expansions/catalog';
import { ADDON_PRESET_MODES } from '../expansions/packSystemEngine';
import { OVERDRIVE_TOOL_PRESETS } from '../expansions/digitalTools';
import { TEAM_NAMES } from '../rulesets/unoTeams';
import { DEFAULT_HOUSE_REMIX_CONFIG } from '../rulesets/unoHouseRemix';
import {
  clearVariantSave,
  loadHubPreferences,
  loadVariantHistory,
  loadVariantSave,
  loadVariantSettings,
  saveVariantSettings,
} from '../storage';
import { AddOnPackId, DigitalToolId, VariantId, VariantSettings } from '../types';

interface HubVariantSetupPageProps {
  variantId: Exclude<VariantId, 'uno-zero'>;
  defaultPacks: AddOnPackId[];
  defaultTools: DigitalToolId[];
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
  defaultPacks,
  defaultTools,
  onStartNewGame,
  onResumeSavedGame,
  onOpenGuide,
  onBack,
}) => {
  const meta = getVariantMetadata(variantId);
  const prefs = loadHubPreferences();
  const [savedExists, setSavedExists] = useState(() => loadVariantSave(variantId) !== null);
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

  const [settings, setSettings] = useState<VariantSettings>(() => {
    const loaded = loadVariantSettings(variantId, meta.defaultSettings);
    return {
      ...loaded,
      activePacks: loaded.activePacks ?? defaultPacks,
      activeTools: loaded.activeTools ?? defaultTools,
    };
  });

  const validPlayerCounts = meta.isTeamGame
    ? [4, 6, 8]
    : Array.from(
        { length: meta.maxPlayers - meta.minPlayers + 1 },
        (_, i) => meta.minPlayers + i
      );

  const updateSetting = <K extends keyof VariantSettings>(key: K, value: VariantSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveVariantSettings(variantId, next);
      return next;
    });
  };

  const togglePack = (id: AddOnPackId) => {
    const curr = settings.activePacks ?? [];
    const next = curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id];
    updateSetting('activePacks', next);
  };

  const toggleTool = (id: DigitalToolId) => {
    const curr = settings.activeTools ?? [];
    const next = curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id];
    updateSetting('activeTools', next);
  };

  const handleStart = () => {
    const activeNames = names.slice(0, playerCount).map((n, idx) => {
      if (mode === 'ai' && idx > 0) {
        return n.startsWith('Pemain ') ? `Bot ${idx}` : n;
      }
      return n.trim() || `Pemain ${idx + 1}`;
    });
    saveVariantSettings(variantId, settings);
    onStartNewGame(mode, activeNames, settings, onlineRoomCode.trim().toUpperCase() || undefined);
  };

  const supportsExpansions =
    variantId !== 'ono-99' && variantId !== 'uno-golf' && variantId !== 'uno-hearts';

  return (
    <div className="min-h-screen table-felt text-slate-100 px-4 py-6 sm:py-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="px-3.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-sm font-bold flex items-center gap-2 cursor-pointer transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Hub
          </button>

          <button
            type="button"
            onClick={onOpenGuide}
            className="px-3.5 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-200 text-sm font-bold flex items-center gap-2 cursor-pointer transition"
          >
            <BookOpen className="w-4 h-4" />
            Panduan {meta.name}
          </button>
        </div>

        {/* Hero Card */}
        <div
          className={`rounded-3xl p-6 bg-gradient-to-br ${meta.accentGradient} text-slate-950 shadow-2xl relative overflow-hidden`}
        >
          <div className="pointer-events-none absolute -right-6 -bottom-8 font-display font-black italic text-9xl text-black/10">
            {meta.number}
          </div>
          <div className="relative z-10 space-y-1.5">
            <span className="inline-block px-2.5 py-0.5 rounded-full bg-black/20 text-white text-[11px] font-black tracking-wider">
              {meta.category} • {meta.badgeText}
            </span>
            <h1 className="font-display font-black italic text-3xl sm:text-4xl text-white drop-shadow">
              {meta.name}
            </h1>
            <p className="text-sm font-semibold text-white/95 max-w-xl">{meta.description}</p>
          </div>
        </div>

        {savedExists && (
          <div className="rounded-2xl bg-emerald-500/15 border border-emerald-400/40 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-display font-bold text-emerald-200 text-sm">
                Ada Permainan {meta.name} Tersimpan!
              </h3>
              <p className="text-xs text-emerald-100/80">
                Lanjutkan pertandingan terakhirmu atau mulai baru di bawah.
              </p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onResumeSavedGame}
                className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-display font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                LANJUTKAN
              </button>
              <button
                type="button"
                onClick={() => {
                  clearVariantSave(variantId);
                  setSavedExists(false);
                }}
                className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-rose-500/30 border border-slate-700 text-slate-300 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div className="rounded-3xl bg-slate-900/90 border border-white/10 p-6 space-y-6 shadow-xl">
          {/* Mode Bermain */}
          <div className="space-y-2.5">
            <label className="text-xs font-display font-bold uppercase tracking-wider text-slate-400">
              Mode Bermain
            </label>
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

          {/* Player Count */}
          <div className="space-y-2.5">
            <label className="text-xs font-display font-bold uppercase tracking-wider text-slate-400">
              Jumlah Pemain ({meta.minPlayers}–{meta.maxPlayers})
            </label>
            <div className="flex flex-wrap gap-1.5">
              {validPlayerCounts.map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setPlayerCount(cnt)}
                  className={`px-3.5 py-2 rounded-xl font-display font-black text-xs sm:text-sm border cursor-pointer transition ${
                    playerCount === cnt
                      ? 'bg-amber-400 text-slate-950 border-amber-300'
                      : 'bg-slate-950/60 text-slate-300 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {cnt}
                </button>
              ))}
            </div>
          </div>

          {/* Player Names */}
          <div className="space-y-2">
            <label className="text-xs font-display font-bold uppercase tracking-wider text-slate-400">
              Daftar Pemain
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
              {Array.from({ length: playerCount }).map((_, idx) => {
                const isBot = mode === 'ai' && idx > 0;
                const teamId = meta.isTeamGame ? idx % (playerCount === 6 ? 3 : 2) : undefined;
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-2 bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-1.5"
                  >
                    <span className="text-[11px] font-bold text-slate-500 w-5">#{idx + 1}</span>
                    <input
                      type="text"
                      value={isBot && names[idx]?.startsWith('Pemain ') ? `Bot ${idx}` : names[idx] ?? `Pemain ${idx + 1}`}
                      onChange={(e) => {
                        const copy = [...names];
                        copy[idx] = e.target.value;
                        setNames(copy);
                      }}
                      className="flex-1 bg-transparent text-xs sm:text-sm text-white font-semibold focus:outline-none"
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

          {/* ADD-ON EXPANSION PACKS TOGGLE */}
          {supportsExpansions && (
            <div className="space-y-2.5 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-xs font-display font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                  <Layers className="w-4 h-4" />
                  Add-On Expansion Packs ({(settings.activePacks ?? []).length} aktif)
                </label>
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

          {/* DIGITAL TABLE TOOLS TOGGLE */}
          {supportsExpansions && (
            <div className="space-y-2.5 pt-2 border-t border-slate-800">
              <label className="text-xs font-display font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                <Cpu className="w-4 h-4" />
                Simulasi Alat Bantu Digital ({(settings.activeTools ?? []).length} aktif)
              </label>
              {/* 2 Overdrive Preset Modes: Ranked Tactical vs Chaos Party */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {OVERDRIVE_TOOL_PRESETS.map((preset) => {
                  const active =
                    (settings.activeTools ?? []).length === preset.tools.length &&
                    preset.tools.every((tid) => (settings.activeTools ?? []).includes(tid));
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        updateSetting('activeTools', [...preset.tools]);
                        updateSetting('blastExtreme', preset.blastExtreme);
                        updateSetting('targetScore', preset.targetScore);
                        updateSetting('singleRound', preset.singleRound);
                      }}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        active
                          ? 'bg-emerald-400/20 border-emerald-400 text-white'
                          : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-emerald-400/50'
                      }`}
                    >
                      <div className="text-[9px] font-black text-emerald-300">{preset.badge}</div>
                      <div className="text-[11px] font-display font-black">{preset.name}</div>
                      <div className="text-[9px] opacity-75 leading-snug mt-0.5">{preset.description}</div>
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {DIGITAL_TOOLS_CATALOG.map((tool) => {
                  const active = (settings.activeTools ?? []).includes(tool.id);
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => toggleTool(tool.id)}
                      title={tool.description}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-start justify-between gap-2 ${
                        active
                          ? 'bg-emerald-400/15 border-emerald-400 text-white'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-800/60'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-display font-black">{tool.name}</div>
                        <div className="text-[10px] opacity-80 leading-snug mt-0.5">
                          {tool.shortTag}
                        </div>
                      </div>
                      <CheckCircle2
                        className={`w-4 h-4 shrink-0 ${active ? 'text-emerald-400' : 'text-slate-700'}`}
                      />
                    </button>
                  );
                })}
              </div>

              {(settings.activeTools ?? []).includes('uno-blast') && (
                <label className="flex items-center justify-between p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 cursor-pointer">
                  <span className="text-xs font-bold text-rose-200">
                    Mode Ekstrem: Show &apos;Em No Mercy Attack! (Ledakan +4 s/d +10 kartu)
                  </span>
                  <input
                    type="checkbox"
                    checked={Boolean(settings.blastExtreme)}
                    onChange={(e) => updateSetting('blastExtreme', e.target.checked)}
                    className="w-4 h-4 accent-rose-500"
                  />
                </label>
              )}
            </div>
          )}

          {/* UNO Attack Standard vs Classic Mode + Scoring Mode */}
          {variantId === 'uno-attack' && (
            <div className="space-y-2.5 pt-2 border-t border-slate-800">
              <div className="grid grid-cols-2 gap-2">
                {(['standard', 'classic'] as const).map((dm) => (
                  <button
                    key={dm}
                    type="button"
                    onClick={() => updateSetting('attackDeckMode', dm)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                      (settings.attackDeckMode ?? 'standard') === dm
                        ? 'bg-orange-400 text-slate-950 border-orange-300 font-black'
                        : 'bg-slate-950/60 text-slate-300 border-slate-800'
                    }`}
                  >
                    <div className="text-xs font-display uppercase">
                      {dm === 'standard' ? 'MODE STANDAR (MODERN)' : 'MODE KLASIK'}
                    </div>
                    <div className="text-[10px] opacity-80">
                      {dm === 'standard'
                        ? 'Hit 2, Discard All, Attack-Attack'
                        : '+ Trade Hands, All Hit, Hit Fire'}
                    </div>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['classic_500', 'lowest_at_500'] as const).map((sm) => (
                  <button
                    key={sm}
                    type="button"
                    onClick={() => updateSetting('attackScoringMode', sm)}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition ${
                      (settings.attackScoringMode ?? 'classic_500') === sm
                        ? 'bg-amber-400/20 border-amber-400 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="text-[11px] font-display font-bold">
                      {sm === 'classic_500' ? 'Skor Standar (500 Menang)' : 'Skor Alternatif (Terendah)'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Variant-specific quick settings */}
          {variantId === 'uno-junior' && (
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800">
              {(['beginner', 'intermediate', 'advanced'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => updateSetting('juniorLevel', lvl)}
                  className={`p-2.5 rounded-xl border text-center cursor-pointer text-xs font-display uppercase ${
                    (settings.juniorLevel ?? 'beginner') === lvl
                      ? 'bg-emerald-400 text-slate-950 border-emerald-300 font-black'
                      : 'bg-slate-950/60 text-slate-300 border-slate-800'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          )}

          {variantId === 'uno-triple-play' && (
            <div className="space-y-2.5 pt-2 border-t border-slate-800">
              <div className="grid grid-cols-2 gap-2">
                {(['regular', 'timer'] as const).map((tpMode) => (
                  <button
                    key={tpMode}
                    type="button"
                    onClick={() => updateSetting('triplePlayMode', tpMode)}
                    className={`p-3 rounded-xl border text-left cursor-pointer text-xs font-display uppercase ${
                      (settings.triplePlayMode ?? 'regular') === tpMode
                        ? 'bg-lime-400 text-slate-950 border-lime-300 font-black'
                        : 'bg-slate-950/60 text-slate-300 border-slate-800'
                    }`}
                  >
                    {tpMode === 'regular' ? 'REGULAR MODE (FAMILY)' : 'TIMER MODE (7s)'}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['classic_500', 'lowest_at_500'] as const).map((sm) => (
                  <button
                    key={sm}
                    type="button"
                    onClick={() => updateSetting('triplePlayScoringMode', sm)}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer text-[11px] font-display font-bold ${
                      (settings.triplePlayScoringMode ?? 'classic_500') === sm
                        ? 'bg-amber-400/20 border-amber-400 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400'
                    }`}
                  >
                    {sm === 'classic_500' ? 'Skor Standar (500 Menang)' : 'Skor Alternatif (Terendah)'}
                  </button>
                ))}
              </div>
              <label className="flex items-center justify-between p-3 rounded-xl bg-fuchsia-950/40 border border-fuchsia-500/35 cursor-pointer">
                <span className="text-xs font-bold text-fuchsia-200">
                  Opsional: Party Mode (Non-Resmi — Penalti Overload +1 kartu ekstra)
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(settings.triplePlayPartyRules)}
                  onChange={(e) => updateSetting('triplePlayPartyRules', e.target.checked)}
                  className="w-4 h-4 accent-fuchsia-400"
                />
              </label>
            </div>
          )}

          {variantId === 'uno-house-remix' && (() => {
            const hrc = { ...DEFAULT_HOUSE_REMIX_CONFIG, ...(settings.houseRemixConfig ?? {}) };
            const updateHrc = (patch: Partial<typeof hrc>) =>
              updateSetting('houseRemixConfig', { ...hrc, ...patch });
            return (
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <div className="text-xs font-display font-bold uppercase tracking-wider text-amber-300">
                  🎛️ Pengaturan Lobby Remix &amp; House Rules
                </div>

                {/* Single Round vs 500 Point Mode */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { single: true, label: 'SINGLE ROUND (CEPAT)' },
                    { single: false, label: 'POINT MODE (500 POIN)' },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => updateSetting('singleRound', opt.single)}
                      className={`p-2.5 rounded-xl border text-center cursor-pointer text-[11px] font-display font-black ${
                        Boolean(settings.singleRound) === opt.single
                          ? 'bg-amber-400 text-slate-950 border-amber-300'
                          : 'bg-slate-950/60 text-slate-300 border-slate-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Stacking Draw */}
                <div className="space-y-1">
                  <div className="text-[11px] font-bold text-slate-400">Stacking Draw (+2 / +4)</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      { id: 'off', label: 'Off' },
                      { id: 'same_type', label: 'Tipe Sama' },
                      { id: 'mixed', label: 'Campur +2/+4' },
                    ] as const).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => updateHrc({ stackingMode: m.id })}
                        className={`p-2 rounded-xl border text-[11px] font-bold cursor-pointer ${
                          hrc.stackingMode === m.id
                            ? 'bg-emerald-400 text-slate-950 border-emerald-300'
                            : 'bg-slate-950/60 text-slate-300 border-slate-800'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Aturan Angka 0 */}
                <div className="space-y-1">
                  <div className="text-[11px] font-bold text-slate-400">Aturan Angka 0 (Hand Swap)</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      { id: 'off', label: 'Off' },
                      { id: 'pass_left', label: 'Oper Kiri' },
                      { id: 'choose_target', label: 'Pilih Target' },
                    ] as const).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => updateHrc({ zeroHandSwapMode: m.id })}
                        className={`p-2 rounded-xl border text-[11px] font-bold cursor-pointer ${
                          hrc.zeroHandSwapMode === m.id
                            ? 'bg-sky-400 text-slate-950 border-sky-300'
                            : 'bg-slate-950/60 text-slate-300 border-slate-800'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Boolean Remix Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { key: 'reverseOnDraw' as const, label: '🔄 Reverse-on-Draw' },
                    { key: 'multiCardPlay' as const, label: '🃏 Multi-Card Play' },
                    { key: 'speedJumpIn' as const, label: '⚡ Speed Jump-In' },
                  ].map((t) => (
                    <label
                      key={t.key}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 cursor-pointer text-[11px] font-bold text-slate-200"
                    >
                      <span>{t.label}</span>
                      <input
                        type="checkbox"
                        checked={hrc[t.key]}
                        onChange={(e) => updateHrc({ [t.key]: e.target.checked })}
                        className="w-4 h-4 accent-amber-400"
                      />
                    </label>
                  ))}
                </div>
              </div>
            );
          })()}

          {variantId === 'uno-dare-emoji' && (
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div className="text-xs font-display font-bold uppercase tracking-wider text-pink-300">
                🔥😜 Pengaturan UNO Dare! &amp; Emoji (220 Kartu)
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-bold text-slate-400">Kategori Dare List (Tantangan 1–10)</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {([
                    { id: 'family', label: '👨‍👩‍👧 Family' },
                    { id: 'showoff', label: '🌟 Show-off' },
                    { id: 'daredevil', label: '🔥 Daredevil' },
                    { id: 'custom', label: '✍️ Custom' },
                  ] as const).map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => updateSetting('dareCategory', cat.id)}
                      className={`p-2 rounded-xl border text-[11px] font-display font-black cursor-pointer ${
                        (settings.dareCategory ?? 'family') === cat.id
                          ? 'bg-pink-500 text-white border-pink-300'
                          : 'bg-slate-950/60 text-slate-300 border-slate-800'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-bold text-slate-400">Target Kemenangan</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { single: false, pts: 500, label: '500 Poin' },
                    { single: false, pts: 250, label: '250 Poin' },
                    { single: true, pts: 500, label: 'Single Round' },
                  ].map((opt) => {
                    const active =
                      Boolean(settings.singleRound) === opt.single &&
                      (opt.single || settings.targetScore === opt.pts);
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => {
                          updateSetting('singleRound', opt.single);
                          updateSetting('targetScore', opt.pts);
                        }}
                        className={`p-2 rounded-xl border text-[11px] font-display font-black cursor-pointer ${
                          active
                            ? 'bg-amber-400 text-slate-950 border-amber-300'
                            : 'bg-slate-950/60 text-slate-300 border-slate-800'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {variantId === 'uno-express' && (
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div className="text-xs font-display font-bold uppercase tracking-wider text-cyan-300">
                ⚡ Pengaturan UNO Express (Cepat &amp; Portabel)
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: 'classic_56', label: 'CLASSIC 56 KARTU', sub: 'Resmi (+1 & Wild +2)' },
                  { id: 'plus_60', label: 'EXPRESS+ 60 KARTU', sub: '+Wild Snatch & Skip All' },
                ] as const).map((dm) => (
                  <button
                    key={dm.id}
                    type="button"
                    onClick={() => updateSetting('expressDeckMode', dm.id)}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer ${
                      (settings.expressDeckMode ?? 'classic_56') === dm.id
                        ? 'bg-cyan-400 text-slate-950 border-cyan-300 font-black'
                        : 'bg-slate-950/60 text-slate-300 border-slate-800'
                    }`}
                  >
                    <div className="text-[11px] font-display uppercase">{dm.label}</div>
                    <div className="text-[10px] opacity-80">{dm.sub}</div>
                  </button>
                ))}
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-bold text-slate-400">Mode Skor &amp; Turnamen</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {([
                    { id: 'first_to_3', label: '⭐ First-to-3' },
                    { id: 'points_100', label: '⚡ 100 Poin' },
                    { id: 'points_250', label: '🏆 250 Poin' },
                    { id: 'knockout_sprint', label: '☠️ Knockout' },
                  ] as const).map((sm) => (
                    <button
                      key={sm.id}
                      type="button"
                      onClick={() => {
                        updateSetting('expressScoringMode', sm.id);
                        updateSetting('singleRound', false);
                      }}
                      className={`p-2 rounded-xl border text-[11px] font-display font-black cursor-pointer ${
                        (settings.expressScoringMode ?? 'points_250') === sm.id
                          ? 'bg-amber-400 text-slate-950 border-amber-300'
                          : 'bg-slate-950/60 text-slate-300 border-slate-800'
                      }`}
                    >
                      {sm.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 cursor-pointer text-[11px] font-bold text-slate-200">
                  <span>🔥 Express Stacking (+1 / +2)</span>
                  <input
                    type="checkbox"
                    checked={settings.expressStacking !== false}
                    onChange={(e) => updateSetting('expressStacking', e.target.checked)}
                    className="w-4 h-4 accent-cyan-400"
                  />
                </label>
                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 cursor-pointer text-[11px] font-bold text-slate-200">
                  <span>⚡ Turbo Match (2 Angka Kembar)</span>
                  <input
                    type="checkbox"
                    checked={settings.expressTurboMatch !== false}
                    onChange={(e) => updateSetting('expressTurboMatch', e.target.checked)}
                    className="w-4 h-4 accent-cyan-400"
                  />
                </label>
              </div>
            </div>
          )}

          {variantId === 'uno-rummy-up' && (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="text-xs font-display font-bold uppercase tracking-wider text-emerald-300">
                🀄 Mode Permainan UNO RUMMY-UP (100 Tile • 14 Tile/Rak)
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'points_200', label: '🏆 200 Poin' },
                  { id: 'casual_2_rounds', label: '⚡ Kasual 2 Ronde' },
                  { id: 'casual_4_rounds', label: '🎯 Kasual 4 Ronde' },
                ] as const).map((rm) => (
                  <button
                    key={rm.id}
                    type="button"
                    onClick={() => {
                      updateSetting('rummyScoringMode', rm.id);
                      updateSetting('singleRound', false);
                    }}
                    className={`p-2.5 rounded-xl border text-center cursor-pointer text-[11px] font-display font-black ${
                      (settings.rummyScoringMode ?? 'points_200') === rm.id
                        ? 'bg-emerald-400 text-slate-950 border-emerald-300'
                        : 'bg-slate-950/60 text-slate-300 border-slate-800'
                    }`}
                  >
                    {rm.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {variantId === 'ono-99' && (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="text-xs font-display font-bold uppercase tracking-wider text-amber-300">
                🔥 Edisi Aturan ONO 99
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: '2022', label: 'EDISI 2022 (RESMI)', sub: '112 Kartu • Eliminasi Langsung • Total ≥ 0' },
                  { id: 'classic_1980s', label: 'CLASSIC 1980s', sub: '3 Token Nyawa • Total Boleh Negatif' },
                ] as const).map((ed) => (
                  <button
                    key={ed.id}
                    type="button"
                    onClick={() => updateSetting('ono99Edition', ed.id)}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer ${
                      (settings.ono99Edition ?? '2022') === ed.id
                        ? 'bg-amber-400 text-slate-950 border-amber-300 font-black'
                        : 'bg-slate-950/60 text-slate-300 border-slate-800'
                    }`}
                  >
                    <div className="text-[11px] font-display uppercase">{ed.label}</div>
                    <div className="text-[10px] opacity-80">{ed.sub}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleStart}
            className={`w-full py-4 rounded-2xl bg-gradient-to-r ${meta.accentGradient} text-slate-950 font-display font-black text-base sm:text-lg tracking-wide shadow-2xl flex items-center justify-center gap-2 cursor-pointer hover:brightness-110 active:scale-[0.98] transition`}
          >
            <Play className="w-5 h-5 fill-current" />
            MULAI {meta.name}
          </button>
        </div>

        {history.length > 0 && (
          <div className="rounded-3xl bg-slate-900/80 border border-white/10 p-5 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-display font-bold uppercase tracking-wider text-slate-400">
              <History className="w-4 h-4 text-amber-400" />
              Riwayat {meta.name}
            </div>
            {history.slice(0, 4).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between text-xs bg-slate-950/60 border border-slate-800 rounded-xl px-3.5 py-2"
              >
                <span className="font-bold text-amber-300">🏆 {item.winnerName}</span>
                <span className="text-slate-500">
                  {new Date(item.completedAt).toLocaleDateString('id-ID')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
