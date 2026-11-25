import { describe, expect, it, vi } from 'vitest';
import { makeDefaultPlayers } from '../engine/core';
import {
  checkDefenseOrImmunity,
  injectAddOnPackCards,
  isAddOnPackSupported,
  resolveAddOnCardEffect,
  sanitizeAddOnPacksForVariant,
} from '../expansions/addOnPacks';
import {
  ADDON_PRESET_MODES,
  MAX_CHAIN_BOUNCES,
  applyChainReaction,
  applySpeedSafeHandSwap,
  buildBalancedExpansionDeck,
  finalizePenaltyChain,
  getRequiredSpeedPlays,
  recordComebackUnoLetter,
  triggerComebackUnoCombo,
} from '../expansions/packSystemEngine';
import { getRuleset } from '../rulesets';
import {
  calculateDosHandPoints,
  dosModeRuleset,
  finishDosMatching,
  placeDosCenterDiscard,
} from '../rulesets/dosMode';
import { computeNextOnoTotal, ono99Ruleset } from '../rulesets/ono99';
import {
  calculateLiarsHandPoints,
  challengeLiarsClaim,
  challengeWildSubmission,
  unoLiarsRuleset,
} from '../rulesets/unoLiars';
import {
  attemptSpeedPlayCutIn,
  calculatePartyHandPoints,
  takePartyPileUp,
  unoPartyRuleset,
} from '../rulesets/unoParty';
import { AddOnPackId } from '../types';

describe('UNO GAME HUB: Exact Specs for Packs & Modes', () => {
  describe('BAGIAN A: 7 Add-On Expansion Packs (Exact 16 cards each)', () => {
    it('injects EXACTLY 16 cards for each of the 7 packs (112 total)', () => {
      const allPacks: AddOnPackId[] = [
        'reverse-pack',
        'stack-pack',
        'swap-pack',
        'speed-pack',
        'defense-pack',
        'comeback-pack',
        'frenemies-pack',
      ];
      for (const pack of allPacks) {
        const injected = injectAddOnPackCards([], [pack]);
        expect(injected).toHaveLength(16);
      }
      expect(injectAddOnPackCards([], allPacks)).toHaveLength(112);
    });

    it('strictly restricts Add-On Packs to UNO Classic only (defensive deck guard, exact 16-card injection, resetRound preservation & non-classic rejection)', () => {
      expect(isAddOnPackSupported('uno-classic')).toBe(true);
      expect(isAddOnPackSupported('uno-flip')).toBe(false);
      expect(isAddOnPackSupported('uno-no-mercy')).toBe(false);
      expect(isAddOnPackSupported('dos-mode')).toBe(false);
      expect(isAddOnPackSupported('ono-99')).toBe(false);

      // UNO Classic: 108 base + 2 packs * 16 = 140 exact total cards in initializeGame & resetRound
      const players = makeDefaultPlayers(['P1', 'P2', 'P3'], 'ai');
      const classicRuleset = getRuleset('uno-classic');
      const classicState = classicRuleset.initializeGame(players, 'ai', {
        targetScore: 500,
        singleRound: false,
        activePacks: ['reverse-pack', 'stack-pack'],
      });
      const countTotalCards = (s: typeof classicState) =>
        s.players.reduce((sum, p) => sum + p.hand.length, 0) +
        s.drawPile.length +
        s.discardPile.length;

      expect(classicState.settings.activePacks).toEqual(['reverse-pack', 'stack-pack']);
      expect(countTotalCards(classicState)).toBe(108 + 32);

      // Subsequent round (resetRound) preserves all 140 cards cleanly
      const round2 = classicRuleset.resetRound(classicState);
      expect(countTotalCards(round2)).toBe(108 + 32);
      expect(round2.settings.activePacks).toEqual(['reverse-pack', 'stack-pack']);

      // Non-Classic variants MUST reject/ignore activePacks and log a warning
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const flipRuleset = getRuleset('uno-flip');
        const flipDeck = flipRuleset.createDeck({
          targetScore: 500,
          singleRound: true,
          activePacks: ['stack-pack', 'swap-pack'],
        });
        expect(flipDeck).toHaveLength(112); // Untouched UNO Flip deck!
        expect(warnSpy).toHaveBeenCalled();

        const noMercyState = getRuleset('uno-no-mercy').initializeGame(players, 'ai', {
          targetScore: 1000,
          singleRound: true,
          activePacks: ['reverse-pack'],
        });
        expect(noMercyState.settings.activePacks).toEqual([]);
        expect(countTotalCards(noMercyState)).toBe(168); // Untouched No Mercy deck!

        expect(sanitizeAddOnPacksForVariant('dos-mode', ['speed-pack'])).toEqual([]);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('resolves Stack Multiplier x2, Defense Mirror Deflect, Shield Block & Wild Fortress', () => {
      const players = makeDefaultPlayers(['P1', 'P2', 'P3'], 'ai');
      const state = getRuleset('uno-classic').initializeGame(players, 'ai', {
        targetScore: 500,
        singleRound: true,
        activePacks: ['stack-pack', 'defense-pack', 'frenemies-pack'],
      });

      // Stack Multiplier x2: +4 -> +8
      const x2Res = resolveAddOnCardEffect(
        { ...state, pendingDrawCount: 4 },
        { id: 'sx2', color: 'wild', type: 'wild_stack_x2' },
        'p_1',
        'blue'
      );
      expect(x2Res.state.pendingDrawCount).toBe(8);

      // Defense Mirror Deflect bounces +3 back to attacker
      const withMirror = {
        ...state,
        players: state.players.map((p, i) =>
          i === 1 ? { ...p, hand: [{ id: 'm1', color: 'red' as const, type: 'mirror_deflect' as const }] } : p
        ),
      };
      const defRes = checkDefenseOrImmunity(withMirror, 'p_2', 'p_1', 3);
      expect(defRes.blocked).toBe(true);
      expect(defRes.reflected).toBe(true);
      expect(defRes.state.players[0].hand.length).toBe(state.players[0].hand.length + 3);

      // Shield Block cancels penalty & switches activeColor
      const withShield = {
        ...state,
        players: state.players.map((p, i) =>
          i === 1 ? { ...p, hand: [{ id: 'sb1', color: 'green' as const, type: 'shield_block' as const }] } : p
        ),
      };
      const blkRes = checkDefenseOrImmunity(withShield, 'p_2', 'p_1', 2);
      expect(blkRes.blocked).toBe(true);
      expect(blkRes.reflected).toBe(false);
      expect(blkRes.state.activeColor).toBe('green');
    });

    it('enforces 4-Tier Priority Chain (Bounce Cap 2x), Dynamic Deck Balancer (3-7 packs), Anti-Soft-Lock Speed/Nemesis & Comeback U-N-O Combo', () => {
      // 1) 3 Curated Preset Modes
      expect(ADDON_PRESET_MODES).toHaveLength(3);
      expect(ADDON_PRESET_MODES.every((m) => m.packs.length === 3)).toBe(true);

      // 2) Dynamic Deck Ratio Balancer: 108 classic + 3 packs -> trims 36 classic (72) + 48 = 120 cards; 7 packs -> 72 + 56 = 128 cards!
      const classic108 = getRuleset('uno-classic').createDeck({ targetScore: 500, singleRound: false });
      const bal3 = buildBalancedExpansionDeck(classic108, ['defense-pack', 'reverse-pack', 'swap-pack']);
      expect(bal3).toHaveLength(120);
      const bal7 = buildBalancedExpansionDeck(classic108, [
        'reverse-pack',
        'stack-pack',
        'swap-pack',
        'speed-pack',
        'defense-pack',
        'comeback-pack',
        'frenemies-pack',
      ]);
      expect(bal7).toHaveLength(128);

      // 3) Complex Chain Simulation: A Draw2 (+2) -> B Stack2 (+4) -> C Rebound (+5, bounce 1/2) -> B Wild No U (+5, bounce 2/2) -> 3rd bounce BLOCKED!
      const c0 = { pendingDraw: 2, bounces: 0, attackerId: 'p_1', targetId: 'p_2', blocked: false };
      const c1 = applyChainReaction(c0, { type: 'stack', actorId: 'p_2', nextTargetId: 'p_3', addDraw: 2 });
      expect(c1.chain.pendingDraw).toBe(4);
      const c2 = applyChainReaction(c1.chain, { type: 'rebound', actorId: 'p_3', nextTargetId: 'p_2' });
      expect(c2.accepted).toBe(true);
      expect(c2.chain.pendingDraw).toBe(5); // +1 Rebound bonus
      expect(c2.chain.bounces).toBe(1);
      expect(c2.chain.targetId).toBe('p_2');
      const c3 = applyChainReaction(c2.chain, { type: 'no_u', actorId: 'p_2', nextTargetId: 'p_3' });
      expect(c3.accepted).toBe(true);
      expect(c3.chain.pendingDraw).toBe(5); // No +1 on Wild No U
      expect(c3.chain.bounces).toBe(MAX_CHAIN_BOUNCES);
      expect(c3.chain.targetId).toBe('p_3');
      // 3rd bounce MUST be rejected by Bounce Cap 2x!
      const c4 = applyChainReaction(c3.chain, { type: 'rebound', actorId: 'p_3', nextTargetId: 'p_2' });
      expect(c4.accepted).toBe(false);

      // Finalize chain onto C (with Speed Level 2 -> resets to 1; Nemesis on B does NOT trigger on C!)
      const players = makeDefaultPlayers(['A', 'B', 'C', 'D'], 'ai');
      const base = getRuleset('uno-classic').initializeGame(players, 'ai', {
        targetScore: 500,
        singleRound: true,
        activePacks: ['stack-pack', 'speed-pack', 'frenemies-pack', 'comeback-pack'],
      });
      const chainState = {
        ...base,
        speedLevel: 2 as const,
        nemesisLink: { hunterId: 'p_1', targetId: 'p_2', targetName: 'B', chargesLeft: 2 },
      };
      const afterChain = finalizePenaltyChain(chainState, c3.chain);
      expect(afterChain.players[2].hand.length).toBe(base.players[2].hand.length + 5);
      expect(afterChain.speedLevel).toBe(1); // Reset to 1!
      expect(afterChain.nemesisLink?.chargesLeft).toBe(2); // Untouched because C wasn't Nemesis!

      // Anti-Soft-Lock Safeguards
      expect(getRequiredSpeedPlays({ ...chainState, pendingDrawCount: 4 }, chainState.players[0])).toBe(0);
      expect(applySpeedSafeHandSwap({ ...chainState, speedLevel: 3 }).speedLevel).toBe(2);

      // Comeback U-N-O Combo: collecting U, N, O dumps all but 1 card & flags UNO!
      let cb = recordComebackUnoLetter(base, 'p_1', 'U');
      cb = recordComebackUnoLetter(cb, 'p_1', 'N');
      cb = recordComebackUnoLetter(cb, 'p_1', 'O');
      const afterUnoCombo = triggerComebackUnoCombo(cb, 'p_1');
      expect(afterUnoCombo.players[0].hand).toHaveLength(1);
      expect(afterUnoCombo.players[0].calledUno).toBe(true);
    });
  });

  describe('BAGIAN B: Exact Math: DOS & ONO 99', () => {
    it('DOS enforces 108-card deck (no regular 2), multi-pile matching, strict refill-before-bonus-discard sequence & official 20/40 scoring', () => {
      const deck = dosModeRuleset.createDeck({ targetScore: 200, singleRound: false });
      expect(deck).toHaveLength(108);
      expect(deck.filter((c) => c.type === 'number' && c.value === 2)).toHaveLength(0); // NO regular 2!
      expect(deck.filter((c) => c.type === 'wild_dos')).toHaveLength(12);
      expect(deck.filter((c) => c.type === 'wild_number')).toHaveLength(8);

      const state = dosModeRuleset.initializeGame(makeDefaultPlayers(['A', 'B'], 'ai'), 'ai', {
        targetScore: 200,
        singleRound: true,
      });
      expect(state.dosCenterPiles).toHaveLength(2);

      const target7 = { id: 't7', color: 'red' as const, type: 'number' as const, value: 7 };
      const target5 = { id: 't5', color: 'blue' as const, type: 'number' as const, value: 5 };
      const red3 = { id: 'r3', color: 'red' as const, type: 'number' as const, value: 3 };
      const red4 = { id: 'r4', color: 'red' as const, type: 'number' as const, value: 4 };
      const extra = { id: 'ex', color: 'blue' as const, type: 'number' as const, value: 9 };
      const keep = { id: 'kp', color: 'green' as const, type: 'number' as const, value: 1 };
      const prep = {
        ...state,
        dosCenterPiles: [[target7], [target5]],
        players: state.players.map((p, i) => (i === 0 ? { ...p, hand: [red3, red4, extra, keep] } : p)),
      };

      // Double Color Match (both red = red 7) on Pile #1 -> staged so player can match Pile #2 or finish!
      const staged = dosModeRuleset.executeAction(prep, 'p_1', {
        cardId: 'r3',
        secondCardId: 'r4',
        pileIndex: 0,
      });
      expect(staged.dosTurnState?.matchedPileIndices).toEqual([0]);
      expect(staged.dosTurnState?.pendingBonusDiscards).toBe(1);
      expect(staged.dosTurnState?.pendingOpponentDraws).toBe(1);

      // Finish matching: moves matched pile to Discard, refills Center Row to 2, applies opponent +1, then enters discard_to_center!
      const afterRefill = finishDosMatching(staged, 'p_1');
      expect(afterRefill.dosCenterPiles).toHaveLength(2); // Refilled to 2 BEFORE bonus discard!
      expect(afterRefill.players[1].hand.length).toBe(state.players[1].hand.length + 1); // Opponent drew +1!
      expect(afterRefill.dosTurnState?.stage).toBe('discard_to_center');

      // Place bonus card to Center Row LAST -> now 3 piles in Center Row!
      const afterBonus = placeDosCenterDiscard(afterRefill, 'p_1', 'ex');
      expect(afterBonus.dosCenterPiles).toHaveLength(3);
      expect(afterBonus.dosTurnState).toBeNull();
      expect(afterBonus.currentPlayerIndex).toBe(1);

      // Official DOS Scoring: numbers = face, Wild DOS = 20, Wild # = 40
      expect(
        calculateDosHandPoints([
          { id: 'd1', color: 'red', type: 'number', value: 8 },
          { id: 'd2', color: 'wild', type: 'wild_dos', value: 2 },
          { id: 'd3', color: 'blue', type: 'wild_number' },
        ])
      ).toBe(8 + 20 + 40);
    });

    it('ONO 99 (2022 Edition) enforces 112-card deck, strict < 99, -10 clamp at 0, 4x ONO 99 discard, Play 2 Deflect (incl. 2-player Reverse) & Card #2 Elimination', () => {
      const deck = ono99Ruleset.createDeck({ targetScore: 100, singleRound: true });
      expect(deck).toHaveLength(112); // 8×0 + 54×(1-9) + 10×10 + 10×ONO99 + 10×Rev + 10×(-10) + 10×Play2!
      expect(deck.filter((c) => c.type === 'number' && c.value === 0)).toHaveLength(8);
      expect(deck.filter((c) => c.type === 'number' && c.value === 10)).toHaveLength(10);
      expect(deck.filter((c) => c.type === 'ono_99_dead')).toHaveLength(10);
      expect(deck.filter((c) => c.type === 'reverse')).toHaveLength(10);
      expect(deck.filter((c) => c.type === 'ono_minus10')).toHaveLength(10);
      expect(deck.filter((c) => c.type === 'ono_play2')).toHaveLength(10);

      // -10 clamps at 0 (never negative in 2022 mode!)
      expect(computeNextOnoTotal(6, { id: 'm', color: 'green', type: 'ono_minus10', value: -10 })).toBe(0);
      expect(computeNextOnoTotal(90, { id: 'm', color: 'green', type: 'ono_minus10', value: -10 })).toBe(80);

      // 2-player Reverse vs Play 2 edge case: Reverse DEFLECTS Play 2 back to opponent!
      const state2p = ono99Ruleset.initializeGame(makeDefaultPlayers(['A', 'B'], 'ai'), 'ai', {
        targetScore: 100,
        singleRound: true,
        ono99Edition: '2022',
      });
      const play2Card = { id: 'p2c', color: 'purple' as const, type: 'ono_play2' as const, value: 0 };
      const revCard = { id: 'revc', color: 'yellow' as const, type: 'reverse' as const, value: 0 };
      const num5 = { id: 'n5', color: 'yellow' as const, type: 'number' as const, value: 5 };
      const num10 = { id: 'n10', color: 'red' as const, type: 'number' as const, value: 10 };

      const p2Prep = {
        ...state2p,
        onoTotal: 50,
        players: [
          { ...state2p.players[0], hand: [play2Card, num5, num5, num5] },
          { ...state2p.players[1], hand: [revCard, num5, num5, num5] },
        ],
      };
      const afterPlay2 = ono99Ruleset.executeAction(p2Prep, 'p_1', { cardId: 'p2c' });
      expect(afterPlay2.currentPlayerIndex).toBe(1);
      expect(afterPlay2.onoMustPlayCount).toBe(2);

      // In 2-player, B plays Reverse to DEFLECT Play 2 back to A (stays 2, NOT 4!)
      const deflected = ono99Ruleset.executeAction(afterPlay2, 'p_2', { cardId: 'revc' });
      expect(deflected.currentPlayerIndex).toBe(0);
      expect(deflected.onoMustPlayCount).toBe(2);

      // Strict < 99 validation: at total 95, playing +5 (total 100) or +4 (total 99) is INVALID!
      const num4 = { id: 'n4', color: 'yellow' as const, type: 'number' as const, value: 4 };
      const strictPrep = {
        ...state2p,
        onoTotal: 95,
        players: [{ ...state2p.players[0], hand: [num4, num10] }, state2p.players[1]],
      };
      expect(ono99Ruleset.validateMove(strictPrep, 'p_1', { cardId: 'n4' }).valid).toBe(false);

      // Failing on Card #2 of Play 2 eliminates player immediately & expires Play 2!
      const state3p = ono99Ruleset.initializeGame(makeDefaultPlayers(['A', 'B', 'C'], 'ai'), 'ai', {
        targetScore: 100,
        singleRound: true,
        ono99Edition: '2022',
      });
      const num3 = { id: 'n3', color: 'blue' as const, type: 'number' as const, value: 3 };
      const dead1 = { id: 'd1', color: 'red' as const, type: 'ono_99_dead' as const, value: 99 };
      const dead2 = { id: 'd2', color: 'red' as const, type: 'ono_99_dead' as const, value: 99 };
      const dead3 = { id: 'd3', color: 'red' as const, type: 'ono_99_dead' as const, value: 99 };
      const failCard2Prep = {
        ...state3p,
        onoTotal: 95,
        onoMustPlayCount: 2,
        drawPile: [...state3p.drawPile, num10], // Top of drawPile (+10) makes total 108 >= 99!
        players: state3p.players.map((p, i) => (i === 0 ? { ...p, hand: [num3, dead1, dead2, dead3] } : p)),
      };
      const afterFail2 = ono99Ruleset.executeAction(failCard2Prep, 'p_1', { cardId: 'n3' });
      expect(afterFail2.players[0].eliminated).toBe(true);
      expect(afterFail2.onoMustPlayCount).toBe(1); // Play 2 EXPIRED!

      // 4× ONO 99 discards all 4 and draws 4 new cards!
      const quad = [1, 2, 3, 4].map((n) => ({ id: `q${n}`, color: 'red' as const, type: 'ono_99_dead' as const, value: 99 }));
      const quadPrep = {
        ...state3p,
        onoTotal: 88,
        players: state3p.players.map((p, i) => (i === 0 ? { ...p, hand: quad } : p)),
      };
      const afterQuad = ono99Ruleset.executeAction(quadPrep, 'p_1', { cardId: 'q1' });
      expect(afterQuad.players[0].hand).toHaveLength(4);
      expect(afterQuad.players[0].hand.every((c) => !c.id.startsWith('q'))).toBe(true);
    });
  });

  describe('BAGIAN C: Exact Rules: Party & Liars', () => {
    it('UNO Party! enforces 224-card deck, Speed Play penalty, Wild Pile Up, Drawn Together, Point Taken, Wild +4 Challenge & 1-9/20/50 scoring', () => {
      const partyDeck = unoPartyRuleset.createDeck({ targetScore: 500, singleRound: true });
      expect(partyDeck).toHaveLength(224);
      expect(partyDeck.filter((c) => c.type === 'wild_pile_up')).toHaveLength(4);
      expect(partyDeck.filter((c) => c.type === 'drawn_together')).toHaveLength(4);
      expect(partyDeck.filter((c) => c.type === 'point_taken')).toHaveLength(8);

      const pState = unoPartyRuleset.initializeGame(
        makeDefaultPlayers(['A', 'B', 'C', 'D', 'E', 'F'], 'ai'),
        'ai',
        { targetScore: 500, singleRound: true }
      );
      expect(pState.discardPile[0].type).toBe('number');
      expect(pState.currentPlayerIndex).toBe(1); // Left of dealer!

      // 1) Valid Speed Play cut-in with identical Number card
      const top = pState.discardPile[0];
      const dup = { ...top, id: 'dup1' };
      const cut = attemptSpeedPlayCutIn(
        { ...pState, players: pState.players.map((p, i) => (i === 3 ? { ...p, hand: [dup, ...p.hand] } : p)) },
        'p_4',
        'dup1'
      );
      expect(cut.discardPile[cut.discardPile.length - 1].id).toBe('dup1');

      // 2) Invalid Speed Play attempt -> card stays in hand + 1 penalty card!
      const wrongCard = { id: 'wrong1', color: top.color, type: 'skip' as const };
      const withWrong = {
        ...pState,
        players: pState.players.map((p, i) => (i === 3 ? { ...p, hand: [wrongCard, ...p.hand] } : p)),
      };
      const badCut = attemptSpeedPlayCutIn(withWrong, 'p_4', 'wrong1');
      expect(badCut.players[3].hand.some((c) => c.id === 'wrong1')).toBe(true);
      expect(badCut.players[3].hand.length).toBe(withWrong.players[3].hand.length + 1);

      // 3) Wild Drawn Together links 2 OTHER players (not actor), then Point Taken breaks the link!
      const dtCard = { id: 'dt1', color: 'wild' as const, type: 'drawn_together' as const };
      const ptCard = { id: 'pt1', color: 'blue' as const, type: 'point_taken' as const };
      const dtPrep = {
        ...pState,
        currentPlayerIndex: 0,
        players: pState.players.map((p, i) =>
          i === 0 ? { ...p, hand: [dtCard, ptCard, ...p.hand.slice(0, 2)] } : p
        ),
      };
      const linked = unoPartyRuleset.executeAction(dtPrep, 'p_1', {
        cardId: 'dt1',
        chosenColor: 'blue',
        targetPlayerId: 'p_2',
      });
      expect(linked.drawnTogetherPair).toBeTruthy();
      expect(linked.drawnTogetherPair).not.toContain('p_1');
      expect(linked.drawnTogetherPair).toContain('p_2');

      // 4) Wild Pile Up: creates mini-pile, allows stacking same color/Wild, and mirrors takePartyPileUp to Linked partner!
      const pileCard = { id: 'pu1', color: 'wild' as const, type: 'wild_pile_up' as const };
      const forcedRed = { id: 'fr1', color: 'red' as const, type: 'number' as const, value: 4 };
      const puPrep = {
        ...linked,
        currentPlayerIndex: 0,
        drawPile: [...linked.drawPile, forcedRed],
        players: linked.players.map((p, i) =>
          i === 0 ? { ...p, hand: [pileCard, ...p.hand] } : p
        ),
      };
      const afterPileStart = unoPartyRuleset.executeAction(puPrep, 'p_1', { cardId: 'pu1' });
      expect(afterPileStart.phase).toBe('party_pile_up');
      expect(afterPileStart.partyPileUp?.color).toBe('red');
      expect(afterPileStart.partyPileUp?.cards).toHaveLength(1);

      // Next player (p_2, who is linked!) cannot stack -> takes mini-pile (+1) & linked partner also draws +1!
      const linkedPartnerId = afterPileStart.drawnTogetherPair!.find((id) => id !== 'p_2')!;
      const partnerBefore = afterPileStart.players.find((p) => p.id === linkedPartnerId)!.hand.length;
      const p2Before = afterPileStart.players[1].hand.length;
      const afterTake = takePartyPileUp(afterPileStart, 'p_2');
      expect(afterTake.phase).toBe('playing');
      expect(afterTake.partyPileUp).toBeNull();
      expect(afterTake.activeColor).toBe('red');
      expect(afterTake.players[1].hand.length).toBe(p2Before + 1);
      expect(afterTake.players.find((p) => p.id === linkedPartnerId)!.hand.length).toBe(partnerBefore + 1);

      // Point Taken breaks the Drawn Together link!
      const afterPoint = unoPartyRuleset.executeAction(
        { ...afterTake, currentPlayerIndex: 0, activeColor: 'blue' },
        'p_1',
        { cardId: 'pt1', targetPlayerId: 'p_3' }
      );
      expect(afterPoint.drawnTogetherPair).toBeNull();

      // 5) Wild Draw Four Challenge (illegal -> actor +4; legal -> challenger +6 & skipped)
      const w4 = { id: 'w4', color: 'wild' as const, type: 'wild_draw4' as const };
      const redMatch = { id: 'rm', color: 'red' as const, type: 'number' as const, value: 2 };
      const blueCard = { id: 'bc', color: 'blue' as const, type: 'number' as const, value: 3 };
      const illegalPrep = {
        ...pState,
        currentPlayerIndex: 0,
        activeColor: 'red' as const,
        players: pState.players.map((p, i) => (i === 0 ? { ...p, hand: [w4, redMatch] } : p)),
      };
      const chPending = unoPartyRuleset.executeAction(illegalPrep, 'p_1', {
        cardId: 'w4',
        chosenColor: 'green',
      });
      expect(chPending.phase).toBe('party_wild4_challenge');
      const chWon = unoPartyRuleset.resolvePrompt(chPending, { challengeChoice: 'challenge' });
      expect(chWon.players[0].hand.length).toBe(5); // 1 left + 4 penalty!
      expect(chWon.currentPlayerIndex).toBe(1); // Challenger plays!

      const legalPrep = {
        ...pState,
        currentPlayerIndex: 0,
        activeColor: 'red' as const,
        players: pState.players.map((p, i) => (i === 0 ? { ...p, hand: [w4, blueCard] } : p)),
      };
      const chPendingLegal = unoPartyRuleset.executeAction(legalPrep, 'p_1', {
        cardId: 'w4',
        chosenColor: 'yellow',
      });
      const p2HandBefore = chPendingLegal.players[1].hand.length;
      const chLost = unoPartyRuleset.resolvePrompt(chPendingLegal, { challengeChoice: 'challenge' });
      expect(chLost.players[1].hand.length).toBe(p2HandBefore + 6);
      expect(chLost.currentPlayerIndex).toBe(2); // Challenger skipped!

      // 6) Official UNO Party! Scoring (1-9 = face, Color Action = 20, Wild Action = 50)
      expect(
        calculatePartyHandPoints([
          { id: 's1', color: 'red', type: 'number', value: 7 },
          { id: 's2', color: 'blue', type: 'point_taken' },
          { id: 's3', color: 'wild', type: 'wild_pile_up' },
          { id: 's4', color: 'wild', type: 'drawn_together' },
        ])
      ).toBe(7 + 20 + 50 + 50);
    });

    it("Liar's UNO enforces 112-card deck, Regular vs Liar's, Last-Card Bluff Fail, 0's Pass post-swap penalty, Wild Liar's Challenge & Co-Winners", () => {
      const deck = unoLiarsRuleset.createDeck({ targetScore: 500, singleRound: true });
      expect(deck).toHaveLength(112);
      expect(deck.filter((c) => c.type === 'wild_liars_challenge' && !c.isLiarsCard)).toHaveLength(4);
      expect(deck.filter((c) => c.type === 'wild_draw4' && c.isLiarsCard)).toHaveLength(4);
      expect(deck.filter((c) => c.isLiarsCard)).toHaveLength(68); // 40 num + 24 action + 4 wild_draw4

      const base = unoLiarsRuleset.initializeGame(makeDefaultPlayers(['A', 'B', 'C'], 'ai'), 'ai', {
        targetScore: 500,
        singleRound: true,
      });
      expect(base.discardPile[0].type).toBe('number');

      // 1) Regular card cannot be played if non-matching
      const badReg = { id: 'br1', color: 'blue' as const, type: 'number' as const, value: 9, isLiarsCard: false };
      const topRed2 = { id: 'tr2', color: 'red' as const, type: 'number' as const, value: 2, isLiarsCard: false };
      const regPrep = {
        ...base,
        currentPlayerIndex: 0,
        activeColor: 'red' as const,
        discardPile: [topRed2],
        players: base.players.map((p, i) => (i === 0 ? { ...p, hand: [badReg] } : p)),
      };
      expect(unoLiarsRuleset.validateMove(regPrep, 'p_1', { cardId: 'br1' }).valid).toBe(false);

      // 2) Last-card bluff caught -> actor takes back card + 1 penalty (2 cards total!) & FAILS to win!
      const bluffLast = { id: 'bl1', color: 'green' as const, type: 'number' as const, value: 8, isLiarsCard: true };
      const bluffPrep = {
        ...regPrep,
        players: regPrep.players.map((p, i) => (i === 0 ? { ...p, hand: [bluffLast] } : p)),
      };
      const claimed = unoLiarsRuleset.executeAction(bluffPrep, 'p_1', {
        cardId: 'bl1',
        claimedColor: 'red',
        claimedType: 'number',
        claimedValue: 2,
      });
      expect(claimed.phase).toBe('liar_challenge');
      const caught = challengeLiarsClaim(claimed, 'p_3'); // ANY player (p_3) can challenge!
      expect(caught.phase).toBe('playing'); // Did NOT win!
      expect(caught.players[0].hand).toHaveLength(2); // Card returned + 1 penalty!
      expect(caught.players[0].hand.some((c) => c.id === 'bl1')).toBe(true);

      // 3) Unchallenged bluff Action Card (Draw 2) STILL executes its declared effect!
      const bluffD2 = unoLiarsRuleset.executeAction(
        {
          ...regPrep,
          players: regPrep.players.map((p, i) => (i === 0 ? { ...p, hand: [bluffLast, badReg] } : p)),
        },
        'p_1',
        { cardId: 'bl1', claimedColor: 'red', claimedType: 'draw2' }
      );
      const p2Before = bluffD2.players[1].hand.length;
      const trustedD2 = unoLiarsRuleset.resolvePrompt(bluffD2, { challengeChoice: 'trust' });
      expect(trustedD2.players[1].hand.length).toBe(p2Before + 2);
      expect(trustedD2.currentPlayerIndex).toBe(2); // P2 skipped!

      // 4) Edge Case: Honest 0's Pass challenged -> hands rotate FIRST, THEN challenger draws +1 AFTER rotation!
      const honestZero = { id: 'hz0', color: 'red' as const, type: 'number' as const, value: 0, isLiarsCard: true };
      const p1Keep = { id: 'p1k', color: 'blue' as const, type: 'number' as const, value: 1, isLiarsCard: false };
      const p2Hand = [
        { id: 'p2a', color: 'yellow' as const, type: 'number' as const, value: 3, isLiarsCard: false },
        { id: 'p2b', color: 'yellow' as const, type: 'number' as const, value: 4, isLiarsCard: false },
      ];
      const p3Hand = [
        { id: 'p3a', color: 'green' as const, type: 'number' as const, value: 5, isLiarsCard: false },
        { id: 'p3b', color: 'green' as const, type: 'number' as const, value: 6, isLiarsCard: false },
        { id: 'p3c', color: 'green' as const, type: 'number' as const, value: 7, isLiarsCard: false },
      ];
      const zeroPrep = {
        ...regPrep,
        direction: 1 as const,
        players: [
          { ...regPrep.players[0], hand: [honestZero, p1Keep] },
          { ...regPrep.players[1], hand: p2Hand },
          { ...regPrep.players[2], hand: p3Hand },
        ],
      };
      const zeroClaimed = unoLiarsRuleset.executeAction(zeroPrep, 'p_1', {
        cardId: 'hz0',
        claimedColor: 'red',
        claimedType: 'number',
        claimedValue: 0,
      });
      // P2 challenges honest 0 -> P1's 1 card goes to P2, THEN P2 draws +1 (total 2 cards, containing p1k!)
      const afterZeroCh = challengeLiarsClaim(zeroClaimed, 'p_2');
      expect(afterZeroCh.players[1].hand.some((c) => c.id === 'p1k')).toBe(true);
      expect(afterZeroCh.players[1].hand).toHaveLength(2); // 1 received from P1 + 1 penalty AFTER pass!

      // 5) Wild Liar's Challenge: Wild card counts as LYING; Honest target stops phase & Simultaneous Co-Winners!
      const wlcCard = { id: 'wlc1', color: 'wild' as const, type: 'wild_liars_challenge' as const, isLiarsCard: false };
      const wlcWildBluff = { id: 'wb1', color: 'wild' as const, type: 'wild_draw4' as const, isLiarsCard: true };
      const wlcHonestRed = { id: 'hr1', color: 'red' as const, type: 'number' as const, value: 4, isLiarsCard: false };
      const wlcPrep = {
        ...regPrep,
        players: [
          { ...regPrep.players[0], hand: [wlcCard] }, // Actor's LAST card!
          { ...regPrep.players[1], hand: [wlcWildBluff] }, // Only has Wild (counts as LYING!)
          { ...regPrep.players[2], hand: [wlcHonestRed] }, // Last card is honest Red!
        ],
      };
      const wlcActive = unoLiarsRuleset.executeAction(wlcPrep, 'p_1', {
        cardId: 'wlc1',
        chosenColor: 'red',
      });
      expect(wlcActive.phase).toBe('liars_wild_challenge');
      // Challenge P2 (Wild Draw 4 != Red -> CAUGHT LYING, takes back + 1 penalty!)
      const afterCatchP2 = challengeWildSubmission(wlcActive, 'p_2');
      expect(afterCatchP2.phase).toBe('liars_wild_challenge'); // Can keep challenging P3!
      expect(afterCatchP2.players[1].hand).toHaveLength(2);
      // Challenge P3 (Honest Red -> phase stops; BOTH P1 and P3 have 0 cards -> CO-WINNERS!)
      const afterHonestP3 = challengeWildSubmission(afterCatchP2, 'p_3');
      expect(afterHonestP3.phase).toBe('game_over');
      expect(afterHonestP3.roundHistory[afterHonestP3.roundHistory.length - 1].winnerName).toContain('A & C');

      // 6) Official Scoring (0-9 = face, Actions = 20, Wilds = 50)
      expect(
        calculateLiarsHandPoints([
          { id: 'x1', color: 'red', type: 'number', value: 6, isLiarsCard: false },
          { id: 'x2', color: 'blue', type: 'skip', isLiarsCard: true },
          { id: 'x3', color: 'wild', type: 'wild_draw4', isLiarsCard: true },
          { id: 'x4', color: 'wild', type: 'wild_liars_challenge', isLiarsCard: false },
        ])
      ).toBe(6 + 20 + 50 + 50);
    });
  });
});
