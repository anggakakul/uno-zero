function canVibrate(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false;
  }
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return false;
  }
  return true;
}

function trigger(pattern: number | number[]): void {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Ignore browser vibration restrictions
  }
}

export const haptics = {
  /** Subtle single pulse when the player's turn arrives */
  turnStart: () => trigger(18),
  /** Crisp double pulse when shouting UNO! */
  unoCall: () => trigger([25, 40, 35]),
  /** Stronger triple pulse when hit by +2 / +4 / +6 / +10 penalty */
  penaltyHit: () => trigger([45, 35, 65]),
  /** Light tactile tick for card select/play */
  cardTap: () => trigger(10),
};
