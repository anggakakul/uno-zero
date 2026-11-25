import {
  appendEvent,
  calculateClassicHandPoints,
  drawCardsFromDeck,
  getActivePlayers,
  getColorLabel,
  getNextPlayerIndex,
  shuffleCards,
  transitionTurnWithPrivacy,
  uid,
} from '../engine/core';
import {
  HubCard,
  HubCardColor,
  HubGameState,
  HubPlayer,
  MoveInput,
  UnoRuleset,
  ValidationResult,
} from '../types';
import {
  STANDARD_COLORS,
  createBaseState,
  finalizeStandardRoundWin,
  genericAIDecision,
  standardColorMatchValid,
  standardDrawOneAndAdvance,
} from './baseHelpers';

function buildClassicDeck(): HubCard[] {
  const cards: HubCard[] = [];
  for (const color of STANDARD_COLORS) {
    // One 0 per color
    cards.push({ id: uid('cls'), color, type: 'number', value: 0 });
    // Two each of 1-9 per color
    for (let v = 1; v <= 9; v += 1) {
      cards.push({ id: uid('cls'), color, type: 'number', value: v });
      cards.push({ id: uid('cls'), color, type: 'number', value: v });
    }
    // Two Skip, Reverse, Draw Two per color
    for (let i = 0; i < 2; i += 1) {
      cards.push({ id: uid('cls'), color, type: 'skip' });
      cards.push({ id: uid('cls'), color, type: 'reverse' });
      cards.push({ id: uid('cls'), color, type: 'draw2' });
    }
  }
  // 4 Wild + 4 Wild Draw Four = 108 total
  for (let i = 0; i < 4; i += 1) {
    cards.push({ id: uid('cls'), color: 'wild', type: 'wild' });
    cards.push({ id: uid('cls'), color: 'wild', type: 'wild_draw4' });
  }
  return cards;
}

export const unoClassicRuleset: UnoRuleset = {
  id: 'uno-classic',

  createDeck() {
    return buildClassicDeck();
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
    const initialPlayers: HubPlayer[] = playerInits.map((p) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      hand: [],
      score: 0,
      calledUno: false,
    }));
    const { players, remainingDeck } = this.dealCards(deck, initialPlayers, settings);
    return createBaseState('uno-classic', remainingDeck, players, mode, settings, 1, []);
  },

  validateMove(state: HubGameState, playerId: string, move: MoveInput): ValidationResult {
    if (state.phase !== 'playing') return { valid: false, reason: 'Permainan tidak sedang aktif.' };
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.id !== playerId) return { valid: false, reason: 'Bukan giliranmu.' };

    const card = current.hand.find((c) => c.id === move.cardId);
    if (!card) return { valid: false, reason: 'Kartu tidak ditemukan di tangan.' };

    if (card.type === 'wild_draw4' && state.settings.strictWildDraw4) {
      const hasMatchingColor = current.hand.some(
        (c) => c.id !== card.id && c.color === state.activeColor
      );
      if (hasMatchingColor) {
        return {
          valid: false,
          reason: 'Aturan ketat aktif: Wild +4 hanya boleh jika tidak memiliki warna aktif.',
        };
      }
    }

    if (!standardColorMatchValid(state, card)) {
      return { valid: false, reason: 'Kartu harus cocok dengan warna, angka, atau simbol!' };
    }

    return {
      valid: true,
      requiresColor: card.type === 'wild' || card.type === 'wild_draw4',
    };
  },

  executeAction(state: HubGameState, playerId: string, move: MoveInput): HubGameState {
    const validation = this.validateMove(state, playerId, move);
    if (!validation.valid) return state;

    const current = state.players[state.currentPlayerIndex];
    const card = current.hand.find((c) => c.id === move.cardId)!;

    // If wild card without chosen color, open color picker prompt
    if ((card.type === 'wild' || card.type === 'wild_draw4') && !move.chosenColor) {
      return {
        ...state,
        phase: 'choose_color',
        pendingPrompt: {
          type: 'color',
          actorId: playerId,
          cardId: card.id,
          message: 'Pilih warna aktif untuk kartu Wild:',
        },
      };
    }

    const remainingHand = current.hand.filter((c) => c.id !== card.id);
    const activeCount = getActivePlayers(state.players).length;
    let direction = state.direction;
    let steps = 1;
    let drawPile = [...state.drawPile];
    let discardPile = [...state.discardPile, card];
    let activeColor: HubCardColor =
      card.type === 'wild' || card.type === 'wild_draw4'
        ? move.chosenColor ?? 'red'
        : card.color;

    let players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex
        ? { ...p, hand: remainingHand, calledUno: remainingHand.length === 1 ? p.calledUno : false }
        : p
    );

    let eventType = 'play';
    let message = `${current.name} memainkan ${card.type === 'number' ? `${getColorLabel(card.color)} ${card.value}` : card.type.toUpperCase()}.`;

    // Check immediate round win before applying victim draws if empty? Official Mattel: Draw Two / Wild Draw Four still adds cards to next player before scoring!
    if (card.type === 'reverse') {
      if (activeCount === 2) {
        steps = 2;
        message = `${current.name} memainkan REVERSE (2 pemain = Skip)!`;
      } else {
        direction = (direction * -1) as 1 | -1;
        message = `${current.name} membalik arah permainan!`;
      }
      eventType = 'reverse';
    } else if (card.type === 'skip') {
      steps = 2;
      eventType = 'skip';
      const skipped = players[getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1)];
      message = `${current.name} melewati giliran ${skipped?.name}!`;
    } else if (card.type === 'draw2' || card.type === 'wild_draw4') {
      const count = card.type === 'draw2' ? 2 : 4;
      const victimIdx = getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1);
      const drawRes = drawCardsFromDeck(drawPile, discardPile, count);
      drawPile = drawRes.drawPile;
      discardPile = drawRes.discardPile;
      players = players.map((p, idx) =>
        idx === victimIdx ? { ...p, hand: [...p.hand, ...drawRes.drawn], calledUno: false } : p
      );
      steps = 2;
      eventType = card.type;
      message =
        card.type === 'wild_draw4'
          ? `${current.name} memainkan WILD +4 (${getColorLabel(activeColor)})! ${players[victimIdx].name} ambil 4 kartu.`
          : `${current.name} memainkan DRAW +2! ${players[victimIdx].name} ambil 2 kartu.`;
    } else if (card.type === 'wild') {
      eventType = 'wild';
      message = `${current.name} memainkan WILD → warna ${getColorLabel(activeColor)}!`;
    }

    const unoVulnerablePlayerId =
      remainingHand.length === 1 && !current.calledUno ? current.id : null;

    let nextState: HubGameState = appendEvent(
      {
        ...state,
        phase: 'playing',
        players,
        direction,
        drawPile,
        discardPile,
        activeColor,
        pendingPrompt: null,
        unoVulnerablePlayerId,
      },
      eventType,
      message
    );

    nextState = this.checkWinCondition(nextState);
    if (nextState.phase === 'round_over' || nextState.phase === 'game_over') {
      return nextState;
    }

    return this.advanceTurn(nextState, steps);
  },

  advanceTurn(state, steps = 1) {
    const nextIdx = getNextPlayerIndex(state.players, state.currentPlayerIndex, state.direction, steps);
    return transitionTurnWithPrivacy(state, nextIdx);
  },

  calculateScore(state, winnerId) {
    return state.players
      .filter((p) => p.id !== winnerId)
      .reduce((sum, p) => sum + calculateClassicHandPoints(p.hand, 'light'), 0);
  },

  checkWinCondition(state) {
    const winner = state.players.find((p) => !p.isOut && !p.eliminated && p.hand.length === 0);
    if (!winner) return state;
    const pts = this.calculateScore(state, winner.id);
    return finalizeStandardRoundWin(state, winner.id, pts, 'Menghabiskan seluruh kartu di tangan!');
  },

  resetRound(state) {
    const deck = this.shuffleDeck(this.createDeck(state.settings));
    const resetPlayers = state.players.map((p) => ({ ...p, hand: [], calledUno: false }));
    const { players, remainingDeck } = this.dealCards(deck, resetPlayers, state.settings);
    return createBaseState(
      'uno-classic',
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
    if (!state.pendingPrompt || !state.pendingPrompt.cardId) return state;
    return this.executeAction(
      { ...state, phase: 'playing', pendingPrompt: null },
      state.pendingPrompt.actorId,
      {
        cardId: state.pendingPrompt.cardId,
        chosenColor: payload.color,
      }
    );
  },

  decideAIMove(state) {
    return genericAIDecision(this, state);
  },
};
