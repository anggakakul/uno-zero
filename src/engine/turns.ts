import { PlayDirection, ReverseTwoPlayerRule } from '../types/game';

/**
 * Computes the next player index given current index, player count, direction, and step count.
 */
export function getNextPlayerIndex(
  currentIndex: number,
  playerCount: number,
  direction: PlayDirection,
  steps = 1
): number {
  const raw = (currentIndex + direction * steps) % playerCount;
  return (raw + playerCount) % playerCount;
}

/**
 * Computes the starting player index: player to the left of the dealer (clockwise +1).
 */
export function getStartingPlayerIndex(dealerIndex: number, playerCount: number): number {
  return getNextPlayerIndex(dealerIndex, playerCount, 1, 1);
}

/**
 * Computes new direction and next player index after a Reverse card is played.
 */
export function resolveReverseTurn(
  currentIndex: number,
  playerCount: number,
  currentDirection: PlayDirection,
  reverseTwoPlayerRule: ReverseTwoPlayerRule
): { nextDirection: PlayDirection; nextPlayerIndex: number; skippedOpponent: boolean } {
  const nextDirection: PlayDirection = currentDirection === 1 ? -1 : 1;

  if (playerCount === 2 && reverseTwoPlayerRule === 'act_as_skip') {
    return {
      nextDirection,
      nextPlayerIndex: currentIndex,
      skippedOpponent: true,
    };
  }

  return {
    nextDirection,
    nextPlayerIndex: getNextPlayerIndex(currentIndex, playerCount, nextDirection, 1),
    skippedOpponent: false,
  };
}
