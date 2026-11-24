import {
  appendEvent,
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
  HubCardType,
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
  finalizeStandardRoundWin,
  genericAIDecision,
  standardColorMatchValid,
} from './baseHelpers';

export const MERCY_LIMIT = 25;

export function getDrawStackValue(type: HubCardType): number {
  if (type === 'draw2') return 2;
  if (type === 'draw4' || type === 'wild_reverse_draw4') return 4;
  if (type === 'wild_draw6') return 6;
  if (type === 'wild_draw10') return 10;
  return 0;
}

/**
 * Official 168-card UNO Show 'Em No Mercy deck:
 * - Numbers 0-9 (2 per color = 80)
 * - Color Actions: 3 Skip, 3 Reverse, 3 Discard All, 2 Skip Everyone, 2 Draw 2, 2 Draw 4 per color (60)
 * - Wilds: 8 Wild Reverse Draw 4, 8 Wild Color Roulette, 6 Wild Draw 6, 6 Wild Draw 10 (28)
 * Total = 168 cards!
 */
function buildNoMercyDeck(): HubCard[] {
  const cards: HubCard[] = [];
  for (const color of STANDARD_COLORS) {
    for (let v = 0; v <= 9; v += 1) {
      cards.push({ id: uid('nm'), color, type: 'number', value: v });
      cards.push({ id: uid('nm'), color, type: 'number', value: v });
    }
    for (let i = 0; i < 3; i += 1) {
      cards.push({ id: uid('nm'), color, type: 'skip' });
      cards.push({ id: uid('nm'), color, type: 'reverse' });
      cards.push({ id: uid('nm'), color, type: 'discard_all' });
    }
    for (let i = 0; i < 2; i += 1) {
      cards.push({ id: uid('nm'), color, type: 'skip_everyone' });
      cards.push({ id: uid('nm'), color, type: 'draw2' });
      cards.push({ id: uid('nm'), color, type: 'draw4' });
    }
  }
  for (let i = 0; i < 8; i += 1) {
    cards.push({ id: uid('nm'), color: 'wild', type: 'wild_reverse_draw4' });
    cards.push({ id: uid('nm'), color: 'wild', type: 'wild_color_roulette' });
  }
  for (let i = 0; i < 6; i += 1) {
    cards.push({ id: uid('nm'), color: 'wild', type: 'wild_draw6' });
    cards.push({ id: uid('nm'), color: 'wild', type: 'wild_draw10' });
  }
  return cards;
}

/**
 * Official No Mercy Draw & Reshuffle helper:
 * When Draw Pile empties, shuffles Discard Pile (keeping top card) TOGETHER with eliminatedCardsPool!
 */
function drawNoMercyCards(
  drawPile: HubCard[],
  discardPile: HubCard[],
  eliminatedCardsPool: HubCard[],
  count: number
): {
  drawn: HubCard[];
  drawPile: HubCard[];
  discardPile: HubCard[];
  eliminatedCardsPool: HubCard[];
  reshuffled: boolean;
} {
  let dPile = [...drawPile];
  let discPile = [...discardPile];
  let elimPool = [...eliminatedCardsPool];
  const drawn: HubCard[] = [];
  let reshuffled = false;

  for (let i = 0; i < count; i += 1) {
    if (dPile.length === 0) {
      const recyclableDiscard = discPile.length > 1 ? discPile.slice(0, -1) : [];
      const combined = [...recyclableDiscard, ...elimPool];
      if (combined.length === 0) break;
      dPile = shuffleCards(combined);
      discPile = discPile.length > 0 ? [discPile[discPile.length - 1]] : [];
      elimPool = [];
      reshuffled = true;
    }
    const card = dPile.pop();
    if (card) drawn.push(card);
  }

  return { drawn, drawPile: dPile, discardPile: discPile, eliminatedCardsPool: elimPool, reshuffled };
}

/**
 * Official Mercy Rule Check:
 * Any player reaching >= 25 cards is immediately eliminated (knocked out).
 * Their cards are set aside in `eliminatedCardsPool` (NOT placed in Discard Pile until Draw Pile reshuffles!).
 */
function applyMercyCheck(
  players: HubPlayer[],
  eliminatedCardsPool: HubCard[]
): { players: HubPlayer[]; eliminatedCardsPool: HubCard[]; newlyEliminated: string[] } {
  const newlyEliminated: string[] = [];
  const nextPool = [...eliminatedCardsPool];
  const updated = players.map((p) => {
    if (!p.eliminated && p.hand.length >= MERCY_LIMIT) {
      newlyEliminated.push(p.name);
      nextPool.push(...p.hand);
      return { ...p, eliminated: true, hand: [], calledUno: false };
    }
    return p;
  });
  return { players: updated, eliminatedCardsPool: nextPool, newlyEliminated };
}

/**
 * Official UNO Show 'Em No Mercy Scoring:
 * - Numbers 0–9: face value
 * - Color Action Cards (Skip, Reverse, Skip Everyone, Discard All, Draw 2, Draw 4): 20 pts
 * - Wild Cards: 50 pts
 */
export function calculateNoMercyHandPoints(hand: HubCard[]): number {
  return hand.reduce((sum, card) => {
    if (card.type === 'number') return sum + (card.value ?? 0);
    if (card.color === 'wild' || card.type.startsWith('wild')) return sum + 50;
    return sum + 20;
  }, 0);
}

/**
 * Official Setup:
 * - 2–6 players, 7 cards each.
 * - First Discard Pile card MUST be a numbered card (0–9); Action/Wild cards are skipped until a number appears.
 * - Starts with player to the LEFT of dealer (index 1 % players.length) moving clockwise!
 */
function createNoMercyRoundState(
  deck: HubCard[],
  players: HubPlayer[],
  mode: 'local' | 'ai' | 'online',
  settings: VariantSettings,
  roundNumber: number,
  roundHistory: HubRoundSummary[]
): HubGameState {
  const drawPile = [...deck];
  let firstCard: HubCard | undefined;

  for (let guard = 0; guard < drawPile.length; guard += 1) {
    const candidate = drawPile.pop();
    if (!candidate) break;
    if (candidate.type === 'number') {
      firstCard = candidate;
      break;
    }
    drawPile.unshift(candidate);
  }

  const starterIdx = players.length > 1 ? 1 % players.length : 0;
  const activeColor: HubCardColor =
    firstCard && firstCard.color !== 'wild' ? firstCard.color : 'red';

  return appendEvent(
    {
      version: 1,
      variantId: 'uno-no-mercy',
      mode,
      phase: 'playing',
      roundNumber,
      players,
      currentPlayerIndex: starterIdx,
      direction: 1,
      drawPile,
      discardPile: firstCard ? [firstCard] : [],
      eliminatedCardsPool: [],
      activeColor,
      pendingDrawCount: 0,
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
    `Ronde ${roundNumber} UNO Show 'Em No Mercy dimulai! Giliran ${players[starterIdx].name} (sebelah kiri dealer). Waspadai Mercy Rule (25 kartu)!`
  );
}

export const unoNoMercyRuleset: UnoRuleset = {
  id: 'uno-no-mercy',

  createDeck() {
    return buildNoMercyDeck();
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
      eliminated: false,
    }));
    return { players: dealt, remainingDeck: remaining };
  },

  initializeGame(playerInits, mode, settings) {
    const deck = this.shuffleDeck(this.createDeck(settings));
    const clamped = playerInits.slice(0, 6); // Official 2–6 players
    const initialPlayers: HubPlayer[] = clamped.map((p) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      hand: [],
      score: 0,
      calledUno: false,
      eliminated: false,
    }));
    const { players, remainingDeck } = this.dealCards(deck, initialPlayers, settings);
    return createNoMercyRoundState(remainingDeck, players, mode, settings, 1, []);
  },

  validateMove(state: HubGameState, playerId: string, move: MoveInput): ValidationResult {
    if (state.phase !== 'playing') return { valid: false, reason: 'Permainan tidak aktif.' };
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.id !== playerId || current.eliminated) {
      return { valid: false, reason: 'Bukan giliranmu.' };
    }

    const card = current.hand.find((c) => c.id === move.cardId);
    if (!card) return { valid: false, reason: 'Kartu tidak ditemukan.' };

    // STACKING RULE: ONLY a Draw card with value >= pendingDrawMinValue can be stacked!
    if (state.pendingDrawCount > 0) {
      const cardDrawVal = getDrawStackValue(card.type);
      const minVal = state.pendingDrawMinValue ?? 2;
      if (cardDrawVal >= minVal) {
        return {
          valid: true,
          requiresColor: card.color === 'wild',
        };
      }
      return {
        valid: false,
        reason: `Tumpukan penalti +${state.pendingDrawCount} aktif! Harus tumpuk kartu Draw ≥ +${minVal} atau ambil seluruh tumpukan.`,
      };
    }

    if (!standardColorMatchValid(state, card)) {
      return { valid: false, reason: 'Kartu tidak cocok dengan warna, angka, atau simbol!' };
    }

    return {
      valid: true,
      requiresColor:
        card.type === 'wild_reverse_draw4' ||
        card.type === 'wild_draw6' ||
        card.type === 'wild_draw10',
      requiresTarget: card.type === 'number' && card.value === 7 ? 'target_swap' : undefined,
    };
  },

  executeAction(state: HubGameState, playerId: string, move: MoveInput): HubGameState {
    const validation = this.validateMove(state, playerId, move);
    if (!validation.valid) return state;

    const current = state.players[state.currentPlayerIndex];
    const card = current.hand.find((c) => c.id === move.cardId)!;
    let remainingHand = current.hand.filter((c) => c.id !== card.id);

    // Wild color choice (NOT Color Roulette — the NEXT player chooses color!)
    if (
      (card.type === 'wild_reverse_draw4' ||
        card.type === 'wild_draw6' ||
        card.type === 'wild_draw10') &&
      !move.chosenColor
    ) {
      return {
        ...state,
        phase: 'choose_color',
        pendingPrompt: {
          type: 'color',
          actorId: playerId,
          cardId: card.id,
          message: 'Pilih warna aktif untuk kartu Wild Brutal:',
        },
      };
    }

    // 7's Swap: mandatory swap with 1 chosen player (if actor still has cards)
    if (
      card.type === 'number' &&
      card.value === 7 &&
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
          message: "7's SWAP: Pilih 1 pemain untuk bertukar seluruh kartu tangan!",
        },
      };
    }

    const activeCount = getActivePlayers(state.players).length;
    let direction = state.direction;
    let steps = 1;
    let drawPile = [...state.drawPile];
    let discardPile = [...state.discardPile];
    let eliminatedCardsPool = [...(state.eliminatedCardsPool ?? [])];
    let activeColor: HubCardColor =
      card.color === 'wild' ? move.chosenColor ?? state.activeColor : card.color;
    let pendingDrawCount = state.pendingDrawCount;
    let pendingDrawMinValue = state.pendingDrawMinValue;

    // Official Discard All rule: same-color cards go UNDERNEATH Discard All so Discard All stays on TOP!
    if (card.type === 'discard_all') {
      const sameColor = remainingHand.filter((c) => c.color === card.color);
      remainingHand = remainingHand.filter((c) => c.color !== card.color);
      discardPile = [...discardPile, ...sameColor, card];
    } else {
      discardPile = [...discardPile, card];
    }

    let players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex
        ? { ...p, hand: remainingHand, calledUno: remainingHand.length === 1 ? p.calledUno : false }
        : p
    );

    let eventType: string = card.type;
    let message = `${current.name} memainkan ${card.type === 'number' ? `${getColorLabel(card.color)} ${card.value}` : card.type.toUpperCase()}.`;

    const drawVal = getDrawStackValue(card.type);
    if (drawVal > 0) {
      pendingDrawCount += drawVal;
      pendingDrawMinValue = drawVal;
      eventType = 'stack';

      if (card.type === 'wild_reverse_draw4') {
        direction = (direction * -1) as 1 | -1;
        if (activeCount === 2) {
          // OFFICIAL 2-PLAYER EDGE CASE: reverses back onto the player who played it!
          // Actor must take the penalty UNLESS they immediately stack another Draw card!
          steps = 0;
          message = `🔥 WILD REVERSE +4 (2 Pemain — ${getColorLabel(activeColor)})! Arah berbalik ke ${current.name} sendiri! Stack ≥+4 atau ambil +${pendingDrawCount}!`;
        } else {
          message = `🔥 WILD REVERSE +4 (${getColorLabel(activeColor)})! Arah dibalik — tumpukan penalti +${pendingDrawCount} menuju pemain di arah baru!`;
        }
      } else {
        message = `🔥 STACK +${drawVal}! Total tumpukan penalti kini +${pendingDrawCount}!`;
      }
    } else if (card.type === 'wild_color_roulette') {
      const nextIdx = getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1);
      const victim = players[nextIdx];
      let nextState: HubGameState = appendEvent(
        {
          ...state,
          phase: 'choose_roulette_color',
          players,
          direction,
          drawPile,
          discardPile,
          eliminatedCardsPool,
          activeColor,
          pendingPrompt: {
            type: 'roulette_color',
            actorId: victim.id,
            cardId: card.id,
            message: `🎰 WILD COLOR ROULETTE! ${victim.name}, pilih 1 warna (kartu Wild tidak dihitung cocok)!`,
          },
          currentPlayerIndex: nextIdx,
          unoVulnerablePlayerId: remainingHand.length === 1 && !current.calledUno ? current.id : null,
        },
        'roulette',
        `🎰 ${current.name} memainkan WILD COLOR ROULETTE! Giliran ${victim.name} memilih warna!`
      );
      nextState = this.checkWinCondition(nextState);
      return nextState;
    } else if (card.type === 'discard_all') {
      message = `💥 DISCARD ALL! ${current.name} membuang semua kartu ${getColorLabel(card.color)} (Discard All tetap di puncak)!`;
    } else if (card.type === 'skip_everyone') {
      steps = 0;
      message = `⚡ SKIP EVERYONE! ${current.name} melewati semua lawan dan bermain lagi!`;
    } else if (card.type === 'skip') {
      steps = 2;
      const skipped = players[getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1)];
      message = `🚫 SKIP! ${skipped?.name} kehilangan giliran.`;
    } else if (card.type === 'reverse') {
      if (activeCount === 2) {
        direction = (direction * -1) as 1 | -1;
        steps = 0;
        message = `🔄 REVERSE (2 pemain = Skip)!`;
      } else {
        direction = (direction * -1) as 1 | -1;
        message = `🔄 ${current.name} membalik arah permainan!`;
      }
    } else if (card.type === 'number' && card.value === 7 && remainingHand.length > 0) {
      const targetIdx = players.findIndex((p) => p.id === move.targetPlayerId);
      if (targetIdx >= 0 && targetIdx !== state.currentPlayerIndex) {
        const myCards = [...remainingHand];
        const targetCards = [...players[targetIdx].hand];
        const targetName = players[targetIdx].name;
        players = players.map((p, idx) => {
          if (idx === state.currentPlayerIndex) return { ...p, hand: targetCards, calledUno: false };
          if (idx === targetIdx) return { ...p, hand: myCards, calledUno: false };
          return p;
        });
        eventType = 'swap';
        message = `🔀 7's SWAP! ${current.name} menukar seluruh kartu dengan ${targetName}!`;
      }
    } else if (card.type === 'number' && card.value === 0) {
      const activeIndices = players
        .map((p, i) => (!p.eliminated ? i : -1))
        .filter((i) => i >= 0);
      if (activeIndices.length >= 2) {
        const oldHands = activeIndices.map((idx) => [...players[idx].hand]);
        const newPlayers = [...players];
        for (let k = 0; k < activeIndices.length; k += 1) {
          const toPos =
            direction === 1
              ? (k + 1) % activeIndices.length
              : (k - 1 + activeIndices.length) % activeIndices.length;
          const targetIdx = activeIndices[toPos];
          newPlayers[targetIdx] = {
            ...newPlayers[targetIdx],
            hand: oldHands[k],
            calledUno: false,
          };
        }
        players = newPlayers;
        eventType = 'pass_all';
        message = `🌪️ 0's PASS! Semua pemain mengoper seluruh kartu mereka searah permainan!`;
      }
    }

    const mercy = applyMercyCheck(players, eliminatedCardsPool);
    players = mercy.players;
    eliminatedCardsPool = mercy.eliminatedCardsPool;
    if (mercy.newlyEliminated.length > 0) {
      message += ` ☠️ MERCY RULE: ${mercy.newlyEliminated.join(', ')} tersingkir (≥25 kartu)!`;
    }

    const updatedSelf = players[state.currentPlayerIndex];
    const unoVulnerablePlayerId =
      !updatedSelf.eliminated && updatedSelf.hand.length === 1 && !updatedSelf.calledUno
        ? updatedSelf.id
        : null;

    let nextState: HubGameState = appendEvent(
      {
        ...state,
        phase: 'playing',
        players,
        direction,
        drawPile,
        discardPile,
        eliminatedCardsPool,
        activeColor,
        pendingDrawCount,
        pendingDrawMinValue,
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
    return transitionTurnWithPrivacy(state, nextIdx);
  },

  calculateScore(state, winnerId) {
    const handPts = state.players
      .filter((p) => p.id !== winnerId && !p.eliminated)
      .reduce((sum, p) => sum + calculateNoMercyHandPoints(p.hand), 0);
    const koBonus = state.players.filter((p) => p.eliminated).length * 250;
    return handPts + koBonus;
  },

  checkWinCondition(state) {
    const alive = state.players.filter((p) => !p.eliminated);
    if (alive.length === 1) {
      const survivor = alive[0];
      const pts = this.calculateScore(state, survivor.id);
      return finalizeStandardRoundWin(
        state,
        survivor.id,
        pts,
        'LAST PLAYER STANDING! Semua lawan tersingkir oleh Mercy Rule (≥25 kartu)!'
      );
    }
    const emptyWinner = alive.find((p) => p.hand.length === 0);
    if (emptyWinner) {
      const pts = this.calculateScore(state, emptyWinner.id);
      return finalizeStandardRoundWin(
        state,
        emptyWinner.id,
        pts,
        'Menghabiskan seluruh kartu di tangan!'
      );
    }
    return state;
  },

  resetRound(state) {
    const deck = this.shuffleDeck(this.createDeck(state.settings));
    const resetPlayers = state.players.map((p) => ({
      ...p,
      hand: [],
      calledUno: false,
      eliminated: false,
    }));
    const { players, remainingDeck } = this.dealCards(deck, resetPlayers, state.settings);
    return createNoMercyRoundState(
      remainingDeck,
      players,
      state.mode,
      state.settings,
      state.roundNumber + 1,
      state.roundHistory
    );
  },

  /**
   * Official No Mercy Draw Logic:
   * 1. If pendingDrawCount > 0 (Stacking Penalty): take entire accumulated penalty, check Mercy Rule, lose turn.
   * 2. If pendingDrawCount === 0: **DRAW UNTIL PLAYABLE**! Keep drawing 1 by 1 until finding a playable card
   *    (checking Mercy Rule >= 25 on EVERY card drawn!). Once a playable card is drawn, player keeps turn to play it!
   */
  handleDrawOrPass(state, playerId) {
    const player = state.players[state.currentPlayerIndex];
    if (!player || player.id !== playerId || state.phase !== 'playing') return state;

    let drawPile = [...state.drawPile];
    let discardPile = [...state.discardPile];
    let eliminatedCardsPool = [...(state.eliminatedCardsPool ?? [])];

    // Case 1: Taking stacked Draw penalty
    if (state.pendingDrawCount > 0) {
      const drawRes = drawNoMercyCards(drawPile, discardPile, eliminatedCardsPool, state.pendingDrawCount);
      drawPile = drawRes.drawPile;
      discardPile = drawRes.discardPile;
      eliminatedCardsPool = drawRes.eliminatedCardsPool;

      let players = state.players.map((p, idx) =>
        idx === state.currentPlayerIndex
          ? { ...p, hand: [...p.hand, ...drawRes.drawn], calledUno: false }
          : p
      );

      const mercy = applyMercyCheck(players, eliminatedCardsPool);
      players = mercy.players;
      eliminatedCardsPool = mercy.eliminatedCardsPool;

      let message = `💀 ${player.name} menerima tumpukan penalti +${drawRes.drawn.length} kartu dan dilewati!`;
      if (mercy.newlyEliminated.length > 0) {
        message += ` ☠️ MERCY RULE: ${mercy.newlyEliminated.join(', ')} TERSINGKIR (≥25 kartu)!`;
      }

      let nextState = appendEvent(
        {
          ...state,
          players,
          drawPile,
          discardPile,
          eliminatedCardsPool,
          pendingDrawCount: 0,
          pendingDrawMinValue: undefined,
          unoVulnerablePlayerId: null,
        },
        mercy.newlyEliminated.length > 0 ? 'eliminated' : 'draw',
        message
      );

      nextState = this.checkWinCondition(nextState);
      if (nextState.phase === 'round_over' || nextState.phase === 'game_over') return nextState;
      return this.advanceTurn(nextState, 1);
    }

    // Case 2: Official DRAW UNTIL PLAYABLE!
    const drawnCards: HubCard[] = [];
    let currentHand = [...player.hand];
    let foundPlayable = false;

    for (let guard = 0; guard < 40; guard += 1) {
      const res = drawNoMercyCards(drawPile, discardPile, eliminatedCardsPool, 1);
      drawPile = res.drawPile;
      discardPile = res.discardPile;
      eliminatedCardsPool = res.eliminatedCardsPool;
      if (res.drawn.length === 0) break;

      const card = res.drawn[0];
      drawnCards.push(card);
      currentHand.push(card);

      // Check Mercy Rule immediately on every drawn card!
      if (currentHand.length >= MERCY_LIMIT) {
        break;
      }
      if (standardColorMatchValid(state, card)) {
        foundPlayable = true;
        break;
      }
    }

    let players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex ? { ...p, hand: currentHand, calledUno: false } : p
    );

    const mercy = applyMercyCheck(players, eliminatedCardsPool);
    players = mercy.players;
    eliminatedCardsPool = mercy.eliminatedCardsPool;

    let message = foundPlayable
      ? `🃏 DRAW UNTIL PLAYABLE: ${player.name} menarik ${drawnCards.length} kartu hingga menemukan kartu yang bisa dimainkan!`
      : `🃏 ${player.name} menarik ${drawnCards.length} kartu dari Draw Pile.`;

    if (mercy.newlyEliminated.length > 0) {
      message += ` ☠️ MERCY RULE: ${mercy.newlyEliminated.join(', ')} TERSINGKIR (≥25 kartu)!`;
    }

    let nextState = appendEvent(
      {
        ...state,
        players,
        drawPile,
        discardPile,
        eliminatedCardsPool,
        unoVulnerablePlayerId: null,
      },
      mercy.newlyEliminated.length > 0 ? 'eliminated' : 'draw',
      message
    );

    nextState = this.checkWinCondition(nextState);
    if (nextState.phase === 'round_over' || nextState.phase === 'game_over') return nextState;

    // If player found a playable card and was NOT eliminated, they stay on their turn to play it!
    if (foundPlayable && mercy.newlyEliminated.length === 0) {
      return nextState;
    }

    return this.advanceTurn(nextState, 1);
  },

  resolvePrompt(state, payload) {
    if (!state.pendingPrompt) return state;

    // Official Wild Color Roulette: draw until getting a non-Wild card matching chosen color!
    if (state.pendingPrompt.type === 'roulette_color' && payload.color) {
      const victimIdx = state.players.findIndex((p) => p.id === state.pendingPrompt?.actorId);
      if (victimIdx < 0) return state;
      const victim = state.players[victimIdx];
      let drawPile = [...state.drawPile];
      let discardPile = [...state.discardPile];
      let eliminatedCardsPool = [...(state.eliminatedCardsPool ?? [])];
      const drawnCards: HubCard[] = [];

      const maxDraws = drawPile.length + discardPile.length + eliminatedCardsPool.length + 5;
      for (let guard = 0; guard < maxDraws; guard += 1) {
        const res = drawNoMercyCards(drawPile, discardPile, eliminatedCardsPool, 1);
        drawPile = res.drawPile;
        discardPile = res.discardPile;
        eliminatedCardsPool = res.eliminatedCardsPool;
        if (res.drawn.length === 0) break;
        const c = res.drawn[0];
        drawnCards.push(c);
        // Official rule: Wild cards drawn do NOT count as a color match!
        if (c.color === payload.color && !c.type.startsWith('wild')) break;
      }

      let players = state.players.map((p, idx) =>
        idx === victimIdx ? { ...p, hand: [...p.hand, ...drawnCards], calledUno: false } : p
      );
      const mercy = applyMercyCheck(players, eliminatedCardsPool);
      players = mercy.players;
      eliminatedCardsPool = mercy.eliminatedCardsPool;

      let msg = `🎰 COLOR ROULETTE (${getColorLabel(payload.color)}): ${victim.name} menarik ${drawnCards.length} kartu (Wild diabaikan) & kehilangan giliran!`;
      if (mercy.newlyEliminated.length > 0) {
        msg += ` ☠️ MERCY RULE: ${mercy.newlyEliminated.join(', ')} TERSINGKIR!`;
      }

      let nextState = appendEvent(
        {
          ...state,
          phase: 'playing',
          players,
          drawPile,
          discardPile,
          eliminatedCardsPool,
          activeColor: payload.color,
          pendingPrompt: null,
        },
        'roulette',
        msg
      );
      nextState = this.checkWinCondition(nextState);
      if (nextState.phase === 'round_over' || nextState.phase === 'game_over') return nextState;
      return this.advanceTurn(nextState, 1);
    }

    if (!state.pendingPrompt.cardId) return state;
    return this.executeAction(
      { ...state, phase: 'playing', pendingPrompt: null },
      state.pendingPrompt.actorId,
      {
        cardId: state.pendingPrompt.cardId,
        chosenColor: payload.color,
        targetPlayerId: payload.targetPlayerId,
      }
    );
  },

  decideAIMove(state) {
    return genericAIDecision(this, state);
  },
};
