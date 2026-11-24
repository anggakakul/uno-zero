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
  TriplePlayPile,
  UnoRuleset,
  ValidationResult,
  VariantSettings,
} from '../types';
import {
  STANDARD_COLORS,
  genericAIDecision,
} from './baseHelpers';

/**
 * Official 112-card UNO Triple Play Deck:
 * - 76 Number cards (0–9 in 4 colors: one 0 + two each of 1–9 = 19/color × 4 = 76)
 * -  8 Reverse (2/color)
 * -  8 Skip (2/color)
 * -  8 Discard Two of the Same Color (2/color)
 * -  4 Wild
 * -  4 Wild Clear
 * -  4 Wild Give Away
 * Total = 76 + 24 + 12 = 112 cards!
 */
function buildTriplePlayDeck(): HubCard[] {
  const cards: HubCard[] = [];
  for (const color of STANDARD_COLORS) {
    cards.push({ id: uid('tp'), color, type: 'number', value: 0 });
    for (let v = 1; v <= 9; v += 1) {
      cards.push({ id: uid('tp'), color, type: 'number', value: v });
      cards.push({ id: uid('tp'), color, type: 'number', value: v });
    }
    for (let i = 0; i < 2; i += 1) {
      cards.push({ id: uid('tp'), color, type: 'reverse' });
      cards.push({ id: uid('tp'), color, type: 'skip' });
      cards.push({ id: uid('tp'), color, type: 'discard_two' });
    }
  }
  for (let i = 0; i < 4; i += 1) {
    cards.push({ id: uid('tp'), color: 'wild', type: 'wild' });
    cards.push({ id: uid('tp'), color: 'wild', type: 'wild_clear' });
    cards.push({ id: uid('tp'), color: 'wild', type: 'wild_give_away' });
  }
  return cards;
}

/** Secret hidden Overload threshold per pile cycle: 5 to 8 plays */
function randomOverloadThreshold(rng: () => number = Math.random): number {
  return 5 + Math.floor(rng() * 4);
}

/**
 * Balanced Lit-Pile Probability Distribution:
 * - 35% -> 1 pile lit (high tension!)
 * - 45% -> 2 piles lit (strategic choice)
 * - 20% -> 3 piles lit (relief / combo opportunity)
 */
export function illuminatePiles(
  piles: TriplePlayPile[],
  rng: () => number = Math.random
): TriplePlayPile[] {
  const roll = rng();
  const litCount = roll < 0.35 ? 1 : roll < 0.8 ? 2 : 3;
  const indices = shuffleCards([0, 1, 2]).slice(0, litCount);
  const litSet = new Set(indices);
  return piles.map((p, idx) => ({ ...p, lit: litSet.has(idx) }));
}

/** Weighted Overload Penalty (1–4 cards, EV ~ 2.35): 20%->1, 40%->2, 25%->3, 15%->4 */
function rollOverloadPenalty(rng: () => number = Math.random): number {
  const r = rng();
  if (r < 0.2) return 1;
  if (r < 0.6) return 2;
  if (r < 0.85) return 3;
  return 4;
}

function cardMatchesPile(card: HubCard, pile: TriplePlayPile): boolean {
  if (card.color === 'wild' || card.type.startsWith('wild')) return true;
  if (card.color === pile.activeColor) return true;
  const top = pile.cards[pile.cards.length - 1];
  if (!top) return true;
  if (card.type === 'number' && top.type === 'number' && card.value === top.value) return true;
  if (card.type !== 'number' && card.type === top.type) return true;
  return false;
}

/**
 * Official UNO Triple Play Scoring:
 * - Numbers (0–9): face value
 * - Reverse & Skip: 20 pts
 * - Discard Two of the Same Color: 30 pts
 * - Wild, Wild Clear, Wild Give Away: 50 pts
 */
export function calculateTriplePlayHandPoints(hand: HubCard[]): number {
  return hand.reduce((sum, card) => {
    if (card.type === 'number') return sum + (card.value ?? 0);
    if (card.type === 'reverse' || card.type === 'skip') return sum + 20;
    if (card.type === 'discard_two') return sum + 30;
    return sum + 50;
  }, 0);
}

function buildInitialTripleState(
  deck: HubCard[],
  players: HubPlayer[],
  mode: 'local' | 'ai' | 'online',
  settings: VariantSettings,
  roundNumber: number,
  roundHistory: HubRoundSummary[]
): HubGameState {
  const drawPile = [...deck];
  const piles: TriplePlayPile[] = [];
  for (let i = 0; i < 3; i += 1) {
    const numIdx = drawPile.findIndex((c) => c.type === 'number');
    const starter = numIdx >= 0 ? drawPile.splice(numIdx, 1)[0] : drawPile.pop()!;
    piles.push({
      id: i,
      cards: [starter],
      activeColor: starter.color === 'wild' ? 'red' : starter.color,
      lit: true,
      pressure: 0,
      overloadThreshold: randomOverloadThreshold(),
    });
  }

  const litPiles = illuminatePiles(piles);

  return appendEvent(
    {
      version: 1,
      variantId: 'uno-triple-play',
      mode,
      phase: 'playing',
      roundNumber,
      players,
      currentPlayerIndex: 0,
      direction: 1,
      drawPile,
      discardPile: [litPiles[0].cards[0]],
      activeColor: litPiles[0].activeColor,
      pendingDrawCount: 0,
      flipSide: 'light',
      triplePiles: litPiles,
      turnTimerSeconds: settings.triplePlayMode === 'timer' ? 7 : undefined,
      hasDrawnThisTurn: false,
      settings,
      roundHistory,
      actionLog: [],
      lastEvent: null,
      winnerId: null,
      startedAt: Date.now(),
    },
    'info',
    `Ronde ${roundNumber} UNO Triple Play dimulai (${settings.triplePlayMode === 'timer' ? 'Timer Mode 7s' : 'Regular Mode'})!`
  );
}

/** Handle Timer Mode timeout -> +6 penalty cards, relight piles, advance turn */
export function handleTriplePlayTimeout(state: HubGameState): HubGameState {
  if (state.variantId !== 'uno-triple-play' || state.phase !== 'playing') return state;
  const current = state.players[state.currentPlayerIndex];
  if (!current) return state;

  const drawRes = drawCardsFromDeck(state.drawPile, state.discardPile, 6);
  const players = state.players.map((p, idx) =>
    idx === state.currentPlayerIndex
      ? { ...p, hand: [...p.hand, ...drawRes.drawn], calledUno: false }
      : p
  );
  const triplePiles = state.triplePiles ? illuminatePiles(state.triplePiles) : undefined;
  const nextState = appendEvent(
    {
      ...state,
      players,
      drawPile: drawRes.drawPile,
      discardPile: drawRes.discardPile,
      triplePiles,
      turnTimerSeconds: 7,
    },
    'timeout',
    `⏱️ WAKTU HABIS (7 detik)! ${current.name} menerima penalti +${drawRes.drawn.length} kartu!`
  );
  return unoTriplePlayRuleset.advanceTurn(nextState, 1);
}

export const unoTriplePlayRuleset: UnoRuleset = {
  id: 'uno-triple-play',

  createDeck() {
    return buildTriplePlayDeck();
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
    return buildInitialTripleState(remainingDeck, players, mode, settings, 1, []);
  },

  validateMove(state: HubGameState, playerId: string, move: MoveInput): ValidationResult {
    if (state.phase !== 'playing') return { valid: false, reason: 'Permainan tidak aktif.' };
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.id !== playerId) return { valid: false, reason: 'Bukan giliranmu.' };

    const card = current.hand.find((c) => c.id === move.cardId);
    if (!card) return { valid: false, reason: 'Kartu tidak ditemukan.' };

    const piles = state.triplePiles ?? [];
    const targetIdx = move.pileIndex;
    if (targetIdx !== undefined) {
      const pile = piles[targetIdx];
      if (!pile) return { valid: false, reason: 'Discard Pile tidak valid.' };
      if (!pile.lit) return { valid: false, reason: 'Pile ini sedang MATI! Pilih pile yang menyala.' };
      if (!cardMatchesPile(card, pile)) {
        return { valid: false, reason: 'Kartu tidak cocok dengan Discard Pile tersebut.' };
      }
      return {
        valid: true,
        requiresColor: card.color === 'wild',
        requiresTarget: card.type === 'wild_give_away' ? 'target_give_away' : undefined,
      };
    }

    const anyLitMatch = piles.some((p) => p.lit && cardMatchesPile(card, p));
    if (!anyLitMatch) {
      return { valid: false, reason: 'Kartu tidak cocok dengan Discard Pile mana pun yang menyala!' };
    }
    return {
      valid: true,
      requiresColor: card.color === 'wild',
      requiresTarget: card.type === 'wild_give_away' ? 'target_give_away' : undefined,
    };
  },

  executeAction(state: HubGameState, playerId: string, move: MoveInput): HubGameState {
    const piles = state.triplePiles ?? [];
    const current = state.players[state.currentPlayerIndex];
    if (!current) return state;
    const card = current.hand.find((c) => c.id === move.cardId);
    if (!card) return state;

    const chosenPileIdx =
      move.pileIndex !== undefined
        ? move.pileIndex
        : piles.findIndex((p) => p.lit && cardMatchesPile(card, p));

    if (chosenPileIdx < 0) return state;
    const validation = this.validateMove(state, playerId, { ...move, pileIndex: chosenPileIdx });
    if (!validation.valid) return state;

    if (card.color === 'wild' && !move.chosenColor) {
      return {
        ...state,
        phase: 'choose_color',
        pendingPrompt: {
          type: 'color',
          actorId: playerId,
          cardId: card.id,
          pileIndex: chosenPileIdx,
          message: `Pilih warna aktif untuk Pile #${chosenPileIdx + 1}:`,
        },
      };
    }

    if (card.type === 'wild_give_away' && !move.targetPlayerId) {
      return {
        ...state,
        phase: 'choose_target',
        pendingPrompt: {
          type: 'target_give_away',
          actorId: playerId,
          cardId: card.id,
          pileIndex: chosenPileIdx,
          message: `🎁 WILD GIVE AWAY (Pile #${chosenPileIdx + 1}): Pilih lawan yang menerima kartu dari tumpukan ini!`,
        },
      };
    }

    let remainingHand = current.hand.filter((c) => c.id !== card.id);
    const activeCount = getActivePlayers(state.players).length;
    let direction = state.direction;
    let steps = 1;
    let drawPile = [...state.drawPile];
    let discardPile = [...state.discardPile, card];
    const newColor: HubCardColor = card.color === 'wild' ? move.chosenColor ?? 'red' : card.color;

    // Discard Two of the Same Color: sheds 1 additional same-color card from hand (+2 pressure!)
    let extraDiscarded: HubCard | undefined;
    if (card.type === 'discard_two') {
      extraDiscarded = remainingHand.find((c) => c.color === card.color);
      if (extraDiscarded) {
        remainingHand = remainingHand.filter((c) => c.id !== extraDiscarded!.id);
        discardPile = [...discardPile, extraDiscarded];
      }
    }

    let players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex
        ? { ...p, hand: remainingHand, calledUno: remainingHand.length === 1 ? p.calledUno : false }
        : p
    );

    let eventType: string = card.type;
    let message = `${current.name} memainkan kartu ke Pile #${chosenPileIdx + 1}.`;

    let overloaded = false;
    let overloadPenalty = 0;

    let nextPiles = piles.map((p, idx) => {
      if (idx !== chosenPileIdx) return p;

      // WILD CLEAR: clears pile underneath & resets pressure to 0 (NEVER triggers Overload!)
      if (card.type === 'wild_clear' || card.type === 'clear') {
        discardPile = [...p.cards, ...discardPile];
        return {
          ...p,
          cards: [card],
          activeColor: newColor,
          pressure: 0,
          overloadThreshold: randomOverloadThreshold(),
        };
      }

      // WILD GIVE AWAY: gives up to 3 cards from pile to chosen opponent & resets pressure to 0 (NEVER triggers Overload!)
      if (card.type === 'wild_give_away') {
        const giveCount = Math.min(3, Math.max(1, p.cards.length));
        const givenCards = p.cards.slice(-giveCount);
        const targetIdx = players.findIndex((pl) => pl.id === move.targetPlayerId);
        if (targetIdx >= 0) {
          players = players.map((pl, pi) =>
            pi === targetIdx
              ? { ...pl, hand: [...pl.hand, ...givenCards], calledUno: false }
              : pl
          );
          message = `🎁 WILD GIVE AWAY (${getColorLabel(newColor)})! ${current.name} mengirim ${givenCards.length} kartu dari Pile #${idx + 1} ke ${players[targetIdx].name} & mereset tekanan!`;
        }
        return {
          ...p,
          cards: [card],
          activeColor: newColor,
          pressure: 0,
          overloadThreshold: randomOverloadThreshold(),
        };
      }

      // Normal / Discard Two pressure increment (+2 if extra card was discarded!)
      const pressureDelta = extraDiscarded ? 2 : 1;
      const nextPressure = p.pressure + pressureDelta;
      const appendedCards = extraDiscarded ? [extraDiscarded, card] : [card];

      if (nextPressure >= p.overloadThreshold) {
        overloaded = true;
        overloadPenalty = rollOverloadPenalty();
        if (state.settings.triplePlayPartyRules) {
          overloadPenalty += 1; // Optional Party Rule bonus penalty
        }
        return {
          ...p,
          cards: [...p.cards, ...appendedCards],
          activeColor: newColor,
          pressure: 0,
          overloadThreshold: randomOverloadThreshold(),
        };
      }

      return {
        ...p,
        cards: [...p.cards, ...appendedCards],
        activeColor: newColor,
        pressure: nextPressure,
      };
    });

    if (card.type === 'wild_clear' || card.type === 'clear') {
      eventType = 'wild_clear';
      message = `✨ WILD CLEAR (${getColorLabel(newColor)})! ${current.name} mengosongkan Pile #${chosenPileIdx + 1} & mereset lampu ke HIJAU!`;
    } else if (card.type === 'discard_two') {
      message = extraDiscarded
        ? `✌️ DISCARD TWO! ${current.name} membuang 2 kartu ${getColorLabel(card.color)} sekaligus ke Pile #${chosenPileIdx + 1} (+2 tekanan)!`
        : `${current.name} memainkan Discard Two ke Pile #${chosenPileIdx + 1}.`;
    }

    if (overloaded) {
      const drawRes = drawCardsFromDeck(drawPile, discardPile, overloadPenalty);
      drawPile = drawRes.drawPile;
      discardPile = drawRes.discardPile;
      players = players.map((p, idx) =>
        idx === state.currentPlayerIndex
          ? { ...p, hand: [...p.hand, ...drawRes.drawn], calledUno: false }
          : p
      );
      eventType = 'overload';
      message = `🚨 OVERLOAD di Pile #${chosenPileIdx + 1}! ${current.name} terkena penalti +${drawRes.drawn.length} kartu${state.settings.triplePlayPartyRules ? ' (Party Mode +1!)' : ''}!`;
    } else if (card.type === 'reverse') {
      direction = (direction * -1) as 1 | -1;
      if (activeCount === 2) steps = 0;
      message = `🔄 ${current.name} membalik arah di Pile #${chosenPileIdx + 1}!`;
    } else if (card.type === 'skip') {
      steps = 2;
      message = `🚫 SKIP di Pile #${chosenPileIdx + 1}!`;
    }

    nextPiles = illuminatePiles(nextPiles);

    const updatedSelf = players[state.currentPlayerIndex];
    const unoVulnerablePlayerId =
      updatedSelf.hand.length === 1 && !updatedSelf.calledUno ? updatedSelf.id : null;

    let nextState: HubGameState = appendEvent(
      {
        ...state,
        phase: 'playing',
        players,
        direction,
        drawPile,
        discardPile,
        activeColor: newColor,
        triplePiles: nextPiles,
        pendingPrompt: null,
        unoVulnerablePlayerId,
        turnTimerSeconds: state.settings.triplePlayMode === 'timer' ? 7 : undefined,
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
    return transitionTurnWithPrivacy(state, nextIdx);
  },

  calculateScore(state, winnerId) {
    return state.players
      .filter((p) => p.id !== winnerId)
      .reduce((sum, p) => sum + calculateTriplePlayHandPoints(p.hand), 0);
  },

  checkWinCondition(state) {
    const roundWinner = state.players.find((p) => p.hand.length === 0);
    if (!roundWinner) return state;

    const isLowestMode = state.settings.triplePlayScoringMode === 'lowest_at_500';
    let updatedPlayers: HubPlayer[];
    let pointsAwarded = 0;

    if (isLowestMode) {
      updatedPlayers = state.players.map((p) => ({
        ...p,
        score: p.score + calculateTriplePlayHandPoints(p.hand),
      }));
    } else {
      pointsAwarded = this.calculateScore(state, roundWinner.id);
      updatedPlayers = state.players.map((p) =>
        p.id === roundWinner.id ? { ...p, score: p.score + pointsAwarded } : p
      );
    }

    const anyHitTarget = updatedPlayers.some((p) => p.score >= state.settings.targetScore);
    const matchOver = state.settings.singleRound || anyHitTarget;
    const matchWinner =
      matchOver && isLowestMode
        ? [...updatedPlayers].sort((a, b) => a.score - b.score)[0]
        : roundWinner;

    const summary: HubRoundSummary = {
      roundNumber: state.roundNumber,
      winnerId: matchOver ? matchWinner.id : roundWinner.id,
      winnerName: matchOver ? matchWinner.name : roundWinner.name,
      pointsAwarded,
      reason: isLowestMode
        ? `${roundWinner.name} menutup ronde (Skor Alternatif Terendah)!`
        : `${roundWinner.name} menghabiskan kartu di UNO Triple Play (+${pointsAwarded} poin)!`,
      playerPoints: updatedPlayers.map((p) => ({
        playerId: p.id,
        playerName: p.name,
        handPoints: calculateTriplePlayHandPoints(p.hand),
        totalScore: p.score,
      })),
    };

    return appendEvent(
      {
        ...state,
        players: updatedPlayers,
        phase: matchOver ? 'game_over' : 'round_over',
        winnerId: matchOver ? matchWinner.id : null,
        pendingPrompt: null,
        unoVulnerablePlayerId: null,
        roundHistory: [...state.roundHistory, summary],
      },
      matchOver ? 'game_win' : 'round_end',
      matchOver
        ? `🏆 ${matchWinner.name} memenangkan UNO TRIPLE PLAY (${matchWinner.score} poin)!`
        : `🎉 ${roundWinner.name} menang Ronde ${state.roundNumber}!`
    );
  },

  resetRound(state) {
    const deck = this.shuffleDeck(this.createDeck(state.settings));
    const resetPlayers = state.players.map((p) => ({ ...p, hand: [], calledUno: false }));
    const { players, remainingDeck } = this.dealCards(deck, resetPlayers, state.settings);
    return buildInitialTripleState(
      remainingDeck,
      players,
      state.mode,
      state.settings,
      state.roundNumber + 1,
      state.roundHistory
    );
  },

  /**
   * Official UNO Triple Play Draw Until Playable:
   * Keep drawing from Draw Pile until finding a card that matches any currently LIT pile!
   */
  handleDrawOrPass(state, playerId) {
    const player = state.players[state.currentPlayerIndex];
    if (!player || player.id !== playerId || state.phase !== 'playing') return state;

    const litPiles = (state.triplePiles ?? []).filter((p) => p.lit);
    let drawPile = [...state.drawPile];
    let discardPile = [...state.discardPile];
    const drawnCards: HubCard[] = [];
    let foundPlayable = false;

    for (let guard = 0; guard < 25; guard += 1) {
      const drawRes = drawCardsFromDeck(drawPile, discardPile, 1);
      drawPile = drawRes.drawPile;
      discardPile = drawRes.discardPile;
      if (drawRes.drawn.length === 0) break;
      const c = drawRes.drawn[0];
      drawnCards.push(c);
      if (litPiles.some((lp) => cardMatchesPile(c, lp))) {
        foundPlayable = true;
        break;
      }
    }

    const players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex
        ? { ...p, hand: [...p.hand, ...drawnCards], calledUno: false }
        : p
    );

    const nextState = appendEvent(
      {
        ...state,
        players,
        drawPile,
        discardPile,
        unoVulnerablePlayerId: null,
      },
      'draw',
      foundPlayable
        ? `🃏 ${player.name} menarik ${drawnCards.length} kartu hingga menemukan kartu yang cocok pada pile menyala!`
        : `${player.name} menarik ${drawnCards.length} kartu.`
    );

    if (foundPlayable) return nextState; // Player stays on turn to play the matching card!
    const relit = state.triplePiles ? illuminatePiles(state.triplePiles) : undefined;
    return this.advanceTurn({ ...nextState, triplePiles: relit }, 1);
  },

  resolvePrompt(state, payload) {
    if (!state.pendingPrompt?.cardId) return state;
    return this.executeAction(
      { ...state, phase: 'playing', pendingPrompt: null },
      state.pendingPrompt.actorId,
      {
        cardId: state.pendingPrompt.cardId,
        chosenColor: payload.color ?? state.activeColor,
        targetPlayerId: payload.targetPlayerId,
        pileIndex: state.pendingPrompt.pileIndex,
      }
    );
  },

  decideAIMove(state) {
    return genericAIDecision(this, state);
  },
};
