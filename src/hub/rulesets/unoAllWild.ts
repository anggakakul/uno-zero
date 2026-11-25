import {
  appendEvent,
  drawCardsFromDeck,
  getActivePlayers,
  getNextPlayerIndex,
  shuffleCards,
  transitionTurnWithPrivacy,
  uid,
} from '../engine/core';
import {
  HubCard,
  HubGameState,
  HubPlayer,
  HubRoundSummary,
  MoveInput,
  UnoRuleset,
  ValidationResult,
  VariantSettings,
} from '../types';
import {
  finalizeStandardRoundWin,
  genericAIDecision,
  standardDrawOneAndAdvance,
} from './baseHelpers';

/**
 * Official 112-card UNO All Wild deck (8 card types, ALL Wild):
 * - 72 Wild (Standard, non-action)
 * - 8 Wild Reverse
 * - 8 Wild Skip
 * - 8 Wild Draw Two
 * - 4 Wild Skip Two
 * - 4 Wild Draw Four
 * - 4 Wild Forced Swap
 * - 4 Wild Targeted Draw Two
 * Total = 72 + 24 + 16 = 112 cards!
 */
function buildAllWildDeck(): HubCard[] {
  const cards: HubCard[] = [];
  for (let i = 0; i < 72; i += 1) {
    cards.push({ id: uid('aw'), color: 'wild', type: 'wild' });
  }
  for (let i = 0; i < 8; i += 1) {
    cards.push({ id: uid('aw'), color: 'wild', type: 'wild_reverse' });
    cards.push({ id: uid('aw'), color: 'wild', type: 'wild_skip' });
    cards.push({ id: uid('aw'), color: 'wild', type: 'wild_draw2' });
  }
  for (let i = 0; i < 4; i += 1) {
    cards.push({ id: uid('aw'), color: 'wild', type: 'wild_skip_two' });
    cards.push({ id: uid('aw'), color: 'wild', type: 'wild_draw4' });
    cards.push({ id: uid('aw'), color: 'wild', type: 'wild_forced_swap' });
    cards.push({ id: uid('aw'), color: 'wild', type: 'wild_target_draw2' });
  }
  return cards;
}

/**
 * Official UNO All Wild Setup:
 * - Supports 2–10 players, 7 cards dealt each.
 * - Top card of Draw Pile flipped to Discard Pile; if it is a Wild Action card, its effect is IGNORED for turn 1!
 * - First turn starts with the player to the LEFT of the dealer (index 1 % players.length) going clockwise!
 */
function createAllWildRoundState(
  deck: HubCard[],
  players: HubPlayer[],
  mode: 'local' | 'ai' | 'online',
  settings: VariantSettings,
  roundNumber: number,
  roundHistory: HubRoundSummary[]
): HubGameState {
  const drawPile = [...deck];
  const firstCard = drawPile.pop();
  const isActionStarter = Boolean(firstCard && firstCard.type !== 'wild');
  // Dealer is index 0; player to the left of dealer (clockwise) goes first!
  const starterIdx = players.length > 1 ? 1 % players.length : 0;

  const startMsg = isActionStarter
    ? `Ronde ${roundNumber} UNO All Wild dimulai! Kartu pembuka ${firstCard!.type.toUpperCase()} diabaikan efeknya untuk giliran pertama. Giliran ${players[starterIdx].name} (sebelah kiri dealer)!`
    : `Ronde ${roundNumber} UNO All Wild dimulai searah jarum jam! Giliran ${players[starterIdx].name} (sebelah kiri dealer).`;

  return appendEvent(
    {
      version: 1,
      variantId: 'uno-all-wild',
      mode,
      phase: 'playing',
      roundNumber,
      players,
      currentPlayerIndex: starterIdx,
      direction: 1,
      drawPile,
      discardPile: firstCard ? [firstCard] : [],
      activeColor: 'wild',
      pendingDrawCount: 0,
      extraTurnsRemaining: 0,
      flipSide: 'light',
      hasDrawnThisTurn: false,
      settings,
      roundHistory,
      actionLog: [],
      lastEvent: null,
      winnerId: null,
      startedAt: Date.now(),
    },
    'info',
    startMsg
  );
}

/**
 * Official UNO All Wild Scoring:
 * - Standard Wild Card = 20 pts
 * - All Wild Action Cards = 50 pts
 */
export function calculateAllWildHandPoints(hand: HubCard[]): number {
  return hand.reduce((sum, card) => sum + (card.type === 'wild' ? 20 : 50), 0);
}

export const unoAllWildRuleset: UnoRuleset = {
  id: 'uno-all-wild',

  createDeck() {
    return buildAllWildDeck();
  },

  shuffleDeck(deck) {
    return shuffleCards(deck);
  },

  dealCards(deck, players) {
    const remaining = [...deck];
    const dealt = players.map((p) => ({
      ...p,
      hand: remaining.splice(0, 7),
      calledUno: false,
    }));
    return { players: dealt, remainingDeck: remaining };
  },

  initializeGame(playerInits, mode, settings) {
    const deck = this.shuffleDeck(this.createDeck(settings));
    const clamped = playerInits.slice(0, 10); // Supports 2–10 players
    const initialPlayers: HubPlayer[] = clamped.map((p) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      hand: [],
      score: 0,
      calledUno: false,
    }));
    const { players, remainingDeck } = this.dealCards(deck, initialPlayers, settings);
    return createAllWildRoundState(remainingDeck, players, mode, settings, 1, []);
  },

  validateMove(state: HubGameState, playerId: string, move: MoveInput): ValidationResult {
    if (state.phase !== 'playing') return { valid: false, reason: 'Permainan tidak aktif.' };
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.id !== playerId) return { valid: false, reason: 'Bukan giliranmu.' };

    const card = current.hand.find((c) => c.id === move.cardId);
    if (!card) return { valid: false, reason: 'Kartu tidak ditemukan.' };

    // EVERY card in UNO All Wild is always valid! No color/number validation.
    return {
      valid: true,
      requiresTarget:
        card.type === 'wild_forced_swap'
          ? 'target_swap'
          : card.type === 'wild_target_draw2'
          ? 'target_draw2'
          : undefined,
    };
  },

  executeAction(state: HubGameState, playerId: string, move: MoveInput): HubGameState {
    const validation = this.validateMove(state, playerId, move);
    if (!validation.valid) return state;

    const current = state.players[state.currentPlayerIndex];
    const card = current.hand.find((c) => c.id === move.cardId)!;
    const remainingHand = current.hand.filter((c) => c.id !== card.id);

    // Forced Swap requires choosing a target (unless actor already emptied hand to win)
    if (
      card.type === 'wild_forced_swap' &&
      remainingHand.length > 0 &&
      !move.targetPlayerId
    ) {
      return {
        ...state,
        phase: 'choose_target',
        pendingPrompt: {
          type: 'target_swap',
          actorId: playerId,
          cardId: card.id,
          message: 'WILD FORCED SWAP: Pilih 1 pemain untuk menukar seluruh kartu tangan!',
        },
      };
    }

    // Targeted Draw Two requires choosing ANY player
    if (card.type === 'wild_target_draw2' && !move.targetPlayerId) {
      return {
        ...state,
        phase: 'choose_target',
        pendingPrompt: {
          type: 'target_draw2',
          actorId: playerId,
          cardId: card.id,
          message: 'WILD TARGETED +2: Pilih siapa saja untuk mengambil 2 kartu (tidak dilewati)!',
        },
      };
    }

    const activeCount = getActivePlayers(state.players).length;
    let direction = state.direction;
    let steps = 1;
    let extraTurnsRemaining = state.extraTurnsRemaining ?? 0;
    let drawPile = [...state.drawPile];
    let discardPile = [...state.discardPile, card];
    let swappedTargetId: string | null = null;

    let players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex
        ? { ...p, hand: remainingHand, calledUno: remainingHand.length === 1 ? p.calledUno : false }
        : p
    );

    let eventType: string = card.type;
    let message = `${current.name} memainkan WILD standar.`;

    if (card.type === 'wild_reverse') {
      direction = (direction * -1) as 1 | -1;
      if (activeCount === 2) {
        steps = 0; // 2-player Reverse acts as Skip (current player goes again)
        message = `🔄 ${current.name} memainkan WILD REVERSE (2 pemain = Skip)!`;
      } else {
        message = `🔄 ${current.name} membalik arah permainan (${direction === 1 ? 'searah jarum jam' : 'berlawanan jarum jam'})!`;
      }
    } else if (card.type === 'wild_skip') {
      steps = 2;
      const skipped = players[getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1)];
      message = `🚫 WILD SKIP! ${skipped?.name} melewati gilirannya.`;
    } else if (card.type === 'wild_skip_two') {
      if (activeCount === 2) {
        // Official 2-player edge case: opponent skips 2 turns -> current player gets 2 consecutive extra turns!
        extraTurnsRemaining += 2;
        steps = 0;
        message = `🚫🚫 WILD SKIP TWO (2 Pemain)! Lawan dilewati 2 giliran: ${current.name} mendapat 2 giliran berturut-turut!`;
      } else {
        steps = 3;
        message = `🚫🚫 WILD SKIP TWO! 2 pemain berikutnya langsung melewati giliran!`;
      }
    } else if (card.type === 'wild_draw2' || card.type === 'wild_draw4') {
      const count = card.type === 'wild_draw2' ? 2 : 4;
      const victimIdx = getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1);
      const res = drawCardsFromDeck(drawPile, discardPile, count);
      drawPile = res.drawPile;
      discardPile = res.discardPile;
      players = players.map((p, idx) =>
        idx === victimIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
      );
      steps = 2;
      message = `💥 WILD DRAW ${count}! ${players[victimIdx].name} wajib ambil ${count} kartu dan dilewati.`;
    } else if (card.type === 'wild_forced_swap' && remainingHand.length > 0) {
      const targetIdx = players.findIndex((p) => p.id === move.targetPlayerId);
      if (targetIdx >= 0 && targetIdx !== state.currentPlayerIndex) {
        const myCards = [...remainingHand];
        const targetCards = [...players[targetIdx].hand];
        const targetName = players[targetIdx].name;
        swappedTargetId = players[targetIdx].id;
        players = players.map((p, idx) => {
          if (idx === state.currentPlayerIndex) {
            // Preserve calledUno ONLY if player already called it, otherwise must call UNO if 1 card!
            return { ...p, hand: targetCards, calledUno: false };
          }
          if (idx === targetIdx) {
            return { ...p, hand: myCards, calledUno: false };
          }
          return p;
        });
        message = `🔀 WILD FORCED SWAP! ${current.name} menukar seluruh kartu dengan ${targetName}!`;
      }
    } else if (card.type === 'wild_target_draw2') {
      const targetIdx = players.findIndex((p) => p.id === move.targetPlayerId);
      if (targetIdx >= 0) {
        const res = drawCardsFromDeck(drawPile, discardPile, 2);
        drawPile = res.drawPile;
        discardPile = res.discardPile;
        players = players.map((p, idx) =>
          idx === targetIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
        );
        // IMPORTANT: Targeted player is NOT skipped; turn advances normally (steps = 1)!
        steps = 1;
        message = `🎯 WILD TARGETED +2! ${current.name} memilih ${players[targetIdx].name} untuk ambil 2 kartu (tidak dilewati)!`;
      }
    }

    // Official UNO! Check (including Forced Swap edge case where EITHER actor OR swapped target now holds 1 card!)
    const updatedSelf = players[state.currentPlayerIndex];
    const updatedTarget = swappedTargetId
      ? players.find((p) => p.id === swappedTargetId)
      : undefined;

    let unoVulnerablePlayerId: string | null = null;
    if (updatedSelf.hand.length === 1 && !updatedSelf.calledUno) {
      unoVulnerablePlayerId = updatedSelf.id;
    } else if (updatedTarget && updatedTarget.hand.length === 1 && !updatedTarget.calledUno) {
      unoVulnerablePlayerId = updatedTarget.id;
      message += ` ⚠️ ${updatedTarget.name} kini tersisa 1 kartu (wajib UNO!)`;
    }

    let nextState: HubGameState = appendEvent(
      {
        ...state,
        phase: 'playing',
        players,
        direction,
        drawPile,
        discardPile,
        activeColor: 'wild',
        extraTurnsRemaining,
        pendingPrompt: null,
        unoVulnerablePlayerId,
      },
      eventType,
      message
    );

    nextState = this.checkWinCondition(nextState);
    if (nextState.phase === 'round_over' || nextState.phase === 'game_over') return nextState;

    // Handle 2-player Wild Skip Two consecutive extra turns!
    if (card.type === 'wild_skip_two' && activeCount === 2) {
      return nextState; // Stay on currentPlayerIndex with extraTurnsRemaining = 2
    }
    if ((nextState.extraTurnsRemaining ?? 0) > 0 && steps > 0) {
      const remainingExtra = (nextState.extraTurnsRemaining ?? 0) - 1;
      if (remainingExtra > 0) {
        return { ...nextState, extraTurnsRemaining: remainingExtra };
      }
      // Just consumed the last extra turn -> now advance normally!
      return this.advanceTurn({ ...nextState, extraTurnsRemaining: 0 }, steps);
    }

    if (steps === 0) return nextState;
    return this.advanceTurn(nextState, steps);
  },

  advanceTurn(state, steps = 1) {
    const nextIdx = getNextPlayerIndex(state.players, state.currentPlayerIndex, state.direction, steps);
    return transitionTurnWithPrivacy(state, nextIdx);
  },

  calculateScore(state, winnerId) {
    return state.players
      .filter((p) => p.id !== winnerId)
      .reduce((sum, p) => sum + calculateAllWildHandPoints(p.hand), 0);
  },

  checkWinCondition(state) {
    const winner = state.players.find((p) => !p.isOut && !p.eliminated && p.hand.length === 0);
    if (!winner) return state;
    const pts = this.calculateScore(state, winner.id);
    return finalizeStandardRoundWin(state, winner.id, pts, 'Menghabiskan seluruh kartu Wild!');
  },

  resetRound(state) {
    const deck = this.shuffleDeck(this.createDeck(state.settings));
    const resetPlayers = state.players.map((p) => ({ ...p, hand: [], calledUno: false }));
    const { players, remainingDeck } = this.dealCards(deck, resetPlayers, state.settings);
    return createAllWildRoundState(
      remainingDeck,
      players,
      state.mode,
      state.settings,
      state.roundNumber + 1,
      state.roundHistory
    );
  },

  handleDrawOrPass(state, playerId) {
    return standardDrawOneAndAdvance(state, playerId);
  },

  resolvePrompt(state, payload) {
    if (!state.pendingPrompt?.cardId) return state;
    return this.executeAction(
      { ...state, phase: 'playing', pendingPrompt: null },
      state.pendingPrompt.actorId,
      {
        cardId: state.pendingPrompt.cardId,
        targetPlayerId: payload.targetPlayerId,
      }
    );
  },

  decideAIMove(state) {
    return genericAIDecision(this, state);
  },
};
