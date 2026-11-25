import {
  HubCard,
  HubCardColor,
  HubEvent,
  HubGameState,
  HubPlayer,
  VariantId,
} from '../types';

let idCounter = 0;

export function uid(prefix = 'c'): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}_${Math.random().toString(36).slice(2, 6)}`;
}

export function shuffleCards<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createEvent(type: string, message: string): HubEvent {
  return {
    id: uid('ev'),
    type,
    message,
    timestamp: Date.now(),
  };
}

export function appendEvent(state: HubGameState, type: string, message: string): HubGameState {
  const ev = createEvent(type, message);
  return {
    ...state,
    lastEvent: ev,
    actionLog: [ev, ...state.actionLog].slice(0, 60),
  };
}

export function getActivePlayers(players: HubPlayer[]): HubPlayer[] {
  return players.filter((p) => !p.eliminated && !p.isOut);
}

/** Find next non-eliminated, non-out player index stepping by `steps` in `direction` */
export function getNextPlayerIndex(
  players: HubPlayer[],
  currentIndex: number,
  direction: 1 | -1,
  steps = 1
): number {
  const total = players.length;
  if (total === 0) return 0;
  let idx = currentIndex;
  let moved = 0;
  let guard = 0;
  while (moved < steps && guard < total * 4) {
    idx = (idx + direction + total) % total;
    guard += 1;
    if (!players[idx].eliminated && !players[idx].isOut) {
      moved += 1;
    }
  }
  return idx;
}

/** Draw N cards from drawPile, reshuffling discardPile (keeping top card) if needed */
export function drawCardsFromDeck(
  drawPile: HubCard[],
  discardPile: HubCard[],
  count: number
): { drawn: HubCard[]; drawPile: HubCard[]; discardPile: HubCard[]; reshuffled: boolean } {
  let dPile = [...drawPile];
  let discPile = [...discardPile];
  const drawn: HubCard[] = [];
  let reshuffled = false;

  for (let i = 0; i < count; i += 1) {
    if (dPile.length === 0) {
      if (discPile.length <= 1) break;
      const top = discPile[discPile.length - 1];
      const recycled = shuffleCards(discPile.slice(0, discPile.length - 1));
      dPile = recycled;
      discPile = [top];
      reshuffled = true;
    }
    const card = dPile.pop();
    if (card) drawn.push(card);
  }

  return { drawn, drawPile: dPile, discardPile: discPile, reshuffled };
}

export function getCardDisplayColor(card: HubCard, flipSide: 'light' | 'dark' = 'light'): HubCardColor {
  if (card.lightFace && card.darkFace) {
    return flipSide === 'light' ? card.lightFace.color : card.darkFace.color;
  }
  return card.color;
}

export function getCardDisplayType(card: HubCard, flipSide: 'light' | 'dark' = 'light') {
  if (card.lightFace && card.darkFace) {
    return flipSide === 'light' ? card.lightFace.type : card.darkFace.type;
  }
  return card.type;
}

export function getCardDisplayValue(card: HubCard, flipSide: 'light' | 'dark' = 'light'): number | undefined {
  if (card.lightFace && card.darkFace) {
    return flipSide === 'light' ? card.lightFace.value : card.darkFace.value;
  }
  return card.value;
}

export function isWildCardType(type: string): boolean {
  return type.startsWith('wild');
}

export function pickMostFrequentColor(
  hand: HubCard[],
  validColors: HubCardColor[],
  flipSide: 'light' | 'dark' = 'light'
): HubCardColor {
  const counts: Record<string, number> = {};
  for (const c of validColors) counts[c] = 0;
  for (const card of hand) {
    const col = getCardDisplayColor(card, flipSide);
    if (col in counts) counts[col] += 1;
  }
  let best = validColors[0];
  let bestScore = -1;
  for (const c of validColors) {
    if (counts[c] > bestScore) {
      bestScore = counts[c];
      best = c;
    }
  }
  return best;
}

export function getColorLabel(color: HubCardColor): string {
  const labels: Record<HubCardColor, string> = {
    red: 'Merah',
    yellow: 'Kuning',
    green: 'Hijau',
    blue: 'Biru',
    pink: 'Pink',
    teal: 'Teal',
    orange: 'Oranye',
    purple: 'Ungu',
    wild: 'Wild',
  };
  return labels[color] ?? color;
}

export function getValidColorsForState(state: HubGameState): HubCardColor[] {
  if (state.variantId === 'uno-flip' && state.flipSide === 'dark') {
    return ['pink', 'teal', 'orange', 'purple'];
  }
  return ['red', 'yellow', 'green', 'blue'];
}

export function calculateClassicHandPoints(hand: HubCard[], flipSide: 'light' | 'dark' = 'light'): number {
  return hand.reduce((sum, card) => {
    const t = getCardDisplayType(card, flipSide);
    const v = getCardDisplayValue(card, flipSide);
    if (t === 'number') return sum + (v ?? 0);
    if (t === 'draw1') return sum + 10;
    if (
      t === 'skip' ||
      t === 'reverse' ||
      t === 'draw2' ||
      t === 'draw5' ||
      t === 'flip' ||
      t === 'discard_all' ||
      t === 'flex_skip' ||
      t === 'flex_reverse' ||
      t === 'flex_draw2'
    ) {
      return sum + 20;
    }
    if (t === 'skip_everyone' || t === 'draw4') return sum + 30;
    if (t === 'wild') return sum + (flipSide === 'dark' ? 40 : 50);
    if (t === 'wild_draw_color') return sum + 60;
    return sum + 50;
  }, 0);
}

/** Call UNO for an active player with 1 or 2 cards (never needed on last card / 0 cards) */
export function callHubUno(state: HubGameState, playerId: string): HubGameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.isOut || player.eliminated || player.hand.length === 0 || player.hand.length > 2) {
    return state;
  }
  const players = state.players.map((p) =>
    p.id === playerId ? { ...p, calledUno: true } : p
  );
  const clearVuln = state.unoVulnerablePlayerId === playerId ? null : state.unoVulnerablePlayerId;
  return appendEvent(
    {
      ...state,
      players,
      unoVulnerablePlayerId: clearVuln,
    },
    'uno_call',
    `${player.name} berteriak UNO!`
  );
}

/** Catch a player who forgot to call UNO -> +2 penalty cards */
export function catchHubUno(state: HubGameState, catcherName: string): HubGameState {
  if (!state.unoVulnerablePlayerId) return state;
  const target = state.players.find((p) => p.id === state.unoVulnerablePlayerId);
  if (!target) return state;

  const { drawn, drawPile, discardPile } = drawCardsFromDeck(state.drawPile, state.discardPile, 2);
  const players = state.players.map((p) =>
    p.id === target.id
      ? { ...p, hand: [...p.hand, ...drawn], calledUno: false }
      : p
  );

  return appendEvent(
    {
      ...state,
      players,
      drawPile,
      discardPile,
      unoVulnerablePlayerId: null,
    },
    'uno_penalty',
    `${catcherName} menangkap ${target.name} lupa bilang UNO! Penalti +${drawn.length} kartu.`
  );
}

/** Confirm Pass-and-Play privacy handoff screen */
export function confirmPassDevice(state: HubGameState): HubGameState {
  if (state.phase !== 'pass_device') return state;
  return {
    ...state,
    phase: 'playing',
  };
}

export function transitionTurnWithPrivacy(
  state: HubGameState,
  nextIndex: number
): HubGameState {
  const changed = nextIndex !== state.currentPlayerIndex;
  const nextPlayer = state.players[nextIndex];
  const needsPassScreen =
    state.mode === 'local' &&
    changed &&
    nextPlayer &&
    !nextPlayer.isAI &&
    state.phase === 'playing';

  return {
    ...state,
    currentPlayerIndex: nextIndex,
    hasDrawnThisTurn: false,
    phase: needsPassScreen ? 'pass_device' : state.phase,
  };
}

export function makeDefaultPlayers(
  names: string[],
  mode: 'local' | 'ai',
  isTeamGame = false
): { id: string; name: string; isAI: boolean; teamId?: number }[] {
  return names.map((name, i) => ({
    id: `p_${i + 1}`,
    name: name.trim() || `Pemain ${i + 1}`,
    isAI: mode === 'ai' && i > 0,
    teamId: isTeamGame ? i % (names.length === 6 ? 3 : 2) : undefined,
  }));
}

export function getVariantStoragePrefix(variantId: VariantId): string {
  return `uno_hub_v1_${variantId}`;
}
