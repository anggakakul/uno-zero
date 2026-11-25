import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Calculator,
  EyeOff,
  Flame,
  Layers,
  Moon,
  ShieldAlert,
  Sun,
  Users,
  Zap,
} from 'lucide-react';
import { getColorLabel } from '../engine/core';
import { ADDON_PACKS_CATALOG } from '../expansions/catalog';
import { TEAM_NAMES } from '../rulesets/unoTeams';
import { HubCard, HubGameState } from '../types';

interface ModeSignatureHudProps {
  state: HubGameState;
  dosSelectedCard?: HubCard | null;
  dosSelectedPileIndex?: number;
}

const TEAM_STYLE = [
  'bg-sky-950/90 border-sky-400/55 text-sky-200',
  'bg-rose-950/90 border-rose-400/55 text-rose-200',
  'bg-emerald-950/90 border-emerald-400/55 text-emerald-200',
  'bg-amber-950/90 border-amber-400/55 text-amber-200',
];

export const ModeSignatureHud: React.FC<ModeSignatureHudProps> = ({
  state,
  dosSelectedCard,
  dosSelectedPileIndex = 0,
}) => {
  const prevFlipRef = useRef(state.flipSide);
  const [flipFlash, setFlipFlash] = useState<'light' | 'dark' | null>(null);

  useEffect(() => {
    if (state.variantId === 'uno-flip' && prevFlipRef.current !== state.flipSide) {
      prevFlipRef.current = state.flipSide;
      setFlipFlash(state.flipSide);
      const t = setTimeout(() => setFlipFlash(null), 900);
      return () => clearTimeout(t);
    }
    prevFlipRef.current = state.flipSide;
  }, [state.variantId, state.flipSide]);

  if (state.variantId === 'uno-classic') {
    const packs = state.settings.activePacks ?? [];
    if (packs.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-2xl">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-950/85 border border-amber-400/45 text-amber-300 text-xs font-display font-bold">
          <Layers className="w-3.5 h-3.5" /> Add-On Aktif:
        </span>
        {packs.map((pid) => {
          const info = ADDON_PACKS_CATALOG.find((p) => p.id === pid);
          return (
            <span
              key={pid}
              className="px-2.5 py-1 rounded-lg text-xs font-display font-black text-slate-950 bg-amber-400"
            >
              {info?.name.replace(' (16 Kartu)', '') ?? pid}
            </span>
          );
        })}
      </div>
    );
  }

  if (state.variantId === 'uno-flip') {
    const isDark = state.flipSide === 'dark';
    return (
      <>
        <AnimatePresence>
          {flipFlash && (
            <motion.div
              key={flipFlash}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.08 }}
              transition={{ duration: 0.3 }}
              className={`pointer-events-none fixed inset-0 z-40 flex items-center justify-center ${
                flipFlash === 'dark' ? 'bg-fuchsia-950/75' : 'bg-sky-950/65'
              }`}
            >
              <div
                className={`px-8 py-4 rounded-2xl border-2 font-display font-black italic text-3xl sm:text-5xl flex items-center gap-3 shadow-2xl ${
                  flipFlash === 'dark'
                    ? 'bg-fuchsia-950 border-fuchsia-300 text-white'
                    : 'bg-sky-400 border-white text-slate-950'
                }`}
              >
                {flipFlash === 'dark' ? (
                  <>
                    <Moon className="w-8 h-8 text-fuchsia-300" />
                    DARK SIDE AKTIF
                  </>
                ) : (
                  <>
                    <Sun className="w-8 h-8 text-slate-950" />
                    LIGHT SIDE AKTIF
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          className={`px-3.5 py-1.5 rounded-xl border font-display font-bold text-xs flex flex-wrap items-center justify-center gap-2 transition-colors duration-300 ${
            isDark
              ? 'bg-fuchsia-950/90 border-fuchsia-400/60 text-fuchsia-200'
              : 'bg-sky-950/90 border-sky-300/50 text-sky-200'
          }`}
        >
          <span className="inline-flex items-center gap-1 font-black">
            {isDark ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
            {isDark ? 'DARK SIDE' : 'LIGHT SIDE'}
          </span>
          <span className="opacity-50">•</span>
          <span className="font-semibold text-[11px]">
            {isDark ? 'Draw +5 • Skip All • Draw Color' : 'Draw +1 • Skip • Wild +2'}
          </span>
        </div>
      </>
    );
  }

  if (state.variantId === 'uno-all-wild') {
    const lastType = state.lastEvent?.type ?? '';
    const isExtremeAction =
      lastType === 'wild_forced_swap' ||
      lastType === 'wild_target_draw2' ||
      lastType === 'wild_skip_two' ||
      lastType === 'wild_draw4';

    return (
      <div className="flex flex-wrap items-center justify-center gap-2">
        <div className="px-3.5 py-1.5 rounded-xl bg-indigo-950/90 border border-pink-400/45 text-xs font-display font-bold text-slate-100 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-amber-300" />
          100% Wild • Semua Kartu Selalu Valid
        </div>
        {isExtremeAction && (
          <motion.span
            key={state.lastEvent?.id}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="px-3 py-1 rounded-xl bg-amber-400 text-slate-950 text-xs font-display font-black uppercase"
          >
            Aksi Ekstrem: {lastType.replace(/_/g, ' ')}
          </motion.span>
        )}
      </div>
    );
  }

  if (state.variantId === 'uno-no-mercy') {
    const eliminatedCount = state.players.filter((p) => p.eliminated).length;
    const aliveCount = state.players.length - eliminatedCount;
    return (
      <div className="flex flex-wrap items-center justify-center gap-2">
        <div className="px-3.5 py-1.5 rounded-xl bg-rose-950/95 border border-rose-500/60 text-rose-100 font-display font-bold text-xs flex flex-wrap items-center justify-center gap-2">
          <Flame className="w-3.5 h-3.5 text-orange-400" />
          <span>Mercy Rule: 25 Kartu = Gugur</span>
          <span className="opacity-45">•</span>
          <span className="text-emerald-300">Penyintas: {aliveCount}</span>
          {eliminatedCount > 0 && (
            <span className="text-rose-300">Gugur: {eliminatedCount}</span>
          )}
        </div>
        {state.pendingDrawCount > 0 && (
          <motion.div
            key={state.pendingDrawCount}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="px-4 py-1.5 rounded-xl bg-rose-600 border border-amber-300 text-white font-display font-black text-xs"
          >
            Stack +{state.pendingDrawCount} (Tumpuk minimal +{state.pendingDrawMinValue ?? 2})
          </motion.div>
        )}
      </div>
    );
  }

  if (state.variantId === 'uno-flex') {
    const greenCount = state.players.filter((p) => p.powerActive).length;
    return (
      <div className="px-3.5 py-1.5 rounded-xl bg-emerald-950/90 border border-emerald-400/50 text-emerald-100 font-display font-bold text-xs flex flex-wrap items-center justify-center gap-2">
        <Zap className="w-3.5 h-3.5 text-lime-300" />
        <span>
          Power Card Aktif: {greenCount}/{state.players.length}
        </span>
        <span className="opacity-45">•</span>
        <span className="text-[11px] font-medium text-emerald-200">
          {greenCount === 1
            ? '1 Power tersisa sebelum reset global ke Hijau'
            : 'Aktifkan Flex untuk memakai warna kedua kartu'}
        </span>
      </div>
    );
  }

  if (state.variantId === 'uno-teams') {
    const teamIds = Array.from(
      new Set(state.players.map((p) => p.teamId ?? 0))
    ).sort((a, b) => a - b);

    return (
      <div className="flex flex-wrap items-center justify-center gap-2 max-w-3xl">
        {teamIds.map((tid) => {
          const members = state.players.filter((p) => (p.teamId ?? 0) === tid);
          const teamScore = state.teamScores?.[tid] ?? 0;
          return (
            <div
              key={tid}
              className={`px-3 py-1.5 rounded-xl border text-xs font-display font-bold flex items-center gap-2 ${
                TEAM_STYLE[tid % TEAM_STYLE.length]
              }`}
            >
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span className="font-black">{TEAM_NAMES[tid] ?? `Tim ${tid + 1}`}:</span>
              <span>{members.map((m) => `${m.name} (${m.hand.length})`).join(' & ')}</span>
              {teamScore > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-slate-950/80 text-amber-300 text-[11px] font-black">
                  {teamScore} pt
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (state.variantId === 'uno-liars') {
    const claimColor = state.liarClaim?.claimedColor ?? state.liarsTopClaim?.color;
    const claimType = state.liarClaim?.claimedType ?? state.liarsTopClaim?.type;
    const claimValue = state.liarClaim?.claimedValue ?? state.liarsTopClaim?.value;
    return (
      <div className="flex flex-wrap items-center justify-center gap-2">
        <div className="px-3.5 py-1.5 rounded-xl bg-violet-950/95 border border-violet-400/55 text-violet-100 font-display font-bold text-xs flex flex-wrap items-center justify-center gap-2">
          <EyeOff className="w-3.5 h-3.5 text-violet-300" />
          <span>Arena Gertakan Tertutup</span>
          {claimColor && claimType && (
            <>
              <span className="opacity-40">•</span>
              <span className="text-amber-300">
                Klaim Aktif: {getColorLabel(claimColor)}{' '}
                {claimType === 'number' ? claimValue : claimType.toUpperCase()}
              </span>
            </>
          )}
        </div>
        {state.phase === 'liar_challenge' && (
          <span className="px-3 py-1 rounded-xl bg-rose-600 border border-rose-300 text-white text-xs font-display font-black flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" /> Percaya atau Tantang
          </span>
        )}
      </div>
    );
  }

  if (state.variantId === 'dos-mode' && state.dosCenterPiles) {
    const targetPile = state.dosCenterPiles[dosSelectedPileIndex];
    const targetTop = targetPile?.[targetPile.length - 1];
    const targetVal = targetTop?.type === 'wild_number' ? null : targetTop?.value ?? 2;
    const firstVal =
      dosSelectedCard?.type === 'wild_number' ? null : dosSelectedCard?.value ?? 2;
    const needed =
      dosSelectedCard && targetVal !== null && firstVal !== null
        ? targetVal - firstVal
        : null;

    return (
      <div className="px-3.5 py-1.5 rounded-xl bg-cyan-950/90 border border-cyan-400/50 text-cyan-100 font-display font-semibold text-xs flex flex-wrap items-center justify-center gap-2">
        <span className="inline-flex items-center gap-1 font-black text-cyan-300">
          <Calculator className="w-3.5 h-3.5" /> Bantu Hitung DOS:
        </span>
        {dosSelectedCard ? (
          needed !== null && needed >= 1 && needed <= 10 ? (
            <span>
              Dipilih <strong className="text-amber-300">{firstVal}</strong> +{' '}
              <strong className="text-emerald-300">{needed}</strong> = Target{' '}
              <strong className="text-white">{targetVal}</strong> (Tumpukan #{dosSelectedPileIndex + 1})
            </span>
          ) : (
            <span>
              Pilih kartu kedua untuk melengkapi penjumlahan ke Tumpukan #{dosSelectedPileIndex + 1}.
            </span>
          )
        ) : (
          <span>
            Cocokkan 1 kartu angka sama atau pilih 2 kartu yang jumlahnya sama dengan tumpukan target.
          </span>
        )}
      </div>
    );
  }

  if (state.variantId === 'ono-99') {
    const eliminated = state.players.filter((p) => p.eliminated).length;
    const alive = state.players.length - eliminated;
    const total = state.onoTotal ?? 0;
    const roomLeft = Math.max(0, 98 - total);
    return (
      <div className="px-3.5 py-1.5 rounded-xl bg-orange-950/90 border border-orange-400/50 text-orange-100 font-display font-bold text-xs flex flex-wrap items-center justify-center gap-2">
        <span className="text-emerald-300">Penyintas: {alive}</span>
        {eliminated > 0 && <span className="text-rose-300">Tersingkir: {eliminated}</span>}
        <span className="opacity-40">•</span>
        <span className={roomLeft <= 13 ? 'text-rose-300 font-black' : 'text-amber-300'}>
          Ruang Aman Tersisa: +{roomLeft} (Maks 98)
        </span>
      </div>
    );
  }

  return null;
};
