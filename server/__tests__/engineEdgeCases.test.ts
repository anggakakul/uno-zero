import { describe, expect, it } from 'vitest';
import {
  callHubUno,
  catchHubUno,
  drawCardsFromDeck,
  makeDefaultPlayers,
} from '../../src/hub/engine/core';
import { getRuleset } from '../../src/hub/rulesets';
import { HubCard, HubGameState } from '../../src/hub/types';

function makeClassicGame(playerNames: string[], singleRound = true): HubGameState {
  const ruleset = getRuleset('uno-classic');
  const players = makeDefaultPlayers(playerNames, 'local');
  return ruleset.initializeGame(players, 'online', {
    targetScore: 500,
    singleRound,
    winConditionMode: singleRound ? 'quick_single' : 'classic_points',
  });
}

describe('Game Engine Edge Cases (Isolated Ruleset Verification)', () => {
  it('1. Normal turn order & 2-player Reverse acts as Skip (returns turn to actor)', () => {
    const ruleset = getRuleset('uno-classic');
    let state = makeClassicGame(['Alice', 'Bob']);

    const revCard: HubCard = { id: 'rev-1', color: 'red', type: 'reverse' };
    const topCard: HubCard = { id: 'top-1', color: 'red', type: 'number', value: 5 };
    state = {
      ...state,
      activeColor: 'red',
      discardPile: [topCard],
      currentPlayerIndex: 0,
      players: state.players.map((p, idx) =>
        idx === 0 ? { ...p, hand: [revCard, { id: 'keep-1', color: 'blue', type: 'number', value: 3 }] } : p
      ),
    };

    const next = ruleset.executeAction(state, state.players[0].id, { cardId: revCard.id });
    // In 2-player UNO, Reverse acts as Skip so Alice keeps her turn
    expect(next.currentPlayerIndex).toBe(0);
    expect(next.players[0].hand.length).toBe(1);
  });

  it('2. Stacking validation (+2 -> +4 -> +6) in UNO No Mercy enforces equal-or-higher draw value', () => {
    const ruleset = getRuleset('uno-no-mercy');
    const players = makeDefaultPlayers(['P1', 'P2', 'P3'], 'local');
    let state = ruleset.initializeGame(players, 'online', {
      targetScore: 1000,
      singleRound: true,
    });

    const draw2: HubCard = { id: 'd2', color: 'red', type: 'draw2' };
    const draw4: HubCard = { id: 'd4', color: 'blue', type: 'draw4' };
    const numCard: HubCard = { id: 'n5', color: 'red', type: 'number', value: 5 };

    state = {
      ...state,
      activeColor: 'red',
      pendingDrawCount: 4,
      pendingDrawMinValue: 4,
      currentPlayerIndex: 0,
      players: state.players.map((p, idx) =>
        idx === 0 ? { ...p, hand: [draw2, draw4, numCard] } : p
      ),
    };

    // Lower draw (+2) and normal card must be rejected while +4 stack is pending
    expect(ruleset.validateMove(state, state.players[0].id, { cardId: draw2.id }).valid).toBe(false);
    expect(ruleset.validateMove(state, state.players[0].id, { cardId: numCard.id }).valid).toBe(false);
    // Equal or higher draw (+4) must be valid and stack to +8
    expect(ruleset.validateMove(state, state.players[0].id, { cardId: draw4.id }).valid).toBe(true);

    const stacked = ruleset.executeAction(state, state.players[0].id, { cardId: draw4.id });
    expect(stacked.pendingDrawCount).toBe(8);
  });

  it('3. Wild card validation & color selection updates activeColor and advances turn', () => {
    const ruleset = getRuleset('uno-classic');
    let state = makeClassicGame(['P1', 'P2', 'P3']);

    const wildCard: HubCard = { id: 'w-1', color: 'wild', type: 'wild' };
    state = {
      ...state,
      activeColor: 'red',
      discardPile: [{ id: 'top-r', color: 'red', type: 'number', value: 7 }],
      currentPlayerIndex: 0,
      players: state.players.map((p, idx) =>
        idx === 0 ? { ...p, hand: [wildCard, { id: 'k1', color: 'green', type: 'number', value: 2 }] } : p
      ),
    };

    expect(ruleset.validateMove(state, state.players[0].id, { cardId: wildCard.id }).valid).toBe(true);

    const prompted = ruleset.executeAction(state, state.players[0].id, { cardId: wildCard.id });
    expect(prompted.phase).toBe('choose_color');
    expect(prompted.pendingPrompt?.type).toBe('color');

    const resolved = ruleset.resolvePrompt(prompted, { color: 'blue' });
    expect(resolved.phase).toBe('playing');
    expect(resolved.activeColor).toBe('blue');
    expect(resolved.currentPlayerIndex).toBe(1);
  });

  it('4. Forgetting to call UNO exposes vulnerability and Catch applies +2 penalty', () => {
    const ruleset = getRuleset('uno-classic');
    let state = makeClassicGame(['Alice', 'Bob', 'Cara']);

    const playCard: HubCard = { id: 'p-r4', color: 'red', type: 'number', value: 4 };
    const lastCard: HubCard = { id: 'last-g9', color: 'green', type: 'number', value: 9 };

    state = {
      ...state,
      activeColor: 'red',
      discardPile: [{ id: 'top-r2', color: 'red', type: 'number', value: 2 }],
      currentPlayerIndex: 0,
      players: state.players.map((p, idx) =>
        idx === 0 ? { ...p, hand: [playCard, lastCard], calledUno: false } : p
      ),
    };

    // Alice plays down to 1 card WITHOUT calling UNO
    const afterPlay = ruleset.executeAction(state, state.players[0].id, { cardId: playCard.id });
    expect(afterPlay.players[0].hand.length).toBe(1);
    expect(afterPlay.unoVulnerablePlayerId).toBe(afterPlay.players[0].id);

    // Bob catches Alice -> Alice receives +2 penalty cards (1 -> 3 cards)
    const afterCatch = catchHubUno(afterPlay, 'Bob');
    expect(afterCatch.players[0].hand.length).toBe(3);
    expect(afterCatch.unoVulnerablePlayerId).toBeNull();

    // Conversely, calling UNO beforehand prevents vulnerability
    const called = callHubUno(state, state.players[0].id);
    const safePlay = ruleset.executeAction(called, called.players[0].id, { cardId: playCard.id });
    expect(safePlay.unoVulnerablePlayerId).toBeNull();
  });

  it('5. Win condition triggers game_over on last card & discard pile reshuffles when draw pile empties', () => {
    const ruleset = getRuleset('uno-classic');
    let state = makeClassicGame(['Alice', 'Bob'], true);

    // 5a. Discard pile reshuffles cleanly when draw pile runs out
    const lowDeckState: HubGameState = {
      ...state,
      drawPile: [{ id: 'd-last', color: 'blue', type: 'number', value: 1 }],
      discardPile: [
        { id: 'disc-1', color: 'red', type: 'number', value: 2 },
        { id: 'disc-2', color: 'green', type: 'number', value: 3 },
        { id: 'disc-3', color: 'yellow', type: 'number', value: 4 },
        { id: 'disc-top', color: 'red', type: 'number', value: 9 },
      ],
    };

    const drawResult = drawCardsFromDeck(lowDeckState.drawPile, lowDeckState.discardPile, 3);
    expect(drawResult.drawn.length).toBe(3);
    expect(drawResult.discardPile.length).toBe(1);
    expect(drawResult.discardPile[0].id).toBe('disc-top');

    // 5b. Playing the last card ends the match with winnerId set
    const winningCard: HubCard = { id: 'win-r9', color: 'red', type: 'number', value: 9 };
    state = {
      ...state,
      activeColor: 'red',
      discardPile: [{ id: 'top-r1', color: 'red', type: 'number', value: 1 }],
      currentPlayerIndex: 0,
      players: state.players.map((p, idx) =>
        idx === 0 ? { ...p, hand: [winningCard], calledUno: true } : p
      ),
    };

    const finished = ruleset.executeAction(state, state.players[0].id, { cardId: winningCard.id });
    expect(finished.phase).toBe('game_over');
    expect(finished.winnerId).toBe(state.players[0].id);
  });
});
