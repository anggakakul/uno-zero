import {
  appendEvent,
  drawCardsFromDeck,
  getColorLabel,
  getNextPlayerIndex,
  shuffleCards,
  transitionTurnWithPrivacy,
  uid,
} from '../engine/core';
import {
  AITrackingMemory,
  HouseRemixConfig,
  HouseRuleSlot,
  HubCard,
  HubCardColor,
  HubGameState,
  HubPlayer,
  HubRoundSummary,
  MoveInput,
  UnoRuleset,
  ValidationResult,
  VariantSettings,
} from '../types';
import {
  STANDARD_COLORS,
  finalizeStandardRoundWin,
  standardColorMatchValid,
} from './baseHelpers';

export const MAX_HOUSE_RULES = 5;

export const DEFAULT_HOUSE_REMIX_CONFIG: HouseRemixConfig = {
  stackingMode: 'same_type',
  reverseOnDraw: true,
  zeroHandSwapMode: 'pass_left',
  multiCardPlay: true,
  speedJumpIn: true,
  maxHouseRules: MAX_HOUSE_RULES,
};

export const PRESET_HOUSE_RULES: { title: string; actionLabel: string }[] = [
  { title: 'Tepuk Tangan Cepat!', actionLabel: '👏 TEPUK SEKARANG!' },
  { title: 'Tahan Tawa & Pose Keren!', actionLabel: '😎 POSE SEKARANG!' },
  { title: 'Sentuh Hidung Tercepat!', actionLabel: '👃 SENTUH SEKARANG!' },
  { title: 'Teriak "HOUSE RULES!"', actionLabel: '📢 TERIAK SEKARANG!' },
  { title: 'Angkat Tangan Kanan!', actionLabel: '✋ ANGKAT SEKARANG!' },
];

const RULE_BUBBLE_NUMBERS = new Set([1, 3, 5, 7, 9]);

export function resolveHouseRemixConfig(settings: VariantSettings): HouseRemixConfig {
  return {
    ...DEFAULT_HOUSE_REMIX_CONFIG,
    ...(settings.houseRemixConfig ?? {}),
    maxHouseRules: MAX_HOUSE_RULES,
  };
}

/**
 * 112-Card UNO House Rules & Remix Deck:
 * - 76 Number cards (0×1, 1–9×2 per color; numbers 1,3,5,7,9 carry Speech Bubble 💬 icon)
 * - 24 Color Action cards (Skip×2, Reverse×2, Draw 2×2 per color)
 * -  4 Wild, 4 Wild Draw 4, 4 Wild Game Changer
 * Total = 76 + 24 + 12 = 112 cards!
 */
function buildHouseRemixDeck(): HubCard[] {
  const cards: HubCard[] = [];
  for (const color of STANDARD_COLORS) {
    for (let v = 0; v <= 9; v += 1) {
      const hasRuleBubble = RULE_BUBBLE_NUMBERS.has(v);
      cards.push({ id: uid('hr'), color, type: 'number', value: v, hasRuleBubble });
      if (v > 0) {
        cards.push({ id: uid('hr'), color, type: 'number', value: v, hasRuleBubble });
      }
    }
    for (let i = 0; i < 2; i += 1) {
      cards.push({ id: uid('hr'), color, type: 'skip' });
      cards.push({ id: uid('hr'), color, type: 'reverse' });
      cards.push({ id: uid('hr'), color, type: 'draw2' });
    }
  }
  for (let i = 0; i < 4; i += 1) {
    cards.push({ id: uid('hr'), color: 'wild', type: 'wild' });
    cards.push({ id: uid('hr'), color: 'wild', type: 'wild_draw4' });
    cards.push({ id: uid('hr'), color: 'wild', type: 'wild_game_changer' });
  }
  return cards;
}

/**
 * Official Point Mode Scoring (Target 500 pts):
 * - Numbers 0–9 = face value
 * - Skip, Reverse, Draw 2 = 20 pts
 * - Wild, Wild Draw 4, Wild Game Changer = 50 pts
 */
export function calculateHouseRemixHandPoints(hand: HubCard[]): number {
  return hand.reduce((sum, card) => {
    if (card.type === 'number') return sum + (card.value ?? 0);
    if (card.color === 'wild' || card.type.startsWith('wild')) return sum + 50;
    return sum + 20;
  }, 0);
}

function recordColorPlay(
  mem: AITrackingMemory | undefined,
  playerId: string,
  color: HubCardColor
): AITrackingMemory {
  const base: AITrackingMemory = {
    colorPlayCounts: { ...(mem?.colorPlayCounts ?? {}) },
    colorDrawFailures: { ...(mem?.colorDrawFailures ?? {}) },
  };
  if (color === 'wild') return base;
  const prevPlayer = { ...(base.colorPlayCounts[playerId] ?? {}) };
  prevPlayer[color] = (prevPlayer[color] ?? 0) + 1;
  base.colorPlayCounts[playerId] = prevPlayer;
  return base;
}

function recordColorDrawFailure(
  mem: AITrackingMemory | undefined,
  playerId: string,
  color: HubCardColor
): AITrackingMemory {
  const base: AITrackingMemory = {
    colorPlayCounts: { ...(mem?.colorPlayCounts ?? {}) },
    colorDrawFailures: { ...(mem?.colorDrawFailures ?? {}) },
  };
  if (color === 'wild') return base;
  const prevPlayer = { ...(base.colorDrawFailures[playerId] ?? {}) };
  prevPlayer[color] = (prevPlayer[color] ?? 0) + 1;
  base.colorDrawFailures[playerId] = prevPlayer;
  return base;
}

function chooseStrategicWildColor(
  hand: HubCard[],
  nextPlayerId: string,
  mem: AITrackingMemory | undefined
): HubCardColor {
  let bestColor: HubCardColor = 'red';
  let bestScore = -Infinity;
  for (const col of STANDARD_COLORS) {
    const inHand = hand.filter((c) => c.color === col).length;
    const nextFails = mem?.colorDrawFailures[nextPlayerId]?.[col] ?? 0;
    const nextPlays = mem?.colorPlayCounts[nextPlayerId]?.[col] ?? 0;
    const score = inHand * 12 + nextFails * 10 - nextPlays * 6;
    if (score > bestScore) {
      bestScore = score;
      bestColor = col;
    }
  }
  return bestColor;
}

function createHouseRemixRoundState(
  deck: HubCard[],
  players: HubPlayer[],
  mode: 'local' | 'ai' | 'online',
  settings: VariantSettings,
  roundNumber: number,
  roundHistory: HubRoundSummary[]
): HubGameState {
  const drawPile = [...deck];
  let firstCard: HubCard | undefined;
  for (let guard = 0; guard < drawPile.length; guard += 1) {
    const cand = drawPile.pop();
    if (!cand) break;
    if (cand.type === 'number') {
      firstCard = cand;
      break;
    }
    drawPile.unshift(cand);
  }

  const starterIdx = players.length > 1 ? 1 % players.length : 0;
  const activeColor: HubCardColor =
    firstCard && firstCard.color !== 'wild' ? firstCard.color : 'red';
  const cfg = resolveHouseRemixConfig(settings);

  return appendEvent(
    {
      version: 1,
      variantId: 'uno-house-remix',
      mode,
      phase: 'playing',
      roundNumber,
      players,
      currentPlayerIndex: starterIdx,
      direction: 1,
      drawPile,
      discardPile: firstCard ? [firstCard] : [],
      activeColor,
      pendingDrawCount: 0,
      houseRuleSlots: [],
      activeHouseRules: [],
      activeRuleQTE: null,
      houseRemixConfig: cfg,
      aiMemory: { colorPlayCounts: {}, colorDrawFailures: {} },
      flexChallenge: null,
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
    `📜 Ronde ${roundNumber} UNO House Rules & Remix dimulai! Giliran ${players[starterIdx]?.name}.`
  );
}

/**
 * Resolve Quick-Time Event (QTE) for an active House Rule:
 * Last player who fails to tap / completes last automatically draws +1 penalty card!
 */
export function completeRuleQTE(state: HubGameState, playerId: string): HubGameState {
  const qte = state.activeRuleQTE;
  if (state.phase !== 'house_rule_qte' || !qte) return state;

  const completed = qte.completedPlayerIds.includes(playerId)
    ? qte.completedPlayerIds
    : [...qte.completedPlayerIds, playerId];

  // If only 1 player remains uncompleted -> that slowest player gets +1 penalty card!
  const remaining = state.players.filter((p) => !completed.includes(p.id));
  if (remaining.length <= 1) {
    const loser = remaining[0] ?? state.players[state.players.length - 1];
    const res = drawCardsFromDeck(state.drawPile, state.discardPile, 1);
    const players = state.players.map((p) =>
      p.id === loser.id ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
    );
    const next = appendEvent(
      {
        ...state,
        phase: 'playing',
        players,
        drawPile: res.drawPile,
        discardPile: res.discardPile,
        activeRuleQTE: null,
        pendingPrompt: null,
      },
      'uno_penalty',
      `⚡ QTE "${qte.rule.title}" selesai! ${loser.name} paling lambat → +1 kartu penalti!`
    );
    const checked = unoHouseRemixRuleset.checkWinCondition(next);
    if (checked.phase === 'round_over' || checked.phase === 'game_over') return checked;
    return unoHouseRemixRuleset.advanceTurn(checked, 1);
  }

  return {
    ...state,
    activeRuleQTE: { ...qte, completedPlayerIds: completed },
  };
}

/**
 * Speed UNO (Jump-In): Out-of-turn cut-in when speedJumpIn is enabled!
 * Strictly blocked during pendingDrawCount > 0 or non-'playing' phases, and 1 card at a time.
 */
export function attemptHouseRemixJumpIn(
  state: HubGameState,
  playerId: string,
  cardId: string
): HubGameState {
  const cfg = state.houseRemixConfig ?? resolveHouseRemixConfig(state.settings);
  if (!cfg.speedJumpIn || state.phase !== 'playing' || state.pendingDrawCount > 0) return state;

  const top = state.discardPile[state.discardPile.length - 1];
  if (!top) return state;

  const pIdx = state.players.findIndex((p) => p.id === playerId);
  if (pIdx < 0 || pIdx === state.currentPlayerIndex) return state;

  const player = state.players[pIdx];
  const card = player.hand.find((c) => c.id === cardId);
  if (!card) return state;

  const exactMatch =
    card.color === top.color &&
    card.type === top.type &&
    (card.type !== 'number' || card.value === top.value);
  if (!exactMatch) return state;

  const remaining = player.hand.filter((c) => c.id !== card.id);
  const players = state.players.map((p, i) =>
    i === pIdx ? { ...p, hand: remaining, calledUno: remaining.length === 1 ? p.calledUno : false } : p
  );

  let next = appendEvent(
    {
      ...state,
      players,
      currentPlayerIndex: pIdx,
      discardPile: [...state.discardPile, card],
      activeColor: card.color === 'wild' ? state.activeColor : card.color,
      aiMemory: recordColorPlay(state.aiMemory, playerId, card.color),
      unoVulnerablePlayerId: remaining.length === 1 && !player.calledUno ? player.id : null,
    },
    'speed_play',
    `⚡ SPEED UNO JUMP-IN! ${player.name} memotong giliran dengan kartu identik!`
  );

  next = unoHouseRemixRuleset.checkWinCondition(next);
  if (next.phase === 'round_over' || next.phase === 'game_over') return next;
  return unoHouseRemixRuleset.advanceTurn(next, 1);
}

export const unoHouseRemixRuleset: UnoRuleset = {
  id: 'uno-house-remix',

  createDeck() {
    return buildHouseRemixDeck();
  },

  shuffleDeck(deck) {
    return shuffleCards(deck);
  },

  dealCards(deck, players) {
    const remaining = [...deck];
    const dealt = players.map((p) => ({
      ...p,
      hand: remaining.splice(0, 7),
      calledUno: false,
    }));
    return { players: dealt, remainingDeck: remaining };
  },

  initializeGame(playerInits, mode, settings) {
    const deck = this.shuffleDeck(this.createDeck(settings));
    const initialPlayers: HubPlayer[] = playerInits.map((p) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      hand: [],
      score: 0,
      calledUno: false,
    }));
    const { players, remainingDeck } = this.dealCards(deck, initialPlayers, settings);
    return createHouseRemixRoundState(remainingDeck, players, mode, settings, 1, []);
  },

  validateMove(state: HubGameState, playerId: string, move: MoveInput): ValidationResult {
    if (state.phase !== 'playing') return { valid: false, reason: 'Permainan tidak aktif.' };
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.id !== playerId) return { valid: false, reason: 'Bukan giliranmu.' };

    const card = current.hand.find((c) => c.id === move.cardId);
    if (!card) return { valid: false, reason: 'Kartu tidak ditemukan.' };

    const cfg = state.houseRemixConfig ?? resolveHouseRemixConfig(state.settings);
    const extras = move.extraCardIds ?? [];

    // PRIORITY 1: Pending Draw Stack (Stacking / Reverse-on-Draw)
    if (state.pendingDrawCount > 0) {
      if (extras.length > 0) {
        return { valid: false, reason: 'Multi-Card Play tidak berlaku saat menumpuk penalti.' };
      }
      if (cfg.reverseOnDraw && card.type === 'reverse' && card.color === state.activeColor) {
        return { valid: true };
      }
      const top = state.discardPile[state.discardPile.length - 1];
      if (cfg.stackingMode === 'same_type') {
        const ok =
          (top?.type === 'draw2' && card.type === 'draw2') ||
          (top?.type === 'wild_draw4' && card.type === 'wild_draw4');
        return ok
          ? { valid: true, requiresColor: card.color === 'wild' }
          : { valid: false, reason: `Tumpuk kartu tipe sama atau ambil +${state.pendingDrawCount}!` };
      }
      if (cfg.stackingMode === 'mixed') {
        const ok = card.type === 'draw2' || card.type === 'wild_draw4';
        return ok
          ? { valid: true, requiresColor: card.color === 'wild' }
          : { valid: false, reason: `Tumpuk +2/+4 atau ambil +${state.pendingDrawCount}!` };
      }
      return { valid: false, reason: `Ambil +${state.pendingDrawCount} kartu penalti!` };
    }

    // PRIORITY 2: Multi-Card Play validation (exact color & number match)
    if (extras.length > 0) {
      if (!cfg.multiCardPlay || card.type !== 'number') {
        return { valid: false, reason: 'Multi-Card Play hanya untuk salinan kartu angka identik!' };
      }
      const allIdentical = extras.every((eid) => {
        const ec = current.hand.find((c) => c.id === eid);
        return ec && ec.id !== card.id && ec.type === 'number' && ec.color === card.color && ec.value === card.value;
      });
      if (!allIdentical) {
        return { valid: false, reason: 'Semua kartu tambahan harus warna & angka identik!' };
      }
    }

    // PRIORITY 3: Standard UNO color/number/symbol match
    if (!standardColorMatchValid(state, card)) {
      return { valid: false, reason: 'Kartu tidak cocok warna, angka, atau simbol!' };
    }

    return { valid: true, requiresColor: card.color === 'wild' };
  },

  executeAction(state: HubGameState, playerId: string, move: MoveInput): HubGameState {
    const val = this.validateMove(state, playerId, move);
    if (!val.valid) return state;

    const cfg = state.houseRemixConfig ?? resolveHouseRemixConfig(state.settings);
    const current = state.players[state.currentPlayerIndex];
    const card = current.hand.find((c) => c.id === move.cardId)!;
    const extras = (move.extraCardIds ?? [])
      .map((eid) => current.hand.find((c) => c.id === eid))
      .filter((c): c is HubCard => Boolean(c));
    const playedIds = new Set([card.id, ...extras.map((c) => c.id)]);

    // 1) WILD GAME CHANGER: replace an existing rule + pick color (or just pick color if no active rules!)
    if (card.type === 'wild_game_changer' && !move.chosenColor) {
      const slots = state.houseRuleSlots ?? [];
      if (slots.length > 0) {
        return {
          ...state,
          phase: 'house_game_changer',
          pendingPrompt: {
            type: 'house_game_changer',
            actorId: playerId,
            cardId: card.id,
            message: '🌪️ WILD GAME CHANGER! Ganti salah satu aturan aktif & pilih warna baru:',
          },
        };
      }
      return {
        ...state,
        phase: 'choose_color',
        pendingPrompt: {
          type: 'color',
          actorId: playerId,
          cardId: card.id,
          message: '🌪️ WILD GAME CHANGER (belum ada aturan aktif): Pilih warna berikutnya:',
        },
      };
    }

    // 2) Standard Wild / Wild Draw 4 color selection
    if (card.color === 'wild' && !move.chosenColor) {
      return {
        ...state,
        phase: 'choose_color',
        pendingPrompt: {
          type: 'color',
          actorId: playerId,
          cardId: card.id,
          message: 'Pilih warna aktif:',
        },
      };
    }

    // 3) Zero Hand Swap ('choose_target' mode)
    const remainingHand = current.hand.filter((c) => !playedIds.has(c.id));
    if (
      card.type === 'number' &&
      card.value === 0 &&
      cfg.zeroHandSwapMode === 'choose_target' &&
      remainingHand.length > 0 &&
      !move.targetPlayerId
    ) {
      return {
        ...state,
        phase: 'choose_target',
        pendingPrompt: {
          type: 'target_swap',
          actorId: playerId,
          cardId: card.id,
          message: '🔀 ATURAN ANGKA 0! Pilih 1 pemain untuk bertukar seluruh kartu:',
        },
      };
    }

    // Check Wild Draw 4 legality BEFORE removing card
    const actorWasGuiltyForWild4 = current.hand.some(
      (c) => c.id !== card.id && c.color === state.activeColor
    );

    let direction = state.direction;
    let steps = 1;
    let pendingDrawCount = state.pendingDrawCount;
    let drawPile = [...state.drawPile];
    let discardPile = [...state.discardPile, ...extras, card];
    const activeColor: HubCardColor =
      card.color === 'wild' ? move.chosenColor ?? 'red' : card.color;
    const aiMemory = recordColorPlay(state.aiMemory, playerId, activeColor);

    let players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex
        ? { ...p, hand: remainingHand, calledUno: remainingHand.length === 1 ? p.calledUno : false }
        : p
    );
    const unoVulnerablePlayerId =
      remainingHand.length === 1 && !current.calledUno ? current.id : null;

    const multiNote = extras.length > 0 ? ` (×${extras.length + 1} Multi-Card!)` : '';
    let msg = `${current.name} memainkan ${card.type === 'number' ? `${getColorLabel(card.color)} ${card.value}` : card.type.toUpperCase()}${multiNote}.`;

    // === REVERSE-ON-DRAW ===
    if (card.type === 'reverse' && pendingDrawCount > 0 && cfg.reverseOnDraw) {
      direction = (direction * -1) as 1 | -1;
      msg = `🔄 REVERSE-ON-DRAW! ${current.name} memantulkan tumpukan +${pendingDrawCount} kartu kembali!`;
    } else if (card.type === 'reverse') {
      if (players.length === 2) {
        steps = 2;
        msg = `🔄 ${current.name} memainkan REVERSE (2 pemain = Skip)!`;
      } else {
        direction = (direction * -1) as 1 | -1;
        msg = `🔄 ${current.name} membalik arah giliran!`;
      }
    } else if (card.type === 'skip') {
      steps = 2;
      msg = `🚫 ${current.name} melewati pemain berikutnya!`;
    } else if (card.type === 'draw2') {
      if (cfg.stackingMode !== 'off' || cfg.reverseOnDraw) {
        pendingDrawCount += 2;
        msg = `🔥 ${current.name} menumpuk +2! Total penalti kini +${pendingDrawCount} kartu!`;
      } else {
        const victimIdx = getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1);
        const res = drawCardsFromDeck(drawPile, discardPile, 2);
        drawPile = res.drawPile;
        discardPile = res.discardPile;
        players = players.map((p, i) =>
          i === victimIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
        );
        steps = 2;
        msg = `${current.name} memainkan +2! ${players[victimIdx].name} ambil 2 kartu & dilewati.`;
      }
    } else if (card.type === 'wild_draw4') {
      const victimIdx = getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1);
      const victim = players[victimIdx];
      // Stacking continuation vs Fresh Wild +4 Challenge!
      if (pendingDrawCount > 0 && cfg.stackingMode !== 'off') {
        pendingDrawCount += 4;
        msg = `🔥 ${current.name} menumpuk WILD +4 (${getColorLabel(activeColor)})! Total penalti: +${pendingDrawCount}!`;
      } else if (remainingHand.length === 0) {
        const res = drawCardsFromDeck(drawPile, discardPile, 4);
        drawPile = res.drawPile;
        discardPile = res.discardPile;
        players = players.map((p, i) =>
          i === victimIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
        );
        msg = `${current.name} menutup ronde dengan WILD +4! ${victim.name} ambil 4 kartu.`;
      } else {
        // Fresh Wild +4 -> Official Challenge (+6 wrong / +4 right) OR Stack!
        return appendEvent(
          {
            ...state,
            phase: 'house_wild4_challenge',
            players,
            currentPlayerIndex: victimIdx,
            direction,
            drawPile,
            discardPile,
            activeColor,
            aiMemory,
            unoVulnerablePlayerId,
            flexChallenge: {
              actorId: current.id,
              actorName: current.name,
              challengerId: victim.id,
              challengerName: victim.name,
              chosenColor: activeColor,
              actorWasGuilty: actorWasGuiltyForWild4,
            },
            pendingPrompt: {
              type: 'house_wild4_challenge',
              actorId: victim.id,
              message: `⚔️ ${current.name} memainkan WILD +4 (${getColorLabel(activeColor)})! ${victim.name}: Terima +4 atau Challenge?`,
            },
          },
          'wild_draw4',
          `${current.name} memainkan WILD +4 (${getColorLabel(activeColor)})! Menunggu keputusan ${victim.name}...`
        );
      }
    } else if (card.type === 'number' && card.value === 0 && cfg.zeroHandSwapMode !== 'off') {
      if (cfg.zeroHandSwapMode === 'pass_left') {
        const oldHands = players.map((p) => p.hand);
        const n = players.length;
        players = players.map((p, i) => ({
          ...p,
          hand: oldHands[(i - direction + n) % n],
          calledUno: false,
        }));
        msg += ' 🔁 ATURAN ANGKA 0: Semua pemain mengoper seluruh kartunya!';
      } else if (cfg.zeroHandSwapMode === 'choose_target' && move.targetPlayerId) {
        const tIdx = players.findIndex((p) => p.id === move.targetPlayerId);
        if (tIdx >= 0 && tIdx !== state.currentPlayerIndex) {
          const aHand = players[state.currentPlayerIndex].hand;
          const tHand = players[tIdx].hand;
          players = players.map((p, i) =>
            i === state.currentPlayerIndex
              ? { ...p, hand: tHand, calledUno: tHand.length === 1 ? p.calledUno : false }
              : i === tIdx
              ? { ...p, hand: aHand, calledUno: aHand.length === 1 ? p.calledUno : false }
              : p
          );
          msg += ` 🔀 ATURAN ANGKA 0: ${current.name} bertukar kartu dengan ${players[tIdx].name}!`;
        }
      }
    }

    const baseNext: HubGameState = {
      ...state,
      phase: 'playing',
      players,
      direction,
      pendingDrawCount,
      drawPile,
      discardPile,
      activeColor,
      aiMemory,
      pendingPrompt: null,
      unoVulnerablePlayerId,
    };

    // Check immediate win before rule prompts
    const checkedWin = this.checkWinCondition(baseNext);
    if (checkedWin.phase === 'round_over' || checkedWin.phase === 'game_over') {
      return checkedWin;
    }

    // === ADD-A-RULE (Speech Bubble Number Cards: 1, 3, 5, 7, 9) ===
    if (card.type === 'number' && card.hasRuleBubble && card.value !== undefined) {
      const slots = state.houseRuleSlots ?? [];
      const existingRule = slots.find((s) => s.triggerNumber === card.value);

      if (existingRule) {
        // Trigger QTE! All players must tap; slowest draws +1!
        return appendEvent(
          {
            ...baseNext,
            phase: 'house_rule_qte',
            activeRuleQTE: {
              rule: existingRule,
              triggeredBy: current.name,
              completedPlayerIds: [],
              startedAt: Date.now(),
            },
          },
          'house_rule_qte',
          `💬 ANGKA ${card.value} MEMICU ATURAN: "${existingRule.title}" — Tekan tombol QTE sekarang! Paling lambat +1 kartu!`
        );
      }

      if (slots.length < cfg.maxHouseRules) {
        // First time this bubble number is played in this round -> actor creates a custom rule!
        return appendEvent(
          {
            ...baseNext,
            phase: 'add_rule_prompt',
            pendingPrompt: {
              type: 'add_rule',
              actorId: playerId,
              pileIndex: card.value, // Stores the triggerNumber cleanly!
              message: `💬 ADD-A-RULE (Angka ${card.value})! Buat atau pilih aturan kustom (Slot ${slots.length + 1}/5):`,
            },
          },
          'add_a_rule',
          `${msg} 💬 Angka ${card.value} belum punya aturan — ${current.name} membuat aturan baru!`
        );
      }
    }

    const withEv = appendEvent(baseNext, card.type, msg);
    return this.advanceTurn(withEv, steps);
  },

  advanceTurn(state, steps = 1) {
    const nextIdx = getNextPlayerIndex(state.players, state.currentPlayerIndex, state.direction, steps);
    return transitionTurnWithPrivacy(state, nextIdx);
  },

  calculateScore(state, winnerId) {
    return state.players
      .filter((p) => p.id !== winnerId)
      .reduce((sum, p) => sum + calculateHouseRemixHandPoints(p.hand), 0);
  },

  checkWinCondition(state) {
    const winner = state.players.find((p) => p.hand.length === 0);
    if (!winner) return state;
    const pts = this.calculateScore(state, winner.id);
    return finalizeStandardRoundWin(state, winner.id, pts, 'Juara UNO House Rules & Remix!');
  },

  resetRound(state) {
    const deck = this.shuffleDeck(this.createDeck(state.settings));
    const resetPlayers = state.players.map((p) => ({ ...p, hand: [], calledUno: false }));
    const { players, remainingDeck } = this.dealCards(deck, resetPlayers, state.settings);
    return createHouseRemixRoundState(
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

    const count = state.pendingDrawCount > 0 ? state.pendingDrawCount : 1;
    const res = drawCardsFromDeck(state.drawPile, state.discardPile, count);
    const players = state.players.map((p, i) =>
      i === state.currentPlayerIndex
        ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false }
        : p
    );
    const aiMemory = recordColorDrawFailure(state.aiMemory, playerId, state.activeColor);
    const nextIdx = getNextPlayerIndex(players, state.currentPlayerIndex, state.direction, 1);

    const next = appendEvent(
      {
        ...state,
        players,
        drawPile: res.drawPile,
        discardPile: res.discardPile,
        pendingDrawCount: 0,
        aiMemory,
      },
      'draw',
      state.pendingDrawCount > 0
        ? `💥 ${current.name} menarik total +${res.drawn.length} kartu tumpukan penalti!`
        : `${current.name} mengambil 1 kartu dari Draw Pile.`
    );
    return transitionTurnWithPrivacy(next, nextIdx);
  },

  resolvePrompt(state, payload) {
    if (!state.pendingPrompt) return state;

    // 1) ADD-A-RULE prompt (binds custom/preset rule to triggerNumber, max 5 slots)
    if (state.pendingPrompt.type === 'add_rule') {
      const triggerNumber = state.pendingPrompt.pileIndex ?? 5;
      const slots = state.houseRuleSlots ?? [];
      const preset = PRESET_HOUSE_RULES[slots.length % PRESET_HOUSE_RULES.length];
      const title = payload.textValue?.trim() || preset.title;
      const actorName =
        state.players.find((p) => p.id === state.pendingPrompt?.actorId)?.name ?? 'Pemain';

      const newSlot: HouseRuleSlot = {
        slotIndex: slots.length,
        triggerNumber,
        title,
        actionLabel: `⚡ AKSI ANGKA ${triggerNumber}!`,
        createdBy: actorName,
      };
      const updatedSlots = [...slots, newSlot].slice(0, MAX_HOUSE_RULES);
      const next = appendEvent(
        {
          ...state,
          phase: 'playing',
          pendingPrompt: null,
          houseRuleSlots: updatedSlots,
          activeHouseRules: updatedSlots.map((s) => `[#${s.triggerNumber}] ${s.title}`),
        },
        'add_a_rule',
        `📜 ATURAN BARU (Angka ${triggerNumber}): "${title}" aktif di Slot ${updatedSlots.length}/5!`
      );
      return this.advanceTurn(next, 1);
    }

    // 2) WILD GAME CHANGER prompt (replace an active rule slot + pick color)
    if (state.pendingPrompt.type === 'house_game_changer' && state.pendingPrompt.cardId) {
      const slots = state.houseRuleSlots ?? [];
      const targetIdx = payload.passCardId ? Number(payload.passCardId) : 0;
      const safeIdx = targetIdx >= 0 && targetIdx < slots.length ? targetIdx : 0;
      const newTitle =
        payload.textValue?.trim() ||
        PRESET_HOUSE_RULES[Math.floor(Math.random() * PRESET_HOUSE_RULES.length)].title;
      const updatedSlots = slots.map((s, i) =>
        i === safeIdx ? { ...s, title: newTitle } : s
      );
      const updatedState: HubGameState = {
        ...state,
        phase: 'playing',
        pendingPrompt: null,
        houseRuleSlots: updatedSlots,
        activeHouseRules: updatedSlots.map((s) => `[#${s.triggerNumber}] ${s.title}`),
      };
      return this.executeAction(updatedState, state.pendingPrompt.actorId, {
        cardId: state.pendingPrompt.cardId,
        chosenColor: payload.color ?? 'red',
      });
    }

    // 3) WILD DRAW 4 CHALLENGE (+6 wrong challenger / +4 guilty actor)
    if (state.pendingPrompt.type === 'house_wild4_challenge' && state.flexChallenge) {
      const ch = state.flexChallenge;
      const challengerIdx = state.players.findIndex((p) => p.id === ch.challengerId);
      let players = [...state.players];
      let drawPile = [...state.drawPile];
      let discardPile = [...state.discardPile];
      let msg = '';
      let nextTurnIdx = challengerIdx;

      if (payload.challengeChoice === 'challenge') {
        if (ch.actorWasGuilty) {
          const res = drawCardsFromDeck(drawPile, discardPile, 4);
          drawPile = res.drawPile;
          discardPile = res.discardPile;
          players = players.map((p) =>
            p.id === ch.actorId ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
          );
          msg = `🚨 CHALLENGE BENAR! ${ch.actorName} masih punya warna cocok → ${ch.actorName} tarik 4 kartu! Giliran ${ch.challengerName}.`;
          nextTurnIdx = challengerIdx;
        } else {
          const res = drawCardsFromDeck(drawPile, discardPile, 6);
          drawPile = res.drawPile;
          discardPile = res.discardPile;
          players = players.map((p) =>
            p.id === ch.challengerId
              ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false }
              : p
          );
          msg = `😎 CHALLENGE SALAH! ${ch.actorName} jujur → ${ch.challengerName} tarik 6 kartu & kehilangan giliran!`;
          nextTurnIdx = getNextPlayerIndex(players, challengerIdx, state.direction, 1);
        }
      } else {
        const res = drawCardsFromDeck(drawPile, discardPile, 4);
        drawPile = res.drawPile;
        discardPile = res.discardPile;
        players = players.map((p) =>
          p.id === ch.challengerId
            ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false }
            : p
        );
        msg = `${ch.challengerName} menerima WILD +4 (+4 kartu) & dilewati.`;
        nextTurnIdx = getNextPlayerIndex(players, challengerIdx, state.direction, 1);
      }

      const resolved = appendEvent(
        {
          ...state,
          phase: 'playing',
          players,
          drawPile,
          discardPile,
          flexChallenge: null,
          pendingPrompt: null,
        },
        'challenge_resolved',
        msg
      );
      return transitionTurnWithPrivacy(resolved, nextTurnIdx);
    }

    // 4) Color or Target Swap prompt
    if (!state.pendingPrompt.cardId) return state;
    return this.executeAction(
      { ...state, phase: 'playing', pendingPrompt: null },
      state.pendingPrompt.actorId,
      {
        cardId: state.pendingPrompt.cardId,
        chosenColor: payload.color ?? state.activeColor,
        targetPlayerId: payload.targetPlayerId,
      }
    );
  },

  /**
   * Strategic Bot AI (4 Pillars):
   * 1. Card & Color Tracking (keep colors opponents draw on, switch away from their strong colors)
   * 2. Aggression on Leader (prioritize Action cards when any opponent has <= 2 cards)
   * 3. Wild Card Saving (hold Wild cards until end-game unless necessary)
   * 4. Point Mode Awareness (dump high-value cards early in 500-pt mode)
   */
  decideAIMove(state) {
    if (state.pendingPrompt?.type === 'add_rule') {
      const preset = PRESET_HOUSE_RULES[Math.floor(Math.random() * PRESET_HOUSE_RULES.length)];
      return { type: 'resolve_prompt' as const, payload: { textValue: preset.title } };
    }
    if (state.pendingPrompt?.type === 'house_game_changer') {
      const curr = state.players.find((p) => p.id === state.pendingPrompt?.actorId);
      const nextIdx = getNextPlayerIndex(state.players, state.currentPlayerIndex, state.direction, 1);
      const bestColor = chooseStrategicWildColor(
        curr?.hand ?? [],
        state.players[nextIdx]?.id ?? '',
        state.aiMemory
      );
      const preset = PRESET_HOUSE_RULES[Math.floor(Math.random() * PRESET_HOUSE_RULES.length)];
      return {
        type: 'resolve_prompt' as const,
        payload: { color: bestColor, textValue: preset.title, passCardId: '0' },
      };
    }
    if (state.pendingPrompt?.type === 'house_wild4_challenge') {
      return {
        type: 'resolve_prompt' as const,
        payload: { challengeChoice: Math.random() < 0.35 ? ('challenge' as const) : ('trust' as const) },
      };
    }
    if (state.pendingPrompt?.type === 'target_swap') {
      const opp = state.players
        .filter((p) => p.id !== state.pendingPrompt?.actorId)
        .sort((a, b) => a.hand.length - b.hand.length)[0];
      return { type: 'resolve_prompt' as const, payload: { targetPlayerId: opp?.id ?? state.players[0].id } };
    }

    const curr = state.players[state.currentPlayerIndex];
    const nextIdx = getNextPlayerIndex(state.players, state.currentPlayerIndex, state.direction, 1);
    const nextPlayer = state.players[nextIdx];
    const cfg = state.houseRemixConfig ?? resolveHouseRemixConfig(state.settings);
    const mem = state.aiMemory;

    const playable = curr.hand.filter((c) => this.validateMove(state, curr.id, { cardId: c.id }).valid);
    if (playable.length === 0) return { type: 'draw' as const };

    const leaderAlert = state.players.some((p) => p.id !== curr.id && p.hand.length <= 2);
    const isPointMode = !state.settings.singleRound;

    const scored = playable.map((card) => {
      let score = 0;
      const isWild = card.color === 'wild';
      const isAction =
        card.type === 'skip' ||
        card.type === 'reverse' ||
        card.type === 'draw2' ||
        card.type === 'wild_draw4';

      // Wild Card Saving
      if (isWild) {
        score += curr.hand.length <= 2 ? 40 : -35;
      }

      // Aggression on Leader
      if (leaderAlert && isAction) {
        score += nextPlayer.hand.length <= 2 ? 45 : 20;
      }

      // Point Mode Awareness (dump high-value cards early!)
      if (isPointMode && !isWild) {
        score += card.type === 'number' ? (card.value ?? 0) * 1.5 : 18;
      }

      // Card & Color Tracking
      if (card.color !== 'wild' && mem) {
        const nextFails = mem.colorDrawFailures[nextPlayer.id]?.[card.color] ?? 0;
        const nextPlays = mem.colorPlayCounts[nextPlayer.id]?.[card.color] ?? 0;
        score += nextFails * 10 - nextPlays * 5;
      }

      // Multi-Card Play combo bonus
      if (cfg.multiCardPlay && card.type === 'number' && state.pendingDrawCount === 0) {
        const dupes = curr.hand.filter(
          (c) => c.id !== card.id && c.color === card.color && c.value === card.value
        ).length;
        score += dupes * 16;
      }

      return { card, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0].card;
    const chosenColor =
      best.color === 'wild'
        ? chooseStrategicWildColor(curr.hand, nextPlayer.id, mem)
        : undefined;
    const extraCardIds =
      cfg.multiCardPlay && best.type === 'number' && state.pendingDrawCount === 0
        ? curr.hand
            .filter((c) => c.id !== best.id && c.color === best.color && c.value === best.value)
            .map((c) => c.id)
        : undefined;

    return {
      type: 'play' as const,
      move: { cardId: best.id, chosenColor, extraCardIds },
    };
  },
};
