import {
  appendEvent,
  calculateClassicHandPoints,
  drawCardsFromDeck,
  getCardDisplayColor,
  getCardDisplayType,
  getCardDisplayValue,
  getColorLabel,
  getNextPlayerIndex,
  getValidColorsForState,
  pickMostFrequentColor,
  transitionTurnWithPrivacy,
} from '../engine/core';
import {
  HubCard,
  HubCardColor,
  HubGameState,
  HubPlayer,
  HubRoundSummary,
  UnoRuleset,
  VariantId,
  VariantSettings,
} from '../types';

export const STANDARD_COLORS: HubCardColor[] = ['red', 'yellow', 'green', 'blue'];
export const DARK_COLORS: HubCardColor[] = ['pink', 'teal', 'orange', 'purple'];

export function createBaseState(
  variantId: VariantId,
  deck: HubCard[],
  players: HubPlayer[],
  mode: 'local' | 'ai' | 'online',
  settings: VariantSettings,
  roundNumber = 1,
  roundHistory: HubRoundSummary[] = [],
  teamScores?: Record<number, number>
): HubGameState {
  const drawPile = [...deck];
  let firstCard: HubCard | undefined;
  // Pull first non-wild card for starting discard pile when possible
  const nonWildIdx = drawPile.findIndex(
    (c) => c.color !== 'wild' && !c.type.startsWith('wild')
  );
  if (nonWildIdx >= 0) {
    firstCard = drawPile.splice(nonWildIdx, 1)[0];
  } else {
    firstCard = drawPile.pop();
  }

  const activeColor: HubCardColor =
    firstCard && firstCard.color !== 'wild' ? firstCard.color : 'red';

  const base: HubGameState = {
    version: 1,
    variantId,
    mode,
    phase: 'playing',
    roundNumber,
    players,
    currentPlayerIndex: 0,
    direction: 1,
    drawPile,
    discardPile: firstCard ? [firstCard] : [],
    activeColor,
    pendingDrawCount: 0,
    flipSide: 'light',
    hasDrawnThisTurn: false,
    settings,
    roundHistory,
    actionLog: [],
    lastEvent: null,
    winnerId: null,
    winnerTeamId: null,
    teamScores,
    startedAt: Date.now(),
  };

  return appendEvent(
    base,
    'info',
    `Ronde ${roundNumber} dimulai! Giliran ${players[0]?.name ?? 'Pemain 1'}.`
  );
}

export function finalizeStandardRoundWin(
  state: HubGameState,
  winnerId: string,
  pointsAwarded: number,
  reason: string
): HubGameState {
  const winner = state.players.find((p) => p.id === winnerId);
  if (!winner) return state;

  const updatedPlayers = state.players.map((p) =>
    p.id === winnerId ? { ...p, score: p.score + pointsAwarded } : p
  );

  const summary: HubRoundSummary = {
    roundNumber: state.roundNumber,
    winnerId,
    winnerName: winner.name,
    pointsAwarded,
    reason,
    playerPoints: updatedPlayers.map((p) => ({
      playerId: p.id,
      playerName: p.name,
      handPoints: calculateClassicHandPoints(p.hand, state.flipSide),
      totalScore: p.score,
      eliminated: p.eliminated,
    })),
  };

  const newWinnerScore = updatedPlayers.find((p) => p.id === winnerId)?.score ?? 0;
  const reachedTarget = state.settings.singleRound || newWinnerScore >= state.settings.targetScore;

  return appendEvent(
    {
      ...state,
      players: updatedPlayers,
      phase: reachedTarget ? 'game_over' : 'round_over',
      winnerId: reachedTarget ? winnerId : null,
      pendingPrompt: null,
      unoVulnerablePlayerId: null,
      roundHistory: [...state.roundHistory, summary],
    },
    reachedTarget ? 'game_win' : 'round_end',
    reachedTarget
      ? `🏆 ${winner.name} memenangkan permainan dengan ${newWinnerScore} poin!`
      : `🎉 ${winner.name} memenangkan Ronde ${state.roundNumber} (+${pointsAwarded} poin)!`
  );
}

export function standardDrawOneAndAdvance(state: HubGameState, playerId: string): HubGameState {
  const player = state.players[state.currentPlayerIndex];
  if (!player || player.id !== playerId || state.phase !== 'playing') return state;

  const { drawn, drawPile, discardPile } = drawCardsFromDeck(state.drawPile, state.discardPile, 1);
  const players = state.players.map((p, idx) =>
    idx === state.currentPlayerIndex
      ? { ...p, hand: [...p.hand, ...drawn], calledUno: false }
      : p
  );

  const nextIdx = getNextPlayerIndex(players, state.currentPlayerIndex, state.direction, 1);
  const withEvent = appendEvent(
    {
      ...state,
      players,
      drawPile,
      discardPile,
      unoVulnerablePlayerId: null,
    },
    'draw',
    `${player.name} mengambil ${drawn.length} kartu dari Draw Pile.`
  );
  return transitionTurnWithPrivacy(withEvent, nextIdx);
}

export function standardColorMatchValid(
  state: HubGameState,
  card: HubCard
): boolean {
  const top = state.discardPile[state.discardPile.length - 1];
  const cColor = getCardDisplayColor(card, state.flipSide);
  const cType = getCardDisplayType(card, state.flipSide);
  const cVal = getCardDisplayValue(card, state.flipSide);

  if (cColor === 'wild' || cType.startsWith('wild')) return true;
  if (!top) return true;
  if (cColor === state.activeColor) return true;

  const topType = getCardDisplayType(top, state.flipSide);
  const topVal = getCardDisplayValue(top, state.flipSide);

  if (cType === 'number' && topType === 'number' && cVal !== undefined && cVal === topVal) {
    return true;
  }
  if (cType !== 'number' && cType === topType) return true;

  return false;
}

export function genericAIDecision(ruleset: UnoRuleset, state: HubGameState) {
  const activePlayer = state.players[state.currentPlayerIndex];
  const validColors = getValidColorsForState(state);

  if (state.pendingPrompt) {
    const prompt = state.pendingPrompt;
    const actor = state.players.find((p) => p.id === prompt.actorId) ?? activePlayer;
    if (prompt.type === 'color' || prompt.type === 'roulette_color') {
      const color = pickMostFrequentColor(actor.hand, validColors, state.flipSide);
      return { type: 'resolve_prompt' as const, payload: { color } };
    }
    if (
      prompt.type === 'target_swap' ||
      prompt.type === 'target_draw2' ||
      prompt.type === 'target_attack'
    ) {
      const candidates = state.players.filter(
        (p) => p.id !== actor.id && !p.eliminated && !p.isOut
      );
      candidates.sort((a, b) => a.hand.length - b.hand.length);
      return {
        type: 'resolve_prompt' as const,
        payload: { targetPlayerId: candidates[0]?.id },
      };
    }
    if (prompt.type === 'pass_to_partner') {
      const cardToPass = actor.hand[0];
      return {
        type: 'resolve_prompt' as const,
        payload: { passCardId: cardToPass?.id },
      };
    }
  }

  // Prefer non-wild playable cards first, then wilds
  const playable: { card: HubCard; useFlex?: boolean; pileIndex?: number }[] = [];

  if (state.triplePiles) {
    for (let pi = 0; pi < state.triplePiles.length; pi += 1) {
      if (!state.triplePiles[pi].lit) continue;
      for (const card of activePlayer.hand) {
        const res = ruleset.validateMove(state, activePlayer.id, { cardId: card.id, pileIndex: pi });
        if (res.valid) playable.push({ card, pileIndex: pi });
      }
    }
    // Prefer lowest pressure pile
    playable.sort((a, b) => {
      const pa = state.triplePiles?.[a.pileIndex ?? 0]?.pressure ?? 0;
      const pb = state.triplePiles?.[b.pileIndex ?? 0]?.pressure ?? 0;
      return pa - pb;
    });
  } else {
    for (const card of activePlayer.hand) {
      const res = ruleset.validateMove(state, activePlayer.id, { cardId: card.id });
      if (res.valid) {
        playable.push({ card, useFlex: false });
      } else if (activePlayer.powerActive) {
        const flexRes = ruleset.validateMove(state, activePlayer.id, {
          cardId: card.id,
          useFlex: true,
        });
        if (flexRes.valid) playable.push({ card, useFlex: true });
      }
    }
  }

  if (playable.length === 0) {
    return { type: 'draw' as const };
  }

  const nonWild = playable.find(
    (p) => !getCardDisplayType(p.card, state.flipSide).startsWith('wild')
  );
  const chosen = nonWild ?? playable[0];
  const color = pickMostFrequentColor(activePlayer.hand, validColors, state.flipSide);
  const opponents = state.players
    .filter((p) => p.id !== activePlayer.id && !p.eliminated && !p.isOut)
    .sort((a, b) => a.hand.length - b.hand.length);

  return {
    type: 'play' as const,
    move: {
      cardId: chosen.card.id,
      chosenColor: color,
      targetPlayerId: opponents[0]?.id,
      useFlex: chosen.useFlex,
      pileIndex: chosen.pileIndex,
    },
  };
}

export function formatColorNotice(color: HubCardColor): string {
  return `Warna aktif: ${getColorLabel(color)}`;
}
