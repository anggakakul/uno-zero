import {
  appendEvent,
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
  RummyMeld,
  RummyTurnTransaction,
  UnoRuleset,
  ValidationResult,
  VariantSettings,
} from '../types';
import { STANDARD_COLORS } from './baseHelpers';

const RUMMY_PLAIN_NUMBERS = [1, 3, 4, 6, 8, 9, 10, 11, 12] as const;

/**
 * Official 100-Tile UNO RUMMY-UP Deck (2–4 players):
 * - 72 Number Tiles: 1, 3, 4, 6, 8, 9, 10, 11, 12 (×2 per 4 colors = 72)
 * - 24 Word/Number Tiles: Draw 2 (#2), Skip (#5), Reverse (#7) (×2 per 4 colors = 24)
 * -  4 Wild Draw Four Tiles
 * Total = 72 + 24 + 4 = 100 tiles!
 */
function buildRummyDeck(): HubCard[] {
  const tiles: HubCard[] = [];
  for (const color of STANDARD_COLORS) {
    for (const v of RUMMY_PLAIN_NUMBERS) {
      tiles.push({ id: uid('rmy'), color, type: 'number', value: v, rummyEffectConsumed: false });
      tiles.push({ id: uid('rmy'), color, type: 'number', value: v, rummyEffectConsumed: false });
    }
    for (let i = 0; i < 2; i += 1) {
      tiles.push({ id: uid('rmy'), color, type: 'draw2', value: 2, rummyEffectConsumed: false });
      tiles.push({ id: uid('rmy'), color, type: 'skip', value: 5, rummyEffectConsumed: false });
      tiles.push({ id: uid('rmy'), color, type: 'reverse', value: 7, rummyEffectConsumed: false });
    }
  }
  for (let i = 0; i < 4; i += 1) {
    tiles.push({ id: uid('rmy'), color: 'wild', type: 'wild_draw4', rummyEffectConsumed: false });
  }
  return tiles;
}

export function isRummyWordOrWild(tile: HubCard): boolean {
  return (
    tile.type === 'draw2' ||
    tile.type === 'skip' ||
    tile.type === 'reverse' ||
    tile.type === 'wild_draw4' ||
    tile.type === 'wild_rummy'
  );
}

/**
 * Official UNO RUMMY-UP Scoring:
 * - Plain Number tiles (1,3,4,6,8,9,10,11,12) = face value
 * - Word/Number tiles (Draw 2 #2, Skip #5, Reverse #7) = 20 pts
 * - Wild Draw Four = 50 pts
 */
export function getRummyCardPoints(tile: HubCard): number {
  if (tile.type === 'wild_draw4' || tile.type === 'wild_rummy' || tile.color === 'wild') return 50;
  if (tile.type === 'draw2' || tile.type === 'skip' || tile.type === 'reverse') return 20;
  return tile.value ?? 0;
}

export function calculateRummyRackPoints(hand: HubCard[]): number {
  return hand.reduce((sum, t) => sum + getRummyCardPoints(t), 0);
}

/**
 * Official Set Validator:
 * - 3–4 tiles, same number value, ALL distinct colors, max 1 Wild!
 */
export function isValidRummySet(tiles: HubCard[]): boolean {
  if (tiles.length < 3 || tiles.length > 4) return false;
  const wilds = tiles.filter((t) => t.color === 'wild');
  if (wilds.length > 1) return false;

  const reals = tiles.filter((t) => t.color !== 'wild');
  if (reals.length < 2) return false;

  const targetNum = reals[0].value;
  if (targetNum === undefined) return false;
  const seenColors = new Set<string>();
  for (const t of reals) {
    if (t.value !== targetNum) return false;
    if (seenColors.has(t.color)) return false;
    seenColors.add(t.color);
  }
  return true;
}

/**
 * Official Run Validator:
 * - 3–12 tiles, same color, consecutive numbers in 1..12.
 * - Multiple Wilds allowed ONLY IF NON-CONSECUTIVE (no two adjacent Wilds)!
 */
export function isValidRummyRun(tiles: HubCard[]): boolean {
  if (tiles.length < 3 || tiles.length > 12) return false;

  // No two adjacent Wilds!
  for (let i = 0; i < tiles.length - 1; i += 1) {
    if (tiles[i].color === 'wild' && tiles[i + 1].color === 'wild') {
      return false;
    }
  }

  const firstRealIdx = tiles.findIndex((t) => t.color !== 'wild');
  if (firstRealIdx < 0) return false;

  const runColor = tiles[firstRealIdx].color;
  const startNum = (tiles[firstRealIdx].value ?? 0) - firstRealIdx;
  if (startNum < 1 || startNum + tiles.length - 1 > 12) return false;

  for (let i = 0; i < tiles.length; i += 1) {
    const t = tiles[i];
    if (t.color === 'wild') continue;
    if (t.color !== runColor || t.value !== startNum + i) return false;
  }
  return true;
}

/**
 * Finds an available valid Run or Set (3–4 tiles, max 4 from rack, optionally using Starting Tiles on table).
 */
export function findAvailableMeld(
  hand: HubCard[],
  _legacyMin15 = false,
  startingSingles: RummyMeld[] = []
): { kind: 'set' | 'run'; cards: HubCard[]; points: number; usedStartingMeldIds: string[] } | null {
  const startingTiles = startingSingles
    .filter((m) => m.kind === 'starting_single' && m.cards.length === 1)
    .map((m) => ({ meldId: m.id, tile: m.cards[0] }));
  const pool = [...hand, ...startingTiles.map((s) => s.tile)];
  const startingIdMap = new Map(startingTiles.map((s) => [s.tile.id, s.meldId]));

  const reals = pool.filter((c) => c.color !== 'wild' && c.value !== undefined);
  const wilds = pool.filter((c) => c.color === 'wild');

  // 1. Check Set (3–4 same value, distinct colors, max 1 wild)
  const byValue = new Map<number, HubCard[]>();
  for (const c of reals) {
    const arr = byValue.get(c.value!) ?? [];
    if (!arr.some((x) => x.color === c.color)) {
      arr.push(c);
      byValue.set(c.value!, arr);
    }
  }
  for (const [, group] of byValue) {
    const candidate =
      group.length >= 3
        ? group.slice(0, 3)
        : group.length === 2 && wilds.length >= 1
        ? [group[0], group[1], wilds[0]]
        : null;
    if (candidate && isValidRummySet(candidate)) {
      const rackCount = candidate.filter((c) => !startingIdMap.has(c.id)).length;
      if (rackCount >= 1 && rackCount <= 4) {
        return {
          kind: 'set',
          cards: candidate,
          points: calculateRummyRackPoints(candidate),
          usedStartingMeldIds: candidate
            .map((c) => startingIdMap.get(c.id))
            .filter((id): id is string => Boolean(id)),
        };
      }
    }
  }

  // 2. Check Run (3 consecutive same color, non-consecutive wild allowed)
  for (const color of STANDARD_COLORS) {
    const colTiles = reals
      .filter((c) => c.color === color)
      .sort((a, b) => (a.value ?? 0) - (b.value ?? 0));
    const unique: HubCard[] = [];
    for (const c of colTiles) {
      if (!unique.some((u) => u.value === c.value)) unique.push(c);
    }
    // 3 consecutive real tiles
    for (let i = 0; i <= unique.length - 3; i += 1) {
      const trio = [unique[i], unique[i + 1], unique[i + 2]];
      if (isValidRummyRun(trio)) {
        const rackCount = trio.filter((c) => !startingIdMap.has(c.id)).length;
        if (rackCount >= 1 && rackCount <= 4) {
          return {
            kind: 'run',
            cards: trio,
            points: calculateRummyRackPoints(trio),
            usedStartingMeldIds: trio
              .map((c) => startingIdMap.get(c.id))
              .filter((id): id is string => Boolean(id)),
          };
        }
      }
    }
    // 2 tiles with 1 gap bridged by a Wild (e.g. 4, W, 6)
    if (wilds.length >= 1) {
      for (let i = 0; i <= unique.length - 2; i += 1) {
        if ((unique[i + 1].value ?? 0) === (unique[i].value ?? 0) + 2) {
          const trio = [unique[i], wilds[0], unique[i + 1]];
          if (isValidRummyRun(trio)) {
            const rackCount = trio.filter((c) => !startingIdMap.has(c.id)).length;
            if (rackCount >= 1 && rackCount <= 4) {
              return {
                kind: 'run',
                cards: trio,
                points: calculateRummyRackPoints(trio),
                usedStartingMeldIds: trio
                  .map((c) => startingIdMap.get(c.id))
                  .filter((id): id is string => Boolean(id)),
              };
            }
          }
        }
      }
    }
  }

  return null;
}

/** Find an existing table Run or Set that this tile can legally extend */
export function findLayOffTarget(tile: HubCard, melds: RummyMeld[] = []): RummyMeld | null {
  for (const m of melds) {
    if (m.kind === 'starting_single') continue;
    if (m.kind === 'set') {
      if (isValidRummySet([...m.cards, tile])) return m;
    }
    if (m.kind === 'run') {
      if (isValidRummyRun([tile, ...m.cards])) return m;
      if (isValidRummyRun([...m.cards, tile])) return m;
    }
  }
  return null;
}

/**
 * Wild Substitution: swaps a real tile from rack for a Wild on the table.
 * The freed Wild MUST be played onto the table before ending the turn!
 */
export function substituteWildOnBoard(
  state: HubGameState,
  playerId: string,
  meldId: string,
  replacementTileId: string
): HubGameState {
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId || state.phase !== 'playing') return state;

  const replacement = current.hand.find((c) => c.id === replacementTileId && c.color !== 'wild');
  const targetMeld = (state.rummyMelds ?? []).find((m) => m.id === meldId);
  if (!replacement || !targetMeld) return state;

  const wildIdx = targetMeld.cards.findIndex((c) => c.color === 'wild');
  if (wildIdx < 0) return state;

  const freedWild = targetMeld.cards[wildIdx];
  const candidateCards = targetMeld.cards.map((c, idx) => (idx === wildIdx ? replacement : c));
  const validSwap =
    targetMeld.kind === 'set'
      ? isValidRummySet(candidateCards)
      : isValidRummyRun(candidateCards);
  if (!validSwap) return state;

  const tx: RummyTurnTransaction = state.rummyTransaction ?? {
    actorId: playerId,
    snapshotMelds: state.rummyMelds ?? [],
    snapshotHand: current.hand,
    rackTileIdsPlayed: [],
    pendingSubstitutedWildIds: [],
    triggeredActionTiles: [],
  };

  if (tx.rackTileIdsPlayed.length >= 4) return state;

  const updatedMelds = (state.rummyMelds ?? []).map((m) =>
    m.id === meldId ? { ...m, cards: candidateCards } : m
  );
  const newHand = [...current.hand.filter((c) => c.id !== replacement.id), freedWild];
  const players = state.players.map((p, i) =>
    i === state.currentPlayerIndex ? { ...p, hand: newHand } : p
  );

  const triggered =
    isRummyWordOrWild(replacement) && !replacement.rummyEffectConsumed
      ? [...tx.triggeredActionTiles, replacement]
      : tx.triggeredActionTiles;

  return appendEvent(
    {
      ...state,
      players,
      rummyMelds: updatedMelds,
      unoVulnerablePlayerId: null, // Catch window closes as soon as next player touches a tile!
      rummyTransaction: {
        ...tx,
        rackTileIdsPlayed: [...tx.rackTileIdsPlayed, replacement.id],
        pendingSubstitutedWildIds: [...tx.pendingSubstitutedWildIds, freedWild.id],
        triggeredActionTiles: triggered,
      },
    },
    'rummy_meld',
    `🔄 SUBSTITUSI WILD! ${current.name} menukar ${getColorLabel(replacement.color)} ${replacement.value} untuk mengambil Wild dari meja (wajib langsung dipakai giliran ini)!`
  );
}

/** Revert all board & rack changes made during the current turn back to snapshot! */
export function revertRummyTurn(state: HubGameState, playerId: string): HubGameState {
  const tx = state.rummyTransaction;
  if (!tx || tx.actorId !== playerId) return state;
  const players = state.players.map((p) =>
    p.id === playerId ? { ...p, hand: tx.snapshotHand } : p
  );
  return appendEvent(
    {
      ...state,
      phase: 'playing',
      players,
      rummyMelds: tx.snapshotMelds,
      rummyTransaction: null,
      pendingPrompt: null,
    },
    'info',
    `↩️ Giliran di-revert ke posisi awal!`
  );
}

/** Execute a single Word/Wild Tile effect and finalize turn transition */
function applyChosenRummyEffectAndAdvance(
  state: HubGameState,
  actorIdx: number,
  chosenTile: HubCard | null
): HubGameState {
  let players = [...state.players];
  let drawPile = [...state.drawPile];
  let direction = state.direction;
  let steps = 1;
  let effectMsg = '';

  const actor = players[actorIdx];

  // Mark ALL tiles currently on the board as effectConsumed = true (single-use rule!)
  const consumedMelds = (state.rummyMelds ?? []).map((m) => ({
    ...m,
    cards: m.cards.map((c) => ({ ...c, rummyEffectConsumed: true })),
  }));

  if (chosenTile && !chosenTile.rummyEffectConsumed) {
    if (chosenTile.type === 'reverse') {
      if (players.length === 2) {
        steps = 2;
        effectMsg = ' 🔄 REVERSE (2 pemain = Skip)!';
      } else {
        direction = (direction * -1) as 1 | -1;
        effectMsg = ` 🔄 REVERSE! Arah dibalik (${direction === 1 ? '↻' : '↺'}).`;
      }
    } else if (chosenTile.type === 'skip') {
      steps = 2;
      effectMsg = ' 🚫 SKIP! Pemain berikutnya dilewati!';
    } else if (chosenTile.type === 'draw2') {
      const victimIdx = getNextPlayerIndex(players, actorIdx, direction, 1);
      const drawn = drawPile.splice(0, Math.min(2, drawPile.length));
      players = players.map((p, i) =>
        i === victimIdx ? { ...p, hand: [...p.hand, ...drawn], calledUno: false } : p
      );
      steps = 2;
      effectMsg = ` 💥 DRAW 2 (#2)! ${players[victimIdx].name} ambil ${drawn.length} tile & dilewati!`;
    } else if (chosenTile.type === 'wild_draw4') {
      const victimIdx = getNextPlayerIndex(players, actorIdx, direction, 1);
      const drawn = drawPile.splice(0, Math.min(4, drawPile.length));
      players = players.map((p, i) =>
        i === victimIdx ? { ...p, hand: [...p.hand, ...drawn], calledUno: false } : p
      );
      steps = 2;
      effectMsg = ` 💥 WILD DRAW 4! ${players[victimIdx].name} ambil ${drawn.length} tile & dilewati!`;
    }
  }

  // UNO! Catch Window: ONLY opens after End Turn if actor has EXACTLY 1 tile left without calling UNO!
  const unoVulnerablePlayerId =
    actor.hand.length === 1 && !actor.calledUno ? actor.id : null;

  let next = appendEvent(
    {
      ...state,
      phase: 'playing',
      players,
      drawPile,
      direction,
      rummyMelds: consumedMelds,
      rummyTransaction: null,
      pendingPrompt: null,
      drawnPlayableCardId: null,
      hasDrawnThisTurn: false,
      unoVulnerablePlayerId,
    },
    'rummy_meld',
    `✅ ${actor.name} mengakhiri giliran.${effectMsg}`
  );

  // Check immediate win (even if actor went from 2-4 tiles -> 0 in 1 turn without UNO!)
  next = unoRummyUpRuleset.checkWinCondition(next);
  if (next.phase === 'round_over' || next.phase === 'game_over') return next;
  return unoRummyUpRuleset.advanceTurn(next, steps);
}

/** Validate & Commit the active turn transaction (1–4 rack tiles, no pending Wilds, all melds valid) */
export function commitRummyTurn(state: HubGameState, playerId: string): HubGameState {
  const tx = state.rummyTransaction;
  if (!tx || tx.actorId !== playerId) return state;

  if (tx.rackTileIdsPlayed.length < 1 || tx.rackTileIdsPlayed.length > 4) {
    return appendEvent(
      state,
      'uno_penalty',
      '❌ Wajib memainkan minimal 1 dan maksimal 4 tile dari rak sebelum End Turn!'
    );
  }
  if (tx.pendingSubstitutedWildIds.length > 0) {
    return appendEvent(
      state,
      'uno_penalty',
      '❌ Wild hasil substitusi WAJIB langsung digunakan di meja pada giliran ini!'
    );
  }

  for (const m of state.rummyMelds ?? []) {
    if (m.kind === 'starting_single' && m.cards.length === 1) continue;
    if (!isValidRummyRun(m.cards) && !isValidRummySet(m.cards)) {
      return appendEvent(
        state,
        'uno_penalty',
        '❌ Ada kombinasi Run/Set di meja yang tidak valid! Perbaiki atau klik Revert.'
      );
    }
  }

  const actorIdx = state.players.findIndex((p) => p.id === playerId);
  const actor = state.players[actorIdx];

  // If actor emptied their rack -> instant win!
  if (actor && actor.hand.length === 0) {
    return applyChosenRummyEffectAndAdvance(state, actorIdx, null);
  }

  // Multi-Word Tile Conflict: if >1 distinct Word/Wild effect played from rack, ask player to choose ONLY 1!
  const uniqueEffects = tx.triggeredActionTiles.filter(
    (t, idx, arr) => arr.findIndex((x) => x.type === t.type) === idx
  );
  if (uniqueEffects.length > 1) {
    return appendEvent(
      {
        ...state,
        phase: 'rummy_choose_effect',
        pendingPrompt: {
          type: 'rummy_choose_effect',
          actorId: playerId,
          message: `⚡ MULTI-WORD TILE! Kamu memainkan ${uniqueEffects.length} efek sekaligus. Pilih HANYA 1 efek yang aktif:`,
        },
      },
      'info',
      `⚡ ${actor.name} memilih 1 efek aktif dari ${uniqueEffects.length} Word/Wild Tile!`
    );
  }

  return applyChosenRummyEffectAndAdvance(state, actorIdx, uniqueEffects[0] ?? null);
}

/** Play an automatically found Meld (or commit immediately for smooth 1-click flow) */
export function playRummyMeld(state: HubGameState, playerId: string): HubGameState {
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId || state.phase !== 'playing') return state;

  const meld = findAvailableMeld(current.hand, false, state.rummyMelds ?? []);
  if (!meld) return state;

  const tx: RummyTurnTransaction = state.rummyTransaction ?? {
    actorId: playerId,
    snapshotMelds: state.rummyMelds ?? [],
    snapshotHand: current.hand,
    rackTileIdsPlayed: [],
    pendingSubstitutedWildIds: [],
    triggeredActionTiles: [],
  };

  const meldIds = new Set(meld.cards.map((c) => c.id));
  const usedRackTiles = current.hand.filter((c) => meldIds.has(c.id));
  if (tx.rackTileIdsPlayed.length + usedRackTiles.length > 4) {
    return appendEvent(state, 'uno_penalty', '❌ Batas maksimal 4 tile dari rak per giliran!');
  }

  const remaining = current.hand.filter((c) => !meldIds.has(c.id));
  const players = state.players.map((p, idx) =>
    idx === state.currentPlayerIndex ? { ...p, hand: remaining, hasOpenedMeld: true } : p
  );

  const usedStartSet = new Set(meld.usedStartingMeldIds);
  const filteredMelds = (state.rummyMelds ?? []).filter((m) => !usedStartSet.has(m.id));
  const newMelds: RummyMeld[] = [
    ...filteredMelds,
    { id: uid('mld'), ownerName: current.name, kind: meld.kind, cards: meld.cards },
  ];

  const newPendingWilds = tx.pendingSubstitutedWildIds.filter((wid) => !meldIds.has(wid));
  const newTriggered = [
    ...tx.triggeredActionTiles,
    ...usedRackTiles.filter((t) => isRummyWordOrWild(t) && !t.rummyEffectConsumed),
  ];

  const staged: HubGameState = appendEvent(
    {
      ...state,
      players,
      rummyMelds: newMelds,
      unoVulnerablePlayerId: null, // Catch window closed!
      rummyTransaction: {
        ...tx,
        rackTileIdsPlayed: [...tx.rackTileIdsPlayed, ...usedRackTiles.map((t) => t.id)],
        pendingSubstitutedWildIds: newPendingWilds,
        triggeredActionTiles: newTriggered,
      },
    },
    'rummy_meld',
    `🃏 MELD ${meld.kind.toUpperCase()} (${meld.points}pt)! ${current.name} menurunkan kombinasi ke meja!`
  );

  return commitRummyTurn(staged, playerId);
}

/** Lay Off 1 rack tile onto an existing valid Meld on the table! */
export function layOffCardToMeld(
  state: HubGameState,
  playerId: string,
  cardId: string
): HubGameState {
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId || state.phase !== 'playing') return state;
  const card = current.hand.find((c) => c.id === cardId);
  if (!card) return state;

  const targetMeld = findLayOffTarget(card, state.rummyMelds);
  if (!targetMeld) return state;

  const tx: RummyTurnTransaction = state.rummyTransaction ?? {
    actorId: playerId,
    snapshotMelds: state.rummyMelds ?? [],
    snapshotHand: current.hand,
    rackTileIdsPlayed: [],
    pendingSubstitutedWildIds: [],
    triggeredActionTiles: [],
  };

  const isSubstitutedWild = tx.pendingSubstitutedWildIds.includes(card.id);
  if (!isSubstitutedWild && tx.rackTileIdsPlayed.length >= 4) {
    return appendEvent(state, 'uno_penalty', '❌ Batas maksimal 4 tile dari rak per giliran!');
  }

  const remaining = current.hand.filter((c) => c.id !== card.id);
  const players = state.players.map((p, idx) =>
    idx === state.currentPlayerIndex ? { ...p, hand: remaining } : p
  );

  const updatedMelds = (state.rummyMelds ?? []).map((m) => {
    if (m.id !== targetMeld.id) return m;
    if (m.kind === 'run') {
      const nextCards = isValidRummyRun([card, ...m.cards])
        ? [card, ...m.cards]
        : [...m.cards, card];
      return { ...m, cards: nextCards };
    }
    return { ...m, cards: [...m.cards, card] };
  });

  const newPendingWilds = tx.pendingSubstitutedWildIds.filter((wid) => wid !== card.id);
  const newRackIds = isSubstitutedWild
    ? tx.rackTileIdsPlayed
    : [...tx.rackTileIdsPlayed, card.id];
  const newTriggered =
    !isSubstitutedWild && isRummyWordOrWild(card) && !card.rummyEffectConsumed
      ? [...tx.triggeredActionTiles, card]
      : tx.triggeredActionTiles;

  const staged: HubGameState = appendEvent(
    {
      ...state,
      players,
      rummyMelds: updatedMelds,
      unoVulnerablePlayerId: null, // Catch window closed!
      rummyTransaction: {
        ...tx,
        rackTileIdsPlayed: newRackIds,
        pendingSubstitutedWildIds: newPendingWilds,
        triggeredActionTiles: newTriggered,
      },
    },
    'rummy_meld',
    `➕ LAY OFF! ${current.name} menempelkan ${getColorLabel(card.color)} ${card.value ?? 'Wild'} ke ${targetMeld.kind.toUpperCase()}!`
  );

  // If no pending substituted Wilds remain and player hit 4 tiles or emptied rack, commit cleanly!
  if (newPendingWilds.length === 0 && (remaining.length === 0 || newRackIds.length >= 4 || current.isAI)) {
    return commitRummyTurn(staged, playerId);
  }
  return staged;
}

/** Pass after drawing a playable tile in UNO Rummy-Up */
export function passAfterRummyDraw(state: HubGameState, playerId: string): HubGameState {
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId || !state.drawnPlayableCardId) return state;
  const next = appendEvent(
    { ...state, drawnPlayableCardId: null, hasDrawnThisTurn: false },
    'pass',
    `${current.name} menyimpan tile yang baru diambil ke rak dan mengakhiri giliran.`
  );
  return unoRummyUpRuleset.advanceTurn(next, 1);
}

/** Setup 100-tile UNO Rummy-Up round: 14 tiles/player + 4 Starting Tiles (effectConsumed = true) */
function createRummyUpRoundState(
  deck: HubCard[],
  players: HubPlayer[],
  mode: 'local' | 'ai' | 'online',
  settings: VariantSettings,
  roundNumber: number,
  roundHistory: HubRoundSummary[]
): HubGameState {
  const remaining = [...deck];
  // 4 Starting Tiles face-up on table (Word/Wild effects INACTIVE!)
  const startingMelds: RummyMeld[] = remaining.splice(0, 4).map((tile) => ({
    id: uid('st'),
    ownerName: 'Meja',
    kind: 'starting_single',
    cards: [{ ...tile, rummyEffectConsumed: true }],
  }));

  // Highest-number tile draw check determines starting player
  let starterIdx = 0;
  let bestVal = -1;
  players.forEach((p, idx) => {
    const topVal = Math.max(...p.hand.map((t) => t.value ?? 0), 0);
    if (topVal > bestVal) {
      bestVal = topVal;
      starterIdx = idx;
    }
  });

  return appendEvent(
    {
      version: 1,
      variantId: 'uno-rummy-up',
      mode,
      phase: 'playing',
      roundNumber,
      players,
      currentPlayerIndex: starterIdx,
      direction: 1,
      drawPile: remaining,
      discardPile: [],
      activeColor: 'red',
      pendingDrawCount: 0,
      rummyMelds: startingMelds,
      rummyTransaction: null,
      drawnPlayableCardId: null,
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
    `🀄 Ronde ${roundNumber} UNO RUMMY-UP (100 Tile • 14 Tile/Rak • 4 Starting Tiles)! Giliran ${players[starterIdx]?.name}.`
  );
}

function finalizeRummyRound(state: HubGameState, winnerId: string, reason: string): HubGameState {
  const winner = state.players.find((p) => p.id === winnerId) ?? state.players[0];
  const mode = state.settings.rummyScoringMode ?? 'points_200';
  const roundPts = state.players
    .filter((p) => p.id !== winner.id)
    .reduce((sum, p) => sum + calculateRummyRackPoints(p.hand), 0);

  const isCasual = mode === 'casual_2_rounds' || mode === 'casual_4_rounds';
  const targetWins = mode === 'casual_4_rounds' ? 4 : 2;
  const award = isCasual ? 1 : roundPts;

  const updatedPlayers = state.players.map((p) =>
    p.id === winner.id ? { ...p, score: p.score + award } : p
  );
  const wUpdated = updatedPlayers.find((p) => p.id === winner.id)!;
  const done =
    state.settings.singleRound ||
    (isCasual ? wUpdated.score >= targetWins : wUpdated.score >= 200);

  return appendEvent(
    {
      ...state,
      players: updatedPlayers,
      phase: done ? 'game_over' : 'round_over',
      winnerId: done ? winner.id : null,
      rummyTransaction: null,
      pendingPrompt: null,
      unoVulnerablePlayerId: null,
      roundHistory: [
        ...state.roundHistory,
        {
          roundNumber: state.roundNumber,
          winnerId: winner.id,
          winnerName: winner.name,
          pointsAwarded: award,
          reason,
          playerPoints: updatedPlayers.map((p) => ({
            playerId: p.id,
            playerName: p.name,
            handPoints: calculateRummyRackPoints(p.hand),
            totalScore: p.score,
          })),
        },
      ],
    },
    done ? 'game_win' : 'round_end',
    `🀄 Ronde ${state.roundNumber} UNO RUMMY-UP selesai! Pemenang: ${winner.name} (${isCasual ? `${wUpdated.score}/${targetWins} ronde` : `${wUpdated.score}/200 poin`})!`
  );
}

export const unoRummyUpRuleset: UnoRuleset = {
  id: 'uno-rummy-up',

  createDeck() {
    return buildRummyDeck();
  },

  shuffleDeck(deck) {
    return shuffleCards(deck);
  },

  dealCards(deck, players) {
    const remaining = [...deck];
    const dealt = players.map((p) => ({
      ...p,
      hand: remaining.splice(0, 14), // Official 14 tiles per rack!
      hasOpenedMeld: true,
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
      hasOpenedMeld: true,
      calledUno: false,
    }));
    const { players, remainingDeck } = this.dealCards(deck, initialPlayers, settings);
    return createRummyUpRoundState(remainingDeck, players, mode, settings, 1, []);
  },

  validateMove(state: HubGameState, playerId: string, move: MoveInput): ValidationResult {
    if (state.phase !== 'playing') return { valid: false, reason: 'Permainan tidak aktif.' };
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.id !== playerId) return { valid: false, reason: 'Bukan giliranmu.' };

    if (move.meldCardIds && move.meldCardIds.length >= 3) return { valid: true };

    if (state.drawnPlayableCardId && move.cardId !== state.drawnPlayableCardId) {
      return { valid: false, reason: 'Mainkan tile yang baru diambil atau klik Lewati Giliran!' };
    }

    const card = current.hand.find((c) => c.id === move.cardId);
    if (!card) return { valid: false, reason: 'Tile tidak ditemukan di rak.' };

    if (findLayOffTarget(card, state.rummyMelds)) {
      return { valid: true };
    }

    return {
      valid: false,
      reason: 'Tile tidak bisa ditempelkan! Gunakan tombol Turunkan Meld atau Ambil 1 Tile.',
    };
  },

  executeAction(state: HubGameState, playerId: string, move: MoveInput): HubGameState {
    if (move.meldCardIds && move.meldCardIds.length >= 3) {
      return playRummyMeld(state, playerId);
    }
    return layOffCardToMeld(state, playerId, move.cardId);
  },

  advanceTurn(state, steps = 1) {
    const nextIdx = getNextPlayerIndex(state.players, state.currentPlayerIndex, state.direction, steps);
    return transitionTurnWithPrivacy(
      { ...state, drawnPlayableCardId: null, hasDrawnThisTurn: false },
      nextIdx
    );
  },

  calculateScore(state, winnerId) {
    return state.players
      .filter((p) => p.id !== winnerId)
      .reduce((sum, p) => sum + calculateRummyRackPoints(p.hand), 0);
  },

  checkWinCondition(state) {
    const winner = state.players.find((p) => p.hand.length === 0);
    if (!winner) return state;
    return finalizeRummyRound(state, winner.id, `${winner.name} menghabiskan semua tile di rak!`);
  },

  resetRound(state) {
    const deck = this.shuffleDeck(this.createDeck(state.settings));
    const resetPlayers = state.players.map((p) => ({
      ...p,
      hand: [],
      hasOpenedMeld: true,
      calledUno: false,
    }));
    const { players, remainingDeck } = this.dealCards(deck, resetPlayers, state.settings);
    return createRummyUpRoundState(
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

    if (state.rummyTransaction) {
      return commitRummyTurn(state, playerId);
    }
    if (state.drawnPlayableCardId) {
      return passAfterRummyDraw(state, playerId);
    }

    // Empty Pool Edge Case: lowest remaining rack value wins the round!
    if (state.drawPile.length === 0) {
      const sorted = [...state.players].sort(
        (a, b) => calculateRummyRackPoints(a.hand) - calculateRummyRackPoints(b.hand)
      );
      return finalizeRummyRound(
        state,
        sorted[0].id,
        `Tumpukan tile habis! ${sorted[0].name} menang dengan total nilai rak terendah (${calculateRummyRackPoints(sorted[0].hand)} pt)!`
      );
    }

    const drawPile = [...state.drawPile];
    const drawn = drawPile.shift()!;
    const players = state.players.map((p, i) =>
      i === state.currentPlayerIndex ? { ...p, hand: [...p.hand, drawn], calledUno: false } : p
    );

    const canPlayDrawn = Boolean(findLayOffTarget(drawn, state.rummyMelds));
    if (canPlayDrawn && !current.isAI) {
      return appendEvent(
        {
          ...state,
          players,
          drawPile,
          drawnPlayableCardId: drawn.id,
          hasDrawnThisTurn: true,
          unoVulnerablePlayerId: null, // Catch window closed!
        },
        'draw',
        `🀄 ${current.name} mengambil 1 tile yang BISA langsung dimainkan! Tempelkan atau klik Lewati Giliran.`
      );
    }

    const nextIdx = getNextPlayerIndex(players, state.currentPlayerIndex, state.direction, 1);
    const next = appendEvent(
      {
        ...state,
        players,
        drawPile,
        drawnPlayableCardId: null,
        hasDrawnThisTurn: false,
        unoVulnerablePlayerId: null,
      },
      'draw',
      `🀄 ${current.name} mengambil 1 tile dari tumpukan tertutup.`
    );
    return transitionTurnWithPrivacy(next, nextIdx);
  },

  resolvePrompt(state, payload) {
    if (state.pendingPrompt?.type === 'rummy_choose_effect' && state.rummyTransaction) {
      const actorIdx = state.players.findIndex((p) => p.id === state.pendingPrompt?.actorId);
      const chosen =
        state.rummyTransaction.triggeredActionTiles.find((t) => t.id === payload.passCardId) ??
        state.rummyTransaction.triggeredActionTiles[0] ??
        null;
      return applyChosenRummyEffectAndAdvance(state, actorIdx, chosen);
    }
    return state;
  },

  decideAIMove(state) {
    if (state.pendingPrompt?.type === 'rummy_choose_effect' && state.rummyTransaction) {
      const best =
        state.rummyTransaction.triggeredActionTiles.find((t) => t.type === 'wild_draw4') ??
        state.rummyTransaction.triggeredActionTiles.find((t) => t.type === 'draw2') ??
        state.rummyTransaction.triggeredActionTiles[0];
      return { type: 'resolve_prompt' as const, payload: { passCardId: best?.id } };
    }

    const curr = state.players[state.currentPlayerIndex];
    const meld = findAvailableMeld(curr.hand, false, state.rummyMelds ?? []);
    if (meld) {
      return { type: 'play' as const, move: { cardId: meld.cards[0].id, meldCardIds: meld.cards.map((c) => c.id) } };
    }
    const layOff = curr.hand.find((c) => findLayOffTarget(c, state.rummyMelds));
    if (layOff) {
      return { type: 'play' as const, move: { cardId: layOff.id } };
    }
    return { type: 'draw' as const };
  },
};
