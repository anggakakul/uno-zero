import { appendEvent, drawCardsFromDeck } from '../engine/core';
import { AddOnPackId, HubCard, HubGameState, HubPlayer } from '../types';
import { injectAddOnPackCards } from './addOnPacks';

export const MAX_CHAIN_BOUNCES = 2;
export const MAX_PENALTY_STACK = 16;
export const MAX_SPEED_LEVEL = 3;

export interface AddOnPresetMode {
  id: 'tactical' | 'party_chaos' | 'comeback_survivor';
  name: string;
  badge: string;
  description: string;
  packs: AddOnPackId[];
  recommendedTargetScore: number;
  recommendedSingleRound: boolean;
}

/** 3 Curated Preset Modes for balanced 15–20 minute sessions */
export const ADDON_PRESET_MODES: AddOnPresetMode[] = [
  {
    id: 'tactical',
    name: 'Mode Taktis / Kompetitif',
    badge: '🎯 STRATEGIS',
    description: 'Defense + Reverse + Swap (dek diseimbangkan ~120 kartu, minim RNG, target 500 poin).',
    packs: ['defense-pack', 'reverse-pack', 'swap-pack'],
    recommendedTargetScore: 500,
    recommendedSingleRound: false,
  },
  {
    id: 'party_chaos',
    name: 'Mode Party / Chaos',
    badge: '🎉 ADRENALIN',
    description: 'Stack + Speed + Frenemies (tumpukan eksplosif maks +16, Speed Level 1–3 & drama Nemesis).',
    packs: ['stack-pack', 'speed-pack', 'frenemies-pack'],
    recommendedTargetScore: 250,
    recommendedSingleRound: true,
  },
  {
    id: 'comeback_survivor',
    name: 'Mode Comeback / Survivor',
    badge: '🛡️ UNDERDOG',
    description: 'Comeback + Defense + Stack (kombo huruf U-N-O, perisai Block, target 250 poin).',
    packs: ['comeback-pack', 'defense-pack', 'stack-pack'],
    recommendedTargetScore: 250,
    recommendedSingleRound: false,
  },
];

/**
 * Dynamic Deck Ratio Balancer (Target: 15–20 minutes, Wild ratio <= 22%):
 * - 0 packs: returns base deck untouched.
 * - 1–2 packs: full base deck + 16 cards/pack (124–140 cards).
 * - 3–4 packs: trims 1 copy of each number 1–9 per color (-36 cards) + 16 cards/pack (120–136 cards).
 * - 5–7 packs: trims 36 classic cards + half-pack (8 core cards per pack) -> 112–128 cards!
 */
export function buildBalancedExpansionDeck(
  baseClassicDeck: HubCard[],
  activePacks: AddOnPackId[] = []
): HubCard[] {
  if (!activePacks || activePacks.length === 0) return baseClassicDeck;

  let workingBase = [...baseClassicDeck];
  if (activePacks.length >= 3) {
    // Trim 1 copy of each number 1–9 per color (36 cards) to maintain crisp 15–20 min pacing!
    const trimmedKey = new Set<string>();
    workingBase = workingBase.filter((card) => {
      if (card.type === 'number' && card.value !== undefined && card.value >= 1 && card.value <= 9) {
        const key = `${card.color}_${card.value}`;
        if (!trimmedKey.has(key)) {
          trimmedKey.add(key);
          return false; // Remove 1 copy
        }
      }
      return true;
    });
  }

  const allExtra = injectAddOnPackCards([], activePacks);

  // Stamp Comeback Pack cards with corner letters 'U', 'N', 'O'
  const letters: ('U' | 'N' | 'O')[] = ['U', 'N', 'O'];
  let letterIdx = 0;
  const stampedExtra = allExtra.map((c) => {
    if (c.packId === 'comeback-pack') {
      const l = letters[letterIdx % 3];
      letterIdx += 1;
      return { ...c, unoLetter: l };
    }
    return c;
  });

  if (activePacks.length >= 5) {
    // Half-pack (8 core cards per pack) so 5–7 packs stays compact (112–128 cards)!
    const halfPacks: HubCard[] = [];
    for (const pack of activePacks) {
      const packCards = stampedExtra.filter((c) => c.packId === pack);
      halfPacks.push(...packCards.slice(0, 8));
    }
    return [...workingBase, ...halfPacks];
  }

  return [...workingBase, ...stampedExtra];
}

export type ChainReactionType = 'stack' | 'rebound' | 'no_u' | 'hard_block';

export interface PenaltyChainState {
  pendingDraw: number;
  bounces: number;
  attackerId: string;
  targetId: string;
  blocked: boolean;
}

/**
 * 4-Tier Priority Stack / Chain Resolution:
 * - Tier 1: Hard Block / Rebound (+1 & bounce) / Wild No U (bounce without +1) — capped at MAX_CHAIN_BOUNCES (2x)!
 * - Tier 2: Draw Stacking — capped at MAX_PENALTY_STACK (+16)!
 */
export function applyChainReaction(
  chain: PenaltyChainState,
  action: { type: ChainReactionType; actorId: string; nextTargetId: string; addDraw?: number }
): { accepted: boolean; reason?: string; chain: PenaltyChainState } {
  if (chain.blocked) {
    return { accepted: false, reason: 'Rantai penalti sudah dibatalkan oleh Wild Block!', chain };
  }

  if (action.type === 'hard_block') {
    return {
      accepted: true,
      chain: { ...chain, pendingDraw: 0, blocked: true },
    };
  }

  if (action.type === 'rebound' || action.type === 'no_u') {
    if (chain.bounces >= MAX_CHAIN_BOUNCES) {
      return {
        accepted: false,
        reason: `Batas pantulan (Bounce Cap ${MAX_CHAIN_BOUNCES}×) tercapai! Tidak bisa memantulkan lagi.`,
        chain,
      };
    }
    const extra = action.type === 'rebound' ? 1 : 0;
    const nextPending = Math.min(MAX_PENALTY_STACK, chain.pendingDraw + extra);
    return {
      accepted: true,
      chain: {
        pendingDraw: nextPending,
        bounces: chain.bounces + 1,
        attackerId: action.actorId,
        targetId: chain.attackerId, // Bounces directly back to previous attacker!
        blocked: false,
      },
    };
  }

  // Tier 2: Draw Stacking (+N, capped at +16)
  const nextPending = Math.min(MAX_PENALTY_STACK, chain.pendingDraw + (action.addDraw ?? 2));
  return {
    accepted: true,
    chain: {
      ...chain,
      pendingDraw: nextPending,
      attackerId: action.actorId,
      targetId: action.nextTargetId,
    },
  };
}

/**
 * Finalizes a Penalty Chain onto the final victim:
 * - Applies Wild Nemesis (+2) ONLY ONCE if final victim is the Nemesis target (and decrements charges 2->1->0!).
 * - Automatically resets Speed Level to 1 (prevents double punishment!).
 */
export function finalizePenaltyChain(
  state: HubGameState,
  chain: PenaltyChainState
): HubGameState {
  if (chain.blocked || chain.pendingDraw <= 0) {
    return appendEvent(
      { ...state, pendingDrawCount: 0, chainBounces: 0 },
      'shield_block',
      '🛡️ Rantai penalti dibatalkan sepenuhnya!'
    );
  }

  let totalToDraw = chain.pendingDraw;
  let nemesisLink = state.nemesisLink ?? null;
  let nemesisNote = '';

  // Tier 3 Global Modifier: Nemesis triggers ONLY ONCE at final resolution!
  if (nemesisLink && nemesisLink.targetId === chain.targetId && nemesisLink.chargesLeft > 0) {
    totalToDraw = Math.min(MAX_PENALTY_STACK, totalToDraw + 2);
    const nextCharges = nemesisLink.chargesLeft - 1;
    nemesisNote = ` 😈 NEMESIS (+2 ekstra! Sisa muatan: ${nextCharges}/2)`;
    nemesisLink = nextCharges > 0 ? { ...nemesisLink, chargesLeft: nextCharges } : null;
  }

  const res = drawCardsFromDeck(state.drawPile, state.discardPile, totalToDraw);
  const victimName = state.players.find((p) => p.id === chain.targetId)?.name ?? 'Pemain';
  const players = state.players.map((p) =>
    p.id === chain.targetId ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
  );

  return appendEvent(
    {
      ...state,
      players,
      drawPile: res.drawPile,
      discardPile: res.discardPile,
      pendingDrawCount: 0,
      chainBounces: 0,
      speedLevel: 1, // Anti double-punishment: Speed Level resets to 1 after taking penalty!
      nemesisLink,
    },
    'draw',
    `💥 Rantai penalti selesai! ${victimName} menarik +${res.drawn.length} kartu.${nemesisNote} (Speed Level reset ke 1)`
  );
}

/** Anti-Soft-Lock Safeguard: Speed Level clamped to 1..3 */
export function adjustSpeedLevel(state: HubGameState, delta: number): HubGameState {
  const curr = state.speedLevel ?? 1;
  const clamped = Math.max(1, Math.min(MAX_SPEED_LEVEL, curr + delta)) as 1 | 2 | 3;
  return { ...state, speedLevel: clamped };
}

/** Anti-Soft-Lock Safeguard: Swap/Pass Hands lowers Speed Level by 1 (min 1) */
export function applySpeedSafeHandSwap(state: HubGameState): HubGameState {
  return adjustSpeedLevel(state, -1);
}

/** Anti-Soft-Lock Safeguard: Speed Level paused when pendingDrawCount > 0, and never exceeds hand size */
export function getRequiredSpeedPlays(state: HubGameState, player: HubPlayer): number {
  if (state.pendingDrawCount > 0) return 0;
  const lvl = state.speedLevel ?? 1;
  return Math.min(lvl, player.hand.length);
}

/** Record a U-N-O letter collected by a player (Comeback Pack) */
export function recordComebackUnoLetter(
  state: HubGameState,
  playerId: string,
  letter: 'U' | 'N' | 'O'
): HubGameState {
  const prevMap = state.comebackUnoProgress ?? {};
  const prevLetters = prevMap[playerId] ?? [];
  if (prevLetters.includes(letter)) return state;
  return {
    ...state,
    comebackUnoProgress: {
      ...prevMap,
      [playerId]: [...prevLetters, letter],
    },
  };
}

/**
 * Trigger Comeback Pack "U-N-O" Combo:
 * Discards all cards except 1, resets U-N-O progress, safely ignores remaining Speed Level quota, and flags UNO!
 */
export function triggerComebackUnoCombo(state: HubGameState, playerId: string): HubGameState {
  const progress = state.comebackUnoProgress?.[playerId] ?? [];
  const hasAll = progress.includes('U') && progress.includes('N') && progress.includes('O');
  if (!hasAll) return state;

  const pIdx = state.players.findIndex((p) => p.id === playerId);
  if (pIdx < 0) return state;
  const player = state.players[pIdx];
  if (player.hand.length <= 1) return state;

  const kept = player.hand[0];
  const dumped = player.hand.slice(1);
  const players = state.players.map((p, i) =>
    i === pIdx ? { ...p, hand: [kept], calledUno: true } : p
  );

  return appendEvent(
    {
      ...state,
      players,
      discardPile: [...state.discardPile, ...dumped],
      comebackUnoProgress: {
        ...(state.comebackUnoProgress ?? {}),
        [playerId]: [],
      },
      unoVulnerablePlayerId: null,
    },
    'uno_call',
    `🌟 KOMBO HURUF U-N-O! ${player.name} membuang ${dumped.length} kartu sekaligus hingga tersisa 1 kartu (UNO!)`
  );
}
