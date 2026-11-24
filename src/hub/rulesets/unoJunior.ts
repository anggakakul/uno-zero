import {
  appendEvent,
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
  HubRoundSummary,
  MoveInput,
  UnoRuleset,
  ValidationResult,
  VariantSettings,
} from '../types';
import {
  STANDARD_COLORS,
  genericAIDecision,
} from './baseHelpers';

export const JUNIOR_ANIMALS: Record<number, { emoji: string; name: string }> = {
  0: { emoji: '🦁', name: 'Singa' },
  1: { emoji: '🐘', name: 'Gajah' },
  2: { emoji: '🐼', name: 'Panda' },
  3: { emoji: '🦊', name: 'Rubah' },
  4: { emoji: '🐸', name: 'Katak' },
  5: { emoji: '🐧', name: 'Penguin' },
  6: { emoji: '🦒', name: 'Jerapah' },
  7: { emoji: '🐨', name: 'Koala' },
  8: { emoji: '🐰', name: 'Kelinci' },
};

const ACTION_ANIMALS: Record<string, { emoji: string; name: string }> = {
  skip: { emoji: '🐢', name: 'Kura-kura' },
  reverse: { emoji: '🦀', name: 'Kepiting' },
  draw1: { emoji: '🐒', name: 'Monyet' },
  draw2: { emoji: '🐊', name: 'Buaya' },
};

/**
 * Official 56-card UNO Junior Deck filtered dynamically by 3 Difficulty Levels (NO Wild Draw Four!):
 * - Beginner (36 cards): Numbers 0–8 with Animal characters ONLY (4 colors × 9 = 36).
 * - Intermediate (48 cards): + 4 Skip + 4 Reverse + 4 Wild = 48 cards.
 * - Advanced (56 cards): + 4 Draw One + 4 Draw Two = 56 cards full deck!
 */
function buildJuniorDeck(settings: VariantSettings): HubCard[] {
  const level = settings.juniorLevel ?? 'beginner';
  const cards: HubCard[] = [];

  for (const color of STANDARD_COLORS) {
    for (let v = 0; v <= 8; v += 1) {
      const animal = JUNIOR_ANIMALS[v];
      cards.push({
        id: uid('jr'),
        color,
        type: 'number',
        value: v,
        animal: animal.emoji,
        animalName: animal.name,
      });
    }
    if (level === 'intermediate' || level === 'advanced') {
      cards.push({
        id: uid('jr'),
        color,
        type: 'skip',
        animal: ACTION_ANIMALS.skip.emoji,
        animalName: ACTION_ANIMALS.skip.name,
      });
      cards.push({
        id: uid('jr'),
        color,
        type: 'reverse',
        animal: ACTION_ANIMALS.reverse.emoji,
        animalName: ACTION_ANIMALS.reverse.name,
      });
    }
    if (level === 'advanced') {
      cards.push({
        id: uid('jr'),
        color,
        type: 'draw1',
        animal: ACTION_ANIMALS.draw1.emoji,
        animalName: ACTION_ANIMALS.draw1.name,
      });
      cards.push({
        id: uid('jr'),
        color,
        type: 'draw2',
        animal: ACTION_ANIMALS.draw2.emoji,
        animalName: ACTION_ANIMALS.draw2.name,
      });
    }
  }

  if (level === 'intermediate' || level === 'advanced') {
    for (let i = 0; i < 4; i += 1) {
      cards.push({ id: uid('jr'), color: 'wild', type: 'wild' });
    }
  }

  return cards;
}

/**
 * Official UNO Junior 3-Criteria Matching Validation:
 * Matches by COLOR, NUMBER, ANIMAL, or SAME ACTION TYPE (Wild always valid)!
 */
export function juniorCardMatches(
  card: HubCard,
  top: HubCard | undefined,
  activeColor: HubCardColor
): boolean {
  if (card.type === 'wild' || card.color === 'wild') return true;
  if (!top) return true;
  // 1. Color match
  if (card.color === activeColor) return true;
  // 2. Number match
  if (card.type === 'number' && top.type === 'number' && card.value !== undefined && card.value === top.value) {
    return true;
  }
  // 3. Animal match (even across different colors/numbers!)
  if (card.animal && top.animal && card.animal === top.animal) {
    return true;
  }
  // 4. Same Action Type match
  if (card.type !== 'number' && card.type === top.type) {
    return true;
  }
  return false;
}

/**
 * Official UNO Junior Setup with ALL 5 Opening Discard Action Edge Cases:
 * - Deal 5 cards to each player.
 * - First turn starts left of dealer (index 1) clockwise.
 * - Opening Discard Card rules:
 *   * Draw One -> first player immediately draws 1 card!
 *   * Draw Two -> first player immediately draws 2 cards!
 *   * Reverse  -> dealer (index 0) goes first & direction becomes counter-clockwise (-1)!
 *   * Skip     -> first player is skipped!
 *   * Wild     -> first player chooses a color & immediately plays!
 */
function createJuniorRoundState(
  deck: HubCard[],
  players: HubPlayer[],
  mode: 'local' | 'ai' | 'online',
  settings: VariantSettings,
  roundNumber: number,
  roundHistory: HubRoundSummary[]
): HubGameState {
  let drawPile = [...deck];
  const firstCard = drawPile.pop();
  let discardPile = firstCard ? [firstCard] : [];
  let updatedPlayers = [...players];
  let direction: 1 | -1 = 1;
  let currentPlayerIndex = players.length > 1 ? 1 % players.length : 0;
  let phase: HubGameState['phase'] = 'playing';
  let pendingPrompt: HubGameState['pendingPrompt'] = null;
  let activeColor: HubCardColor =
    firstCard && firstCard.color !== 'wild' ? firstCard.color : 'red';
  let startMsg = `🌟 UNO Junior (${(settings.juniorLevel ?? 'beginner').toUpperCase()}) dimulai! Cocokkan Warna, Angka, atau Hewan yang sama!`;

  if (firstCard) {
    if (firstCard.type === 'draw1' || firstCard.type === 'draw2') {
      const amt = firstCard.type === 'draw1' ? 1 : 2;
      const firstPlayer = updatedPlayers[currentPlayerIndex];
      const res = drawCardsFromDeck(drawPile, discardPile, amt);
      drawPile = res.drawPile;
      discardPile = res.discardPile;
      updatedPlayers = updatedPlayers.map((p, idx) =>
        idx === currentPlayerIndex ? { ...p, hand: [...p.hand, ...res.drawn] } : p
      );
      startMsg = `🐾 Kartu pembuka +${amt}! ${firstPlayer.name} langsung mengambil ${amt} kartu.`;
    } else if (firstCard.type === 'reverse') {
      direction = -1;
      currentPlayerIndex = 0; // Dealer goes first counter-clockwise!
      startMsg = `🔄 Kartu pembuka REVERSE! ${updatedPlayers[0].name} (Dealer) jalan duluan berlawanan jarum jam!`;
    } else if (firstCard.type === 'skip') {
      const skippedName = updatedPlayers[currentPlayerIndex].name;
      currentPlayerIndex = getNextPlayerIndex(updatedPlayers, currentPlayerIndex, 1, 1);
      startMsg = `🚫 Kartu pembuka SKIP! ${skippedName} dilewati, giliran ${updatedPlayers[currentPlayerIndex].name}!`;
    } else if (firstCard.type === 'wild') {
      const firstPlayer = updatedPlayers[currentPlayerIndex];
      if (firstPlayer.isAI) {
        activeColor = 'red';
        startMsg = `🌈 Kartu pembuka WILD! ${firstPlayer.name} memilih warna Merah!`;
      } else {
        phase = 'choose_color';
        pendingPrompt = {
          type: 'color',
          actorId: firstPlayer.id,
          message: `🌈 Kartu pembuka WILD! ${firstPlayer.name}, pilih warna pembuka lalu mainkan kartumu!`,
        };
        startMsg = `🌈 Kartu pembuka WILD! ${firstPlayer.name} bebas memilih warna pembuka!`;
      }
    }
  }

  return appendEvent(
    {
      version: 1,
      variantId: 'uno-junior',
      mode,
      phase,
      roundNumber,
      players: updatedPlayers,
      currentPlayerIndex,
      direction,
      drawPile,
      discardPile,
      activeColor,
      pendingDrawCount: 0,
      drawnPlayableCardId: null,
      flipSide: 'light',
      hasDrawnThisTurn: false,
      settings: { ...settings, singleRound: true },
      roundHistory,
      actionLog: [],
      lastEvent: null,
      pendingPrompt,
      winnerId: null,
      startedAt: Date.now(),
    },
    'info',
    startMsg
  );
}

/** Save newly drawn playable card and pass turn */
export function passAfterJuniorDraw(state: HubGameState, playerId: string): HubGameState {
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId || !state.drawnPlayableCardId) return state;
  const next = appendEvent(
    { ...state, drawnPlayableCardId: null, hasDrawnThisTurn: false },
    'pass',
    `${current.name} menyimpan kartunya. Giliran pemain berikutnya!`
  );
  return unoJuniorRuleset.advanceTurn(next, 1);
}

export const unoJuniorRuleset: UnoRuleset = {
  id: 'uno-junior',

  createDeck(settings) {
    return buildJuniorDeck(settings);
  },

  shuffleDeck(deck) {
    return shuffleCards(deck);
  },

  dealCards(deck, players) {
    const remaining = [...deck];
    // Official UNO Junior deals EXACTLY 5 cards per player!
    const dealt = players.map((p) => ({
      ...p,
      hand: remaining.splice(0, 5),
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
    return createJuniorRoundState(remainingDeck, players, mode, settings, 1, []);
  },

  validateMove(state: HubGameState, playerId: string, move: MoveInput): ValidationResult {
    if (state.phase !== 'playing') return { valid: false, reason: 'Permainan tidak aktif.' };
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.id !== playerId) return { valid: false, reason: 'Bukan giliranmu.' };

    if (state.drawnPlayableCardId && move.cardId !== state.drawnPlayableCardId) {
      return {
        valid: false,
        reason: 'Mainkan kartu yang baru diambil atau klik Simpan & Lewati!',
      };
    }

    const card = current.hand.find((c) => c.id === move.cardId);
    if (!card) return { valid: false, reason: 'Kartu tidak ditemukan.' };

    const top = state.discardPile[state.discardPile.length - 1];
    if (!juniorCardMatches(card, top, state.activeColor)) {
      return { valid: false, reason: 'Cocokkan Warna, Angka, atau Hewan yang sama ya!' };
    }

    return { valid: true, requiresColor: card.type === 'wild' };
  },

  executeAction(state: HubGameState, playerId: string, move: MoveInput): HubGameState {
    const validation = this.validateMove(state, playerId, move);
    if (!validation.valid) return state;

    const current = state.players[state.currentPlayerIndex];
    const card = current.hand.find((c) => c.id === move.cardId)!;

    if (card.type === 'wild' && !move.chosenColor) {
      return {
        ...state,
        phase: 'choose_color',
        pendingPrompt: {
          type: 'color',
          actorId: playerId,
          cardId: card.id,
          message: '🌈 Pilih warna favoritmu!',
        },
      };
    }

    const remainingHand = current.hand.filter((c) => c.id !== card.id);
    const activeCount = getActivePlayers(state.players).length;
    let direction = state.direction;
    let steps = 1;
    let drawPile = [...state.drawPile];
    let discardPile = [...state.discardPile, card];
    const activeColor: HubCardColor =
      card.type === 'wild' ? move.chosenColor ?? 'red' : card.color;

    let players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex
        ? { ...p, hand: remainingHand, calledUno: remainingHand.length === 1 ? p.calledUno : false }
        : p
    );

    const eventType: string = card.type;
    let message = card.animal
      ? `${current.name} memainkan ${card.animal} ${card.animalName} (${getColorLabel(card.color)}${card.value !== undefined ? ` ${card.value}` : ''})!`
      : `${current.name} memainkan ${card.type.toUpperCase()}!`;

    if (card.type === 'reverse') {
      direction = (direction * -1) as 1 | -1;
      if (activeCount === 2) steps = 0;
      message = `🔄 ${current.name} membalik arah main!`;
    } else if (card.type === 'skip') {
      steps = 2;
      message = `🚫 ${current.name} melewati giliran berikutnya!`;
    } else if (card.type === 'draw1' || card.type === 'draw2') {
      const count = card.type === 'draw1' ? 1 : 2;
      const victimIdx = getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1);
      const res = drawCardsFromDeck(drawPile, discardPile, count);
      drawPile = res.drawPile;
      discardPile = res.discardPile;
      players = players.map((p, idx) =>
        idx === victimIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
      );
      steps = 2;
      message = `🐾 ${current.name} memainkan +${count}! ${players[victimIdx].name} ambil ${count} kartu & dilewati.`;
    } else if (card.type === 'wild') {
      message = `🌈 ${current.name} mengganti warna menjadi ${getColorLabel(activeColor)}!`;
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
        drawnPlayableCardId: null,
        hasDrawnThisTurn: false,
        pendingPrompt: null,
        unoVulnerablePlayerId,
      },
      eventType,
      message
    );

    nextState = this.checkWinCondition(nextState);
    if (nextState.phase === 'round_over' || nextState.phase === 'game_over') return nextState;
    if (steps === 0) return nextState;
    return this.advanceTurn(nextState, steps);
  },

  advanceTurn(state, steps = 1) {
    const nextIdx = getNextPlayerIndex(state.players, state.currentPlayerIndex, state.direction, steps);
    return transitionTurnWithPrivacy(
      { ...state, drawnPlayableCardId: null, hasDrawnThisTurn: false },
      nextIdx
    );
  },

  /** Official UNO Junior has NO point/scoring system! */
  calculateScore() {
    return 0;
  },

  checkWinCondition(state) {
    const winner = state.players.find((p) => p.hand.length === 0);
    if (!winner) return state;

    const summary: HubRoundSummary = {
      roundNumber: state.roundNumber,
      winnerId: winner.id,
      winnerName: winner.name,
      pointsAwarded: 0,
      reason: '🎉 Hebat! Berhasil menghabiskan seluruh kartu hewan!',
      playerPoints: state.players.map((p) => ({
        playerId: p.id,
        playerName: p.name,
        handPoints: p.hand.length,
        totalScore: 0,
      })),
    };

    return appendEvent(
      {
        ...state,
        phase: 'game_over',
        winnerId: winner.id,
        pendingPrompt: null,
        drawnPlayableCardId: null,
        unoVulnerablePlayerId: null,
        roundHistory: [...state.roundHistory, summary],
      },
      'game_win',
      `🏆 HOREE! ${winner.name} MENANG UNO JUNIOR!`
    );
  },

  resetRound(state) {
    const deck = this.shuffleDeck(this.createDeck(state.settings));
    const resetPlayers = state.players.map((p) => ({ ...p, hand: [], calledUno: false }));
    const { players, remainingDeck } = this.dealCards(deck, resetPlayers, state.settings);
    return createJuniorRoundState(
      remainingDeck,
      players,
      state.mode,
      state.settings,
      state.roundNumber + 1,
      state.roundHistory
    );
  },

  /**
   * Official UNO Junior Draw Rule:
   * Draw 1 card; if it matches, allow immediate play OR save & pass!
   */
  handleDrawOrPass(state, playerId) {
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.id !== playerId || state.phase !== 'playing') return state;

    if (state.drawnPlayableCardId) {
      return passAfterJuniorDraw(state, playerId);
    }

    const { drawn, drawPile, discardPile } = drawCardsFromDeck(state.drawPile, state.discardPile, 1);
    const drawnCard = drawn[0];
    const players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex
        ? { ...p, hand: [...p.hand, ...drawn], calledUno: false }
        : p
    );

    const top = state.discardPile[state.discardPile.length - 1];
    const canPlayDrawn = Boolean(drawnCard && juniorCardMatches(drawnCard, top, state.activeColor));

    if (canPlayDrawn && !current.isAI) {
      return appendEvent(
        {
          ...state,
          players,
          drawPile,
          discardPile,
          drawnPlayableCardId: drawnCard.id,
          hasDrawnThisTurn: true,
          unoVulnerablePlayerId: null,
        },
        'draw',
        `🎉 Kartu yang diambil langsung cocok! Mainkan sekarang atau klik Simpan Kartu.`
      );
    }

    if (canPlayDrawn && current.isAI && drawnCard) {
      return this.executeAction(
        {
          ...state,
          players,
          drawPile,
          discardPile,
          drawnPlayableCardId: drawnCard.id,
          hasDrawnThisTurn: true,
          unoVulnerablePlayerId: null,
        },
        current.id,
        { cardId: drawnCard.id, chosenColor: 'red' }
      );
    }

    const withEv = appendEvent(
      {
        ...state,
        players,
        drawPile,
        discardPile,
        drawnPlayableCardId: null,
        hasDrawnThisTurn: false,
        unoVulnerablePlayerId: null,
      },
      'draw',
      `${current.name} mengambil 1 kartu dari Draw Pile.`
    );
    return this.advanceTurn(withEv, 1);
  },

  resolvePrompt(state, payload) {
    if (!state.pendingPrompt) return state;
    // Opening Wild card color choice (no cardId — player chooses color and immediately plays!)
    if (!state.pendingPrompt.cardId && payload.color) {
      return appendEvent(
        {
          ...state,
          phase: 'playing',
          activeColor: payload.color,
          pendingPrompt: null,
        },
        'wild',
        `🌈 Warna pembuka dipilih: ${getColorLabel(payload.color)}! Silakan mainkan kartumu!`
      );
    }

    if (!state.pendingPrompt.cardId) return state;
    return this.executeAction(
      { ...state, phase: 'playing', pendingPrompt: null },
      state.pendingPrompt.actorId,
      {
        cardId: state.pendingPrompt.cardId,
        chosenColor: payload.color ?? 'red',
      }
    );
  },

  decideAIMove(state) {
    return genericAIDecision(this, state);
  },
};
