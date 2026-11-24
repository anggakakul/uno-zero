import { describe, expect, it } from 'vitest';
import {
  INITIAL_CARDS_PER_PLAYER,
  INITIAL_COLUMNS,
  autoPlayTimeoutTurn,
  callUno,
  catchUno,
  createMatch,
  finishRound,
  flipInitialCard,
  getRankedPlayers,
  resolveDoubleDrawTwo,
  sanitizeGameStateForPlayer,
  startNewRound,
  swapWithGridSlot,
  takeFromPile,
} from '../gameEngine';
import { decideAIMove } from '../ai';
import { createDeck, getDeckTotalCount } from '../deck';
import {
  calculateGridPoints,
  canTakeFromDiscardPile,
  countFaceDownCards,
  doColumnCardsMatch,
  eliminateMatchingColumns,
  getCardPoints,
} from '../rules';
import { Card, DEFAULT_GAME_CONFIG, GameState, GridColumn } from '../../types/game';

function seededRng(seed = 42): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function makeCol(
  id: string,
  top: Card | null,
  bottom: Card | null,
  topUp = false,
  botUp = false
): GridColumn {
  return {
    id,
    top: top ? { card: top, faceUp: topUp } : null,
    bottom: bottom ? { card: bottom, faceUp: botUp } : null,
  };
}

function makePlayingState(overrides: Partial<GameState>): GameState {
  const base = createMatch(['Andi', 'Budi', 'Citra'], 0, DEFAULT_GAME_CONFIG, seededRng(1));
  return {
    ...base,
    phase: 'playing',
    turnStep: 'choose_source',
    ...overrides,
  };
}

describe('Official 112-Card Deck (0-6 Numbers + 28 Actions)', () => {
  it('generates exactly 84 number cards (0-6, 3 per color) + 28 action cards (8 Rev, 8 Skip, 8 Draw2, 4 DoubleDraw2) = 112 cards', () => {
    const deck = createDeck(DEFAULT_GAME_CONFIG.deckConfig);
    expect(deck.length).toBe(112);
    expect(getDeckTotalCount(DEFAULT_GAME_CONFIG.deckConfig)).toBe(112);

    const numberCards = deck.filter((c) => c.type === 'number');
    expect(numberCards.length).toBe(84);
    expect(deck.filter((c) => c.type === 'reverse').length).toBe(8);
    expect(deck.filter((c) => c.type === 'skip').length).toBe(8);
    expect(deck.filter((c) => c.type === 'draw2').length).toBe(8);
    expect(deck.filter((c) => c.type === 'double_draw2').length).toBe(4);
    expect(numberCards.every((c) => (c.value ?? -1) >= 0 && (c.value ?? 99) <= 6)).toBe(true);
  });

  it('deals 6 face-down cards in 2x3 grid and requires 1 initial flip per player', () => {
    let state = createMatch(['Andi', 'Budi', 'Citra'], 0, DEFAULT_GAME_CONFIG, seededRng(5));
    expect(state.phase).toBe('initial_flip');
    expect(state.drawPile.length).toBe(112 - 3 * INITIAL_CARDS_PER_PLAYER - 1);

    for (const p of state.players) {
      expect(p.columns.length).toBe(INITIAL_COLUMNS);
      expect(countFaceDownCards(p.columns)).toBe(6);
    }

    state = flipInitialCard(state, 0, 'top');
    state = flipInitialCard(state, 1, 'bottom');
    state = flipInitialCard(state, 2, 'top');
    expect(state.phase).toBe('playing');
    expect(state.turnStep).toBe('choose_source');
  });
});

describe('Dynamic Grid Compaction & Action Card Trigger Rules', () => {
  const r2: Card = { id: 'r2', type: 'number', color: 'red', value: 2 };
  const r5: Card = { id: 'r5', type: 'number', color: 'red', value: 5 };
  const b2: Card = { id: 'b2', type: 'number', color: 'blue', value: 2 };
  const g4: Card = { id: 'g4', type: 'number', color: 'green', value: 4 };

  it('removes eliminated vertical columns cleanly from the grid array without leaving empty gaps', () => {
    expect(doColumnCardsMatch(r2, r5)).toBe(true);
    expect(doColumnCardsMatch(r2, b2)).toBe(true);
    expect(doColumnCardsMatch(r2, g4)).toBe(false);

    const cols = [
      makeCol('c1', r2, r5, true, true), // Eliminated (same color)
      makeCol('c2', r2, g4, true, true), // Kept (2 + 4 = 6)
      makeCol('c3', r2, b2, true, true), // Eliminated (same number)
    ];

    const res = eliminateMatchingColumns(cols);
    expect(res.eliminatedCount).toBe(2);
    expect(res.columns.length).toBe(1); // Compacted cleanly!
    expect(res.columns[0].id).toBe('c2');
    expect(calculateGridPoints(res.columns)).toBe(6);
  });

  it('does NOT trigger action card when placed INTO grid, ONLY triggers when old grid card discarded is an action card', () => {
    const incomingSkip: Card = { id: 'sk-in', type: 'skip', color: 'blue' };
    const oldGridDraw2: Card = { id: 'd2-out', type: 'draw2', color: 'yellow' };

    let state = makePlayingState({
      currentPlayerIndex: 0,
      direction: 1,
      drawPile: [
        incomingSkip,
        { id: 'p1', type: 'number', color: 'red', value: 1 },
        { id: 'p2', type: 'number', color: 'green', value: 3 },
      ],
      players: [
        {
          id: 'p1',
          name: 'Andi',
          columns: [
            makeCol('c1', oldGridDraw2, g4, false, false),
            makeCol('c2', r2, b2, true, false),
          ],
          totalScore: 0,
          hasFlippedInitial: true,
          hasCalledUno: false,
          eliminatedColumnsThisRound: 0,
          extraColumnsThisRound: 0,
        },
        {
          id: 'p2',
          name: 'Budi',
          columns: [makeCol('b1', r2, g4, true, false)],
          totalScore: 0,
          hasFlippedInitial: true,
          hasCalledUno: false,
          eliminatedColumnsThisRound: 0,
          extraColumnsThisRound: 0,
        },
        {
          id: 'p3',
          name: 'Citra',
          columns: [makeCol('d1', r2, g4, true, false)],
          totalScore: 0,
          hasFlippedInitial: true,
          hasCalledUno: false,
          eliminatedColumnsThisRound: 0,
          extraColumnsThisRound: 0,
        },
      ],
    });

    // Andi draws Skip, swaps it INTO grid, pushing oldGridDraw2 OUT to Discard Pile!
    state = takeFromPile(state, 'draw');
    state = swapWithGridSlot(state, 0, 'top');

    // Skip MUST NOT trigger (Budi is NOT skipped -> currentPlayerIndex === 1)
    expect(state.currentPlayerIndex).toBe(1);
    // oldGridDraw2 MUST trigger -> Budi receives +1 new column on the right!
    expect(state.players[1].columns.length).toBe(2);
    expect(state.discardPile[state.discardPile.length - 1].id).toBe('d2-out');
  });

  it('recycles Discard Pile into Draw Pile automatically when Draw Pile is empty', () => {
    let state = makePlayingState({
      currentPlayerIndex: 0,
      drawPile: [],
      discardPile: [
        { id: 'old1', type: 'number', color: 'red', value: 1 },
        { id: 'old2', type: 'number', color: 'green', value: 2 },
        { id: 'top', type: 'number', color: 'blue', value: 6 },
      ],
      players: [
        { id: 'p1', name: 'Andi', columns: [makeCol('c1', r2, g4, false, false)], totalScore: 0, hasFlippedInitial: true, hasCalledUno: false, eliminatedColumnsThisRound: 0, extraColumnsThisRound: 0 },
        { id: 'p2', name: 'Budi', columns: [makeCol('b1', r2, g4, true, false)], totalScore: 0, hasFlippedInitial: true, hasCalledUno: false, eliminatedColumnsThisRound: 0, extraColumnsThisRound: 0 },
      ],
    });

    state = takeFromPile(state, 'draw', seededRng(7));
    expect(state.drawnCard).not.toBeNull();
    expect(state.discardPile.length).toBe(1);
    expect(state.discardPile[0].id).toBe('top');
  });
});

describe('Round End, Official Scoring (0-6, Rev=10, Skip=11, Draw2=12, DoubleDraw2=22), and Lowest-Score Starter', () => {
  it('calculates exact official points and sets player with LOWEST round score as starter of next round', () => {
    const r1: Card = { id: 'r1', type: 'number', color: 'red', value: 1 };
    const b6: Card = { id: 'b6', type: 'number', color: 'blue', value: 6 };
    const revCard: Card = { id: 'rv', type: 'reverse', color: 'yellow' };
    const skipCard: Card = { id: 'sk', type: 'skip', color: 'green' };
    const draw2Card: Card = { id: 'd2', type: 'draw2', color: 'blue' };
    const dd2Card: Card = { id: 'dd2', type: 'double_draw2', color: 'red' };

    expect(getCardPoints(r1)).toBe(1);
    expect(getCardPoints(b6)).toBe(6);
    expect(getCardPoints(revCard)).toBe(10);
    expect(getCardPoints(skipCard)).toBe(11);
    expect(getCardPoints(draw2Card)).toBe(12);
    expect(getCardPoints(dd2Card)).toBe(22);

    const state = makePlayingState({
      roundNumber: 1,
      players: [
        { id: 'p1', name: 'Andi', columns: [makeCol('c1', b6, skipCard, true, true)], totalScore: 0, hasFlippedInitial: true, hasCalledUno: false, eliminatedColumnsThisRound: 0, extraColumnsThisRound: 0 }, // 6 + 11 = 17 pts
        { id: 'p2', name: 'Budi', columns: [makeCol('b1', r1, b6, true, false)], totalScore: 0, hasFlippedInitial: true, hasCalledUno: false, eliminatedColumnsThisRound: 0, extraColumnsThisRound: 0 }, // 7 pts
        { id: 'p3', name: 'Citra', columns: [makeCol('d1', r1, { id: 'r4', type: 'number', color: 'red', value: 4 }, true, false)], totalScore: 0, hasFlippedInitial: true, hasCalledUno: false, eliminatedColumnsThisRound: 0, extraColumnsThisRound: 0 }, // 0 pts (red match!)
      ],
    });

    const ended = finishRound(state, 'p1');
    expect(ended.phase).toBe('round_over');
    expect(ended.players[0].totalScore).toBe(17);
    expect(ended.players[1].totalScore).toBe(7);
    expect(ended.players[2].totalScore).toBe(0);
    expect(ended.roundHistory[0].lowestRoundPlayerId).toBe('p3');

    // Start Round 2 -> Citra (index 2) MUST start first!
    const r2 = startNewRound(ended, seededRng(9));
    expect(r2.roundNumber).toBe(2);
    expect(r2.currentPlayerIndex).toBe(2);
    expect(getRankedPlayers(r2.players)[0].id).toBe('p3');
  });
});

describe('Smart AI Decisions, UNO Catch, Anti-Cheat Sanitizer & Timeout', () => {
  it('AI takes from Discard Pile when top card is low (0-2) or matches an open grid card', () => {
    const state = makePlayingState({
      currentPlayerIndex: 0,
      discardPile: [{ id: 'd1', type: 'number', color: 'green', value: 1 }],
      players: [
        { id: 'ai1', name: 'Bot Alpha', isAI: true, columns: [makeCol('c1', { id: 'r6', type: 'number', color: 'red', value: 6 }, { id: 'b5', type: 'number', color: 'blue', value: 5 }, true, false)], totalScore: 0, hasFlippedInitial: true, hasCalledUno: false, eliminatedColumnsThisRound: 0, extraColumnsThisRound: 0 },
        { id: 'p2', name: 'Andi', columns: [makeCol('b1', { id: 'r2', type: 'number', color: 'red', value: 2 }, { id: 'g3', type: 'number', color: 'green', value: 3 }, true, false)], totalScore: 0, hasFlippedInitial: true, hasCalledUno: false, eliminatedColumnsThisRound: 0, extraColumnsThisRound: 0 },
      ],
    });

    const move = decideAIMove(state, seededRng(1));
    expect(move).toEqual({ action: 'take_source', source: 'discard' });

    // After taking green 1, AI swaps out high open red 6!
    const afterTake = takeFromPile(state, 'discard');
    const swapMove = decideAIMove(afterTake, seededRng(1));
    expect(swapMove?.action).toBe('swap_slot');
    if (swapMove?.action === 'swap_slot') {
      expect(swapMove.colIdx).toBe(0);
      expect(swapMove.pos).toBe('top');
    }
  });

  it('sanitizes all face-down cards and drawPile for online anti-cheat', () => {
    const state = createMatch(['Andi', 'Budi'], 0, DEFAULT_GAME_CONFIG, seededRng(3));
    const sanitized = sanitizeGameStateForPlayer(state, 'player-1');

    expect(sanitized.drawPile.length).toBe(0);
    expect(sanitized.drawPileCount).toBe(state.drawPile.length);
    for (const p of sanitized.players) {
      for (const col of p.columns) {
        if (col.top && !col.top.faceUp) expect(col.top.card).toBeNull();
        if (col.bottom && !col.bottom.faceUp) expect(col.bottom.card).toBeNull();
      }
    }
  });

  it('auto-plays cleanly on 20s timeout and supports UNO call/catch + Double Draw Two', () => {
    let state = createMatch(['Andi', 'Budi', 'Citra'], 0, DEFAULT_GAME_CONFIG, seededRng(4));
    // Timeout during initial_flip flips 1 card and advances
    const afterTimeout1 = autoPlayTimeoutTurn(state, seededRng(4));
    expect(countFaceDownCards(afterTimeout1.players[state.currentPlayerIndex].columns)).toBe(5);

    // UNO call & catch smoke check
    const vulnState = makePlayingState({
      unoVulnerability: { playerId: 'player-1', playerName: 'Andi', createdAt: Date.now() },
    });
    const saved = callUno(vulnState, 'player-1');
    expect(saved.unoVulnerability).toBeNull();

    const caught = catchUno(vulnState, 'Budi', seededRng(2));
    expect(caught.players[0].columns.length).toBe(4); // +1 penalty column

    // Double Draw Two split
    const ddState = makePlayingState({ phase: 'choose_double_draw2_target', currentPlayerIndex: 0 });
    const resolved = resolveDoubleDrawTwo(ddState, ['player-2', 'player-3'], seededRng(2));
    expect(resolved.phase).toBe('playing');
    expect(resolved.players[1].columns.length).toBe(4);
    expect(resolved.players[2].columns.length).toBe(4);
  });

  it('forbids taking Action Cards from Discard Pile for both human players and AI', () => {
    const actionCards: Card[] = [
      { id: 'a1', type: 'skip', color: 'red' },
      { id: 'a2', type: 'reverse', color: 'green' },
      { id: 'a3', type: 'draw2', color: 'blue' },
      { id: 'a4', type: 'double_draw2', color: 'yellow' },
    ];

    for (const ac of actionCards) {
      expect(canTakeFromDiscardPile([ac])).toBe(false);

      const state = makePlayingState({
        currentPlayerIndex: 0,
        discardPile: [ac],
        players: [
          {
            id: 'ai1',
            name: 'Bot Alpha',
            isAI: true,
            // Even if color matches an open card in grid, taking Action Card from Discard MUST be blocked!
            columns: [makeCol('c1', { id: 'm1', type: 'number', color: ac.color, value: 4 }, { id: 'm2', type: 'number', color: 'blue', value: 5 }, true, false)],
            totalScore: 0,
            hasFlippedInitial: true,
            hasCalledUno: false,
            eliminatedColumnsThisRound: 0,
            extraColumnsThisRound: 0,
          },
          {
            id: 'p2',
            name: 'Andi',
            columns: [makeCol('b1', { id: 'n1', type: 'number', color: 'red', value: 2 }, { id: 'n2', type: 'number', color: 'green', value: 3 }, true, false)],
            totalScore: 0,
            hasFlippedInitial: true,
            hasCalledUno: false,
            eliminatedColumnsThisRound: 0,
            extraColumnsThisRound: 0,
          },
        ],
      });

      // Engine blocks taking action card from discard pile
      const blocked = takeFromPile(state, 'discard');
      expect(blocked.turnStep).toBe('choose_source');
      expect(blocked.drawnCard).toBeNull();
      expect(blocked.discardPile.length).toBe(1);

      // AI must draw from Draw Pile instead
      const aiMove = decideAIMove(state, seededRng(1));
      expect(aiMove).toEqual({ action: 'take_source', source: 'draw' });
    }

    // Number card on top of Discard Pile IS allowed
    expect(canTakeFromDiscardPile([{ id: 'ok', type: 'number', color: 'red', value: 3 }])).toBe(true);
  });
});
