import { CARD_COLORS, Card, DeckConfig } from '../types/game';

/**
 * Generates the official 112-card UNO Zero deck:
 * - Number cards 0-6 across 4 colors (3 copies per number per color = 84 cards)
 * - Action cards: Skip, Reverse, Draw Two, Double Draw Two across 4 colors (28 cards)
 */
export function createDeck(config: DeckConfig): Card[] {
  const deck: Card[] = [];
  let seq = 1;

  const nextId = (prefix: string) => `${prefix}-${seq++}`;

  for (const color of CARD_COLORS) {
    // Number cards 0-6
    for (let num = 0; num <= 6; num++) {
      for (let c = 0; c < Math.max(0, config.numbersPerColor); c++) {
        deck.push({ id: nextId(`${color}-${num}`), type: 'number', color, value: num });
      }
    }

    // Skip cards
    for (let c = 0; c < Math.max(0, config.skipsPerColor); c++) {
      deck.push({ id: nextId(`${color}-skip`), type: 'skip', color });
    }

    // Reverse cards
    for (let c = 0; c < Math.max(0, config.reversesPerColor); c++) {
      deck.push({ id: nextId(`${color}-rev`), type: 'reverse', color });
    }

    // Draw Two cards
    for (let c = 0; c < Math.max(0, config.draw2PerColor); c++) {
      deck.push({ id: nextId(`${color}-draw2`), type: 'draw2', color });
    }

    // Double Draw Two cards
    for (let c = 0; c < Math.max(0, config.doubleDraw2PerColor); c++) {
      deck.push({ id: nextId(`${color}-ddraw2`), type: 'double_draw2', color });
    }
  }

  return deck;
}

export function getDeckTotalCount(config: DeckConfig): number {
  const perColor =
    7 * Math.max(0, config.numbersPerColor) +
    Math.max(0, config.skipsPerColor) +
    Math.max(0, config.reversesPerColor) +
    Math.max(0, config.draw2PerColor) +
    Math.max(0, config.doubleDraw2PerColor);
  return perColor * CARD_COLORS.length;
}

/**
 * Fisher-Yates unbiased shuffle.
 */
export function shuffleDeck<T>(cards: readonly T[], rng: () => number = Math.random): T[] {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Recycles the discard pile (keeping only the top card) into a freshly shuffled draw pile.
 */
export function recycleDiscardIntoDraw(
  discardPile: Card[],
  rng: () => number = Math.random
): { drawPile: Card[]; discardPile: Card[] } {
  if (discardPile.length <= 1) {
    return { drawPile: [], discardPile: [...discardPile] };
  }
  const topCard = discardPile[discardPile.length - 1];
  const underCards = discardPile.slice(0, -1);
  return {
    drawPile: shuffleDeck(underCards, rng),
    discardPile: [topCard],
  };
}
