import {
  ActionEvent,
  ActionEventType,
  Card,
  GameConfig,
  GameState,
  GridColumn,
  PlayDirection,
  Player,
  RoundPlayerScore,
  RoundRecord,
  SlotPosition,
} from '../types/game';
import { createDeck, recycleDiscardIntoDraw, shuffleDeck } from './deck';
import {
  calculateGridPoints,
  countFaceDownCards,
  eliminateMatchingColumns,
  formatCardName,
  getGridCards,
  isActionCard,
} from './rules';
import { getNextPlayerIndex, getStartingPlayerIndex, resolveReverseTurn } from './turns';

export const INITIAL_COLUMNS = 3;
export const INITIAL_CARDS_PER_PLAYER = 6; // 2 rows x 3 columns

let eventCounter = 1;
function makeEvent(
  type: ActionEventType,
  message: string,
  actorName?: string,
  targetName?: string
): ActionEvent {
  return {
    id: `evt-${Date.now()}-${eventCounter++}`,
    type,
    message,
    actorName,
    targetName,
    timestamp: Date.now(),
  };
}

function appendLog(log: ActionEvent[], event: ActionEvent): ActionEvent[] {
  return [event, ...log].slice(0, 80);
}

let colSeq = 1;
function makeColumn(topCard: Card | null, bottomCard: Card | null, faceUp = false): GridColumn {
  return {
    id: `col-${Date.now()}-${colSeq++}`,
    top: topCard ? { card: topCard, faceUp } : null,
    bottom: bottomCard ? { card: bottomCard, faceUp } : null,
  };
}

/**
 * Draws N cards from Draw Pile, always recycling Discard Pile (except top card) if Draw Pile runs out.
 */
function drawFromPile(
  drawPile: Card[],
  discardPile: Card[],
  count: number,
  rng: () => number
): {
  drawn: Card[];
  drawPile: Card[];
  discardPile: Card[];
  didReshuffle: boolean;
} {
  let currentDraw = [...drawPile];
  let currentDiscard = [...discardPile];
  const drawn: Card[] = [];
  let didReshuffle = false;

  for (let i = 0; i < count; i++) {
    if (currentDraw.length === 0) {
      if (currentDiscard.length > 1) {
        const recycled = recycleDiscardIntoDraw(currentDiscard, rng);
        currentDraw = recycled.drawPile;
        currentDiscard = recycled.discardPile;
        didReshuffle = true;
      } else {
        break;
      }
    }
    const next = currentDraw.shift();
    if (next) drawn.push(next);
  }

  return {
    drawn,
    drawPile: currentDraw,
    discardPile: currentDiscard,
    didReshuffle,
  };
}

/**
 * Appends N face-down cards to the RIGHT side of a player's grid as new vertical columns (2 cards/column).
 */
function addPenaltyColumnsToPlayer(
  player: Player,
  cards: Card[],
  countAsExtraColumn = true
): Player {
  const newColumns: GridColumn[] = [...player.columns];
  let addedCols = 0;
  for (let i = 0; i < cards.length; i += 2) {
    const topCard = cards[i] ?? null;
    const bottomCard = cards[i + 1] ?? null;
    if (topCard || bottomCard) {
      newColumns.push(makeColumn(topCard, bottomCard, false));
      addedCols += 1;
    }
  }
  return {
    ...player,
    columns: newColumns,
    hasCalledUno: false,
    extraColumnsThisRound: countAsExtraColumn
      ? player.extraColumnsThisRound + addedCols
      : player.extraColumnsThisRound,
  };
}

export interface PlayerInit {
  id?: string;
  name: string;
  isAI?: boolean;
}

/**
 * Creates a brand-new UNO Zero Golf-style match (9 rounds by default) and deals Round 1.
 */
export function createMatch(
  playerInits: (string | PlayerInit)[],
  dealerIndex: number,
  config: GameConfig,
  rng: () => number = Math.random
): GameState {
  if (playerInits.length < 2 || playerInits.length > 8) {
    throw new Error('Jumlah pemain harus antara 2 sampai 8 orang.');
  }

  const players: Player[] = playerInits.map((item, idx) => {
    const normalized: PlayerInit =
      typeof item === 'string' ? { name: item, isAI: false } : item;
    return {
      id: normalized.id ?? `player-${idx + 1}`,
      name: normalized.name.trim() || `Pemain ${idx + 1}`,
      isAI: Boolean(normalized.isAI),
      connected: true,
      columns: [],
      totalScore: 0,
      hasFlippedInitial: false,
      hasCalledUno: false,
      eliminatedColumnsThisRound: 0,
      extraColumnsThisRound: 0,
    };
  });

  const safeDealer = ((dealerIndex % players.length) + players.length) % players.length;

  const baseState: GameState = {
    phase: 'setup',
    turnStep: 'choose_source',
    config,
    players,
    dealerIndex: safeDealer,
    currentPlayerIndex: getStartingPlayerIndex(safeDealer, players.length),
    direction: 1,
    roundNumber: 0,
    drawPile: [],
    discardPile: [],
    drawnCard: null,
    drawnFrom: null,
    pendingDiscardedAction: null,
    unoArmed: false,
    unoVulnerability: null,
    roundHistory: [],
    actionLog: [],
    lastEvent: null,
    winnerIds: [],
  };

  return startNewRound(baseState, rng);
}

/**
 * Deals a fresh round:
 * - Shuffles 112-card deck
 * - Deals 6 face-down cards to each player in a 2x3 grid
 * - Places remaining cards in Draw Pile and flips 1 top card to Discard Pile
 * - Round 1 starter: player to the left of the dealer
 * - Round 2+ starter: player with the LOWEST score in the previous round!
 */
export function startNewRound(
  state: GameState,
  rng: () => number = Math.random
): GameState {
  const nextRoundNumber = state.roundNumber + 1;
  const dealerIndex =
    state.roundNumber === 0
      ? state.dealerIndex
      : getNextPlayerIndex(state.dealerIndex, state.players.length, 1, 1);

  const rawDeck = createDeck(state.config.deckConfig);
  const minRequired = state.players.length * INITIAL_CARDS_PER_PLAYER + 1;
  if (rawDeck.length < minRequired) {
    throw new Error(
      `Jumlah kartu dalam deck (${rawDeck.length}) tidak cukup untuk ${state.players.length} pemain (minimal ${minRequired} kartu).`
    );
  }

  let deck = shuffleDeck(rawDeck, rng);

  const players: Player[] = state.players.map((p) => {
    const dealt = deck.slice(0, INITIAL_CARDS_PER_PLAYER);
    deck = deck.slice(INITIAL_CARDS_PER_PLAYER);
    const columns: GridColumn[] = [];
    for (let c = 0; c < INITIAL_COLUMNS; c++) {
      columns.push(makeColumn(dealt[c * 2], dealt[c * 2 + 1], false));
    }
    return {
      ...p,
      columns,
      hasFlippedInitial: false,
      hasCalledUno: false,
      eliminatedColumnsThisRound: 0,
      extraColumnsThisRound: 0,
    };
  });

  const firstDiscard = deck[0];
  const drawPile = deck.slice(1);

  // Starting player: Round 1 = left of dealer; Round 2+ = lowest-score player from previous round!
  let startingPlayerIdx = getStartingPlayerIndex(dealerIndex, players.length);
  if (state.roundHistory.length > 0) {
    const prevRound = state.roundHistory[state.roundHistory.length - 1];
    const lowestIdx = players.findIndex((p) => p.id === prevRound.lowestRoundPlayerId);
    if (lowestIdx !== -1) {
      startingPlayerIdx = lowestIdx;
    }
  }

  const startEvent = makeEvent(
    'info',
    `Ronde ${nextRoundNumber} / ${state.config.totalRounds} dimulai! Setiap pemain wajib membuka 1 kartu di grid 2×3. Mulai dari ${players[startingPlayerIdx].name}${
      state.roundHistory.length > 0 ? ' (skor terendah ronde sebelumnya)' : ''
    }.`,
    players[startingPlayerIdx].name
  );

  return {
    ...state,
    phase: 'initial_flip',
    turnStep: 'choose_source',
    players,
    dealerIndex,
    currentPlayerIndex: startingPlayerIdx,
    direction: 1,
    roundNumber: nextRoundNumber,
    drawPile,
    discardPile: [firstDiscard],
    drawnCard: null,
    drawnFrom: null,
    pendingDiscardedAction: null,
    unoArmed: false,
    unoVulnerability: null,
    actionLog: appendLog(state.actionLog, startEvent),
    lastEvent: startEvent,
    winnerIds: [],
  };
}

/**
 * Initial phase: each player flips exactly 1 face-down card in their 2x3 grid.
 */
export function flipInitialCard(
  state: GameState,
  columnIndex: number,
  position: SlotPosition
): GameState {
  if (state.phase !== 'initial_flip') return state;

  const player = state.players[state.currentPlayerIndex];
  const col = player.columns[columnIndex];
  if (!col) return state;
  const slot = col[position];
  if (!slot || slot.faceUp || !slot.card) return state;

  const updatedColumns = player.columns.map((c, idx) =>
    idx === columnIndex ? { ...c, [position]: { ...slot, faceUp: true } } : c
  );

  const players = state.players.map((p, idx) =>
    idx === state.currentPlayerIndex
      ? { ...p, columns: updatedColumns, hasFlippedInitial: true }
      : p
  );

  const allFlipped = players.every((p) => p.hasFlippedInitial);
  const nextPlayerIdx = getNextPlayerIndex(state.currentPlayerIndex, players.length, 1, 1);

  // When all flipped, the very first player who started initial_flip (nextPlayerIdx wraps back to them!) begins turn 1
  const event = allFlipped
    ? makeEvent(
        'flip',
        `${player.name} membuka ${formatCardName(slot.card)}. Semua pemain siap! Giliran pertama: ${players[nextPlayerIdx].name}.`,
        player.name,
        players[nextPlayerIdx].name
      )
    : makeEvent(
        'flip',
        `${player.name} membuka ${formatCardName(slot.card)}. Berikutnya ${players[nextPlayerIdx].name} buka 1 kartu awal.`,
        player.name,
        players[nextPlayerIdx].name
      );

  return {
    ...state,
    phase: allFlipped ? 'playing' : 'initial_flip',
    turnStep: 'choose_source',
    players,
    currentPlayerIndex: nextPlayerIdx,
    actionLog: appendLog(state.actionLog, event),
    lastEvent: event,
  };
}

/**
 * Active player draws the top card from Draw Pile OR Discard Pile.
 * Starting the next turn closes any previous player's UNO catch window.
 */
export function takeFromPile(
  state: GameState,
  source: 'draw' | 'discard',
  rng: () => number = Math.random
): GameState {
  if (state.phase !== 'playing' || state.turnStep !== 'choose_source') return state;

  const player = state.players[state.currentPlayerIndex];

  if (source === 'discard') {
    if (state.discardPile.length === 0) return state;
    const topDiscard = state.discardPile[state.discardPile.length - 1];
    const remainingDiscard = state.discardPile.slice(0, -1);

    const event = makeEvent(
      'draw',
      `${player.name} mengambil ${formatCardName(topDiscard)} dari Discard Pile. Pilih 1 kartu di grid untuk ditukar.`,
      player.name
    );

    return {
      ...state,
      turnStep: 'resolve_drawn',
      discardPile: remainingDiscard,
      drawnCard: topDiscard,
      drawnFrom: 'discard',
      unoVulnerability: null,
      actionLog: appendLog(state.actionLog, event),
      lastEvent: event,
    };
  }

  const result = drawFromPile(state.drawPile, state.discardPile, 1, rng);
  let actionLog = [...state.actionLog];
  if (result.didReshuffle) {
    actionLog = appendLog(
      actionLog,
      makeEvent('reshuffle', 'Draw Pile habis! Discard Pile dikocok ulang menjadi Draw Pile baru.')
    );
  }

  if (result.drawn.length === 0) {
    return finishRound({ ...state, unoVulnerability: null, actionLog }, player.id);
  }

  const card = result.drawn[0];
  const event = makeEvent(
    'draw',
    `${player.name} mengambil 1 kartu dari Draw Pile. Tukar dengan kartu di grid atau buang ke Discard Pile.`,
    player.name
  );

  return {
    ...state,
    turnStep: 'resolve_drawn',
    drawPile: result.drawPile,
    discardPile: result.discardPile,
    drawnCard: card,
    drawnFrom: 'draw',
    unoVulnerability: null,
    actionLog: appendLog(actionLog, event),
    lastEvent: event,
  };
}

/**
 * Active player swaps their drawn card with any slot in their grid.
 * CRITICAL RULE:
 * - If the incoming drawnCard is an Action Card, placing it into the grid does NOT trigger its action!
 * - Only the OLD card swapped OUT to the Discard Pile triggers its action effect (if it is an Action Card).
 */
export function swapWithGridSlot(
  state: GameState,
  columnIndex: number,
  position: SlotPosition,
  rng: () => number = Math.random
): GameState {
  if (state.phase !== 'playing' || state.turnStep !== 'resolve_drawn' || !state.drawnCard) {
    return state;
  }

  const player = state.players[state.currentPlayerIndex];
  const col = player.columns[columnIndex];
  if (!col) return state;
  const oldSlot = col[position];
  if (!oldSlot || !oldSlot.card) return state;

  const incomingCard = state.drawnCard;
  const discardedCard = oldSlot.card;

  const replacedColumns = player.columns.map((c, idx) =>
    idx === columnIndex
      ? { ...c, [position]: { card: incomingCard, faceUp: true } }
      : c
  );

  const newDiscardPile = [...state.discardPile, discardedCard];
  const swapEvent = makeEvent(
    'swap',
    `${player.name} menukar kartu di grid dengan ${formatCardName(incomingCard)} dan membuang ${formatCardName(discardedCard)}.`,
    player.name
  );

  return finalizePlayerGridMutation(
    {
      ...state,
      discardPile: newDiscardPile,
      drawnCard: null,
      drawnFrom: null,
      actionLog: appendLog(state.actionLog, swapEvent),
      lastEvent: swapEvent,
    },
    replacedColumns,
    isActionCard(discardedCard) ? discardedCard : null,
    rng
  );
}

/**
 * Only when drawn from Draw Pile: discard the drawn card directly to Discard Pile.
 * Player MUST then flip 1 face-down card in their own grid.
 */
export function discardDrawnCard(
  state: GameState,
  rng: () => number = Math.random
): GameState {
  if (
    state.phase !== 'playing' ||
    state.turnStep !== 'resolve_drawn' ||
    state.drawnFrom !== 'draw' ||
    !state.drawnCard
  ) {
    return state;
  }

  const player = state.players[state.currentPlayerIndex];
  const discarded = state.drawnCard;
  const newDiscardPile = [...state.discardPile, discarded];
  const faceDownLeft = countFaceDownCards(player.columns);

  const discardEvent = makeEvent(
    'discard',
    `${player.name} membuang ${formatCardName(discarded)} ke Discard Pile${
      faceDownLeft > 0 ? ' dan wajib membuka 1 kartu tertutup di grid-nya.' : '.'
    }`,
    player.name
  );

  if (faceDownLeft === 0) {
    return finalizePlayerGridMutation(
      {
        ...state,
        discardPile: newDiscardPile,
        drawnCard: null,
        drawnFrom: null,
        actionLog: appendLog(state.actionLog, discardEvent),
        lastEvent: discardEvent,
      },
      player.columns,
      isActionCard(discarded) ? discarded : null,
      rng
    );
  }

  return {
    ...state,
    turnStep: 'must_flip',
    discardPile: newDiscardPile,
    drawnCard: null,
    drawnFrom: null,
    pendingDiscardedAction: isActionCard(discarded) ? discarded : null,
    actionLog: appendLog(state.actionLog, discardEvent),
    lastEvent: discardEvent,
  };
}

/**
 * Mandatory flip after discarding a card drawn from the Draw Pile.
 */
export function flipGridCardAfterDiscard(
  state: GameState,
  columnIndex: number,
  position: SlotPosition,
  rng: () => number = Math.random
): GameState {
  if (state.phase !== 'playing' || state.turnStep !== 'must_flip') return state;

  const player = state.players[state.currentPlayerIndex];
  const col = player.columns[columnIndex];
  if (!col) return state;
  const slot = col[position];
  if (!slot || slot.faceUp || !slot.card) return state;

  const updatedColumns = player.columns.map((c, idx) =>
    idx === columnIndex ? { ...c, [position]: { ...slot, faceUp: true } } : c
  );

  const flipEvent = makeEvent(
    'flip',
    `${player.name} membuka kartu ${formatCardName(slot.card)} di grid-nya.`,
    player.name
  );

  const pendingAction = state.pendingDiscardedAction;

  return finalizePlayerGridMutation(
    {
      ...state,
      pendingDiscardedAction: null,
      actionLog: appendLog(state.actionLog, flipEvent),
      lastEvent: flipEvent,
    },
    updatedColumns,
    pendingAction,
    rng
  );
}

/**
 * Finalizes a player's grid mutation:
 * 1. Eliminates & removes matching vertical columns (same color OR same number).
 * 2. Checks UNO status (exact 1 face-down card left).
 * 3. Checks round end (0 face-down cards left).
 * 4. Triggers discarded Action Card (if any) and advances turn.
 */
function finalizePlayerGridMutation(
  state: GameState,
  newColumns: GridColumn[],
  discardedAction: Card | null,
  rng: () => number
): GameState {
  const player = state.players[state.currentPlayerIndex];
  let actionLog = [...state.actionLog];
  let lastEvent = state.lastEvent;

  // 1. Column Match Elimination (removes matched columns cleanly from grid!)
  const matchResult = eliminateMatchingColumns(newColumns);
  const finalColumns = matchResult.columns;
  const eliminatedSoFar = player.eliminatedColumnsThisRound + matchResult.eliminatedCount;

  if (matchResult.eliminatedCount > 0) {
    lastEvent = makeEvent(
      'column_match',
      `KOLOM TERELIMINASI! ${player.name} menyingkirkan ${matchResult.eliminatedCount} kolom vertikal yang cocok (0 poin)!`,
      player.name
    );
    actionLog = appendLog(actionLog, lastEvent);
  }

  // 2. Check UNO (1 face-down card left)
  const faceDownRemaining = countFaceDownCards(finalColumns);
  let hasCalledUno = player.hasCalledUno;
  let unoVulnerability = state.unoVulnerability;

  if (faceDownRemaining === 1) {
    if (state.unoArmed || player.hasCalledUno) {
      hasCalledUno = true;
      unoVulnerability = null;
    } else {
      hasCalledUno = false;
      unoVulnerability = {
        playerId: player.id,
        playerName: player.name,
        createdAt: Date.now(),
      };
    }
  } else {
    hasCalledUno = false;
    unoVulnerability = null;
  }

  const players = state.players.map((p, idx) =>
    idx === state.currentPlayerIndex
      ? {
          ...p,
          columns: finalColumns,
          hasCalledUno,
          eliminatedColumnsThisRound: eliminatedSoFar,
        }
      : p
  );

  // 3. Round End Check: all cards face-up or eliminated
  if (faceDownRemaining === 0) {
    return finishRound(
      {
        ...state,
        players,
        unoArmed: false,
        unoVulnerability: null,
        actionLog,
        lastEvent,
      },
      player.id
    );
  }

  // 4. Discarded Action Card Effects
  if (discardedAction?.type === 'double_draw2') {
    const promptEvent = makeEvent(
      'double_draw2',
      `DOUBLE DRAW TWO! ${player.name}, pilih target untuk +4 kartu tertutup (2 kolom) atau bagi +2 kartu ke 2 lawan!`,
      player.name
    );
    return {
      ...state,
      phase: 'choose_double_draw2_target',
      turnStep: 'choose_source',
      players,
      pendingDiscardedAction: discardedAction,
      unoArmed: false,
      unoVulnerability,
      actionLog: appendLog(actionLog, promptEvent),
      lastEvent: promptEvent,
    };
  }

  return applyStandardActionAndAdvance(
    {
      ...state,
      players,
      unoArmed: false,
      unoVulnerability,
      actionLog,
      lastEvent,
    },
    discardedAction,
    rng
  );
}

function applyStandardActionAndAdvance(
  state: GameState,
  actionCard: Card | null,
  rng: () => number
): GameState {
  const actor = state.players[state.currentPlayerIndex];
  let players = [...state.players];
  let drawPile = [...state.drawPile];
  let discardPile = [...state.discardPile];
  let direction: PlayDirection = state.direction;
  let nextPlayerIndex = getNextPlayerIndex(state.currentPlayerIndex, players.length, direction, 1);
  let actionLog = [...state.actionLog];
  let lastEvent = state.lastEvent;

  if (actionCard?.type === 'skip') {
    const skipped = players[nextPlayerIndex];
    nextPlayerIndex = getNextPlayerIndex(state.currentPlayerIndex, players.length, direction, 2);
    lastEvent = makeEvent(
      'skip',
      `SKIP! Giliran ${skipped.name} dilewati.`,
      actor.name,
      skipped.name
    );
    actionLog = appendLog(actionLog, lastEvent);
  } else if (actionCard?.type === 'reverse') {
    const rev = resolveReverseTurn(
      state.currentPlayerIndex,
      players.length,
      direction,
      state.config.houseRules.reverseInTwoPlayers
    );
    direction = rev.nextDirection;
    nextPlayerIndex = rev.nextPlayerIndex;
    const dirLabel = direction === 1 ? 'Searah Jarum Jam' : 'Berlawanan Jarum Jam';
    lastEvent = makeEvent(
      'reverse',
      `REVERSE! Arah giliran berbalik menjadi ${dirLabel}.${
        rev.skippedOpponent ? ` ${actor.name} mendapat giliran lagi!` : ''
      }`,
      actor.name
    );
    actionLog = appendLog(actionLog, lastEvent);
  } else if (actionCard?.type === 'draw2') {
    const targetIdx = nextPlayerIndex;
    const target = players[targetIdx];
    const drawnRes = drawFromPile(drawPile, discardPile, 2, rng);
    drawPile = drawnRes.drawPile;
    discardPile = drawnRes.discardPile;

    if (drawnRes.didReshuffle) {
      actionLog = appendLog(
        actionLog,
        makeEvent('reshuffle', 'Draw Pile habis! Discard Pile dikocok ulang.')
      );
    }

    if (drawnRes.drawn.length > 0) {
      players[targetIdx] = addPenaltyColumnsToPlayer(target, drawnRes.drawn, true);
    }

    lastEvent = makeEvent(
      'draw2',
      `DRAW TWO! ${target.name} mengambil ${drawnRes.drawn.length} kartu tertutup sebagai 1 kolom baru di sisi kanan grid-nya!`,
      actor.name,
      target.name
    );
    actionLog = appendLog(actionLog, lastEvent);
  }

  return {
    ...state,
    phase: 'playing',
    turnStep: 'choose_source',
    players,
    drawPile,
    discardPile,
    direction,
    currentPlayerIndex: nextPlayerIndex,
    pendingDiscardedAction: null,
    actionLog,
    lastEvent,
  };
}

/**
 * Resolves Double Draw Two target selection:
 * - 1 targetId -> 4 face-down cards (2 new columns) to that opponent
 * - 2 distinct targetIds -> 2 face-down cards (1 new column) each
 */
export function resolveDoubleDrawTwo(
  state: GameState,
  targetIds: string[],
  rng: () => number = Math.random
): GameState {
  if (state.phase !== 'choose_double_draw2_target') return state;

  const actor = state.players[state.currentPlayerIndex];
  const validTargets = Array.from(new Set(targetIds.filter((id) => id !== actor.id)));
  if (validTargets.length === 0 || validTargets.length > 2) return state;

  let drawPile = [...state.drawPile];
  let discardPile = [...state.discardPile];
  const players = [...state.players];
  let actionLog = [...state.actionLog];

  if (validTargets.length === 1) {
    const targetIdx = players.findIndex((p) => p.id === validTargets[0]);
    if (targetIdx === -1) return state;

    const drawnRes = drawFromPile(drawPile, discardPile, 4, rng);
    drawPile = drawnRes.drawPile;
    discardPile = drawnRes.discardPile;

    if (drawnRes.drawn.length > 0) {
      players[targetIdx] = addPenaltyColumnsToPlayer(players[targetIdx], drawnRes.drawn, true);
    }

    const evt = makeEvent(
      'double_draw2',
      `DOUBLE DRAW TWO! ${players[targetIdx].name} menerima ${drawnRes.drawn.length} kartu tertutup (2 kolom baru)!`,
      actor.name,
      players[targetIdx].name
    );
    actionLog = appendLog(actionLog, evt);

    return {
      ...state,
      phase: 'playing',
      turnStep: 'choose_source',
      players,
      drawPile,
      discardPile,
      currentPlayerIndex: getNextPlayerIndex(
        state.currentPlayerIndex,
        players.length,
        state.direction,
        1
      ),
      pendingDiscardedAction: null,
      actionLog,
      lastEvent: evt,
    };
  }

  const targetNames: string[] = [];
  for (const tid of validTargets) {
    const targetIdx = players.findIndex((p) => p.id === tid);
    if (targetIdx === -1) return state;
    const drawnRes = drawFromPile(drawPile, discardPile, 2, rng);
    drawPile = drawnRes.drawPile;
    discardPile = drawnRes.discardPile;
    if (drawnRes.drawn.length > 0) {
      players[targetIdx] = addPenaltyColumnsToPlayer(players[targetIdx], drawnRes.drawn, true);
    }
    targetNames.push(players[targetIdx].name);
  }

  const evt = makeEvent(
    'double_draw2',
    `DOUBLE DRAW TWO! ${targetNames[0]} dan ${targetNames[1]} masing-masing menerima 2 kartu tertutup (1 kolom baru)!`,
    actor.name,
    targetNames.join(' & ')
  );
  actionLog = appendLog(actionLog, evt);

  return {
    ...state,
    phase: 'playing',
    turnStep: 'choose_source',
    players,
    drawPile,
    discardPile,
    currentPlayerIndex: getNextPlayerIndex(
      state.currentPlayerIndex,
      players.length,
      state.direction,
      1
    ),
    pendingDiscardedAction: null,
    actionLog,
    lastEvent: evt,
  };
}

/**
 * Calls "UNO!" for the active player (at 1-2 face-down cards) OR saves a vulnerable player before being caught.
 */
export function callUno(state: GameState, callerPlayerId?: string): GameState {
  if (state.unoVulnerability) {
    // If callerPlayerId is specified (online mode), only the vulnerable player can call UNO to save themselves
    if (callerPlayerId && callerPlayerId !== state.unoVulnerability.playerId) {
      return state;
    }
    const { playerId, playerName } = state.unoVulnerability;
    const players = state.players.map((p) =>
      p.id === playerId ? { ...p, hasCalledUno: true } : p
    );
    const evt = makeEvent('uno_call', `${playerName} menyerukan "UNO!" tepat waktu!`, playerName);
    return {
      ...state,
      players,
      unoVulnerability: null,
      actionLog: appendLog(state.actionLog, evt),
      lastEvent: evt,
    };
  }

  if (state.phase === 'playing') {
    const player = state.players[state.currentPlayerIndex];
    if (callerPlayerId && callerPlayerId !== player.id) return state;
    const fd = countFaceDownCards(player.columns);
    if ((fd === 2 || fd === 1) && !state.unoArmed) {
      const evt = makeEvent('uno_call', `${player.name} menyerukan "UNO!"`, player.name);
      return {
        ...state,
        unoArmed: true,
        players:
          fd === 1
            ? state.players.map((p, idx) =>
                idx === state.currentPlayerIndex ? { ...p, hasCalledUno: true } : p
              )
            : state.players,
        actionLog: appendLog(state.actionLog, evt),
        lastEvent: evt,
      };
    }
  }

  return state;
}

/**
 * Another player challenges/catches a player who forgot to call "UNO!" when down to 1 face-down card.
 * Penalty: +2 face-down cards added as 1 new column to the caught player's grid.
 */
export function catchUno(
  state: GameState,
  catcherName?: string,
  rng: () => number = Math.random
): GameState {
  if (!state.unoVulnerability) return state;

  const { playerId, playerName } = state.unoVulnerability;
  const drawnRes = drawFromPile(state.drawPile, state.discardPile, 2, rng);

  const players = state.players.map((p) =>
    p.id === playerId ? addPenaltyColumnsToPlayer(p, drawnRes.drawn, true) : p
  );

  const evt = makeEvent(
    'uno_penalty',
    `TERTANGKAP${catcherName ? ` oleh ${catcherName}` : ''}! ${playerName} lupa menyerukan "UNO!" dan mendapat penalti +${drawnRes.drawn.length} kartu tertutup (1 kolom baru)!`,
    catcherName,
    playerName
  );

  return {
    ...state,
    players,
    drawPile: drawnRes.drawPile,
    discardPile: drawnRes.discardPile,
    unoVulnerability: null,
    actionLog: appendLog(state.actionLog, evt),
    lastEvent: evt,
  };
}

/**
 * Auto-resolves a turn when a player times out (20s AFK/disconnect in online mode).
 */
export function autoPlayTimeoutTurn(
  state: GameState,
  rng: () => number = Math.random
): GameState {
  const player = state.players[state.currentPlayerIndex];
  if (!player) return state;

  const findFirstFaceDown = (cols: readonly GridColumn[]): { colIdx: number; pos: SlotPosition } | null => {
    for (let i = 0; i < cols.length; i++) {
      if (cols[i].top && !cols[i].top!.faceUp) return { colIdx: i, pos: 'top' };
      if (cols[i].bottom && !cols[i].bottom!.faceUp) return { colIdx: i, pos: 'bottom' };
    }
    return null;
  };

  let next = state;

  if (next.phase === 'initial_flip') {
    const fd = findFirstFaceDown(player.columns);
    if (fd) {
      next = flipInitialCard(next, fd.colIdx, fd.pos);
    }
  } else if (next.phase === 'choose_double_draw2_target') {
    const opp = next.players.find((p) => p.id !== player.id);
    if (opp) {
      next = resolveDoubleDrawTwo(next, [opp.id], rng);
    }
  } else if (next.phase === 'playing') {
    if (next.turnStep === 'choose_source') {
      next = takeFromPile(next, 'draw', rng);
    }
    if (next.phase === 'playing' && next.turnStep === 'resolve_drawn') {
      if (next.drawnFrom === 'draw') {
        next = discardDrawnCard(next, rng);
      } else {
        const fd = findFirstFaceDown(next.players[next.currentPlayerIndex].columns) ?? {
          colIdx: 0,
          pos: 'top' as SlotPosition,
        };
        next = swapWithGridSlot(next, fd.colIdx, fd.pos, rng);
      }
    }
    if (next.phase === 'playing' && next.turnStep === 'must_flip') {
      const fd = findFirstFaceDown(next.players[next.currentPlayerIndex].columns);
      if (fd) {
        next = flipGridCardAfterDiscard(next, fd.colIdx, fd.pos, rng);
      }
    }
  }

  const timeoutEvt = makeEvent(
    'timeout',
    `Waktu giliran ${player.name} habis (20 detik)! Sistem menjalankan langkah otomatis.`,
    player.name
  );

  return {
    ...next,
    actionLog: appendLog(next.actionLog, timeoutEvt),
    lastEvent: timeoutEvt,
  };
}

/**
 * Ends the round:
 * 1. Reveals ALL face-down cards in every player's grid.
 * 2. Re-checks vertical column matches (same number or same color) and eliminates them.
 * 3. Calculates each player's round score from remaining grid cards.
 * 4. Identifies lowest-score player of this round (will start first in next round!).
 * 5. Ends match after totalRounds (default 9) and crowns lowest cumulative score winner!
 */
export function finishRound(state: GameState, triggerPlayerId: string): GameState {
  const scores: RoundPlayerScore[] = [];
  const actionPts = state.config.houseRules.actionCardPoints;

  const updatedPlayers: Player[] = state.players.map((p) => {
    const revealedCols: GridColumn[] = p.columns.map((col) => ({
      ...col,
      top: col.top ? { ...col.top, faceUp: true } : null,
      bottom: col.bottom ? { ...col.bottom, faceUp: true } : null,
    }));

    const { columns: cleanedCols, eliminatedCount } = eliminateMatchingColumns(revealedCols);
    const totalEliminated = p.eliminatedColumnsThisRound + eliminatedCount;

    const points = calculateGridPoints(cleanedCols, actionPts);
    const cumulativeTotal = p.totalScore + points;

    scores.push({
      playerId: p.id,
      playerName: p.name,
      points,
      remainingCards: getGridCards(cleanedCols),
      eliminatedColumnsCount: totalEliminated,
      extraColumnsAdded: p.extraColumnsThisRound,
      cumulativeTotal,
    });

    return {
      ...p,
      columns: cleanedCols,
      totalScore: cumulativeTotal,
      eliminatedColumnsThisRound: totalEliminated,
    };
  });

  const triggerPlayer = updatedPlayers.find((p) => p.id === triggerPlayerId);
  const lowestRoundScore = Math.min(...scores.map((s) => s.points));
  const lowestRoundEntry = scores.find((s) => s.points === lowestRoundScore) ?? scores[0];

  const roundRecord: RoundRecord = {
    roundNumber: state.roundNumber,
    triggerPlayerId,
    triggerPlayerName: triggerPlayer?.name ?? '',
    lowestRoundPlayerId: lowestRoundEntry?.playerId ?? updatedPlayers[0].id,
    scores,
    completedAt: Date.now(),
  };

  const roundHistory = [...state.roundHistory, roundRecord];
  const isFinalRound = state.roundNumber >= state.config.totalRounds;

  if (isFinalRound) {
    const minScore = Math.min(...updatedPlayers.map((p) => p.totalScore));
    const winners = updatedPlayers.filter((p) => p.totalScore === minScore);
    const winnerNames = winners.map((w) => w.name).join(' & ');

    const winEvent = makeEvent(
      'game_win',
      `${state.config.totalRounds} RONDE SELESAI! ${winnerNames} menang dengan total skor terendah (${minScore} poin)!`,
      winnerNames
    );

    return {
      ...state,
      phase: 'game_over',
      turnStep: 'choose_source',
      players: updatedPlayers,
      drawnCard: null,
      drawnFrom: null,
      pendingDiscardedAction: null,
      unoArmed: false,
      unoVulnerability: null,
      roundHistory,
      winnerIds: winners.map((w) => w.id),
      actionLog: appendLog(state.actionLog, winEvent),
      lastEvent: winEvent,
    };
  }

  const roundEndEvent = makeEvent(
    'round_end',
    `Ronde ${state.roundNumber} selesai! Skor terendah ronde ini: ${lowestRoundEntry?.playerName ?? ''} (${lowestRoundScore} poin) akan memulai ronde berikutnya.`,
    triggerPlayer?.name
  );

  return {
    ...state,
    phase: 'round_over',
    turnStep: 'choose_source',
    players: updatedPlayers,
    drawnCard: null,
    drawnFrom: null,
    pendingDiscardedAction: null,
    unoArmed: false,
    unoVulnerability: null,
    roundHistory,
    actionLog: appendLog(state.actionLog, roundEndEvent),
    lastEvent: roundEndEvent,
  };
}

/**
 * Anti-cheat sanitizer for Online Multiplayer:
 * Strips ALL face-down card data, strips Draw Pile contents (exposes drawPileCount only),
 * and hides active player's drawn card (if drawn from Draw Pile) from other players.
 */
export function sanitizeGameStateForPlayer(state: GameState, viewerPlayerId: string): GameState {
  const activePlayer = state.players[state.currentPlayerIndex];
  const isViewerActive = activePlayer?.id === viewerPlayerId;

  const sanitizedPlayers: Player[] = state.players.map((p) => ({
    ...p,
    columns: p.columns.map((col) => ({
      ...col,
      top: col.top ? { faceUp: col.top.faceUp, card: col.top.faceUp ? col.top.card : null } : null,
      bottom: col.bottom
        ? { faceUp: col.bottom.faceUp, card: col.bottom.faceUp ? col.bottom.card : null }
        : null,
    })),
  }));

  const hideDrawn =
    state.drawnCard !== null && state.drawnFrom === 'draw' && !isViewerActive;

  return {
    ...state,
    players: sanitizedPlayers,
    drawPile: [],
    drawPileCount: state.drawPile.length,
    drawnCard: hideDrawn ? null : state.drawnCard,
    hasHiddenDrawnCard: hideDrawn,
  };
}

export function getRankedPlayers(players: readonly Player[]): Player[] {
  return [...players].sort((a, b) => a.totalScore - b.totalScore);
}
