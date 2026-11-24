import { describe, expect, it } from 'vitest';
import { VARIANT_CATALOG } from '../catalog';
import { callHubUno, catchHubUno, makeDefaultPlayers } from '../engine/core';
import { RULESET_REGISTRY } from '../rulesets';
import { unoClassicRuleset } from '../rulesets/unoClassic';
import { calculateUnoFlipHandPoints, passAfterFlipDraw, unoFlipRuleset } from '../rulesets/unoFlip';
import {
  UNO_FLEX_POWER_CARDS_TOTAL,
  calculateUnoFlexHandPoints,
  getFlexColorNotches,
  unoFlexRuleset,
} from '../rulesets/unoFlex';
import { calculateAllWildHandPoints, unoAllWildRuleset } from '../rulesets/unoAllWild';
import { MERCY_LIMIT, calculateNoMercyHandPoints, unoNoMercyRuleset } from '../rulesets/unoNoMercy';
import { calculateTeamsHandPoints, unoTeamsRuleset } from '../rulesets/unoTeams';
import {
  calculateAttackHandPoints,
  catchAttackUno,
  simulateLauncherPresses,
  unoAttackRuleset,
} from '../rulesets/unoAttack';
import {
  calculateTriplePlayHandPoints,
  handleTriplePlayTimeout,
  unoTriplePlayRuleset,
} from '../rulesets/unoTriplePlay';
import { juniorCardMatches, passAfterJuniorDraw, unoJuniorRuleset } from '../rulesets/unoJunior';

describe('UNO GAME HUB — Multi-Variant Ruleset Suite', () => {
  it('registers all 20 UNO variants in catalog and 19 wrapped rulesets in registry', () => {
    expect(VARIANT_CATALOG).toHaveLength(20);
    expect(Object.keys(RULESET_REGISTRY)).toHaveLength(19);
  });

  describe('GAME 02 — UNO CLASSIC', () => {
    it('builds official 108-card deck and deals 7 cards per player', () => {
      const deck = unoClassicRuleset.createDeck({ targetScore: 500, singleRound: false });
      expect(deck).toHaveLength(108);

      const players = makeDefaultPlayers(['Alice', 'Bob', 'Cara'], 'local');
      const state = unoClassicRuleset.initializeGame(players, 'local', {
        targetScore: 500,
        singleRound: false,
      });
      expect(state.players.every((p) => p.hand.length === 7)).toBe(true);
      expect(state.discardPile.length).toBe(1);
    });

    it('handles Reverse as Skip in 2-player games and UNO catch penalty (+2)', () => {
      const players = makeDefaultPlayers(['Alice', 'Bob'], 'ai');
      const state = unoClassicRuleset.initializeGame(players, 'ai', {
        targetScore: 500,
        singleRound: false,
      });
      // Put a red reverse in Alice's hand and set active color to red
      const revCard = { id: 'test-rev', color: 'red' as const, type: 'reverse' as const };
      const testState = {
        ...state,
        activeColor: 'red' as const,
        players: state.players.map((p, i) =>
          i === 0 ? { ...p, hand: [revCard, { id: 'keep1', color: 'blue' as const, type: 'number' as const, value: 3 }] } : p
        ),
      };

      const afterPlay = unoClassicRuleset.executeAction(testState, 'p_1', { cardId: 'test-rev' });
      // In 2-player mode, Reverse skips Bob and returns to Alice (index 0)
      expect(afterPlay.currentPlayerIndex).toBe(0);
      // Alice dropped to 1 card without calling UNO -> vulnerable!
      expect(afterPlay.unoVulnerablePlayerId).toBe('p_1');

      const afterCatch = catchHubUno(afterPlay, 'Bob');
      expect(afterCatch.players[0].hand.length).toBe(3); // 1 + 2 penalty

      const safeCall = callHubUno(afterPlay, 'p_1');
      expect(safeCall.unoVulnerablePlayerId).toBeNull();
    });
  });

  describe('GAME 03 — UNO FLIP! (Official Rules)', () => {
    it('creates 112 double-sided cards, flips discard pile with Flip card at bottom, and scores officially', () => {
      const deck = unoFlipRuleset.createDeck({ targetScore: 500, singleRound: false });
      expect(deck).toHaveLength(112);
      expect(deck.every((c) => c.lightFace && c.darkFace)).toBe(true);

      const players = makeDefaultPlayers(['A', 'B', 'C'], 'ai');
      const state = unoFlipRuleset.initializeGame(players, 'ai', {
        targetScore: 500,
        singleRound: false,
      });

      const baseDiscard = {
        id: 'base-1',
        color: 'red' as const,
        type: 'number' as const,
        value: 3,
        lightFace: { color: 'red' as const, type: 'number' as const, value: 3 },
        darkFace: { color: 'teal' as const, type: 'number' as const, value: 7 },
      };
      const flipCard = {
        id: 'flip-1',
        color: 'red' as const,
        type: 'flip' as const,
        lightFace: { color: 'red' as const, type: 'flip' as const },
        darkFace: { color: 'pink' as const, type: 'number' as const, value: 5 },
      };
      const prepared = {
        ...state,
        currentPlayerIndex: 0,
        flipSide: 'light' as const,
        activeColor: 'red' as const,
        discardPile: [baseDiscard],
        players: state.players.map((p, idx) =>
          idx === 0 ? { ...p, hand: [flipCard, ...p.hand.slice(1)] } : p
        ),
      };
      const flipped = unoFlipRuleset.executeAction(prepared, 'p_1', { cardId: 'flip-1' });
      expect(flipped.flipSide).toBe('dark');
      // Official rule: played Flip card moves to BOTTOM (index 0) of Discard Pile!
      expect(flipped.discardPile[0].id).toBe('flip-1');
      expect(flipped.discardPile[flipped.discardPile.length - 1].id).toBe('base-1');
      expect(flipped.activeColor).toBe('teal');

      // Official UNO Flip scoring verification (Light & Dark sides)
      expect(
        calculateUnoFlipHandPoints(
          [
            { id: '1', color: 'red', type: 'draw1', lightFace: { color: 'red', type: 'draw1' }, darkFace: { color: 'pink', type: 'draw5' } },
            { id: '2', color: 'wild', type: 'wild', lightFace: { color: 'wild', type: 'wild' }, darkFace: { color: 'wild', type: 'wild' } },
            { id: '3', color: 'wild', type: 'wild_draw2', lightFace: { color: 'wild', type: 'wild_draw2' }, darkFace: { color: 'wild', type: 'wild_draw_color' } },
          ],
          'light'
        )
      ).toBe(10 + 40 + 50);

      expect(
        calculateUnoFlipHandPoints(
          [
            { id: '1', color: 'red', type: 'draw1', lightFace: { color: 'red', type: 'draw1' }, darkFace: { color: 'pink', type: 'draw5' } },
            { id: '2', color: 'red', type: 'skip', lightFace: { color: 'red', type: 'skip' }, darkFace: { color: 'teal', type: 'skip_everyone' } },
            { id: '3', color: 'wild', type: 'wild', lightFace: { color: 'wild', type: 'wild' }, darkFace: { color: 'wild', type: 'wild' } },
            { id: '4', color: 'wild', type: 'wild_draw2', lightFace: { color: 'wild', type: 'wild_draw2' }, darkFace: { color: 'wild', type: 'wild_draw_color' } },
          ],
          'dark'
        )
      ).toBe(20 + 30 + 40 + 60);
    });

    it('supports Wild Draw Two Challenge (guilty=+2 actor, innocent=+4 challenger) and Draw-then-Pass', () => {
      const players = makeDefaultPlayers(['A', 'B', 'C'], 'local');
      const state = unoFlipRuleset.initializeGame(players, 'local', {
        targetScore: 500,
        singleRound: false,
      });

      const wd2 = {
        id: 'wd2',
        color: 'wild' as const,
        type: 'wild_draw2' as const,
        lightFace: { color: 'wild' as const, type: 'wild_draw2' as const },
        darkFace: { color: 'wild' as const, type: 'wild_draw_color' as const },
      };
      const redMatch = {
        id: 'rm',
        color: 'red' as const,
        type: 'number' as const,
        value: 4,
        lightFace: { color: 'red' as const, type: 'number' as const, value: 4 },
        darkFace: { color: 'pink' as const, type: 'number' as const, value: 4 },
      };
      const blueCard = {
        id: 'bc',
        color: 'blue' as const,
        type: 'number' as const,
        value: 2,
        lightFace: { color: 'blue' as const, type: 'number' as const, value: 2 },
        darkFace: { color: 'teal' as const, type: 'number' as const, value: 2 },
      };

      // Case 1: Guilty actor (has matching red card) challenged -> actor draws +2, challenger gets turn
      const guiltyPrep = {
        ...state,
        flipSide: 'light' as const,
        activeColor: 'red' as const,
        currentPlayerIndex: 0,
        direction: 1 as const,
        players: state.players.map((p, i) => (i === 0 ? { ...p, hand: [wd2, redMatch] } : p)),
      };
      const prompt1 = unoFlipRuleset.executeAction(guiltyPrep, 'p_1', {
        cardId: 'wd2',
        chosenColor: 'blue',
      });
      expect(prompt1.phase).toBe('flip_challenge');
      const guiltyResolved = unoFlipRuleset.resolvePrompt(prompt1, { challengeChoice: 'challenge' });
      expect(guiltyResolved.players[0].hand.length).toBe(3); // 1 remaining + 2 penalty
      expect(guiltyResolved.currentPlayerIndex).toBe(1); // Challenger B gets their turn!

      // Case 2: Innocent actor (no red card) challenged -> challenger draws +4 and loses turn (skips to C)
      const innocentPrep = {
        ...state,
        direction: 1 as const,
        flipSide: 'light' as const,
        activeColor: 'red' as const,
        currentPlayerIndex: 0,
        players: state.players.map((p, i) => (i === 0 ? { ...p, hand: [wd2, blueCard] } : p)),
      };
      const prompt2 = unoFlipRuleset.executeAction(innocentPrep, 'p_1', {
        cardId: 'wd2',
        chosenColor: 'blue',
      });
      const innocentResolved = unoFlipRuleset.resolvePrompt(prompt2, { challengeChoice: 'challenge' });
      expect(innocentResolved.players[1].hand.length).toBe(state.players[1].hand.length + 4);
      expect(innocentResolved.currentPlayerIndex).toBe(2); // Skipped B -> C's turn!

      // Case 3: Draw playable card -> allows immediate play or Pass
      const drawPrep = {
        ...state,
        flipSide: 'light' as const,
        activeColor: 'red' as const,
        currentPlayerIndex: 0,
        drawPile: [...state.drawPile, redMatch],
      };
      const afterDraw = unoFlipRuleset.handleDrawOrPass(drawPrep, 'p_1');
      expect(afterDraw.drawnPlayableCardId).toBe('rm');
      expect(afterDraw.currentPlayerIndex).toBe(0); // Still A's turn to play or pass!
      const afterPass = passAfterFlipDraw(afterDraw, 'p_1');
      expect(afterPass.drawnPlayableCardId).toBeNull();
      expect(afterPass.currentPlayerIndex).toBe(1);
    });
  });

  describe('GAME 04 — UNO FLEX (Official Rules)', () => {
    it('builds 104 playable + 8 Power Cards (112 total), color-blind notches, and numbered opening card', () => {
      const deck = unoFlexRuleset.createDeck({ targetScore: 500, singleRound: false });
      expect(deck.length + UNO_FLEX_POWER_CARDS_TOTAL).toBe(112);
      expect(deck.filter((c) => c.type === 'number').every((c) => (c.value ?? 0) >= 1 && (c.value ?? 0) <= 8)).toBe(true);

      // Color-blindness notches: Yellow=1, Green=2, Blue=3, Red=4
      expect(getFlexColorNotches('yellow')).toBe(1);
      expect(getFlexColorNotches('green')).toBe(2);
      expect(getFlexColorNotches('blue')).toBe(3);
      expect(getFlexColorNotches('red')).toBe(4);

      const players = makeDefaultPlayers(['A', 'B', 'C'], 'ai');
      const state = unoFlexRuleset.initializeGame(players, 'ai', {
        targetScore: 500,
        singleRound: false,
      });
      expect(state.players.every((p) => p.powerActive === true)).toBe(true);
      // Opening discard card MUST be a numbered card
      expect(state.discardPile[0].type).toBe('number');

      // Official scoring: 1-8 face value, non-Wild Action = 20, Wild = 50
      expect(
        calculateUnoFlexHandPoints([
          { id: 'n5', color: 'red', type: 'number', value: 5 },
          { id: 'a1', color: 'blue', type: 'flex_skip' },
          { id: 'w1', color: 'wild', type: 'wild_all_draw' },
        ])
      ).toBe(5 + 20 + 50);
    });

    it('enforces Power Card Global Reset, Regular vs Flex Wild effects, and Wild +4 Challenge (+4/+6)', () => {
      const players = makeDefaultPlayers(['A', 'B', 'C'], 'local');
      const state = unoFlexRuleset.initializeGame(players, 'local', {
        targetScore: 500,
        singleRound: false,
      });

      // 1. Global Reset when all Power Cards become Off
      const flexCard = {
        id: 'flx-test',
        color: 'blue' as const,
        flexColor: 'red' as const,
        type: 'number' as const,
        value: 4,
      };
      const allOffPrep = {
        ...state,
        activeColor: 'red' as const,
        players: state.players.map((p, idx) =>
          idx === 0
            ? { ...p, hand: [flexCard, ...p.hand.slice(1)], powerActive: true }
            : { ...p, powerActive: false }
        ),
      };
      const afterFlex = unoFlexRuleset.executeAction(allOffPrep, 'p_1', {
        cardId: 'flx-test',
        useFlex: true,
      });
      expect(afterFlex.players.every((p) => p.powerActive === true)).toBe(true);
      // Active color stays 'red' when Flex number matched Discard Pile's activeColor
      expect(afterFlex.activeColor).toBe('red');

      // 2. Flex Wild All Draw: Regular side = normal Wild (0 draw!), Flex side = all others +2 & NOT skipped
      const wad = { id: 'wad', color: 'wild' as const, type: 'wild_all_draw' as const, flexType: 'wild_all_draw' as const };
      const regWad = unoFlexRuleset.executeAction(
        { ...state, players: state.players.map((p, i) => (i === 0 ? { ...p, hand: [wad, ...p.hand.slice(1)] } : p)) },
        'p_1',
        { cardId: 'wad', chosenColor: 'green', useFlex: false }
      );
      expect(regWad.players[1].hand.length).toBe(state.players[1].hand.length); // 0 draw on Regular!
      expect(regWad.currentPlayerIndex).toBe(1);

      const flexWad = unoFlexRuleset.executeAction(
        { ...state, players: state.players.map((p, i) => (i === 0 ? { ...p, hand: [wad, ...p.hand.slice(1)] } : p)) },
        'p_1',
        { cardId: 'wad', chosenColor: 'green', useFlex: true }
      );
      expect(flexWad.players[1].hand.length).toBe(state.players[1].hand.length + 2);
      expect(flexWad.players[2].hand.length).toBe(state.players[2].hand.length + 2);
      expect(flexWad.currentPlayerIndex).toBe(1); // Next player NOT skipped!

      // 3. Flex Wild Draw Four: Regular side triggers Challenge (innocent -> challenger draws +6 & skipped!)
      const wd4 = { id: 'wd4', color: 'wild' as const, type: 'wild_draw4' as const, flexType: 'wild_draw4' as const };
      const blueNum = { id: 'bn', color: 'blue' as const, type: 'number' as const, value: 3 };
      const chPrompt = unoFlexRuleset.executeAction(
        {
          ...state,
          activeColor: 'red' as const,
          players: state.players.map((p, i) => (i === 0 ? { ...p, hand: [wd4, blueNum] } : p)),
        },
        'p_1',
        { cardId: 'wd4', chosenColor: 'blue', useFlex: false }
      );
      expect(chPrompt.phase).toBe('flex_challenge');
      const innocentRes = unoFlexRuleset.resolvePrompt(chPrompt, { challengeChoice: 'challenge' });
      expect(innocentRes.players[1].hand.length).toBe(state.players[1].hand.length + 6);
      expect(innocentRes.currentPlayerIndex).toBe(2); // B skipped -> C!

      // 4. Flex Wild Draw Four Flex side = Targeted +4 (C gets +4, turn still goes to B!)
      const flexWd4 = unoFlexRuleset.executeAction(
        { ...state, players: state.players.map((p, i) => (i === 0 ? { ...p, hand: [wd4, blueNum], powerActive: true } : p)) },
        'p_1',
        { cardId: 'wd4', chosenColor: 'yellow', useFlex: true, targetPlayerId: 'p_3' }
      );
      expect(flexWd4.players[2].hand.length).toBe(state.players[2].hand.length + 4);
      expect(flexWd4.currentPlayerIndex).toBe(1); // Turn continues normally to B!
    });
  });

  describe('GAME 05 — UNO ALL WILD (Official Rules & Edge Cases)', () => {
    it('builds 112 Wild cards, starts left of dealer, ignores opening action, and scores 20/50', () => {
      const deck = unoAllWildRuleset.createDeck({ targetScore: 500, singleRound: false });
      expect(deck).toHaveLength(112);
      expect(deck.every((c) => c.color === 'wild')).toBe(true);

      const players = makeDefaultPlayers(['Dealer', 'Left', 'C', 'D'], 'ai');
      const state = unoAllWildRuleset.initializeGame(players, 'ai', {
        targetScore: 500,
        singleRound: false,
      });
      // Starts with player left of dealer (index 1) clockwise!
      expect(state.currentPlayerIndex).toBe(1);
      expect(state.direction).toBe(1);

      const skipTwo = { id: 'skip2', color: 'wild' as const, type: 'wild_skip_two' as const };
      const prepared = {
        ...state,
        currentPlayerIndex: 0,
        players: state.players.map((p, i) =>
          i === 0 ? { ...p, hand: [skipTwo, ...p.hand.slice(1)] } : p
        ),
      };
      expect(unoAllWildRuleset.validateMove(prepared, 'p_1', { cardId: 'skip2' }).valid).toBe(true);
      const next = unoAllWildRuleset.executeAction(prepared, 'p_1', { cardId: 'skip2' });
      // Skipped index 1 and 2 -> lands on index 3
      expect(next.currentPlayerIndex).toBe(3);

      // Official scoring: Wild = 20, Wild Action = 50
      expect(
        calculateAllWildHandPoints([
          { id: 'w1', color: 'wild', type: 'wild' },
          { id: 'w2', color: 'wild', type: 'wild_forced_swap' },
          { id: 'w3', color: 'wild', type: 'wild_skip_two' },
        ])
      ).toBe(20 + 50 + 50);
    });

    it('handles 2-player Wild Skip Two (2 consecutive extra turns), Targeted Draw Two (no skip), and Forced Swap UNO!', () => {
      // 1. 2-player Wild Skip Two -> actor gets 2 consecutive extra turns!
      const twoPlayers = makeDefaultPlayers(['A', 'B'], 'local');
      const s2 = unoAllWildRuleset.initializeGame(twoPlayers, 'local', {
        targetScore: 500,
        singleRound: false,
      });
      const skip2 = { id: 's2', color: 'wild' as const, type: 'wild_skip_two' as const };
      const wA = { id: 'wa', color: 'wild' as const, type: 'wild' as const };
      const wB = { id: 'wb', color: 'wild' as const, type: 'wild' as const };
      const wC = { id: 'wc', color: 'wild' as const, type: 'wild' as const };
      const prep2p = {
        ...s2,
        currentPlayerIndex: 0,
        players: s2.players.map((p, i) => (i === 0 ? { ...p, hand: [skip2, wA, wB, wC] } : p)),
      };
      const afterSkip2 = unoAllWildRuleset.executeAction(prep2p, 'p_1', { cardId: 's2' });
      expect(afterSkip2.currentPlayerIndex).toBe(0);
      expect(afterSkip2.extraTurnsRemaining).toBe(2);

      // Extra turn #1 -> still player 0!
      const afterExtra1 = unoAllWildRuleset.executeAction(afterSkip2, 'p_1', { cardId: 'wa' });
      expect(afterExtra1.currentPlayerIndex).toBe(0);
      expect(afterExtra1.extraTurnsRemaining).toBe(1);

      // Extra turn #2 -> now advances to player 1!
      const afterExtra2 = unoAllWildRuleset.executeAction(afterExtra1, 'p_1', { cardId: 'wb' });
      expect(afterExtra2.currentPlayerIndex).toBe(1);
      expect(afterExtra2.extraTurnsRemaining).toBe(0);

      // 2. Wild Targeted Draw Two -> target draws +2 and is NOT skipped!
      const td2 = { id: 'td2', color: 'wild' as const, type: 'wild_target_draw2' as const };
      const prepTarget = {
        ...s2,
        currentPlayerIndex: 0,
        players: s2.players.map((p, i) => (i === 0 ? { ...p, hand: [td2, wA, wB] } : p)),
      };
      const afterTarget = unoAllWildRuleset.executeAction(prepTarget, 'p_1', {
        cardId: 'td2',
        targetPlayerId: 'p_2',
      });
      expect(afterTarget.players[1].hand.length).toBe(s2.players[1].hand.length + 2);
      expect(afterTarget.currentPlayerIndex).toBe(1); // Target B is NOT skipped!

      // 3. Wild Forced Swap -> target receiving 1 card triggers UNO! vulnerability
      const swap = { id: 'swp', color: 'wild' as const, type: 'wild_forced_swap' as const };
      const prepSwap = {
        ...s2,
        currentPlayerIndex: 0,
        players: s2.players.map((p, i) => (i === 0 ? { ...p, hand: [swap, wA] } : p)), // After playing swap, A gives 1 card (wA) to B!
      };
      const afterSwap = unoAllWildRuleset.executeAction(prepSwap, 'p_1', {
        cardId: 'swp',
        targetPlayerId: 'p_2',
      });
      expect(afterSwap.players[1].hand).toHaveLength(1);
      expect(afterSwap.unoVulnerablePlayerId).toBe('p_2');
    });
  });

  describe("GAME 06 — UNO SHOW 'EM NO MERCY (Official Rules & Edge Cases)", () => {
    it('builds 168 cards, starts left of dealer with numbered card, stacks +4->+6, and isolates eliminatedCardsPool', () => {
      const deck = unoNoMercyRuleset.createDeck({ targetScore: 1000, singleRound: true });
      expect(deck).toHaveLength(168);

      const players = makeDefaultPlayers(['Dealer', 'Left', 'C'], 'ai');
      const state = unoNoMercyRuleset.initializeGame(players, 'ai', {
        targetScore: 1000,
        singleRound: true,
      });
      expect(state.currentPlayerIndex).toBe(1); // Left of dealer!
      expect(state.discardPile[0].type).toBe('number'); // Numbered opening card!

      const draw4 = { id: 'd4', color: 'red' as const, type: 'draw4' as const };
      const draw6 = { id: 'd6', color: 'wild' as const, type: 'wild_draw6' as const };
      const smallDraw2 = { id: 'd2', color: 'red' as const, type: 'draw2' as const };

      const s1 = {
        ...state,
        currentPlayerIndex: 0,
        activeColor: 'red' as const,
        players: state.players.map((p, i) => {
          if (i === 0) return { ...p, hand: [draw4, ...p.hand.slice(1)] };
          if (i === 1) return { ...p, hand: [draw6, smallDraw2, ...p.hand.slice(2)] };
          return p;
        }),
      };

      const afterD4 = unoNoMercyRuleset.executeAction(s1, 'p_1', { cardId: 'd4' });
      expect(afterD4.pendingDrawCount).toBe(4);
      expect(unoNoMercyRuleset.validateMove(afterD4, 'p_2', { cardId: 'd2' }).valid).toBe(false);
      expect(unoNoMercyRuleset.validateMove(afterD4, 'p_2', { cardId: 'd6' }).valid).toBe(true);

      const afterStack = unoNoMercyRuleset.executeAction(afterD4, 'p_2', {
        cardId: 'd6',
        chosenColor: 'blue',
      });
      expect(afterStack.pendingDrawCount).toBe(10);

      // Give C 16 cards so drawing +10 pushes C to 26 >= MERCY_LIMIT (25) -> Eliminated!
      const discardCountBefore = afterStack.discardPile.length;
      const bloatedC = {
        ...afterStack,
        players: afterStack.players.map((p, i) =>
          i === 2
            ? {
                ...p,
                hand: Array.from({ length: 16 }, (_, k) => ({
                  id: `pad_${k}`,
                  color: 'blue' as const,
                  type: 'number' as const,
                  value: 1,
                })),
              }
            : p
        ),
      };
      const afterPenalty = unoNoMercyRuleset.handleDrawOrPass(bloatedC, 'p_3');
      expect(MERCY_LIMIT).toBe(25);
      expect(afterPenalty.players[2].eliminated).toBe(true);
      // Eliminated cards go into separate eliminatedCardsPool, NOT directly into discardPile!
      expect(afterPenalty.eliminatedCardsPool?.length).toBe(26);
      expect(afterPenalty.discardPile.length).toBe(discardCountBefore);

      // Official scoring: numbers=face, Color Action=20, Wild=50
      expect(
        calculateNoMercyHandPoints([
          { id: 'n7', color: 'red', type: 'number', value: 7 },
          { id: 'da', color: 'blue', type: 'discard_all' },
          { id: 'd4', color: 'green', type: 'draw4' },
          { id: 'w10', color: 'wild', type: 'wild_draw10' },
        ])
      ).toBe(7 + 20 + 20 + 50);
    });

    it('handles Draw Until Playable, Discard All on top, 2-player Wild Reverse +4 self-bounce, and Wild Color Roulette ignoring Wilds', () => {
      const twoP = makeDefaultPlayers(['A', 'B'], 'local');
      const state = unoNoMercyRuleset.initializeGame(twoP, 'local', {
        targetScore: 1000,
        singleRound: true,
      });

      // 1. Draw Until Playable: draws 2 non-matching green cards then 1 matching red card -> keeps turn!
      const redMatch = { id: 'rm', color: 'red' as const, type: 'number' as const, value: 5 };
      const green1 = { id: 'g1', color: 'green' as const, type: 'number' as const, value: 1 };
      const green2 = { id: 'g2', color: 'green' as const, type: 'number' as const, value: 2 };
      const drawPrep = {
        ...state,
        currentPlayerIndex: 0,
        activeColor: 'red' as const,
        discardPile: [{ id: 'top9', color: 'red' as const, type: 'number' as const, value: 9 }],
        // Stack top is end of array -> pop() pulls green1, then green2, then redMatch!
        drawPile: [...state.drawPile, redMatch, green2, green1],
        players: state.players.map((p, i) => (i === 0 ? { ...p, hand: [{ id: 'y3', color: 'yellow' as const, type: 'number' as const, value: 3 }] } : p)),
      };
      const afterDrawUntil = unoNoMercyRuleset.handleDrawOrPass(drawPrep, 'p_1');
      expect(afterDrawUntil.players[0].hand).toHaveLength(4); // 1 + 3 drawn
      expect(afterDrawUntil.currentPlayerIndex).toBe(0); // Keeps turn to play redMatch!

      // 2. Discard All places same-color cards UNDERNEATH Discard All so Discard All stays on TOP!
      const discAll = { id: 'da1', color: 'red' as const, type: 'discard_all' as const };
      const redSub = { id: 'rs1', color: 'red' as const, type: 'number' as const, value: 2 };
      const blueKeep = { id: 'bk1', color: 'blue' as const, type: 'number' as const, value: 8 };
      const daPrep = {
        ...state,
        currentPlayerIndex: 0,
        activeColor: 'red' as const,
        players: state.players.map((p, i) => (i === 0 ? { ...p, hand: [discAll, redSub, blueKeep] } : p)),
      };
      const afterDA = unoNoMercyRuleset.executeAction(daPrep, 'p_1', { cardId: 'da1' });
      expect(afterDA.discardPile[afterDA.discardPile.length - 1].id).toBe('da1'); // Discard All on TOP!
      expect(afterDA.players[0].hand.map((c) => c.id)).toEqual(['bk1']);

      // 3. 2-player Wild Reverse Draw 4 bounces +4 back onto the actor themselves!
      const wr4 = { id: 'wr4', color: 'wild' as const, type: 'wild_reverse_draw4' as const };
      const wrPrep = {
        ...state,
        currentPlayerIndex: 0,
        players: state.players.map((p, i) => (i === 0 ? { ...p, hand: [wr4, blueKeep] } : p)),
      };
      const afterWR4 = unoNoMercyRuleset.executeAction(wrPrep, 'p_1', {
        cardId: 'wr4',
        chosenColor: 'yellow',
      });
      expect(afterWR4.pendingDrawCount).toBe(4);
      expect(afterWR4.currentPlayerIndex).toBe(0); // Reversed back to A!

      // 4. Wild Color Roulette ignores Wild cards drawn from Draw Pile!
      const roulette = { id: 'wcr', color: 'wild' as const, type: 'wild_color_roulette' as const };
      const wildDummy = { id: 'wdum', color: 'wild' as const, type: 'wild_draw6' as const };
      const blueTarget = { id: 'btgt', color: 'blue' as const, type: 'number' as const, value: 4 };
      const rPrep = {
        ...state,
        currentPlayerIndex: 0,
        drawPile: [...state.drawPile, blueTarget, wildDummy], // pop() gets wildDummy first (MUST NOT stop!), then blueTarget (stops!)
        players: state.players.map((p, i) => (i === 0 ? { ...p, hand: [roulette, blueKeep] } : p)),
      };
      const promptR = unoNoMercyRuleset.executeAction(rPrep, 'p_1', { cardId: 'wcr' });
      expect(promptR.phase).toBe('choose_roulette_color');
      const afterR = unoNoMercyRuleset.resolvePrompt(promptR, { color: 'blue' });
      expect(afterR.players[1].hand.length).toBe(state.players[1].hand.length + 2); // Drew both wildDummy & blueTarget!
    });
  });

  describe('GAME 07 — UNO TEAMS! (Official Rules & Edge Cases)', () => {
    it('builds 112-card deck, supports 2-4 teams, Initial Pass, Going Out odd-half split & 1-card exception', () => {
      const deck = unoTeamsRuleset.createDeck({ targetScore: 500, singleRound: false });
      expect(deck).toHaveLength(112);

      const players = makeDefaultPlayers(['P1', 'P2', 'P3', 'P4'], 'ai', true);
      const init = unoTeamsRuleset.initializeGame(players, 'ai', {
        targetScore: 500,
        singleRound: false,
      });
      // P1 & P3 = Team 0; P2 & P4 = Team 1 (seated across from each other)
      expect(init.players[0].teamId).toBe(0);
      expect(init.players[2].teamId).toBe(0);
      expect(init.players[1].teamId).toBe(1);
      expect(init.players[3].teamId).toBe(1);
      expect(init.discardPile[0].type).toBe('number');
      // Starts in Initial Pass phase for human player!
      expect(init.phase).toBe('choose_pass_card');

      // Complete Initial Pass
      const playing = unoTeamsRuleset.resolvePrompt(init, { passCardId: init.players[0].hand[0].id });
      expect(playing.phase).toBe('playing');
      expect(playing.currentPlayerIndex).toBe(1); // Left of dealer!

      // 1. Going Out with Odd Partner Hand (9 cards -> partner gives 4, keeps 5!)
      const lastCard = { id: 'last1', color: 'red' as const, type: 'number' as const, value: 4 };
      const nineCards = Array.from({ length: 9 }, (_, k) => ({
        id: `p3_${k}`,
        color: 'blue' as const,
        type: 'number' as const,
        value: (k % 9) + 1,
      }));
      const goPrep = {
        ...playing,
        currentPlayerIndex: 0,
        activeColor: 'red' as const,
        players: playing.players.map((p, i) => {
          if (i === 0) return { ...p, hand: [lastCard] };
          if (i === 2) return { ...p, hand: nineCards };
          return p;
        }),
      };
      const afterGo = unoTeamsRuleset.executeAction(goPrep, 'p_1', { cardId: 'last1' });
      expect(afterGo.players[0].hand).toHaveLength(4); // Received 4
      expect(afterGo.players[2].hand).toHaveLength(5); // Partner kept larger half (5)!
      expect(afterGo.players[0].isOut).toBe(false);

      // 2. Going Out 1-Card Exception (partner has 1 card -> P1 stays Out!)
      const excPrep = {
        ...playing,
        currentPlayerIndex: 0,
        activeColor: 'red' as const,
        players: playing.players.map((p, i) => {
          if (i === 0) return { ...p, hand: [lastCard] };
          if (i === 2) return { ...p, hand: [nineCards[0]] };
          return p;
        }),
      };
      const afterExc = unoTeamsRuleset.executeAction(excPrep, 'p_1', { cardId: 'last1' });
      expect(afterExc.players[0].isOut).toBe(true);
      expect(afterExc.players[0].hand).toHaveLength(0);
      expect(afterExc.players[2].hand).toHaveLength(1);
    });

    it('handles Wild Team Play (jump to partner / +2 actor penalty), Wild Team +4 tagging out partner in, and Tagging Back In', () => {
      const players = makeDefaultPlayers(['P1', 'P2', 'P3', 'P4'], 'local', true);
      const init = unoTeamsRuleset.initializeGame(players, 'local', {
        targetScore: 500,
        singleRound: false,
      });
      const state = unoTeamsRuleset.resolvePrompt(init, { passCardId: init.players[0].hand[0].id });

      const wtp = { id: 'wtp', color: 'wild' as const, type: 'wild_team_play' as const };
      const wt4 = { id: 'wt4', color: 'wild' as const, type: 'wild_team_draw4' as const };
      const red5 = { id: 'r5', color: 'red' as const, type: 'number' as const, value: 5 };
      const blue2 = { id: 'b2', color: 'blue' as const, type: 'number' as const, value: 2 };

      // 1. Wild Team Play when partner P3 CAN play red -> turn jumps directly to P3 (index 2)!
      const canPlayPrep = {
        ...state,
        currentPlayerIndex: 0,
        players: state.players.map((p, i) => {
          if (i === 0) return { ...p, hand: [wtp, blue2] };
          if (i === 2) return { ...p, hand: [red5, blue2] };
          return p;
        }),
      };
      const jumped = unoTeamsRuleset.executeAction(canPlayPrep, 'p_1', {
        cardId: 'wtp',
        chosenColor: 'red',
      });
      expect(jumped.currentPlayerIndex).toBe(2); // Jumped straight to partner P3!

      // 2. Wild Team Play when partner P3 CANNOT play green -> actor P1 gets +2 penalty!
      const cantPlayPrep = {
        ...state,
        currentPlayerIndex: 0,
        players: state.players.map((p, i) => {
          if (i === 0) return { ...p, hand: [wtp, blue2] };
          if (i === 2) return { ...p, hand: [blue2] };
          return p;
        }),
      };
      const penalized = unoTeamsRuleset.executeAction(cantPlayPrep, 'p_1', {
        cardId: 'wtp',
        chosenColor: 'green',
      });
      expect(penalized.players[0].hand).toHaveLength(3); // 1 remaining + 2 penalty!

      // 3. Wild Team Draw Four hits BOTH next opponent (P2) AND their OUT partner (P4 -> tagged back in!)
      const wt4Prep = {
        ...state,
        currentPlayerIndex: 0,
        players: state.players.map((p, i) => {
          if (i === 0) return { ...p, hand: [wt4, blue2] };
          if (i === 3) return { ...p, hand: [], isOut: true }; // P4 is currently Out!
          return p;
        }),
      };
      const afterWt4 = unoTeamsRuleset.executeAction(wt4Prep, 'p_1', {
        cardId: 'wt4',
        chosenColor: 'yellow',
      });
      expect(afterWt4.players[1].hand.length).toBe(state.players[1].hand.length + 2);
      expect(afterWt4.players[3].hand).toHaveLength(2);
      expect(afterWt4.players[3].isOut).toBe(false); // Tagged back in!

      // 4. Official Scoring: numbers = face, action = 20, wild = 50
      expect(
        calculateTeamsHandPoints([
          { id: 'n6', color: 'red', type: 'number', value: 6 },
          { id: 'sk', color: 'blue', type: 'skip' },
          { id: 'w', color: 'wild', type: 'wild_team_play' },
        ])
      ).toBe(6 + 20 + 50);
    });
  });

  describe('GAME 08 — UNO ATTACK (Balanced RNG, Standard & Classic Modes)', () => {
    it('builds 112-card Standard & Classic decks, balances 0-12 RNG, blocks Trade Hands as last card, and handles 2p Hit 2 & Wild Hit Fire', () => {
      const stdDeck = unoAttackRuleset.createDeck({ targetScore: 500, singleRound: false, attackDeckMode: 'standard' });
      const clsDeck = unoAttackRuleset.createDeck({ targetScore: 500, singleRound: false, attackDeckMode: 'classic' });
      expect(stdDeck).toHaveLength(112);
      expect(clsDeck).toHaveLength(112);
      expect(clsDeck.some((c) => c.type === 'trade_hands')).toBe(true);
      expect(clsDeck.some((c) => c.type === 'wild_all_hit')).toBe(true);
      expect(clsDeck.some((c) => c.type === 'wild_hit_fire')).toBe(true);

      // Balanced RNG: safe click (0) vs burst (2..12)
      expect(simulateLauncherPresses(1, 'official', () => 0.1)).toBe(0);
      const blast = simulateLauncherPresses(1, 'official', () => 0.99);
      expect(blast).toBeGreaterThanOrEqual(10);
      expect(blast).toBeLessThanOrEqual(12);

      // Trade Hands CANNOT be played as the last card!
      const s2 = unoAttackRuleset.initializeGame(makeDefaultPlayers(['A', 'B'], 'local'), 'local', {
        targetScore: 500,
        singleRound: false,
        attackDeckMode: 'classic',
      });
      const tradeCard = { id: 'tr1', color: 'red' as const, type: 'trade_hands' as const };
      const lastCardTrade = {
        ...s2,
        currentPlayerIndex: 0,
        activeColor: 'red' as const,
        players: s2.players.map((p, i) => (i === 0 ? { ...p, hand: [tradeCard] } : p)),
      };
      expect(unoAttackRuleset.validateMove(lastCardTrade, 'p_1', { cardId: 'tr1' }).valid).toBe(false);

      // 2-player Hit 2 returns turn immediately to actor (index 0)!
      const hit2 = { id: 'h2', color: 'red' as const, type: 'hit2' as const };
      const keep = { id: 'k1', color: 'blue' as const, type: 'number' as const, value: 3 };
      const afterHit2 = unoAttackRuleset.executeAction(
        { ...s2, currentPlayerIndex: 0, activeColor: 'red' as const, players: s2.players.map((p, i) => (i === 0 ? { ...p, hand: [hit2, keep] } : p)) },
        'p_1',
        { cardId: 'h2' }
      );
      expect(afterHit2.currentPlayerIndex).toBe(0);

      // Wild Hit Fire forces victim to press until >= 1 card fires!
      const whf = { id: 'whf', color: 'wild' as const, type: 'wild_hit_fire' as const };
      const afterFire = unoAttackRuleset.executeAction(
        { ...s2, currentPlayerIndex: 0, players: s2.players.map((p, i) => (i === 0 ? { ...p, hand: [whf, keep] } : p)) },
        'p_1',
        { cardId: 'whf', chosenColor: 'green' }
      );
      expect(afterFire.players[1].hand.length).toBeGreaterThan(s2.players[1].hand.length);

      // UNO Catch in UNO Attack presses launcher 2x
      const caught = catchAttackUno({ ...s2, unoVulnerablePlayerId: 'p_1' }, 'B');
      expect(caught.lastAttackResult?.presses).toBe(2);

      // Official scoring: Number=face, Rev/Skip/Hit2=20, DiscardAll/TradeHands=30, Wilds=50
      expect(
        calculateAttackHandPoints([
          { id: '1', color: 'red', type: 'number', value: 5 },
          { id: '2', color: 'red', type: 'hit2' },
          { id: '3', color: 'blue', type: 'trade_hands' },
          { id: '4', color: 'wild', type: 'wild_hit_fire' },
        ])
      ).toBe(5 + 20 + 30 + 50);
    });
  });

  describe('GAME 09 — UNO TRIPLE PLAY (Official 112-Card Rules)', () => {
    it('builds exact 112-card deck, handles Discard Two, Wild Clear, Wild Give Away, Timeout +6 & 20/30/50 scoring', () => {
      const deck = unoTriplePlayRuleset.createDeck({ targetScore: 500, singleRound: false });
      expect(deck).toHaveLength(112);
      expect(deck.filter((c) => c.type === 'number')).toHaveLength(76);
      expect(deck.filter((c) => c.type === 'discard_two')).toHaveLength(8);
      expect(deck.filter((c) => c.type === 'wild_clear')).toHaveLength(4);
      expect(deck.filter((c) => c.type === 'wild_give_away')).toHaveLength(4);

      const players = makeDefaultPlayers(['A', 'B'], 'local');
      const state = unoTriplePlayRuleset.initializeGame(players, 'local', {
        targetScore: 500,
        singleRound: false,
        triplePlayMode: 'timer',
      });
      expect(state.triplePiles).toHaveLength(3);
      expect(state.turnTimerSeconds).toBe(7);

      // 1. Timer Mode timeout -> +6 penalty
      const afterTimeout = handleTriplePlayTimeout(state);
      expect(afterTimeout.players[0].hand.length).toBe(13);
      expect(afterTimeout.currentPlayerIndex).toBe(1);

      // Force Pile #0 lit, red, pressure 5 (near overload)
      const litState = {
        ...state,
        currentPlayerIndex: 0,
        triplePiles: state.triplePiles!.map((p, idx) =>
          idx === 0
            ? { ...p, lit: true, activeColor: 'red' as const, pressure: 5, overloadThreshold: 8 }
            : { ...p, lit: false }
        ),
      };

      // 2. Discard Two sheds 2 same-color cards & adds +2 pressure!
      const d2 = { id: 'dt2', color: 'red' as const, type: 'discard_two' as const };
      const r3 = { id: 'r3', color: 'red' as const, type: 'number' as const, value: 3 };
      const b7 = { id: 'b7', color: 'blue' as const, type: 'number' as const, value: 7 };
      const afterD2 = unoTriplePlayRuleset.executeAction(
        { ...litState, players: litState.players.map((p, i) => (i === 0 ? { ...p, hand: [d2, r3, b7] } : p)) },
        'p_1',
        { cardId: 'dt2', pileIndex: 0 }
      );
      expect(afterD2.players[0].hand.map((c) => c.id)).toEqual(['b7']);
      expect(afterD2.triplePiles?.[0].pressure).toBe(7); // 5 + 2

      // 3. Wild Clear resets pressure to 0 (NEVER overloads!)
      const wc = { id: 'wc1', color: 'wild' as const, type: 'wild_clear' as const };
      const afterWC = unoTriplePlayRuleset.executeAction(
        { ...litState, players: litState.players.map((p, i) => (i === 0 ? { ...p, hand: [wc, b7] } : p)) },
        'p_1',
        { cardId: 'wc1', chosenColor: 'green', pileIndex: 0 }
      );
      expect(afterWC.triplePiles?.[0].pressure).toBe(0);
      expect(afterWC.triplePiles?.[0].activeColor).toBe('green');

      // 4. Wild Give Away gives pile cards to target opponent & resets pressure to 0!
      const wga = { id: 'wga1', color: 'wild' as const, type: 'wild_give_away' as const };
      const afterWGA = unoTriplePlayRuleset.executeAction(
        { ...litState, players: litState.players.map((p, i) => (i === 0 ? { ...p, hand: [wga, b7] } : p)) },
        'p_1',
        { cardId: 'wga1', chosenColor: 'blue', targetPlayerId: 'p_2', pileIndex: 0 }
      );
      expect(afterWGA.players[1].hand.length).toBeGreaterThan(litState.players[1].hand.length);
      expect(afterWGA.triplePiles?.[0].pressure).toBe(0);

      // 5. Official scoring: Numbers=face, Rev/Skip=20, Discard Two=30, Wild/Wild Clear/Give Away=50
      expect(
        calculateTriplePlayHandPoints([
          { id: '1', color: 'red', type: 'number', value: 4 },
          { id: '2', color: 'blue', type: 'skip' },
          { id: '3', color: 'green', type: 'discard_two' },
          { id: '4', color: 'wild', type: 'wild_give_away' },
        ])
      ).toBe(4 + 20 + 30 + 50);
    });
  });

  describe('GAME 10 — UNO JUNIOR (Official 56-Card 3-Level Rules)', () => {
    it('filters 36/48/56-card decks with NO Wild Draw Four, matches by Color/Number/Animal, supports Draw-or-Save, and uses no points', () => {
      const begDeck = unoJuniorRuleset.createDeck({
        targetScore: 0,
        singleRound: true,
        juniorLevel: 'beginner',
      });
      const intDeck = unoJuniorRuleset.createDeck({
        targetScore: 0,
        singleRound: true,
        juniorLevel: 'intermediate',
      });
      const advDeck = unoJuniorRuleset.createDeck({
        targetScore: 0,
        singleRound: true,
        juniorLevel: 'advanced',
      });
      expect(begDeck).toHaveLength(36);
      expect(intDeck).toHaveLength(48);
      expect(advDeck).toHaveLength(56);
      expect(begDeck.every((c) => c.type === 'number' && Boolean(c.animal))).toBe(true);
      expect(advDeck.some((c) => c.type === 'wild_draw4')).toBe(false);

      // 3-criteria matching: Animal match works even with DIFFERENT color & DIFFERENT number!
      const bluePanda5 = { id: 'bp5', color: 'blue' as const, type: 'number' as const, value: 5, animal: '🐼' };
      const redPanda2 = { id: 'rp2', color: 'red' as const, type: 'number' as const, value: 2, animal: '🐼' };
      const greenLion7 = { id: 'gl7', color: 'green' as const, type: 'number' as const, value: 7, animal: '🦁' };
      expect(juniorCardMatches(redPanda2, bluePanda5, 'blue')).toBe(true); // Animal match!
      expect(juniorCardMatches(greenLion7, bluePanda5, 'blue')).toBe(false);

      // Deals 5 cards each, no points (score = 0), and supports Draw-then-Save!
      const players = makeDefaultPlayers(['Anak 1', 'Anak 2'], 'local');
      const state = unoJuniorRuleset.initializeGame(players, 'local', {
        targetScore: 0,
        singleRound: true,
        juniorLevel: 'beginner',
      });
      expect(state.players.every((p) => p.hand.length === 5)).toBe(true);
      expect(unoJuniorRuleset.calculateScore(state, 'p_1')).toBe(0);

      const drawPrep = {
        ...state,
        phase: 'playing' as const,
        currentPlayerIndex: 0,
        activeColor: 'blue' as const,
        discardPile: [bluePanda5],
        drawPile: [...state.drawPile, redPanda2],
      };
      const afterDraw = unoJuniorRuleset.handleDrawOrPass(drawPrep, 'p_1');
      expect(afterDraw.drawnPlayableCardId).toBe('rp2');
      expect(afterDraw.currentPlayerIndex).toBe(0); // Can play immediately or save!
      const afterSave = passAfterJuniorDraw(afterDraw, 'p_1');
      expect(afterSave.drawnPlayableCardId).toBeNull();
      expect(afterSave.currentPlayerIndex).toBe(1);
    });
  });
});
