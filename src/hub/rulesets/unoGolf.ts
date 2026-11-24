import {
  appendEvent,
  drawCardsFromDeck,
  getColorLabel,
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
import { STANDARD_COLORS } from './baseHelpers';

export const GOLF_TOTAL_ROUNDS = 9;

export interface GolfSlot {
  card: HubCard;
  faceUp: boolean;
}

/**
 * Official 112-card UNO Golf Deck (for 2–8 players):
 * - 80 Number cards (0–9 × 2 copies × 4 colors)
 * -  8 Reverse (2/color)
 * -  8 Skip (2/color)
 * -  8 Draw 2 (2/color)
 * -  8 Double Draw 2 (2/color)
 * Total = 80 + 32 = 112 cards!
 */
function buildGolfDeck(): HubCard[] {
  const cards: HubCard[] = [];
  for (const color of STANDARD_COLORS) {
    for (let v = 0; v <= 9; v += 1) {
      cards.push({ id: uid('glf'), color, type: 'number', value: v });
      cards.push({ id: uid('glf'), color, type: 'number', value: v });
    }
    for (let i = 0; i < 2; i += 1) {
      cards.push({ id: uid('glf'), color, type: 'reverse' });
      cards.push({ id: uid('glf'), color, type: 'skip' });
      cards.push({ id: uid('glf'), color, type: 'draw2' });
      cards.push({ id: uid('glf'), color, type: 'double_draw2' });
    }
  }
  return cards;
}

export function isGolfActionCard(card: HubCard): boolean {
  return card.type !== 'number';
}

/**
 * UNO Golf Card Point Values (Action Cards carry higher penalty than 0–9 number cards):
 * - 0–9 = face value (0–9 pts)
 * - Reverse = 10 pts
 * - Skip = 10 pts
 * - Draw 2 = 12 pts
 * - Double Draw 2 / Wild = 15 pts
 */
export function getGolfCardPoints(card: HubCard): number {
  if (card.type === 'number') return card.value ?? 0;
  if (card.type === 'reverse') return 10;
  if (card.type === 'skip') return 10;
  if (card.type === 'draw2') return 12;
  return 15; // double_draw2 / wild
}

/**
 * Official Column Matching Rule:
 * In any 2-card vertical column (slots[col*2], slots[col*2+1]),
 * if BOTH cards are face-up AND share the SAME COLOR OR SAME NUMBER/VALUE,
 * the column matches and both cards are cleared from the grid (0 pts)!
 */
export function golfColumnMatches(top: GolfSlot, bottom: GolfSlot): boolean {
  if (!top.faceUp || !bottom.faceUp) return false;
  const sameColor =
    top.card.color !== 'wild' &&
    bottom.card.color !== 'wild' &&
    top.card.color === bottom.card.color;
  const sameValue =
    top.card.type === bottom.card.type &&
    (top.card.type !== 'number' || top.card.value === bottom.card.value);
  return sameColor || sameValue;
}

/**
 * Removes all matching face-up columns from a dynamic column-major grid.
 */
export function clearMatchingGolfColumns(slots: GolfSlot[]): {
  remaining: GolfSlot[];
  clearedCount: number;
  clearedCards: HubCard[];
} {
  const remaining: GolfSlot[] = [];
  const clearedCards: HubCard[] = [];
  let clearedCount = 0;

  for (let i = 0; i < slots.length; i += 2) {
    const top = slots[i];
    const bottom = slots[i + 1];
    if (top && bottom && golfColumnMatches(top, bottom)) {
      clearedCount += 1;
      clearedCards.push(top.card, bottom.card);
    } else {
      if (top) remaining.push(top);
      if (bottom) remaining.push(bottom);
    }
  }

  return { remaining, clearedCount, clearedCards };
}

/**
 * Dynamically appends face-down penalty cards to a player's grid (forming new columns when 2x3 is full).
 */
export function appendFaceDownToGolfGrid(slots: GolfSlot[], cards: HubCard[]): GolfSlot[] {
  return [...slots, ...cards.map((card) => ({ card, faceUp: false }))];
}

/**
 * Calculates total score of a dynamic column-major UNO Golf grid.
 * Matching face-up columns count as 0 points!
 */
export function calculateGolfGridScore(
  slots: GolfSlot[] = [],
  includeFaceDown = true
): number {
  let total = 0;
  for (let i = 0; i < slots.length; i += 2) {
    const top = slots[i];
    const bottom = slots[i + 1];
    if (top && bottom && golfColumnMatches(top, bottom)) {
      continue; // Cleared column -> 0 pts!
    }
    if (top && (includeFaceDown || top.faceUp)) total += getGolfCardPoints(top.card);
    if (bottom && (includeFaceDown || bottom.faceUp)) total += getGolfCardPoints(bottom.card);
  }
  return total;
}

export function countFaceDownGolfCards(slots: GolfSlot[] = []): number {
  return slots.filter((s) => !s.faceUp).length;
}

/**
 * Setup initial UNO Golf round state:
 * - 6 face-down cards in 2x3 grid, 1 random card flipped face-up per player.
 * - Starts left of dealer (index 1), clockwise.
 */
function createGolfRoundState(
  deck: HubCard[],
  players: HubPlayer[],
  mode: 'local' | 'ai' | 'online',
  settings: VariantSettings,
  roundNumber: number,
  roundHistory: HubRoundSummary[]
): HubGameState {
  const drawPile = [...deck];
  const firstDiscard = drawPile.pop();
  const starterIdx = players.length > 1 ? 1 % players.length : 0;

  return appendEvent(
    {
      version: 1,
      variantId: 'uno-golf',
      mode,
      phase: 'playing',
      roundNumber,
      players,
      currentPlayerIndex: starterIdx,
      direction: 1,
      drawPile,
      discardPile: firstDiscard ? [firstDiscard] : [],
      activeColor: firstDiscard?.color ?? 'red',
      pendingDrawCount: 0,
      golfDrawnCard: null,
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
    `⛳ Ronde ${roundNumber}/${settings.singleRound ? 1 : GOLF_TOTAL_ROUNDS} UNO Golf dimulai! Setiap pemain membuka 1 kartu acak. Giliran ${players[starterIdx]?.name}.`
  );
}

/**
 * Executes Action Card effects whenever an Action Card lands on Discard Pile
 * (either discarded directly from Draw Pile OR revealed when swapped out of the grid).
 */
function applyGolfDiscardedAction(
  state: HubGameState,
  actorId: string,
  discardedCard: HubCard,
  baseMessage: string,
  columnCleared: boolean
): HubGameState {
  const actorIdx = state.players.findIndex((p) => p.id === actorId);
  const actor = state.players[actorIdx];
  if (!actor) return state;

  // Check if round already ended before applying action (if actor just revealed their last card!)
  const checkedFirst = unoGolfRuleset.checkWinCondition(state);
  if (checkedFirst.phase === 'round_over' || checkedFirst.phase === 'game_over') {
    return checkedFirst;
  }

  let direction = state.direction;
  let steps = 1;
  let players = [...state.players];
  let drawPile = [...state.drawPile];
  let discardPile = [...state.discardPile];
  let msg = baseMessage;

  if (discardedCard.type === 'reverse') {
    direction = (direction * -1) as 1 | -1;
    msg += ` 🔄 REVERSE! Arah giliran dibalik (${direction === 1 ? '↻ Searah' : '↺ Berlawanan'})!`;
  } else if (discardedCard.type === 'skip') {
    const skippedIdx = getNextPlayerIndex(players, actorIdx, direction, 1);
    steps = 2;
    msg += ` 🚫 SKIP! ${players[skippedIdx]?.name} dilewati!`;
  } else if (discardedCard.type === 'draw2') {
    const victimIdx = getNextPlayerIndex(players, actorIdx, direction, 1);
    const victim = players[victimIdx];
    const res = drawCardsFromDeck(drawPile, discardPile, 2);
    drawPile = res.drawPile;
    discardPile = res.discardPile;
    const expandedSlots = appendFaceDownToGolfGrid(victim.golfSlots ?? [], res.drawn);
    players = players.map((p, idx) =>
      idx === victimIdx
        ? {
            ...p,
            golfSlots: expandedSlots,
            hand: expandedSlots.map((s) => s.card),
            calledUno: false,
          }
        : p
    );
    steps = 2; // Victim loses turn!
    msg += ` 💥 DRAW 2! ${victim.name} mendapat +2 kartu tertutup (kolom baru) & kehilangan giliran!`;
  } else if (discardedCard.type === 'double_draw2') {
    // Pause for actor to choose: (a) 2 players get +2 each, OR (b) 1 player gets +4! Nobody loses turn!
    return appendEvent(
      {
        ...state,
        phase: 'golf_double_draw2',
        players,
        direction,
        drawPile,
        discardPile,
        pendingPrompt: {
          type: 'golf_double_draw2',
          actorId,
          cardId: discardedCard.id,
          message: `💥 DOUBLE DRAW 2! ${actor.name}: Pilih 1 pemain (+4 kartu tertutup) ATAU 2 pemain (masing-masing +2 kartu tertutup)!`,
        },
      },
      'double_draw2',
      `${msg} 💥 DOUBLE DRAW 2 aktif! Menunggu pilihan target ${actor.name}...`
    );
  }

  let next = appendEvent(
    {
      ...state,
      players,
      direction,
      drawPile,
      discardPile,
    },
    columnCleared ? 'column_match' : discardedCard.type === 'number' ? 'swap' : discardedCard.type,
    msg
  );

  next = unoGolfRuleset.checkWinCondition(next);
  if (next.phase === 'round_over' || next.phase === 'game_over') return next;
  return unoGolfRuleset.advanceTurn(next, steps);
}

/** Step 1 Option A: Take top card from Discard Pile (Action Cards FORBIDDEN!) */
export function golfTakeDiscard(state: HubGameState, playerId: string): HubGameState {
  if (state.phase !== 'playing' || state.golfDrawnCard) return state;
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId) return state;

  const top = state.discardPile[state.discardPile.length - 1];
  if (!top) return state;

  if (isGolfActionCard(top)) {
    return appendEvent(
      state,
      'uno_penalty',
      `❌ DILARANG! Tidak boleh mengambil Action Card (${top.type.toUpperCase()}) dari Discard Pile!`
    );
  }

  return appendEvent(
    {
      ...state,
      discardPile: state.discardPile.slice(0, -1),
      golfDrawnCard: { card: top, source: 'discard' },
      hasDrawnThisTurn: true,
    },
    'draw',
    `⛳ ${current.name} mengambil ${getColorLabel(top.color)} ${top.value} dari Discard Pile. WAJIB tukar dengan kartu TERTUTUP di grid!`
  );
}

/** Step 1 Option B: Take top card from Draw Pile */
export function golfTakeDraw(state: HubGameState, playerId: string): HubGameState {
  if (state.phase !== 'playing' || state.golfDrawnCard) return state;
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId) return state;

  const res = drawCardsFromDeck(state.drawPile, state.discardPile, 1);
  const drawn = res.drawn[0];
  if (!drawn) return state;

  return appendEvent(
    {
      ...state,
      drawPile: res.drawPile,
      discardPile: res.discardPile,
      golfDrawnCard: { card: drawn, source: 'draw' },
      hasDrawnThisTurn: true,
    },
    'draw',
    `⛳ ${current.name} mengambil kartu dari Draw Pile. Tukar ke grid (terbuka/tertutup) ATAU buang langsung ke Discard Pile!`
  );
}

/** Step 2 Alternative (Draw Pile ONLY): Discard the drawn card directly to Discard Pile */
export function golfDiscardDrawn(state: HubGameState, playerId: string): HubGameState {
  if (state.phase !== 'playing' || !state.golfDrawnCard) return state;
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId) return state;

  if (state.golfDrawnCard.source !== 'draw') {
    return appendEvent(
      state,
      'uno_penalty',
      `❌ Kartu dari Discard Pile tidak bisa dibuang kembali! Wajib ditukar dengan kartu tertutup di grid.`
    );
  }

  const discarded = state.golfDrawnCard.card;
  const nextState: HubGameState = {
    ...state,
    discardPile: [...state.discardPile, discarded],
    activeColor: discarded.color,
    golfDrawnCard: null,
    hasDrawnThisTurn: false,
  };

  const label =
    discarded.type === 'number'
      ? `${getColorLabel(discarded.color)} ${discarded.value}`
      : discarded.type.toUpperCase();
  return applyGolfDiscardedAction(
    nextState,
    playerId,
    discarded,
    `⛳ ${current.name} membuang ${label} langsung ke Discard Pile.`,
    false
  );
}

/** Official UNO Golf UNO! Penalty: Caught forgetting UNO at 1 face-down card -> +2 face-down cards to grid! */
export function catchGolfUno(state: HubGameState, catcherName: string): HubGameState {
  if (!state.unoVulnerablePlayerId) return state;
  const victimIdx = state.players.findIndex((p) => p.id === state.unoVulnerablePlayerId);
  if (victimIdx < 0) return state;

  const victim = state.players[victimIdx];
  const res = drawCardsFromDeck(state.drawPile, state.discardPile, 2);
  const expandedSlots = appendFaceDownToGolfGrid(victim.golfSlots ?? [], res.drawn);

  const players = state.players.map((p, idx) =>
    idx === victimIdx
      ? {
          ...p,
          golfSlots: expandedSlots,
          hand: expandedSlots.map((s) => s.card),
          calledUno: false,
        }
      : p
  );

  return appendEvent(
    {
      ...state,
      players,
      drawPile: res.drawPile,
      discardPile: res.discardPile,
      unoVulnerablePlayerId: null,
    },
    'uno_penalty',
    `🚨 PENALTI UNO GOLF! ${catcherName} menangkap ${victim.name} lupa teriak UNO! → +2 kartu tertutup ke grid!`
  );
}

export const unoGolfRuleset: UnoRuleset = {
  id: 'uno-golf',

  createDeck() {
    return buildGolfDeck();
  },

  shuffleDeck(deck) {
    return shuffleCards(deck);
  },

  dealCards(deck, players) {
    const remaining = [...deck];
    const dealt = players.map((p) => {
      const six = remaining.splice(0, 6);
      // Official rule: 6 face-down cards in 2x3 grid, then flip EXACTLY 1 random card face-up!
      const randomRevealIdx = Math.floor(Math.random() * 6);
      const golfSlots: GolfSlot[] = six.map((card, i) => ({
        card,
        faceUp: i === randomRevealIdx,
      }));
      return {
        ...p,
        hand: six,
        golfSlots,
        calledUno: false,
      };
    });
    return { players: dealt, remainingDeck: remaining };
  },

  initializeGame(playerInits, mode, settings) {
    const deck = this.shuffleDeck(this.createDeck(settings));
    const clamped = playerInits.slice(0, 8); // Supports 2–8 players
    const initialPlayers: HubPlayer[] = clamped.map((p) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      hand: [],
      golfSlots: [],
      score: 0,
      calledUno: false,
    }));
    const { players, remainingDeck } = this.dealCards(deck, initialPlayers, settings);
    return createGolfRoundState(remainingDeck, players, mode, settings, 1, []);
  },

  validateMove(state: HubGameState, playerId: string, move: MoveInput): ValidationResult {
    if (state.phase !== 'playing') return { valid: false, reason: 'Permainan tidak aktif.' };
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.id !== playerId) return { valid: false, reason: 'Bukan giliranmu.' };

    if (!state.golfDrawnCard) {
      return {
        valid: false,
        reason: 'Ambil kartu dari Draw Pile atau Discard Pile terlebih dahulu!',
      };
    }

    const slots = current.golfSlots ?? [];
    const slotIdx =
      move.golfSlotIndex !== undefined
        ? move.golfSlotIndex
        : slots.findIndex((s) => s.card.id === move.cardId);
    if (slotIdx < 0 || slotIdx >= slots.length) {
      return { valid: false, reason: 'Pilih kartu di grid untuk ditukar!' };
    }

    // Official rule: Card taken from Discard Pile MUST replace a face-down card!
    if (state.golfDrawnCard.source === 'discard' && slots[slotIdx].faceUp) {
      return {
        valid: false,
        reason: 'Kartu dari Discard Pile WAJIB ditukar dengan kartu TERTUTUP (face-down)!',
      };
    }

    return { valid: true };
  },

  executeAction(state: HubGameState, playerId: string, move: MoveInput): HubGameState {
    const val = this.validateMove(state, playerId, move);
    if (!val.valid || !state.golfDrawnCard) return state;

    const current = state.players[state.currentPlayerIndex];
    const slots = current.golfSlots ?? [];
    const slotIdx =
      move.golfSlotIndex !== undefined
        ? move.golfSlotIndex
        : slots.findIndex((s) => s.card.id === move.cardId);

    const incomingCard = state.golfDrawnCard.card;
    const oldSlot = slots[slotIdx];
    const swappedSlots: GolfSlot[] = slots.map((s, i) =>
      i === slotIdx ? { card: incomingCard, faceUp: true } : s
    );

    // Run immediate Column Matching (same color OR same number/value -> clear column!)
    const cleared = clearMatchingGolfColumns(swappedSlots);
    const faceDownLeft = countFaceDownGolfCards(cleared.remaining);
    const unoVulnerablePlayerId =
      faceDownLeft === 1 && !current.calledUno ? current.id : null;

    const players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex
        ? {
            ...p,
            golfSlots: cleared.remaining,
            hand: cleared.remaining.map((s) => s.card),
            calledUno: faceDownLeft <= 1 ? p.calledUno : false,
          }
        : p
    );

    const nextState: HubGameState = {
      ...state,
      players,
      discardPile: [...state.discardPile, oldSlot.card],
      activeColor: oldSlot.card.color,
      golfDrawnCard: null,
      hasDrawnThisTurn: false,
      unoVulnerablePlayerId,
    };

    const oldLabel =
      oldSlot.card.type === 'number'
        ? `${getColorLabel(oldSlot.card.color)} ${oldSlot.card.value}`
        : oldSlot.card.type.toUpperCase();
    const clearNote =
      cleared.clearedCount > 0
        ? ` ✨ CLEAR COLUMN! ${cleared.clearedCount} kolom cocok dibuang (0 poin)!`
        : '';

    return applyGolfDiscardedAction(
      nextState,
      playerId,
      oldSlot.card,
      `⛳ ${current.name} menukar slot #${slotIdx + 1} (membuka ${oldLabel}).${clearNote}`,
      cleared.clearedCount > 0
    );
  },

  advanceTurn(state, steps = 1) {
    const nextIdx = getNextPlayerIndex(state.players, state.currentPlayerIndex, state.direction, steps);
    return transitionTurnWithPrivacy(
      { ...state, golfDrawnCard: null, hasDrawnThisTurn: false },
      nextIdx
    );
  },

  calculateScore(state, winnerId) {
    const p = state.players.find((pl) => pl.id === winnerId);
    return p ? calculateGolfGridScore(p.golfSlots, true) : 0;
  },

  checkWinCondition(state) {
    const finisher = state.players.find(
      (p) => p.golfSlots && p.golfSlots.every((s) => s.faceUp)
    );
    if (!finisher) return state;

    // Reveal all face-down cards of ALL players & run final Column Matching pass!
    const revealedPlayers = state.players.map((p) => {
      const allFaceUp = (p.golfSlots ?? []).map((s) => ({ ...s, faceUp: true }));
      const finalCleared = clearMatchingGolfColumns(allFaceUp);
      const roundPts = calculateGolfGridScore(finalCleared.remaining, true);
      return {
        ...p,
        golfSlots: finalCleared.remaining,
        hand: finalCleared.remaining.map((s) => s.card),
        score: p.score + roundPts,
      };
    });

    const sorted = [...revealedPlayers].sort((a, b) => a.score - b.score);
    const leader = sorted[0];
    const done = state.settings.singleRound || state.roundNumber >= GOLF_TOTAL_ROUNDS;

    return appendEvent(
      {
        ...state,
        players: revealedPlayers,
        phase: done ? 'game_over' : 'round_over',
        golfDrawnCard: null,
        pendingPrompt: null,
        unoVulnerablePlayerId: null,
        winnerId: done ? leader.id : null,
        roundHistory: [
          ...state.roundHistory,
          {
            roundNumber: state.roundNumber,
            winnerId: leader.id,
            winnerName: leader.name,
            pointsAwarded: calculateGolfGridScore(leader.golfSlots, true),
            reason: done
              ? `Skor terendah setelah ${state.roundNumber} ronde (${leader.score} poin)!`
              : `${finisher.name} membuka semua kartu! Peringkat 1 sementara: ${leader.name} (${leader.score} poin).`,
            playerPoints: revealedPlayers.map((p) => ({
              playerId: p.id,
              playerName: p.name,
              handPoints: calculateGolfGridScore(p.golfSlots, true),
              totalScore: p.score,
            })),
          },
        ],
      },
      done ? 'game_win' : 'round_end',
      `⛳ Ronde ${state.roundNumber}/${state.settings.singleRound ? 1 : GOLF_TOTAL_ROUNDS} selesai! Peringkat 1: ${leader.name} (${leader.score} poin terendah)!`
    );
  },

  resetRound(state) {
    const deck = this.shuffleDeck(this.createDeck(state.settings));
    const resetPlayers = state.players.map((p) => ({
      ...p,
      hand: [],
      golfSlots: [],
      calledUno: false,
    }));
    const { players, remainingDeck } = this.dealCards(deck, resetPlayers, state.settings);
    return createGolfRoundState(
      remainingDeck,
      players,
      state.mode,
      state.settings,
      state.roundNumber + 1,
      state.roundHistory
    );
  },

  handleDrawOrPass(state, playerId) {
    if (state.golfDrawnCard) {
      if (state.golfDrawnCard.source === 'draw') {
        return golfDiscardDrawn(state, playerId);
      }
      return state;
    }
    return golfTakeDraw(state, playerId);
  },

  resolvePrompt(state, payload) {
    if (state.pendingPrompt?.type === 'golf_double_draw2') {
      const actorId = state.pendingPrompt.actorId;
      const actorName = state.players.find((p) => p.id === actorId)?.name ?? 'Pemain';
      const firstId = payload.targetPlayerId;
      const secondId = payload.secondTargetPlayerId;
      if (!firstId) return state;

      let drawPile = [...state.drawPile];
      let discardPile = [...state.discardPile];
      let players = [...state.players];
      let msg = '';

      if (secondId && secondId !== firstId) {
        // Mode A: 2 players each take +2 face-down cards!
        const targets = [firstId, secondId];
        for (const tid of targets) {
          const res = drawCardsFromDeck(drawPile, discardPile, 2);
          drawPile = res.drawPile;
          discardPile = res.discardPile;
          players = players.map((p) => {
            if (p.id !== tid) return p;
            const expanded = appendFaceDownToGolfGrid(p.golfSlots ?? [], res.drawn);
            return { ...p, golfSlots: expanded, hand: expanded.map((s) => s.card), calledUno: false };
          });
        }
        const n1 = players.find((p) => p.id === firstId)?.name ?? 'P1';
        const n2 = players.find((p) => p.id === secondId)?.name ?? 'P2';
        msg = `💥 DOUBLE DRAW 2! ${actorName} memberi +2 kartu tertutup ke ${n1} & +2 ke ${n2}! (Tidak ada yang kehilangan giliran)`;
      } else {
        // Mode B: 1 player takes +4 face-down cards (2 new columns)!
        const res = drawCardsFromDeck(drawPile, discardPile, 4);
        drawPile = res.drawPile;
        discardPile = res.discardPile;
        players = players.map((p) => {
          if (p.id !== firstId) return p;
          const expanded = appendFaceDownToGolfGrid(p.golfSlots ?? [], res.drawn);
          return { ...p, golfSlots: expanded, hand: expanded.map((s) => s.card), calledUno: false };
        });
        const n1 = players.find((p) => p.id === firstId)?.name ?? 'Target';
        msg = `💥 DOUBLE DRAW 2! ${actorName} memberi +4 kartu tertutup (2 kolom baru) ke ${n1}! (Tidak ada yang kehilangan giliran)`;
      }

      const next = appendEvent(
        {
          ...state,
          phase: 'playing',
          players,
          drawPile,
          discardPile,
          pendingPrompt: null,
        },
        'double_draw2',
        msg
      );
      // Official rule: Nobody loses their turn after Double Draw 2!
      return this.advanceTurn(next, 1);
    }

    return state;
  },

  decideAIMove(state) {
    // Handle Double Draw 2 prompt for AI
    if (state.pendingPrompt?.type === 'golf_double_draw2') {
      const actorId = state.pendingPrompt.actorId;
      const opponents = state.players
        .filter((p) => p.id !== actorId && !p.eliminated)
        .sort((a, b) => countFaceDownGolfCards(a.golfSlots) - countFaceDownGolfCards(b.golfSlots));
      if (opponents.length >= 2 && Math.random() < 0.5) {
        return {
          type: 'resolve_prompt' as const,
          payload: { targetPlayerId: opponents[0].id, secondTargetPlayerId: opponents[1].id },
        };
      }
      return {
        type: 'resolve_prompt' as const,
        payload: { targetPlayerId: opponents[0]?.id ?? state.players[0].id },
      };
    }

    const curr = state.players[state.currentPlayerIndex];
    const slots = curr?.golfSlots ?? [];

    // Step 2: AI already drew a card -> decide whether to swap into a slot or discard!
    if (state.golfDrawnCard) {
      const drawn = state.golfDrawnCard.card;
      const fromDiscard = state.golfDrawnCard.source === 'discard';

      // Check if drawn card can immediately clear a column!
      for (let i = 0; i < slots.length; i += 2) {
        const top = slots[i];
        const bot = slots[i + 1];
        if (top && bot) {
          if (top.faceUp && !bot.faceUp && golfColumnMatches(top, { card: drawn, faceUp: true })) {
            return { type: 'play' as const, move: { cardId: bot.card.id, golfSlotIndex: i + 1 } };
          }
          if (bot.faceUp && !top.faceUp && golfColumnMatches({ card: drawn, faceUp: true }, bot)) {
            return { type: 'play' as const, move: { cardId: top.card.id, golfSlotIndex: i } };
          }
        }
      }

      if (fromDiscard) {
        const hiddenIdx = slots.findIndex((s) => !s.faceUp);
        if (hiddenIdx >= 0) {
          return {
            type: 'play' as const,
            move: { cardId: slots[hiddenIdx].card.id, golfSlotIndex: hiddenIdx },
          };
        }
      }

      // From Draw Pile: if low value (<= 4), swap with worst face-up (> 5) or a face-down slot
      if (getGolfCardPoints(drawn) <= 4) {
        let worstIdx = -1;
        let worstVal = 5;
        slots.forEach((s, i) => {
          if (s.faceUp && getGolfCardPoints(s.card) > worstVal) {
            worstVal = getGolfCardPoints(s.card);
            worstIdx = i;
          }
        });
        if (worstIdx < 0) worstIdx = slots.findIndex((s) => !s.faceUp);
        if (worstIdx >= 0) {
          return {
            type: 'play' as const,
            move: { cardId: slots[worstIdx].card.id, golfSlotIndex: worstIdx },
          };
        }
      }

      // Otherwise discard the drawn card!
      return { type: 'draw' as const };
    }

    // Step 1: AI draws from Draw Pile (safe and flexible; handleDrawOrPass draws from Draw Pile)
    return { type: 'draw' as const };
  },
};
