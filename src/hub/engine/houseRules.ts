import {
  appendEvent,
  calculateClassicHandPoints,
  getActivePlayers,
} from './core';
import {
  HubGameState,
  HubRoundStanding,
  HubRoundSummary,
  VariantId,
  VariantSettings,
  WinConditionMode,
} from '../types';

export const DEFAULT_MERCY_LIMIT = 25;

export function supportsEliminationMode(variantId: VariantId): boolean {
  return variantId !== 'uno-teams' && variantId !== 'ono-99' && variantId !== 'uno-zero';
}

export function supportsOptionalMercyRule(variantId: VariantId): boolean {
  return variantId !== 'uno-no-mercy' && variantId !== 'ono-99' && variantId !== 'uno-zero';
}

export function supportsWinConditionSelector(variantId: VariantId): boolean {
  return variantId !== 'ono-99' && variantId !== 'uno-zero';
}

/**
 * Resolves the effective WinConditionMode from VariantSettings + playerCount + variantId.
 * Maintains 100% backward compatibility with legacy `singleRound` flag.
 */
export function resolveWinConditionMode(
  settings: VariantSettings,
  playerCount: number,
  variantId: VariantId
): WinConditionMode {
  if (variantId === 'ono-99') return 'quick_single';
  if (settings.winConditionMode === 'elimination') {
    if (supportsEliminationMode(variantId) && playerCount >= 3) {
      return 'elimination';
    }
    return 'quick_single';
  }
  if (settings.winConditionMode === 'quick_single') return 'quick_single';
  if (settings.winConditionMode === 'classic_points') return 'classic_points';
  return settings.singleRound ? 'quick_single' : 'classic_points';
}

/**
 * Builds ranked final standings for Elimination Mode or Mercy Rule knockouts:
 * [Juara 1, Juara 2, ..., Last active player (Loser), ...Mercy eliminated in reverse]
 */
export function buildFinalStandings(
  state: HubGameState,
  finishOrder: string[],
  eliminatedOrder: string[]
): HubRoundStanding[] {
  const remainingActive = state.players
    .filter(
      (p) =>
        !p.isOut &&
        !p.eliminated &&
        !finishOrder.includes(p.id) &&
        !eliminatedOrder.includes(p.id)
    )
    .sort((a, b) => a.hand.length - b.hand.length)
    .map((p) => p.id);

  const orderedIds = [
    ...finishOrder,
    ...remainingActive,
    ...[...eliminatedOrder].reverse(),
  ];

  // Append any edge-case player not yet listed
  for (const p of state.players) {
    if (!orderedIds.includes(p.id)) orderedIds.push(p.id);
  }

  return orderedIds.map((id, idx) => {
    const p = state.players.find((pl) => pl.id === id)!;
    const status: HubRoundStanding['status'] = finishOrder.includes(id)
      ? 'finished'
      : p.eliminated
      ? 'eliminated'
      : 'active';
    return {
      playerId: p.id,
      playerName: p.name,
      rank: idx + 1,
      status,
      score: p.score,
      handCount: p.hand.length,
    };
  });
}

/**
 * Optional Mercy Rule Toggle Evaluator:
 * Eliminates any active player holding >= mercyCardLimit (default 25) cards.
 * If only 1 active player remains afterward, immediately declares them the winner!
 */
export function applyOptionalMercyRule(state: HubGameState): HubGameState {
  if (
    !state.settings.mercyRuleEnabled ||
    !supportsOptionalMercyRule(state.variantId) ||
    state.phase === 'round_over' ||
    state.phase === 'game_over'
  ) {
    return state;
  }

  const limit = Math.max(10, state.settings.mercyCardLimit ?? DEFAULT_MERCY_LIMIT);
  const newlyEliminated: string[] = [];

  const updatedPlayers = state.players.map((p) => {
    if (!p.eliminated && !p.isOut && p.hand.length >= limit) {
      newlyEliminated.push(p.id);
      return { ...p, eliminated: true, calledUno: false };
    }
    return p;
  });

  if (newlyEliminated.length === 0) return state;

  const eliminatedOrder = [...(state.eliminatedOrder ?? []), ...newlyEliminated];
  const elimNames = newlyEliminated
    .map((id) => state.players.find((p) => p.id === id)?.name ?? 'Pemain')
    .join(', ');

  let nextState: HubGameState = appendEvent(
    {
      ...state,
      players: updatedPlayers,
      eliminatedOrder,
    },
    'eliminated',
    `☠️ MERCY RULE (${limit}+ kartu)! ${elimNames} TERSINGKIR dari ronde!`
  );

  // If only 1 active player remains standing, they immediately win!
  const remainingActive = getActivePlayers(updatedPlayers);
  if (remainingActive.length <= 1) {
    const finishOrder = state.finishOrder ?? [];
    const survivor = remainingActive[0];
    const championId = finishOrder[0] ?? survivor?.id ?? updatedPlayers[0].id;
    const champion = updatedPlayers.find((p) => p.id === championId) ?? updatedPlayers[0];
    const standings = buildFinalStandings(nextState, finishOrder, eliminatedOrder);

    const summary: HubRoundSummary = {
      roundNumber: state.roundNumber,
      winnerId: champion.id,
      winnerName: champion.name,
      pointsAwarded: 0,
      reason: `Penyintas terakhir setelah Mercy Rule (${limit}+ kartu)!`,
      playerPoints: updatedPlayers.map((p) => ({
        playerId: p.id,
        playerName: p.name,
        handPoints: calculateClassicHandPoints(p.hand, state.flipSide),
        totalScore: p.score,
        eliminated: p.eliminated,
      })),
      finalStandings: standings,
    };

    nextState = appendEvent(
      {
        ...nextState,
        phase: 'game_over',
        winnerId: champion.id,
        pendingPrompt: null,
        unoVulnerablePlayerId: null,
        roundHistory: [...state.roundHistory, summary],
      },
      'game_win',
      `🏆 ${champion.name} memenangkan permainan sebagai penyintas terakhir (Mercy Rule)!`
    );
  }

  return nextState;
}
