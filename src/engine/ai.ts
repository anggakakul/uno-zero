import { Card, GameState, GridColumn, SlotPosition } from '../types/game';
import {
  canTakeFromDiscardPile,
  countFaceDownCards,
  doColumnCardsMatch,
  getCardPoints,
} from './rules';

export type AIDecision =
  | { action: 'flip_initial'; colIdx: number; pos: SlotPosition }
  | { action: 'take_source'; source: 'draw' | 'discard' }
  | { action: 'swap_slot'; colIdx: number; pos: SlotPosition; callUnoFirst?: boolean }
  | { action: 'discard_drawn' }
  | { action: 'flip_after_discard'; colIdx: number; pos: SlotPosition; callUnoFirst?: boolean }
  | { action: 'resolve_double_draw2'; targetIds: string[] };

/**
 * Finds a column where ONE slot is face-up and matches `incomingCard` (same color or same number),
 * returning the OPPOSITE slot so swapping immediately eliminates the vertical column!
 */
function findColumnMatchSwapSlot(
  columns: readonly GridColumn[],
  incomingCard: Card
): { colIdx: number; pos: SlotPosition } | null {
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    if (col.top?.faceUp && col.top.card && col.bottom && !col.bottom.faceUp) {
      if (doColumnCardsMatch(col.top.card, incomingCard)) {
        return { colIdx: i, pos: 'bottom' };
      }
    }
    if (col.bottom?.faceUp && col.bottom.card && col.top && !col.top.faceUp) {
      if (doColumnCardsMatch(col.bottom.card, incomingCard)) {
        return { colIdx: i, pos: 'top' };
      }
    }
    // Also check if both are face-up (unmatched) and replacing one creates a match!
    if (col.top?.faceUp && col.top.card && col.bottom?.faceUp && col.bottom.card) {
      if (doColumnCardsMatch(col.top.card, incomingCard)) {
        return { colIdx: i, pos: 'bottom' };
      }
      if (doColumnCardsMatch(col.bottom.card, incomingCard)) {
        return { colIdx: i, pos: 'top' };
      }
    }
  }
  return null;
}

/**
 * Finds the highest-value open card in the AI's grid (prioritizing action cards and 5-6).
 */
function findHighestOpenSlot(
  columns: readonly GridColumn[]
): { colIdx: number; pos: SlotPosition; points: number } | null {
  let best: { colIdx: number; pos: SlotPosition; points: number } | null = null;
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    for (const pos of ['top', 'bottom'] as const) {
      const slot = col[pos];
      if (slot?.faceUp && slot.card) {
        const pts = getCardPoints(slot.card);
        if (!best || pts > best.points) {
          best = { colIdx: i, pos, points: pts };
        }
      }
    }
  }
  return best;
}

/**
 * Picks a random face-down slot in the AI's grid.
 */
function pickRandomFaceDownSlot(
  columns: readonly GridColumn[],
  rng: () => number
): { colIdx: number; pos: SlotPosition } | null {
  const candidates: { colIdx: number; pos: SlotPosition }[] = [];
  for (let i = 0; i < columns.length; i++) {
    if (columns[i].top && !columns[i].top!.faceUp) {
      candidates.push({ colIdx: i, pos: 'top' });
    }
    if (columns[i].bottom && !columns[i].bottom!.faceUp) {
      candidates.push({ colIdx: i, pos: 'bottom' });
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

/**
 * Strategic AI decision engine for UNO Zero Golf:
 * 1. Source Priority: Takes Discard Pile if top card is low (0, 1, or 2) OR matches an open grid card for column elimination. Otherwise takes Draw Pile.
 * 2. Swap Priority:
 *    - Immediately complete a column match if possible!
 *    - Otherwise swap out high open cards (5, 6, or action cards) if drawn card is lower.
 *    - Otherwise swap a random face-down slot if drawn card is low (0, 1, 2).
 *    - If drawn from Draw Pile and card is high/unhelpful (or action card to attack opponents!), discard it and flip a random face-down slot.
 * 3. UNO Probability: 80% chance to remember calling "UNO!" when dropping to 1 face-down card.
 */
export function decideAIMove(
  state: GameState,
  rng: () => number = Math.random
): AIDecision | null {
  const aiPlayer = state.players[state.currentPlayerIndex];
  if (!aiPlayer) return null;

  if (state.phase === 'initial_flip') {
    const pick = pickRandomFaceDownSlot(aiPlayer.columns, rng);
    if (!pick) return null;
    return { action: 'flip_initial', colIdx: pick.colIdx, pos: pick.pos };
  }

  if (state.phase === 'choose_double_draw2_target') {
    const opponents = state.players
      .filter((p) => p.id !== aiPlayer.id)
      .sort((a, b) => a.totalScore - b.totalScore);
    if (opponents.length === 0) return null;
    // Target lowest-score opponent(s): split if >= 2 opponents and scores are close, else hit leader with +4
    if (opponents.length >= 2 && rng() < 0.45) {
      return { action: 'resolve_double_draw2', targetIds: [opponents[0].id, opponents[1].id] };
    }
    return { action: 'resolve_double_draw2', targetIds: [opponents[0].id] };
  }

  if (state.phase !== 'playing') return null;

  const faceDownCount = countFaceDownCards(aiPlayer.columns);

  if (state.turnStep === 'choose_source') {
    if (canTakeFromDiscardPile(state.discardPile)) {
      const topDiscard = state.discardPile[state.discardPile.length - 1];
      const isLowNumber = topDiscard.type === 'number' && (topDiscard.value ?? 99) <= 2;
      const matchesColumn = Boolean(findColumnMatchSwapSlot(aiPlayer.columns, topDiscard));
      if (isLowNumber || matchesColumn) {
        return { action: 'take_source', source: 'discard' };
      }
    }
    return { action: 'take_source', source: 'draw' };
  }

  if (state.turnStep === 'resolve_drawn' && state.drawnCard) {
    const card = state.drawnCard;
    const cardPts = getCardPoints(card);
    const shouldCallUno = (willDropToOne: boolean) => willDropToOne && rng() < 0.8;

    // 1. Immediate vertical column elimination!
    const matchSlot = findColumnMatchSwapSlot(aiPlayer.columns, card);
    if (matchSlot) {
      const targetSlot = aiPlayer.columns[matchSlot.colIdx][matchSlot.pos];
      const willDropToOne = faceDownCount === 2 && Boolean(targetSlot && !targetSlot.faceUp);
      return {
        action: 'swap_slot',
        colIdx: matchSlot.colIdx,
        pos: matchSlot.pos,
        callUnoFirst: shouldCallUno(willDropToOne),
      };
    }

    // 2. Replace high open card (5, 6, or action card) if incoming card is strictly lower
    const highOpen = findHighestOpenSlot(aiPlayer.columns);
    if (highOpen && highOpen.points >= 5 && cardPts < highOpen.points) {
      return {
        action: 'swap_slot',
        colIdx: highOpen.colIdx,
        pos: highOpen.pos,
      };
    }

    // 3. If incoming card is low (0, 1, or 2), swap into a face-down slot (or any higher open slot)
    if (card.type === 'number' && (card.value ?? 99) <= 2) {
      if (highOpen && highOpen.points > cardPts) {
        return { action: 'swap_slot', colIdx: highOpen.colIdx, pos: highOpen.pos };
      }
      const fd = pickRandomFaceDownSlot(aiPlayer.columns, rng);
      if (fd) {
        return {
          action: 'swap_slot',
          colIdx: fd.colIdx,
          pos: fd.pos,
          callUnoFirst: shouldCallUno(faceDownCount === 2),
        };
      }
    }

    // 4. If drawn from Draw Pile and card isn't useful (high number or action card), discard it & flip!
    if (state.drawnFrom === 'draw') {
      return { action: 'discard_drawn' };
    }

    // 5. Must swap (drawn from Discard Pile)
    if (highOpen) {
      return { action: 'swap_slot', colIdx: highOpen.colIdx, pos: highOpen.pos };
    }
    const fd = pickRandomFaceDownSlot(aiPlayer.columns, rng);
    if (fd) {
      return {
        action: 'swap_slot',
        colIdx: fd.colIdx,
        pos: fd.pos,
        callUnoFirst: shouldCallUno(faceDownCount === 2),
      };
    }
    return { action: 'swap_slot', colIdx: 0, pos: 'top' };
  }

  if (state.turnStep === 'must_flip') {
    const fd = pickRandomFaceDownSlot(aiPlayer.columns, rng);
    if (!fd) return null;
    const callUnoFirst = faceDownCount === 2 && rng() < 0.8;
    return {
      action: 'flip_after_discard',
      colIdx: fd.colIdx,
      pos: fd.pos,
      callUnoFirst,
    };
  }

  return null;
}
