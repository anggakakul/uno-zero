import { describe, expect, it } from 'vitest';
import { makeDefaultPlayers } from '../engine/core';
import {
  checkDefenseOrImmunity,
  injectAddOnPackCards,
  resolveAddOnCardEffect,
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
import {
  OVERDRIVE_TOOL_PRESETS,
  applyTippoDrop,
  createInitialToolState,
  getTippoCardWeight,
  grabOrStealPowerRelic,
  resolveFlashReflex,
  triggerBlastLauncher,
  triggerJackpotRoller,
  triggerOverchargeBlast,
  triggerRobotoDirectorCheck,
  triggerSpinWheel,
} from '../expansions/digitalTools';
import { getRuleset } from '../rulesets';
import {
  calculateDosHandPoints,
  dosModeRuleset,
  finishDosMatching,
  placeDosCenterDiscard,
} from '../rulesets/dosMode';
import { computeNextOnoTotal, ono99Ruleset } from '../rulesets/ono99';
import {
  DARE_LISTS_BY_CATEGORY,
  breakEmojiHold,
  calculateDareEmojiHandPoints,
  maintainEmojiExpression,
  unoDareEmojiRuleset,
} from '../rulesets/unoDareEmoji';
import { unoExpressRuleset } from '../rulesets/unoExpress';
import {
  GOLF_TOTAL_ROUNDS,
  calculateGolfGridScore,
  catchGolfUno,
  clearMatchingGolfColumns,
  countFaceDownGolfCards,
  getGolfCardPoints,
  golfDiscardDrawn,
  golfTakeDiscard,
  golfTakeDraw,
  unoGolfRuleset,
} from '../rulesets/unoGolf';
import {
  HEARTS_TARGET_LIMIT,
  getHeartCardRank,
  getHeartPenaltyPoints,
  unoHeartsRuleset,
} from '../rulesets/unoHearts';
import {
  MAX_HOUSE_RULES,
  attemptHouseRemixJumpIn,
  calculateHouseRemixHandPoints,
  completeRuleQTE,
  unoHouseRemixRuleset,
} from '../rulesets/unoHouseRemix';
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
import {
  calculateRummyRackPoints,
  commitRummyTurn,
  findAvailableMeld,
  isValidRummyRun,
  isValidRummySet,
  layOffCardToMeld,
  playRummyMeld,
  revertRummyTurn,
  substituteWildOnBoard,
  unoRummyUpRuleset,
} from '../rulesets/unoRummyUp';
import { AddOnPackId } from '../types';

describe('UNO GAME HUB — Exact Specs for Packs, Tools & Modes', () => {
  describe('BAGIAN A — 7 Add-On Expansion Packs (Exact 16 cards each)', () => {
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

  describe('BAGIAN B — Exact Math: UNO Tippo, DOS & ONO 99', () => {
    it('UNO Tippo calculates exact card weights (1/2/3/4) and tips when Selisih > Batas Kritis', () => {
      expect(getTippoCardWeight({ id: 'a', color: 'red', type: 'number', value: 3 })).toBe(1);
      expect(getTippoCardWeight({ id: 'b', color: 'red', type: 'number', value: 8 })).toBe(2);
      expect(getTippoCardWeight({ id: 'c', color: 'red', type: 'skip' })).toBe(3);
      expect(getTippoCardWeight({ id: 'd', color: 'wild', type: 'wild_draw4' })).toBe(4);

      const players = makeDefaultPlayers(['P1', 'P2'], 'ai');
      const state = getRuleset('uno-classic').initializeGame(players, 'ai', {
        targetScore: 500,
        singleRound: true,
        activeTools: ['uno-tippo', 'uno-spin', 'uno-jackpot', 'uno-power-grab', 'uno-roboto-flash', 'uno-blast'],
      });
      const fixedThresholdState = {
        ...state,
        toolState: { ...createInitialToolState(state.settings), tippoThreshold: 6 },
      };
      const wildCard = { id: 'w1', color: 'wild' as const, type: 'wild' as const }; // weight 4
      const drop1 = applyTippoDrop(fixedThresholdState, wildCard, 'p_1', 'left'); // left=4, diff=4 <= 6
      expect(drop1.toolState?.tippoLeftWeight).toBe(4);
      const drop2 = applyTippoDrop(drop1, wildCard, 'p_1', 'left'); // left=8, diff=8 > 6 -> TIPPED!
      expect(drop2.toolState?.tippoLeftWeight).toBe(0);
      expect(drop2.players[0].hand.length).toBe(state.players[0].hand.length + 3);

      // Verify other tools still work cleanly
      expect(triggerSpinWheel(state, 'p_1', () => 0.1).toolState?.lastSpin).toBeTruthy();
      expect(triggerJackpotRoller(state, 'p_1', () => 0.1).toolState?.lastJackpot?.reels).toHaveLength(3);
      expect(resolveFlashReflex(state, 'p_1', false).players[0].hand.length).toBe(state.players[0].hand.length + 2);
      expect(triggerBlastLauncher(state, 'p_1', () => 0.1).players[0].hand.length).toBeGreaterThan(state.players[0].hand.length);

      // UNO OVERDRIVE: 2 Presets, 4-Relic U-N-O-! Instant Win, Overcharge Launcher & Roboto Director!
      expect(OVERDRIVE_TOOL_PRESETS).toHaveLength(2);
      let rState = grabOrStealPowerRelic(state, 'p_1', 'U');
      rState = grabOrStealPowerRelic(rState, 'p_1', 'N');
      rState = grabOrStealPowerRelic(rState, 'p_1', 'O');
      rState = grabOrStealPowerRelic(rState, 'p_1', '!');
      expect(rState.phase).toBe('game_over');
      expect(rState.winnerId).toBe('p_1');

      // Overcharge Lv.3: 70% +8 attack, 30% backfire (+4 to actor)
      expect(triggerOverchargeBlast(state, 'p_1', 3, () => 0.5).pendingDrawCount).toBe(8);
      expect(triggerOverchargeBlast(state, 'p_1', 3, () => 0.1).players[0].hand.length).toBe(state.players[0].hand.length + 4);

      // Roboto Rubber-Banding Director detects leader <= 2 vs trailing >= 8
      const dirState = triggerRobotoDirectorCheck({
        ...state,
        players: [
          { ...state.players[0], hand: state.players[0].hand.slice(0, 2) },
          { ...state.players[1], hand: [...state.players[1].hand, ...state.players[1].hand] },
        ],
      });
      expect(dirState.toolState?.robotoRule?.targetName).toBe('P1');
    });

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

  describe('BAGIAN C — Exact Rules: Golf, Rummy-Up, Hearts, Party, Liars, House/Remix, Dare/Emoji, Express', () => {
    it('UNO Golf enforces 112-card deck, 1 random face-up, Discard validation, Column Clear (color/value), Dynamic Grid Draw2/DoubleDraw2, UNO penalty & 9 rounds', () => {
      expect(GOLF_TOTAL_ROUNDS).toBe(9);
      const deck = unoGolfRuleset.createDeck({ targetScore: 9, singleRound: false });
      expect(deck).toHaveLength(112);
      expect(deck.filter((c) => c.type === 'double_draw2')).toHaveLength(8);

      // Action cards have higher penalty than 0-9 number cards
      expect(getGolfCardPoints({ id: 'r', color: 'red', type: 'reverse' })).toBeGreaterThan(9);
      expect(getGolfCardPoints({ id: 's', color: 'red', type: 'skip' })).toBeGreaterThan(9);
      expect(getGolfCardPoints({ id: 'd', color: 'red', type: 'draw2' })).toBeGreaterThan(9);
      expect(getGolfCardPoints({ id: 'dd', color: 'red', type: 'double_draw2' })).toBeGreaterThan(9);

      // Column-major pairs: Col 0 (0,1) same value (8 & 8 -> cleared), Col 1 (2,3) same color (green & green -> cleared), Col 2 (4,5) unmatched (2 + 1 = 3)
      const slots = [
        { card: { id: 'c0', color: 'red' as const, type: 'number' as const, value: 8 }, faceUp: true },
        { card: { id: 'c1', color: 'yellow' as const, type: 'number' as const, value: 8 }, faceUp: true },
        { card: { id: 'c2', color: 'green' as const, type: 'number' as const, value: 4 }, faceUp: true },
        { card: { id: 'c3', color: 'green' as const, type: 'number' as const, value: 9 }, faceUp: true },
        { card: { id: 'c4', color: 'blue' as const, type: 'number' as const, value: 2 }, faceUp: true },
        { card: { id: 'c5', color: 'red' as const, type: 'number' as const, value: 1 }, faceUp: true },
      ];
      const cleared = clearMatchingGolfColumns(slots);
      expect(cleared.clearedCount).toBe(2);
      expect(cleared.remaining).toHaveLength(2);
      expect(calculateGolfGridScore(slots, true)).toBe(3);

      // Setup: 6 cards in 2x3 grid, EXACTLY 1 face-up, left of dealer starts (index 1)
      const state = unoGolfRuleset.initializeGame(makeDefaultPlayers(['A', 'B', 'C'], 'ai'), 'ai', {
        targetScore: 9,
        singleRound: false,
      });
      expect(state.players[0].golfSlots).toHaveLength(6);
      expect(countFaceDownGolfCards(state.players[0].golfSlots)).toBe(5);
      expect(state.currentPlayerIndex).toBe(1);

      // Discard Pile validation: Action Card CANNOT be taken!
      const actionDiscard = {
        ...state,
        currentPlayerIndex: 0,
        discardPile: [{ id: 'act1', color: 'red' as const, type: 'skip' as const }],
      };
      const blocked = golfTakeDiscard(actionDiscard, 'p_1');
      expect(blocked.golfDrawnCard).toBeNull();

      // Number card from Discard CAN be taken, MUST swap with face-down (rejects face-up!)
      const numDiscard = {
        ...state,
        currentPlayerIndex: 0,
        discardPile: [{ id: 'num1', color: 'blue' as const, type: 'number' as const, value: 2 }],
      };
      const picked = golfTakeDiscard(numDiscard, 'p_1');
      expect(picked.golfDrawnCard?.source).toBe('discard');
      const faceUpIdx = picked.players[0].golfSlots!.findIndex((s) => s.faceUp);
      const faceDownIdx = picked.players[0].golfSlots!.findIndex((s) => !s.faceUp);
      expect(unoGolfRuleset.validateMove(picked, 'p_1', { cardId: '', golfSlotIndex: faceUpIdx }).valid).toBe(false);
      expect(unoGolfRuleset.validateMove(picked, 'p_1', { cardId: '', golfSlotIndex: faceDownIdx }).valid).toBe(true);

      // Draw Pile -> discarding Draw 2 adds 2 face-down cards to next player's grid & skips them!
      const draw2Top = { id: 'd2top', color: 'red' as const, type: 'draw2' as const };
      const withD2 = { ...state, currentPlayerIndex: 0, drawPile: [...state.drawPile, draw2Top] };
      const drawnD2 = golfTakeDraw(withD2, 'p_1');
      const afterD2 = golfDiscardDrawn(drawnD2, 'p_1');
      expect(afterD2.players[1].golfSlots).toHaveLength(8); // Dynamic 4th column added!
      expect(afterD2.currentPlayerIndex).toBe(2); // P2 skipped!

      // Double Draw 2 -> choose 2 players (+2 each) and NOBODY loses their turn!
      const dd2Top = { id: 'dd2top', color: 'green' as const, type: 'double_draw2' as const };
      const withDD2 = { ...state, currentPlayerIndex: 0, drawPile: [...state.drawPile, dd2Top] };
      const drawnDD2 = golfTakeDraw(withDD2, 'p_1');
      const promptDD2 = golfDiscardDrawn(drawnDD2, 'p_1');
      expect(promptDD2.phase).toBe('golf_double_draw2');
      const resolvedDD2 = unoGolfRuleset.resolvePrompt(promptDD2, {
        targetPlayerId: 'p_2',
        secondTargetPlayerId: 'p_3',
      });
      expect(resolvedDD2.players[1].golfSlots).toHaveLength(8);
      expect(resolvedDD2.players[2].golfSlots).toHaveLength(8);
      expect(resolvedDD2.currentPlayerIndex).toBe(1); // Nobody skipped!

      // UNO! Penalty adds +2 face-down cards to grid
      const caught = catchGolfUno({ ...state, unoVulnerablePlayerId: 'p_1' }, 'B');
      expect(caught.players[0].golfSlots).toHaveLength(8);
      expect(caught.unoVulnerablePlayerId).toBeNull();
    });

    it('UNO Rummy-Up enforces 100-tile deck, 14-tile racks, 4 Starting Tiles, Run/Set & Non-Consecutive Wild validators, Wild Substitution + Revert & Empty Pool Tie-Breaker', () => {
      const deck = unoRummyUpRuleset.createDeck({ targetScore: 200, singleRound: false });
      expect(deck).toHaveLength(100); // 72 Number + 24 Word/Number (#2,#5,#7) + 4 Wild Draw Four!
      expect(deck.filter((t) => t.type === 'wild_draw4')).toHaveLength(4);
      expect(deck.filter((t) => t.type === 'draw2' && t.value === 2)).toHaveLength(8);
      expect(deck.filter((t) => t.type === 'skip' && t.value === 5)).toHaveLength(8);
      expect(deck.filter((t) => t.type === 'reverse' && t.value === 7)).toHaveLength(8);

      // Run & Set Validators (Set max 1 Wild, Run no consecutive Wilds & 1..12 bounds!)
      const w1 = { id: 'w1', color: 'wild' as const, type: 'wild_draw4' as const };
      const w2 = { id: 'w2', color: 'wild' as const, type: 'wild_draw4' as const };
      const r4 = { id: 'r4', color: 'red' as const, type: 'number' as const, value: 4 };
      const r6 = { id: 'r6', color: 'red' as const, type: 'number' as const, value: 6 };
      const r8 = { id: 'r8', color: 'red' as const, type: 'number' as const, value: 8 };
      const r11 = { id: 'r11', color: 'red' as const, type: 'number' as const, value: 11 };
      const r12 = { id: 'r12', color: 'red' as const, type: 'number' as const, value: 12 };
      const b4 = { id: 'b4', color: 'blue' as const, type: 'number' as const, value: 4 };
      const g4 = { id: 'g4', color: 'green' as const, type: 'number' as const, value: 4 };

      expect(isValidRummySet([r4, b4, w1])).toBe(true);
      expect(isValidRummySet([r4, w1, w2])).toBe(false); // Max 1 Wild in Set!
      expect(isValidRummyRun([r4, w1, r6, w2, r8])).toBe(true); // Non-consecutive Wilds allowed!
      expect(isValidRummyRun([r4, w1, w2, r8])).toBe(false); // Adjacent Wilds FORBIDDEN!
      expect(isValidRummyRun([r11, r12, w1])).toBe(false); // Out of 1..12 bounds!

      // Setup: 14 tiles/rack + 4 Starting Tiles (effectConsumed = true)
      const state = unoRummyUpRuleset.initializeGame(makeDefaultPlayers(['A', 'B'], 'ai'), 'ai', {
        targetScore: 200,
        singleRound: false,
        rummyScoringMode: 'points_200',
      });
      expect(state.players[0].hand).toHaveLength(14);
      expect(state.rummyMelds).toHaveLength(4);
      expect(state.rummyMelds?.every((m) => m.kind === 'starting_single' && m.cards[0].rummyEffectConsumed)).toBe(true);

      // Meld + Lay Off + Wild Substitution (must use freed Wild before commit!) + Revert
      const r5 = { id: 'r5', color: 'red' as const, type: 'skip' as const, value: 5, rummyEffectConsumed: false };
      const r7 = { id: 'r7', color: 'red' as const, type: 'reverse' as const, value: 7, rummyEffectConsumed: false };
      const meldPrep = {
        ...state,
        currentPlayerIndex: 0,
        rummyMelds: [{ id: 'm_wild', ownerName: 'Meja', kind: 'set' as const, cards: [r4, b4, w1] }],
        players: state.players.map((p, i) => (i === 0 ? { ...p, hand: [r4, r5, r6, r7, g4] } : p)),
      };
      expect(findAvailableMeld(meldPrep.players[0].hand)).toBeTruthy();

      // Substitute g4 for w1 on board -> commit BLOCKED while w1 is still pending, then Revert restores!
      const subbed = substituteWildOnBoard(meldPrep, 'p_1', 'm_wild', 'g4');
      expect(subbed.rummyTransaction?.pendingSubstitutedWildIds).toContain('w1');
      const blockedCommit = commitRummyTurn(subbed, 'p_1');
      expect(blockedCommit.rummyTransaction).not.toBeNull(); // Blocked!
      const reverted = revertRummyTurn(subbed, 'p_1');
      expect(reverted.rummyTransaction).toBeNull();
      expect(reverted.players[0].hand.some((c) => c.id === 'g4')).toBe(true);

      // Lay Off r8 onto a run!
      const layOffState = layOffCardToMeld(
        {
          ...state,
          currentPlayerIndex: 0,
          rummyMelds: [{ id: 'run1', ownerName: 'A', kind: 'run', cards: [r4, r5, r6, r7] }],
          players: state.players.map((p, i) => (i === 0 ? { ...p, hand: [r8, b4] } : p)),
        },
        'p_1',
        'r8'
      );
      expect(layOffState.rummyMelds?.[0].cards).toHaveLength(5);

      // Play Meld with 2 Word Tiles -> triggers Multi-Word Effect Chooser!
      const multiWord = playRummyMeld(
        {
          ...state,
          currentPlayerIndex: 0,
          rummyMelds: [],
          players: state.players.map((p, i) => (i === 0 ? { ...p, hand: [r5, r6, r7, b4] } : p)),
        },
        'p_1'
      );
      expect(multiWord.phase).toBe('rummy_choose_effect');

      // Empty Pool Tie-Breaker: lowest rack value wins!
      const emptyPoolEnd = unoRummyUpRuleset.handleDrawOrPass(
        {
          ...state,
          currentPlayerIndex: 0,
          drawPile: [],
          players: [
            { ...state.players[0], hand: [r4] }, // 4 pts (lowest -> WINS!)
            { ...state.players[1], hand: [w1] }, // 50 pts
          ],
        },
        'p_1'
      );
      expect(emptyPoolEnd.phase).toBe('round_over');
      expect(emptyPoolEnd.roundHistory[0].winnerId).toBe('p_1');
      expect(calculateRummyRackPoints([r4, r5, w1])).toBe(4 + 20 + 50);
    });

    it('UNO Hearts redesign enforces 100-card deck, 4x Hazard 5, Balanced Wild Shift (+2/rank 7/void-only), Trick Reverse (lowest wins), Clean Sweep (-3) & Fast Shoot the Moon (35pt limit)', () => {
      expect(HEARTS_TARGET_LIMIT).toBe(35);
      const deck = unoHeartsRuleset.createDeck({ targetScore: 35, singleRound: false });
      expect(deck).toHaveLength(100);
      expect(deck.filter((c) => c.type === 'hazard5')).toHaveLength(4); // 1 per color!
      expect(deck.filter((c) => c.type === 'tactical_swap')).toHaveLength(4);
      expect(deck.filter((c) => c.type === 'wild_shift')).toHaveLength(4);

      expect(getHeartPenaltyPoints({ id: 'r1', color: 'red', type: 'number', value: 5 })).toBe(1);
      expect(getHeartPenaltyPoints({ id: 'h5', color: 'yellow', type: 'hazard5', value: 11 })).toBe(5);
      expect(getHeartPenaltyPoints({ id: 'ws', color: 'wild', type: 'wild_shift', value: 7 })).toBe(2);
      expect(getHeartCardRank({ id: 'ws', color: 'wild', type: 'wild_shift', value: 7 })).toBe(7);

      const base = unoHeartsRuleset.initializeGame(makeDefaultPlayers(['P1', 'P2', 'P3'], 'ai'), 'ai', {
        targetScore: 35,
        singleRound: false,
      });

      // Balanced Wild Shift CANNOT be played when holding lead color!
      const ws = { id: 'ws1', color: 'wild' as const, type: 'wild_shift' as const, value: 7 };
      const g6 = { id: 'g6', color: 'green' as const, type: 'number' as const, value: 6 };
      const g3 = { id: 'g3', color: 'green' as const, type: 'number' as const, value: 3 };
      const gRev = { id: 'grev', color: 'green' as const, type: 'reverse' as const, value: 10 };
      const yHaz = { id: 'yhaz', color: 'yellow' as const, type: 'hazard5' as const, value: 11 };

      const wsCheck = {
        ...base,
        currentPlayerIndex: 0,
        heartsLeadColor: 'green' as const,
        players: base.players.map((p, i) => (i === 0 ? { ...p, hand: [ws, g6] } : p)),
      };
      expect(unoHeartsRuleset.validateMove(wsCheck, 'p_1', { cardId: 'ws1' }).valid).toBe(false);

      // UNO Trick Reverse: P1 plays Green 6, P2 plays Green 3, P3 plays Green Reverse -> P2 (LOWEST = 3!) wins trick!
      const revPrep = {
        ...base,
        currentPlayerIndex: 0,
        players: [
          { ...base.players[0], hand: [g6, yHaz] },
          { ...base.players[1], hand: [g3, yHaz] },
          { ...base.players[2], hand: [gRev, yHaz] },
        ],
      };
      const t1 = unoHeartsRuleset.executeAction(revPrep, 'p_1', { cardId: 'g6' });
      const t2 = unoHeartsRuleset.executeAction(t1, 'p_2', { cardId: 'g3' });
      const t3 = unoHeartsRuleset.executeAction(t2, 'p_3', { cardId: 'grev' });
      expect(t3.currentPlayerIndex).toBe(1); // P2 won the reversed trick with lowest rank 3!

      // Clean Sweep (-3 pts catch-up) when finishing round with 0 penalty!
      const cleanEnd = unoHeartsRuleset.checkWinCondition({
        ...base,
        players: [
          { ...base.players[0], hand: [], score: 10, heartsPenalty: 0, heartsCollected: [] },
          { ...base.players[1], hand: [], score: 10, heartsPenalty: 5, heartsCollected: [] },
          { ...base.players[2], hand: [], score: 10, heartsPenalty: 3, heartsCollected: [] },
        ],
      });
      expect(cleanEnd.players[0].score).toBe(7); // 10 - 3 Clean Sweep!

      // Fast Shoot the Moon: P1 collected all 4 Hazard 5 cards -> P1 gets +0, P2 & P3 get +15!
      const fourHazards = ['red', 'yellow', 'green', 'blue'].map((col, idx) => ({
        id: `hz${idx}`,
        color: col as 'red' | 'yellow' | 'green' | 'blue',
        type: 'hazard5' as const,
        value: 11,
      }));
      const moonEnd = unoHeartsRuleset.checkWinCondition({
        ...base,
        players: base.players.map((p, i) => ({
          ...p,
          hand: [],
          score: 0,
          heartsPenalty: i === 0 ? 20 : 0,
          heartsCollected: i === 0 ? fourHazards : [],
        })),
      });
      expect(moonEnd.players[0].score).toBe(0);
      expect(moonEnd.players[1].score).toBe(15);
      expect(moonEnd.players[2].score).toBe(15);
    });

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

      expect(unoExpressRuleset.createDeck({ targetScore: 200, singleRound: true })).toHaveLength(56);
    });

    it('UNO Express supports Classic 56 (+1/Wild+2), Express+ 60 (Wild Snatch & Skip All), Stacking, Turbo Match, First-to-3 & Knockout Sprint', () => {
      const classicDeck = unoExpressRuleset.createDeck({
        targetScore: 250,
        singleRound: false,
        expressDeckMode: 'classic_56',
      });
      expect(classicDeck).toHaveLength(56);
      expect(classicDeck.filter((c) => c.type === 'draw1')).toHaveLength(4);
      expect(classicDeck.filter((c) => c.type === 'wild_draw2')).toHaveLength(2);

      const plusDeck = unoExpressRuleset.createDeck({
        targetScore: 250,
        singleRound: false,
        expressDeckMode: 'plus_60',
      });
      expect(plusDeck).toHaveLength(60);
      expect(plusDeck.filter((c) => c.type === 'wild_express_swap')).toHaveLength(2);
      expect(plusDeck.filter((c) => c.type === 'wild_skip_all')).toHaveLength(2);

      // Express Stacking (+1 -> Wild +2 = +3) & Turbo Match (2 same-number different-color cards)
      const base = unoExpressRuleset.initializeGame(makeDefaultPlayers(['A', 'B', 'C'], 'ai'), 'ai', {
        targetScore: 100,
        singleRound: false,
        expressDeckMode: 'plus_60',
        expressScoringMode: 'first_to_3',
        expressStacking: true,
        expressTurboMatch: true,
      });
      expect(base.players[0].hand).toHaveLength(5);

      const d1 = { id: 'ed1', color: 'red' as const, type: 'draw1' as const };
      const wd2 = { id: 'ewd2', color: 'wild' as const, type: 'wild_draw2' as const };
      const r6 = { id: 'er6', color: 'red' as const, type: 'number' as const, value: 6 };
      const b6 = { id: 'eb6', color: 'blue' as const, type: 'number' as const, value: 6 };
      const stackPrep = {
        ...base,
        currentPlayerIndex: 0,
        activeColor: 'red' as const,
        players: base.players.map((p, i) =>
          i === 0 ? { ...p, hand: [d1, r6] } : i === 1 ? { ...p, hand: [wd2, b6] } : p
        ),
      };
      const afterD1 = unoExpressRuleset.executeAction(stackPrep, 'p_1', { cardId: 'ed1' });
      expect(afterD1.pendingDrawCount).toBe(1);
      const afterWd2 = unoExpressRuleset.executeAction(afterD1, 'p_2', { cardId: 'ewd2', chosenColor: 'blue' });
      expect(afterWd2.pendingDrawCount).toBe(3);

      // Turbo Match drops both 6s (red 6 + blue 6) in 1 turn & switches activeColor to blue!
      const turboPrep = {
        ...base,
        currentPlayerIndex: 0,
        activeColor: 'red' as const,
        discardPile: [{ id: 'tr1', color: 'red' as const, type: 'number' as const, value: 1 }],
        players: base.players.map((p, i) => (i === 0 ? { ...p, hand: [r6, b6, d1] } : p)),
      };
      const afterTurbo = unoExpressRuleset.executeAction(turboPrep, 'p_1', {
        cardId: 'er6',
        extraCardIds: ['eb6'],
      });
      expect(afterTurbo.players[0].hand).toHaveLength(1);
      expect(afterTurbo.activeColor).toBe('blue');

      // Wild Skip All gives actor an immediate extra turn!
      const wsa = { id: 'wsa1', color: 'wild' as const, type: 'wild_skip_all' as const };
      const afterWsa = unoExpressRuleset.executeAction(
        { ...base, currentPlayerIndex: 0, players: base.players.map((p, i) => (i === 0 ? { ...p, hand: [wsa, r6] } : p)) },
        'p_1',
        { cardId: 'wsa1', chosenColor: 'green' }
      );
      expect(afterWsa.currentPlayerIndex).toBe(0);
      expect(afterWsa.activeColor).toBe('green');

      // Knockout Sprint eliminates highest remaining hand points!
      const koWin = unoExpressRuleset.checkWinCondition({
        ...base,
        settings: { ...base.settings, expressScoringMode: 'knockout_sprint' },
        players: [
          { ...base.players[0], hand: [] },
          { ...base.players[1], hand: [{ id: 'lo', color: 'red', type: 'number', value: 1 }] },
          { ...base.players[2], hand: [{ id: 'hi', color: 'wild', type: 'wild' }] }, // 50 pts -> eliminated!
        ],
      });
      expect(koWin.players[2].eliminated).toBe(true);
      expect(koWin.players[1].eliminated).toBe(false);
    });

    it('UNO Dare! & Emoji enforces 220-card deck, Wild Emoji Hold (+4 break), Combo Lock (+4), Dare Anti-Stacking, Wild Customizable & 0-9/20/50 scoring', () => {
      const deck = unoDareEmojiRuleset.createDeck({ targetScore: 500, singleRound: false });
      expect(deck).toHaveLength(220); // 108 UNO Dare + 112 UNO Emoji!
      expect(DARE_LISTS_BY_CATEGORY.family).toHaveLength(10);
      expect(DARE_LISTS_BY_CATEGORY.showoff).toHaveLength(10);
      expect(DARE_LISTS_BY_CATEGORY.daredevil).toHaveLength(10);
      expect(DARE_LISTS_BY_CATEGORY.custom).toHaveLength(10);

      const base = unoDareEmojiRuleset.initializeGame(makeDefaultPlayers(['A', 'B', 'C'], 'ai'), 'ai', {
        targetScore: 250,
        singleRound: false,
        dareCategory: 'daredevil',
      });

      // 1) Wild Emoji stacks 1 number card + activates Emoji Hold on next player!
      const we = { id: 'we1', color: 'wild' as const, type: 'wild_emoji' as const };
      const emNum = { id: 'en1', color: 'blue' as const, type: 'number' as const, value: 3, emoji: '😮', emojiLabel: 'Terkejut Lebar' };
      const keep = { id: 'kp1', color: 'red' as const, type: 'number' as const, value: 1 };
      const wePrep = {
        ...base,
        currentPlayerIndex: 0,
        activeColor: 'red' as const,
        players: base.players.map((p, i) => (i === 0 ? { ...p, hand: [we, emNum, keep] } : p)),
      };
      const afterWe = unoDareEmojiRuleset.executeAction(wePrep, 'p_1', {
        cardId: 'we1',
        secondCardId: 'en1',
        chosenColor: 'blue',
      });
      expect(afterWe.players[0].hand).toHaveLength(1); // Both Wild Emoji & stacked number removed!
      expect(afterWe.emojiChallenge?.targetId).toBe('p_2');
      expect(afterWe.emojiChallenge?.emoji).toBe('😮');
      expect(maintainEmojiExpression(afterWe, 'p_2').emojiChallenge?.maintained).toBe(true);

      // Reporting broken Emoji Hold -> +4 penalty cards!
      const p2BeforeBreak = afterWe.players[1].hand.length;
      const broken = breakEmojiHold(afterWe, 'A');
      expect(broken.players[1].hand.length).toBe(p2BeforeBreak + 4);
      expect(broken.emojiChallenge).toBeNull();

      // 2) Combo Lock: Player with active Emoji Hold hit by Wild Dare -> penaltyDraw = 4!
      const wd = { id: 'wd1', color: 'wild' as const, type: 'wild_dare' as const };
      const comboPrep = {
        ...afterWe,
        currentPlayerIndex: 0,
        players: afterWe.players.map((p, i) => (i === 0 ? { ...p, hand: [wd, keep] } : p)),
      };
      const comboPrompt = unoDareEmojiRuleset.executeAction(comboPrep, 'p_1', {
        cardId: 'wd1',
        chosenColor: 'green',
        pileIndex: 5,
      });
      expect(comboPrompt.darePrompt?.comboLock).toBe(true);
      expect(comboPrompt.darePrompt?.penaltyDraw).toBe(4);
      const comboFailed = unoDareEmojiRuleset.resolvePrompt(comboPrompt, { challengeChoice: 'skip_dare' });
      expect(comboFailed.players[1].hand.length).toBe(afterWe.players[1].hand.length + 4);

      // 3) Anti-Stacking for Dare: Draw 2 stacks, Dare & Wild Dare CANNOT stack!
      const d2 = { id: 'd2x', color: 'red' as const, type: 'draw2' as const };
      const dareC = { id: 'dc1', color: 'red' as const, type: 'dare_card' as const, dareNumber: 2 };
      const stackState = {
        ...base,
        currentPlayerIndex: 0,
        activeColor: 'red' as const,
        pendingDrawCount: 2,
        players: base.players.map((p, i) => (i === 0 ? { ...p, hand: [d2, dareC, wd] } : p)),
      };
      expect(unoDareEmojiRuleset.validateMove(stackState, 'p_1', { cardId: 'd2x' }).valid).toBe(true);
      expect(unoDareEmojiRuleset.validateMove(stackState, 'p_1', { cardId: 'dc1' }).valid).toBe(false);
      expect(unoDareEmojiRuleset.validateMove(stackState, 'p_1', { cardId: 'wd1' }).valid).toBe(false);

      // 4) Wild Customizable saves custom rule + changes color
      const wc = { id: 'wc1', color: 'wild' as const, type: 'wild_customizable' as const };
      const wcPrompt = unoDareEmojiRuleset.executeAction(
        { ...base, currentPlayerIndex: 0, players: base.players.map((p, i) => (i === 0 ? { ...p, hand: [wc, keep] } : p)) },
        'p_1',
        { cardId: 'wc1' }
      );
      expect(wcPrompt.phase).toBe('wild_custom_rule');
      const afterWc = unoDareEmojiRuleset.resolvePrompt(wcPrompt, {
        color: 'yellow',
        textValue: 'Bilang MERAH MENYALA!',
      });
      expect(afterWc.activeColor).toBe('yellow');
      expect(afterWc.activeHouseRules).toContain('Bilang MERAH MENYALA!');

      // 5) Scoring: Numbers = face, Draw2/Skip/Reverse/Dare = 20, Wild/Wild+4/WildDare/WildEmoji/WildCustom = 50
      expect(
        calculateDareEmojiHandPoints([
          { id: 's1', color: 'red', type: 'number', value: 7 },
          { id: 's2', color: 'blue', type: 'dare_card', dareNumber: 1 },
          { id: 's3', color: 'wild', type: 'wild_dare' },
          { id: 's4', color: 'wild', type: 'wild_emoji' },
          { id: 's5', color: 'wild', type: 'wild_customizable' },
        ])
      ).toBe(7 + 20 + 50 + 50 + 50);
    });

    it('UNO House Rules & Remix enforces 5-slot Add-a-Rule + QTE, Wild Game Changer, Wild +4 Challenge, Stacking/Reverse-on-Draw/Multi-Card/Jump-In & Strategic AI', () => {
      const deck = unoHouseRemixRuleset.createDeck({ targetScore: 500, singleRound: false });
      expect(deck).toHaveLength(112);
      expect(deck.some((c) => c.hasRuleBubble)).toBe(true);

      const base = unoHouseRemixRuleset.initializeGame(makeDefaultPlayers(['A', 'B', 'C'], 'ai'), 'ai', {
        targetScore: 500,
        singleRound: false,
        houseRemixConfig: {
          stackingMode: 'mixed',
          reverseOnDraw: true,
          zeroHandSwapMode: 'pass_left',
          multiCardPlay: true,
          speedJumpIn: true,
          maxHouseRules: MAX_HOUSE_RULES,
        },
      });

      // 1) First time playing bubble number 5 -> Add-a-Rule prompt -> creates Slot 1/5
      const r5a = { id: 'r5a', color: 'red' as const, type: 'number' as const, value: 5, hasRuleBubble: true };
      const r5b = { id: 'r5b', color: 'red' as const, type: 'number' as const, value: 5, hasRuleBubble: true };
      const r2 = { id: 'r2', color: 'red' as const, type: 'number' as const, value: 2 };
      const prep = {
        ...base,
        currentPlayerIndex: 0,
        activeColor: 'red' as const,
        discardPile: [r2],
        players: base.players.map((p, i) => (i === 0 ? { ...p, hand: [r5a, r5b, r2] } : p)),
      };
      const prompted = unoHouseRemixRuleset.executeAction(prep, 'p_1', { cardId: 'r5a' });
      expect(prompted.phase).toBe('add_rule_prompt');
      const withRule = unoHouseRemixRuleset.resolvePrompt(prompted, { textValue: 'Tepuk Tangan!' });
      expect(withRule.houseRuleSlots).toHaveLength(1);
      expect(withRule.houseRuleSlots?.[0].triggerNumber).toBe(5);

      // 2) Second time playing bubble number 5 -> triggers QTE; slowest player gets +1 penalty!
      const qteStarted = unoHouseRemixRuleset.executeAction(
        { ...withRule, currentPlayerIndex: 0, activeColor: 'red' },
        'p_1',
        { cardId: 'r5b' }
      );
      expect(qteStarted.phase).toBe('house_rule_qte');
      const p3Before = qteStarted.players[2].hand.length;
      const qte1 = completeRuleQTE(qteStarted, 'p_1');
      const qteDone = completeRuleQTE(qte1, 'p_2'); // P3 is slowest -> +1 penalty!
      expect(qteDone.phase).toBe('playing');
      expect(qteDone.players[2].hand.length).toBe(p3Before + 1);

      // 3) Wild Game Changer replaces active rule slot & changes color
      const wgc = { id: 'wgc1', color: 'wild' as const, type: 'wild_game_changer' as const };
      const wgcPrompt = unoHouseRemixRuleset.executeAction(
        { ...qteDone, currentPlayerIndex: 0, players: qteDone.players.map((p, i) => (i === 0 ? { ...p, hand: [wgc, r2] } : p)) },
        'p_1',
        { cardId: 'wgc1' }
      );
      expect(wgcPrompt.phase).toBe('house_game_changer');
      const afterWgc = unoHouseRemixRuleset.resolvePrompt(wgcPrompt, {
        passCardId: '0',
        color: 'blue',
        textValue: 'Sentuh Hidung!',
      });
      expect(afterWgc.activeColor).toBe('blue');
      expect(afterWgc.houseRuleSlots?.[0].title).toBe('Sentuh Hidung!');

      // 4) Stacking Draw + Reverse-on-Draw (and Jump-In blocked during pendingDrawCount > 0!)
      const d2a = { id: 'd2a', color: 'blue' as const, type: 'draw2' as const };
      const revB = { id: 'revb', color: 'blue' as const, type: 'reverse' as const };
      const stackPrep = {
        ...afterWgc,
        currentPlayerIndex: 0,
        activeColor: 'blue' as const,
        players: afterWgc.players.map((p, i) =>
          i === 0 ? { ...p, hand: [d2a, r2] } : i === 1 ? { ...p, hand: [revB, r2] } : p
        ),
      };
      const stacked = unoHouseRemixRuleset.executeAction(stackPrep, 'p_1', { cardId: 'd2a' });
      expect(stacked.pendingDrawCount).toBe(2);
      // Jump-In MUST be blocked while pendingDrawCount > 0!
      expect(attemptHouseRemixJumpIn(stacked, 'p_3', stacked.players[2].hand[0].id).pendingDrawCount).toBe(2);
      // Reverse-on-Draw bounces +2 back!
      const bounced = unoHouseRemixRuleset.executeAction(stacked, 'p_2', { cardId: 'revb' });
      expect(bounced.direction).toBe(-1);
      expect(bounced.pendingDrawCount).toBe(2);

      // 5) Multi-Card Play + Wild +4 Challenge (+6 wrong challenger)
      const b4a = { id: 'b4a', color: 'blue' as const, type: 'number' as const, value: 4 };
      const b4b = { id: 'b4b', color: 'blue' as const, type: 'number' as const, value: 4 };
      const multiPrep = {
        ...base,
        currentPlayerIndex: 0,
        activeColor: 'blue' as const,
        discardPile: [{ id: 'tb1', color: 'blue' as const, type: 'number' as const, value: 1 }],
        players: base.players.map((p, i) => (i === 0 ? { ...p, hand: [b4a, b4b, r2] } : p)),
      };
      const afterMulti = unoHouseRemixRuleset.executeAction(multiPrep, 'p_1', {
        cardId: 'b4a',
        extraCardIds: ['b4b'],
      });
      expect(afterMulti.players[0].hand).toHaveLength(1); // Both blue 4s played in 1 turn!

      // Wild +4 Challenge (legal -> challenger +6 & skipped)
      const w4 = { id: 'hw4', color: 'wild' as const, type: 'wild_draw4' as const };
      const chPrep = {
        ...base,
        currentPlayerIndex: 0,
        activeColor: 'blue' as const,
        players: base.players.map((p, i) => (i === 0 ? { ...p, hand: [w4, r2] } : p)),
      };
      const chPrompt = unoHouseRemixRuleset.executeAction(chPrep, 'p_1', { cardId: 'hw4', chosenColor: 'green' });
      expect(chPrompt.phase).toBe('house_wild4_challenge');
      const p2BeforeCh = chPrompt.players[1].hand.length;
      const chFailed = unoHouseRemixRuleset.resolvePrompt(chPrompt, { challengeChoice: 'challenge' });
      expect(chFailed.players[1].hand.length).toBe(p2BeforeCh + 6);
      expect(chFailed.currentPlayerIndex).toBe(2);

      // 6) Strategic AI saves Wild card early & attacks leader (<=2 cards) with Action card!
      const aiState = {
        ...base,
        currentPlayerIndex: 0,
        activeColor: 'red' as const,
        players: [
          {
            ...base.players[0],
            isAI: true,
            hand: [
              { id: 'ai_w', color: 'wild' as const, type: 'wild' as const },
              { id: 'ai_r2', color: 'red' as const, type: 'number' as const, value: 2 },
              { id: 'ai_d2', color: 'red' as const, type: 'draw2' as const },
              { id: 'ai_b8', color: 'blue' as const, type: 'number' as const, value: 8 },
            ],
          },
          { ...base.players[1], hand: [r2] }, // Leader with 1 card!
          base.players[2],
        ],
      };
      const aiMove = unoHouseRemixRuleset.decideAIMove(aiState);
      expect(aiMove.type).toBe('play');
      if (aiMove.type === 'play') {
        expect(aiMove.move.cardId).toBe('ai_d2'); // Aggression on leader + saves Wild!
      }

      // 7) Scoring (0-9 = face, Actions = 20, Wilds = 50)
      expect(
        calculateHouseRemixHandPoints([
          { id: 'p1', color: 'red', type: 'number', value: 8 },
          { id: 'p2', color: 'blue', type: 'reverse' },
          { id: 'p3', color: 'wild', type: 'wild_game_changer' },
        ])
      ).toBe(8 + 20 + 50);
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
