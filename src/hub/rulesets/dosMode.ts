import {
  appendEvent,
  drawCardsFromDeck,
  getNextPlayerIndex,
  shuffleCards,
  transitionTurnWithPrivacy,
  uid,
} from '../engine/core';
import {
  DosTurnState,
  HubCard,
  HubGameState,
  HubPlayer,
  HubRoundSummary,
  MoveInput,
  UnoRuleset,
  ValidationResult,
  VariantSettings,
} from '../types';
import { STANDARD_COLORS, finalizeStandardRoundWin } from './baseHelpers';

const THREE_COPY_NUMBERS = [1, 3, 4, 5] as const;
const TWO_COPY_NUMBERS = [6, 7, 8, 9, 10] as const;

/**
 * Official 108-Card UNO DOS Deck (2–4 players):
 * - 4 Colors (Red, Blue, Green, Yellow):
 *   - 3 copies of 1, 3, 4, 5 (= 12/color -> 48)
 *   - 2 copies of 6, 7, 8, 9, 10 (= 10/color -> 40)
 *   - 2 copies of Wild # (fixed color, value 1–10) (= 2/color -> 8)
 *   (NO regular number 2 cards!)
 * - 12 Wild DOS cards (value = 2, any color)
 * Total = 48 + 40 + 8 + 12 = 108 cards!
 */
function buildDosDeck(): HubCard[] {
  const cards: HubCard[] = [];
  for (const color of STANDARD_COLORS) {
    for (const v of THREE_COPY_NUMBERS) {
      for (let i = 0; i < 3; i += 1) {
        cards.push({ id: uid('dos'), color, type: 'number', value: v });
      }
    }
    for (const v of TWO_COPY_NUMBERS) {
      for (let i = 0; i < 2; i += 1) {
        cards.push({ id: uid('dos'), color, type: 'number', value: v });
      }
    }
    for (let i = 0; i < 2; i += 1) {
      cards.push({ id: uid('dos'), color, type: 'wild_number' });
    }
  }
  for (let i = 0; i < 12; i += 1) {
    cards.push({ id: uid('dos'), color: 'wild', type: 'wild_dos', value: 2 });
  }
  return cards;
}

/**
 * Official UNO DOS Scoring (Target 200 Points):
 * - Number cards (1, 3–10) = face value
 * - Wild DOS (2) = 20 pts
 * - Wild # = 40 pts
 */
export function calculateDosHandPoints(hand: HubCard[]): number {
  return hand.reduce((sum, card) => {
    if (card.type === 'wild_number') return sum + 40;
    if (card.type === 'wild_dos') return sum + 20;
    return sum + (card.value ?? 0);
  }, 0);
}

function getEffectiveTargetValues(centerCard: HubCard): number[] {
  if (centerCard.type === 'wild_number') return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  if (centerCard.type === 'wild_dos') return [2];
  return centerCard.value !== undefined ? [centerCard.value] : [];
}

function cardCanMatchNumber(card: HubCard, targetValue: number): boolean {
  if (card.type === 'wild_number') return targetValue >= 1 && targetValue <= 10;
  if (card.type === 'wild_dos') return targetValue === 2;
  return card.value === targetValue;
}

function twoCardsCanSumTo(c1: HubCard, c2: HubCard, targetValue: number): boolean {
  if (c1.type === 'wild_number' && c2.type === 'wild_number') {
    return targetValue >= 2 && targetValue <= 20;
  }
  if (c1.type === 'wild_number') {
    const v2 = c2.type === 'wild_dos' ? 2 : (c2.value ?? 0);
    const needed = targetValue - v2;
    return needed >= 1 && needed <= 10;
  }
  if (c2.type === 'wild_number') {
    const v1 = c1.type === 'wild_dos' ? 2 : (c1.value ?? 0);
    const needed = targetValue - v1;
    return needed >= 1 && needed <= 10;
  }
  const v1 = c1.type === 'wild_dos' ? 2 : (c1.value ?? 0);
  const v2 = c2.type === 'wild_dos' ? 2 : (c2.value ?? 0);
  return v1 + v2 === targetValue;
}

function cardMatchesCenterCard(c1: HubCard, c2: HubCard | undefined, centerCard: HubCard): boolean {
  const targets = getEffectiveTargetValues(centerCard);
  return targets.some((t) => (c2 ? twoCardsCanSumTo(c1, c2, t) : cardCanMatchNumber(c1, t)));
}

function cardMatchesColor(card: HubCard, centerCard: HubCard): boolean {
  return (
    card.type === 'wild_dos' ||
    card.color === 'wild' ||
    centerCard.type === 'wild_dos' ||
    centerCard.color === 'wild' ||
    card.color === centerCard.color
  );
}

function createEmptyDosTurn(): DosTurnState {
  return {
    matchedPileIndices: [],
    matchedHandCards: [],
    pendingBonusDiscards: 0,
    pendingOpponentDraws: 0,
    mustDiscardToCenterIfNoMatch: false,
    stage: 'matching',
  };
}

function createDosState(
  deck: HubCard[],
  players: HubPlayer[],
  mode: 'local' | 'ai' | 'online',
  settings: VariantSettings,
  roundNumber: number,
  roundHistory: HubRoundSummary[]
): HubGameState {
  const drawPile = [...deck];
  const p1 = drawPile.pop()!;
  const p2 = drawPile.pop()!;

  return appendEvent(
    {
      version: 1,
      variantId: 'dos-mode',
      mode,
      phase: 'playing',
      roundNumber,
      players,
      currentPlayerIndex: 0,
      direction: 1,
      drawPile,
      discardPile: [],
      dosCenterPiles: [[p1], [p2]],
      dosTurnState: null,
      activeColor: p1.color,
      pendingDrawCount: 0,
      unoVulnerablePlayerId: null,
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
    `✌️ Ronde ${roundNumber} UNO DOS (108 kartu) dimulai! Cocokkan 1 atau 2 kartu ke Center Row. Jangan lupa teriak DOS! saat sisa 2 kartu!`
  );
}

/**
 * STRICT OFFICIAL END-OF-TURN SEQUENCE:
 * 1) Move all matched Center Row cards + matchedHandCards to Discard Pile.
 * 2) Refill Center Row from Draw Pile until at least 2 piles exist (refilled cards CANNOT be matched this turn!).
 * 3) Apply any Double Color Match opponent +1 draws.
 * 4) If player has bonus discards (or forced discard after draw-without-match), enter 'discard_to_center'
 *    so the player places those cards into Center Row LAST (AFTER refill!).
 */
export function finishDosMatching(state: HubGameState, playerId: string): HubGameState {
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId || state.phase !== 'playing') return state;

  const turn = state.dosTurnState ?? createEmptyDosTurn();
  const piles = state.dosCenterPiles ?? [];
  const matchedSet = new Set(turn.matchedPileIndices);

  // 1) Move matched Center Row cards + matched hand cards to Discard Pile
  const discardedCenterCards: HubCard[] = [];
  const remainingPiles: HubCard[][] = [];
  piles.forEach((pile, idx) => {
    if (matchedSet.has(idx)) {
      discardedCenterCards.push(...pile);
    } else {
      remainingPiles.push(pile);
    }
  });

  let drawPile = [...state.drawPile];
  let discardPile = [...state.discardPile, ...discardedCenterCards, ...turn.matchedHandCards];

  // 2) Refill Center Row to AT LEAST 2 piles BEFORE placing any bonus/forced discards!
  while (remainingPiles.length < 2) {
    const res = drawCardsFromDeck(drawPile, discardPile, 1);
    drawPile = res.drawPile;
    discardPile = res.discardPile;
    if (res.drawn.length === 0) break;
    remainingPiles.push([res.drawn[0]]);
  }

  // 3) Apply Double Color Match opponent draws
  let players = [...state.players];
  let oppNote = '';
  if (turn.pendingOpponentDraws > 0) {
    players = players.map((p) => {
      if (p.id === current.id || p.eliminated) return p;
      const res = drawCardsFromDeck(drawPile, discardPile, turn.pendingOpponentDraws);
      drawPile = res.drawPile;
      discardPile = res.discardPile;
      return { ...p, hand: [...p.hand, ...res.drawn], calledUno: false };
    });
    oppNote = ` 💥 DOUBLE COLOR MATCH: Semua lawan ambil +${turn.pendingOpponentDraws} kartu!`;
  }

  const currUpdated = players[state.currentPlayerIndex];

  // Check immediate win before bonus discards!
  if (currUpdated.hand.length === 0) {
    const wonState = appendEvent(
      {
        ...state,
        players,
        drawPile,
        discardPile,
        dosCenterPiles: remainingPiles,
        dosTurnState: null,
        hasDrawnThisTurn: false,
      },
      'dos_match',
      `✌️ ${current.name} menghabiskan semua kartunya!${oppNote}`
    );
    return dosModeRuleset.checkWinCondition(wonState);
  }

  // 4) Determine how many cards must be placed into Center Row AFTER refill
  const totalDiscardsNeeded =
    turn.matchedPileIndices.length === 0 && turn.mustDiscardToCenterIfNoMatch
      ? 1
      : turn.pendingBonusDiscards;

  const clampedDiscards = Math.min(totalDiscardsNeeded, currUpdated.hand.length);

  if (clampedDiscards > 0) {
    // If AI, immediately place highest-point cards into Center Row AFTER refill!
    if (currUpdated.isAI) {
      const sortedHand = [...currUpdated.hand].sort(
        (a, b) => calculateDosHandPoints([b]) - calculateDosHandPoints([a])
      );
      const toCenter = sortedHand.slice(0, clampedDiscards);
      const toCenterIds = new Set(toCenter.map((c) => c.id));
      const finalHand = currUpdated.hand.filter((c) => !toCenterIds.has(c.id));
      toCenter.forEach((c) => remainingPiles.push([c]));

      players = players.map((p, i) =>
        i === state.currentPlayerIndex
          ? { ...p, hand: finalHand, calledUno: finalHand.length === 2 ? p.calledUno : false }
          : p
      );
      const dosVuln = finalHand.length === 2 && !currUpdated.calledUno ? currUpdated.id : null;
      let next = appendEvent(
        {
          ...state,
          players,
          drawPile,
          discardPile,
          dosCenterPiles: remainingPiles,
          dosTurnState: null,
          hasDrawnThisTurn: false,
          unoVulnerablePlayerId: dosVuln,
        },
        'dos_match',
        `✌️ ${current.name} menyelesaikan giliran & meletakkan ${clampedDiscards} kartu ke Center Row (${remainingPiles.length} tumpukan).${oppNote}`
      );
      next = dosModeRuleset.checkWinCondition(next);
      if (next.phase === 'round_over' || next.phase === 'game_over') return next;
      return dosModeRuleset.advanceTurn(next, 1);
    }

    // Human player: enter 'discard_to_center' stage so they pick which card(s) to place into Center Row!
    return appendEvent(
      {
        ...state,
        players,
        drawPile,
        discardPile,
        dosCenterPiles: remainingPiles,
        dosTurnState: {
          ...turn,
          matchedPileIndices: [],
          matchedHandCards: [],
          pendingBonusDiscards: clampedDiscards,
          pendingOpponentDraws: 0,
          stage: 'discard_to_center',
        },
      },
      'dos_bonus',
      `🌈 Center Row sudah di-refill! Pilih ${clampedDiscards} kartu dari tanganmu untuk diletakkan ke Center Row!${oppNote}`
    );
  }

  // No discards needed -> check DOS! vulnerability and advance turn!
  const dosVuln = currUpdated.hand.length === 2 && !currUpdated.calledUno ? currUpdated.id : null;
  const next = appendEvent(
    {
      ...state,
      players,
      drawPile,
      discardPile,
      dosCenterPiles: remainingPiles,
      dosTurnState: null,
      hasDrawnThisTurn: false,
      unoVulnerablePlayerId: dosVuln,
    },
    'dos_match',
    `✌️ ${current.name} menyelesaikan giliran DOS!${oppNote}`
  );
  return dosModeRuleset.advanceTurn(next, 1);
}

/** Place 1 chosen card from hand into Center Row during 'discard_to_center' stage (AFTER refill!) */
export function placeDosCenterDiscard(
  state: HubGameState,
  playerId: string,
  cardId: string
): HubGameState {
  const current = state.players[state.currentPlayerIndex];
  const turn = state.dosTurnState;
  if (!current || current.id !== playerId || !turn || turn.stage !== 'discard_to_center') return state;

  const card = current.hand.find((c) => c.id === cardId);
  if (!card) return state;

  const remainingHand = current.hand.filter((c) => c.id !== card.id);
  const nextPiles = [...(state.dosCenterPiles ?? []), [card]];
  const remainingDiscards = Math.max(0, turn.pendingBonusDiscards - 1);

  const players = state.players.map((p, i) =>
    i === state.currentPlayerIndex
      ? { ...p, hand: remainingHand, calledUno: remainingHand.length === 2 ? p.calledUno : false }
      : p
  );

  // Instant win if last card placed!
  if (remainingHand.length === 0) {
    const won = appendEvent(
      {
        ...state,
        players,
        dosCenterPiles: nextPiles,
        dosTurnState: null,
        hasDrawnThisTurn: false,
      },
      'dos_match',
      `✌️ ${current.name} meletakkan kartu terakhir ke Center Row dan MENANG!`
    );
    return dosModeRuleset.checkWinCondition(won);
  }

  if (remainingDiscards > 0) {
    return appendEvent(
      {
        ...state,
        players,
        dosCenterPiles: nextPiles,
        dosTurnState: { ...turn, pendingBonusDiscards: remainingDiscards },
      },
      'dos_bonus',
      `➕ ${current.name} meletakkan 1 kartu ke Center Row! Pilih ${remainingDiscards} kartu bonus lagi.`
    );
  }

  const dosVuln = remainingHand.length === 2 && !current.calledUno ? current.id : null;
  const done = appendEvent(
    {
      ...state,
      players,
      dosCenterPiles: nextPiles,
      dosTurnState: null,
      hasDrawnThisTurn: false,
      unoVulnerablePlayerId: dosVuln,
    },
    'dos_match',
    `✌️ ${current.name} meletakkan kartu ke Center Row (total ${nextPiles.length} tumpukan) & mengakhiri giliran.`
  );
  return dosModeRuleset.advanceTurn(done, 1);
}

export const dosModeRuleset: UnoRuleset = {
  id: 'dos-mode',

  createDeck() {
    return buildDosDeck();
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
    const clamped = playerInits.slice(0, 4); // 2–4 players
    const initialPlayers: HubPlayer[] = clamped.map((p) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      hand: [],
      score: 0,
      calledUno: false,
    }));
    const { players, remainingDeck } = this.dealCards(deck, initialPlayers, settings);
    return createDosState(remainingDeck, players, mode, settings, 1, []);
  },

  validateMove(state: HubGameState, playerId: string, move: MoveInput): ValidationResult {
    if (state.phase !== 'playing') return { valid: false, reason: 'Permainan tidak aktif.' };
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.id !== playerId) return { valid: false, reason: 'Bukan giliranmu.' };

    const c1 = current.hand.find((c) => c.id === move.cardId);
    if (!c1) return { valid: false, reason: 'Kartu tidak ditemukan.' };

    // During 'discard_to_center' stage, ANY single card from hand is valid to place into Center Row!
    if (state.dosTurnState?.stage === 'discard_to_center') {
      return { valid: true };
    }

    const piles = state.dosCenterPiles;
    if (!piles) return { valid: false, reason: 'Center Row DOS tidak tersedia.' };

    const alreadyMatched = new Set(state.dosTurnState?.matchedPileIndices ?? []);
    const targetIndices =
      move.pileIndex !== undefined
        ? [move.pileIndex]
        : piles.map((_, idx) => idx).filter((idx) => !alreadyMatched.has(idx));

    if (move.pileIndex !== undefined && alreadyMatched.has(move.pileIndex)) {
      return { valid: false, reason: 'Kartu Center Row ini sudah dicocokkan di giliran ini!' };
    }

    const c2 = move.secondCardId
      ? current.hand.find((c) => c.id === move.secondCardId && c.id !== c1.id)
      : undefined;
    if (move.secondCardId && !c2) {
      return { valid: false, reason: 'Kartu kedua tidak ditemukan.' };
    }

    const ok = targetIndices.some((pi) => {
      const top = piles[pi]?.[piles[pi].length - 1];
      return top && cardMatchesCenterCard(c1, c2, top);
    });
    if (!ok) {
      return {
        valid: false,
        reason: c2
          ? 'Penjumlahan 2 kartu tidak cocok dengan angka target Center Row!'
          : 'Angka tidak cocok! Pilih 2 kartu yang jumlahnya sama dengan angka target!',
      };
    }
    return { valid: true };
  },

  executeAction(state: HubGameState, playerId: string, move: MoveInput): HubGameState {
    const val = this.validateMove(state, playerId, move);
    if (!val.valid) return state;

    // Handle 'discard_to_center' stage (placing bonus/forced card AFTER refill!)
    if (state.dosTurnState?.stage === 'discard_to_center') {
      return placeDosCenterDiscard(state, playerId, move.cardId);
    }

    const current = state.players[state.currentPlayerIndex];
    const piles = state.dosCenterPiles ?? [];
    const turn = state.dosTurnState ?? createEmptyDosTurn();
    const alreadyMatched = new Set(turn.matchedPileIndices);

    const c1 = current.hand.find((c) => c.id === move.cardId)!;
    const c2 = move.secondCardId
      ? current.hand.find((c) => c.id === move.secondCardId && c.id !== c1.id)
      : undefined;

    const pileIdx =
      move.pileIndex !== undefined
        ? move.pileIndex
        : piles.findIndex((p, idx) => {
            if (alreadyMatched.has(idx)) return false;
            const top = p[p.length - 1];
            return top && cardMatchesCenterCard(c1, c2, top);
          });
    if (pileIdx < 0) return state;

    const top = piles[pileIdx][piles[pileIdx].length - 1];
    const usedIds = new Set([c1.id, ...(c2 ? [c2.id] : [])]);
    const remainingHand = current.hand.filter((c) => !usedIds.has(c.id));

    const isSingleColorMatch = !c2 && cardMatchesColor(c1, top);
    const isDoubleColorMatch = Boolean(c2 && cardMatchesColor(c1, top) && cardMatchesColor(c2, top));

    const updatedTurn: DosTurnState = {
      ...turn,
      matchedPileIndices: [...turn.matchedPileIndices, pileIdx],
      matchedHandCards: [...turn.matchedHandCards, c1, ...(c2 ? [c2] : [])],
      pendingBonusDiscards:
        turn.pendingBonusDiscards + (isSingleColorMatch || isDoubleColorMatch ? 1 : 0),
      pendingOpponentDraws: turn.pendingOpponentDraws + (isDoubleColorMatch ? 1 : 0),
      mustDiscardToCenterIfNoMatch: false,
      stage: 'matching',
    };

    const players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex
        ? { ...p, hand: remainingHand, calledUno: remainingHand.length === 2 ? p.calledUno : false }
        : p
    );

    const matchLabel = isDoubleColorMatch
      ? '🌈 DOUBLE COLOR MATCH (+1 buang Center Row & semua lawan +1!)'
      : isSingleColorMatch
      ? '🎨 SINGLE COLOR MATCH (+1 buang Center Row!)'
      : c2
      ? '✌️ DOUBLE MATCH'
      : '✌️ SINGLE MATCH';

    const staged = appendEvent(
      {
        ...state,
        players,
        dosTurnState: updatedTurn,
        unoVulnerablePlayerId:
          remainingHand.length === 2 && !current.calledUno ? current.id : null,
      },
      'dos_match',
      `${current.name}: ${matchLabel} di Pile #${pileIdx + 1}!`
    );

    // Check if any OTHER unmatched Center Row piles remain AND player still has cards
    const unmatchedRemaining = piles.filter((_, idx) => !updatedTurn.matchedPileIndices.includes(idx));
    if (remainingHand.length === 0 || unmatchedRemaining.length === 0 || current.isAI) {
      return finishDosMatching(staged, playerId);
    }

    return staged;
  },

  advanceTurn(state, steps = 1) {
    const nextIdx = getNextPlayerIndex(state.players, state.currentPlayerIndex, state.direction, steps);
    return transitionTurnWithPrivacy(
      { ...state, dosTurnState: null, hasDrawnThisTurn: false },
      nextIdx
    );
  },

  calculateScore(state, winnerId) {
    return state.players
      .filter((p) => p.id !== winnerId)
      .reduce((sum, p) => sum + calculateDosHandPoints(p.hand), 0);
  },

  checkWinCondition(state) {
    const winner = state.players.find((p) => p.hand.length === 0);
    if (!winner) return state;
    const pts = this.calculateScore(state, winner.id);
    return finalizeStandardRoundWin(
      { ...state, settings: { ...state.settings, targetScore: state.settings.targetScore || 200 } },
      winner.id,
      pts,
      `Juara Ronde DOS (+${pts} poin, target 200)!`
    );
  },

  resetRound(state) {
    const deck = this.shuffleDeck(this.createDeck(state.settings));
    const resetPlayers = state.players.map((p) => ({ ...p, hand: [], calledUno: false }));
    const { players, remainingDeck } = this.dealCards(deck, resetPlayers, state.settings);
    return createDosState(
      remainingDeck,
      players,
      state.mode,
      state.settings,
      state.roundNumber + 1,
      state.roundHistory
    );
  },

  handleDrawOrPass(state, playerId) {
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.id !== playerId || state.phase !== 'playing') return state;

    const turn = state.dosTurnState;
    // If player already matched >= 1 pile, clicking end/pass finalizes the turn!
    if (turn && turn.matchedPileIndices.length > 0) {
      return finishDosMatching(state, playerId);
    }

    // If player already drew 1 card this turn and still cannot match -> MUST discard 1 card to Center Row!
    if (turn?.mustDiscardToCenterIfNoMatch) {
      return finishDosMatching(state, playerId);
    }

    // Draw 1 card from Draw Pile
    const res = drawCardsFromDeck(state.drawPile, state.discardPile, 1);
    const drawn = res.drawn[0];
    const newHand = [...current.hand, ...res.drawn];
    const players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex ? { ...p, hand: newHand, calledUno: false } : p
    );

    const nextTurn: DosTurnState = {
      ...createEmptyDosTurn(),
      mustDiscardToCenterIfNoMatch: true,
    };

    const withDraw = appendEvent(
      {
        ...state,
        players,
        drawPile: res.drawPile,
        discardPile: res.discardPile,
        dosTurnState: nextTurn,
        hasDrawnThisTurn: true,
      },
      'draw',
      `✌️ ${current.name} mengambil 1 kartu dari Draw Pile. Cocokkan sekarang atau buang 1 kartu ke Center Row!`
    );

    // Check if newly drawn card (alone or paired) can match any Center Row pile
    const piles = state.dosCenterPiles ?? [];
    const canMatchNow = Boolean(
      drawn &&
        piles.some((p) => {
          const top = p[p.length - 1];
          if (!top) return false;
          if (cardMatchesCenterCard(drawn, undefined, top)) return true;
          return newHand.some((other) => other.id !== drawn.id && cardMatchesCenterCard(drawn, other, top));
        })
    );

    if (canMatchNow && !current.isAI) {
      return withDraw; // Human can play the drawn card immediately!
    }

    // Cannot match (or AI) -> finalize -> forces 1 card discard to Center Row!
    return finishDosMatching(withDraw, playerId);
  },

  resolvePrompt(state) {
    return state;
  },

  /**
   * Strategic DOS AI:
   * Prioritizes Double Color Match > Single Color Match > Double Match > Single Match!
   */
  decideAIMove(state) {
    const curr = state.players[state.currentPlayerIndex];
    const piles = state.dosCenterPiles ?? [];
    const alreadyMatched = new Set(state.dosTurnState?.matchedPileIndices ?? []);

    if (state.dosTurnState?.stage === 'discard_to_center') {
      const worst = [...curr.hand].sort(
        (a, b) => calculateDosHandPoints([b]) - calculateDosHandPoints([a])
      )[0];
      return { type: 'play' as const, move: { cardId: worst.id } };
    }

    let bestMove: { cardId: string; secondCardId?: string; pileIndex: number; score: number } | null =
      null;

    for (let pi = 0; pi < piles.length; pi += 1) {
      if (alreadyMatched.has(pi)) continue;
      const top = piles[pi]?.[piles[pi].length - 1];
      if (!top) continue;

      // Single matches
      for (const c1 of curr.hand) {
        if (cardMatchesCenterCard(c1, undefined, top)) {
          const colorMatch = cardMatchesColor(c1, top);
          const score = (colorMatch ? 60 : 20) + calculateDosHandPoints([c1]);
          if (!bestMove || score > bestMove.score) {
            bestMove = { cardId: c1.id, pileIndex: pi, score };
          }
        }
      }

      // Double matches
      for (let i = 0; i < curr.hand.length; i += 1) {
        for (let j = i + 1; j < curr.hand.length; j += 1) {
          const c1 = curr.hand[i];
          const c2 = curr.hand[j];
          if (cardMatchesCenterCard(c1, c2, top)) {
            const doubleColor = cardMatchesColor(c1, top) && cardMatchesColor(c2, top);
            const score = (doubleColor ? 100 : 40) + calculateDosHandPoints([c1, c2]);
            if (!bestMove || score > bestMove.score) {
              bestMove = { cardId: c1.id, secondCardId: c2.id, pileIndex: pi, score };
            }
          }
        }
      }
    }

    if (bestMove) {
      return {
        type: 'play' as const,
        move: {
          cardId: bestMove.cardId,
          secondCardId: bestMove.secondCardId,
          pileIndex: bestMove.pileIndex,
        },
      };
    }

    return { type: 'draw' as const };
  },
};
