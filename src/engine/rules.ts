import { ActionCardScoreRule, Card, CardColor, GridColumn } from '../types/game';

/**
 * Official UNO Zero point values at round end:
 * - Number Cards (0-6): face value (0 = 0 pts, 6 = 6 pts)
 * - Action Cards (Skip, Reverse, Draw Two, Double Draw Two): 10 pts (or 20 pts if configured)
 */
export function getCardPoints(card: Card, actionCardPoints: ActionCardScoreRule = 10): number {
  if (card.type === 'number') {
    return card.value ?? 0;
  }
  return actionCardPoints;
}

/**
 * Checks whether two face-up cards in the same vertical column match
 * by SAME NUMBER (0-6) OR SAME COLOR (red, yellow, green, blue).
 */
export function doColumnCardsMatch(a: Card, b: Card): boolean {
  if (a.color === b.color) {
    return true;
  }
  if (a.type === 'number' && b.type === 'number' && a.value === b.value) {
    return true;
  }
  return false;
}

/**
 * Evaluates a player's grid columns: any column where BOTH top and bottom cards
 * are face-up AND match (same color OR same number) is automatically eliminated
 * and cleanly removed from the grid so no confusing empty spaces remain.
 */
export function eliminateMatchingColumns(columns: readonly GridColumn[]): {
  columns: GridColumn[];
  eliminatedCount: number;
  eliminatedCards: Card[];
} {
  let eliminatedCount = 0;
  const eliminatedCards: Card[] = [];
  const remaining: GridColumn[] = [];

  for (const col of columns) {
    if (
      col.top &&
      col.bottom &&
      col.top.faceUp &&
      col.bottom.faceUp &&
      col.top.card &&
      col.bottom.card &&
      doColumnCardsMatch(col.top.card, col.bottom.card)
    ) {
      eliminatedCount += 1;
      eliminatedCards.push(col.top.card, col.bottom.card);
    } else {
      remaining.push(col);
    }
  }

  return {
    columns: remaining,
    eliminatedCount,
    eliminatedCards,
  };
}

/**
 * Counts how many face-down cards remain in a player's grid.
 */
export function countFaceDownCards(columns: readonly GridColumn[]): number {
  let count = 0;
  for (const col of columns) {
    if (col.top && !col.top.faceUp) count++;
    if (col.bottom && !col.bottom.faceUp) count++;
  }
  return count;
}

/**
 * Returns all visible/non-null cards still present in a player's grid.
 */
export function getGridCards(columns: readonly GridColumn[]): Card[] {
  const cards: Card[] = [];
  for (const col of columns) {
    if (col.top?.card) cards.push(col.top.card);
    if (col.bottom?.card) cards.push(col.bottom.card);
  }
  return cards;
}

/**
 * Calculates total score of all remaining cards in a player's grid.
 */
export function calculateGridPoints(
  columns: readonly GridColumn[],
  actionCardPoints: ActionCardScoreRule = 10
): number {
  return getGridCards(columns).reduce(
    (sum, card) => sum + getCardPoints(card, actionCardPoints),
    0
  );
}

/**
 * Returns true if the card is an action card that triggers when discarded to the Discard Pile.
 */
export function isActionCard(card: Card): boolean {
  return (
    card.type === 'skip' ||
    card.type === 'reverse' ||
    card.type === 'draw2' ||
    card.type === 'double_draw2'
  );
}

/**
 * Official UNO Zero rule:
 * Players are NOT allowed to take the top card of the Discard Pile if it is an Action Card.
 */
export function canTakeFromDiscardPile(discardPile: readonly Card[]): boolean {
  if (discardPile.length === 0) return false;
  const top = discardPile[discardPile.length - 1];
  return !isActionCard(top);
}

/**
 * Human-readable Indonesian card label for logs and UI.
 */
export function formatCardName(card: Card): string {
  const colorNames: Record<CardColor, string> = {
    red: 'Merah',
    yellow: 'Kuning',
    green: 'Hijau',
    blue: 'Biru',
  };
  const colorLabel = colorNames[card.color];

  switch (card.type) {
    case 'number':
      return `${colorLabel} ${card.value}`;
    case 'skip':
      return `Skip ${colorLabel}`;
    case 'reverse':
      return `Reverse ${colorLabel}`;
    case 'draw2':
      return `Draw Two ${colorLabel}`;
    case 'double_draw2':
      return `Double Draw Two ${colorLabel}`;
  }
}
