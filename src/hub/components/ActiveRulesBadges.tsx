import React from 'react';
import { ADDON_PACKS_CATALOG } from '../expansions/catalog';
import { DEFAULT_MERCY_LIMIT, resolveWinConditionMode } from '../engine/houseRules';
import { VariantId, VariantSettings } from '../types';

interface ActiveRulesBadgesProps {
  variantId: VariantId;
  settings: VariantSettings;
  playerCount?: number;
  compact?: boolean;
}

export function getActiveRuleLabels(
  variantId: VariantId,
  settings: VariantSettings,
  playerCount = 4
): string[] {
  const badges: string[] = [];

  if (variantId === 'uno-zero') {
    badges.push(`${settings.targetScore || 9} Ronde`);
    badges.push('Skor Terendah Menang');
    badges.push('Eliminasi Kolom 2×3');
    return badges;
  }

  const winMode = resolveWinConditionMode(settings, playerCount, variantId);
  if (winMode === 'classic_points') {
    badges.push(`Klasik (${settings.targetScore || 500} pt)`);
  } else if (winMode === 'quick_single') {
    badges.push('Cepat (1 Ronde)');
  } else if (winMode === 'elimination') {
    badges.push('Eliminasi Bertahap');
  }

  if (variantId === 'uno-no-mercy') {
    badges.push('Stacking +2/+4/+6/+10');
    badges.push('7-0 Swap & Pass');
    badges.push('Mercy Rule (25 Kartu)');
  } else if (settings.mercyRuleEnabled) {
    badges.push(`Mercy Rule (${settings.mercyCardLimit ?? DEFAULT_MERCY_LIMIT} Kartu)`);
  }

  if (variantId === 'uno-classic' && settings.strictWildDraw4) {
    badges.push('Wild +4 Ketat');
  }
  if (settings.houseRuleStacking) {
    badges.push('House Rule: Stacking +2/+4');
  }
  if (settings.houseRuleSevenZero) {
    badges.push('House Rule: 7-0 Swap & Pass');
  }
  if (settings.houseRuleJumpIn) {
    badges.push('House Rule: Jump-In');
  }

  if (variantId === 'uno-classic' && (settings.activePacks?.length ?? 0) > 0) {
    for (const pid of settings.activePacks ?? []) {
      const info = ADDON_PACKS_CATALOG.find((p) => p.id === pid);
      if (info) {
        badges.push(`Add-On: ${info.name.replace(' (16 Kartu)', '')}`);
      }
    }
  }

  if (variantId === 'uno-flip') {
    badges.push('Light & Dark Side');
  } else if (variantId === 'uno-flex') {
    badges.push('Power Card Flex');
  } else if (variantId === 'uno-party') {
    badges.push('Speed Play');
  } else if (variantId === 'ono-99') {
    badges.push(settings.ono99Edition === 'classic_1980s' ? 'Edisi Classic 1980s' : 'Edisi 2022');
  }

  return badges;
}

export const ActiveRulesBadges: React.FC<ActiveRulesBadgesProps> = ({
  variantId,
  settings,
  playerCount = 4,
  compact = false,
}) => {
  const labels = getActiveRuleLabels(variantId, settings, playerCount);
  if (labels.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {labels.map((label) => (
        <span
          key={label}
          className={`rounded-lg bg-slate-900 border border-slate-700 text-slate-200 font-display font-bold ${
            compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
          }`}
        >
          {label}
        </span>
      ))}
    </div>
  );
};
