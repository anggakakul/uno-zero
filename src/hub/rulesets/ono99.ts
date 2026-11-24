import {
  appendEvent,
  drawCardsFromDeck,
  getActivePlayers,
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
  UnoRuleset,
  ValidationResult,
  VariantSettings,
} from '../types';
import { finalizeStandardRoundWin } from './baseHelpers';

/**
 * Modular ONO 99 Rule Config — cleanly separates Official 2022 Edition from Classic 1980s Mode!
 */
export interface Ono99RuleConfig {
  edition: '2022' | 'classic_1980s';
  /** Running total must stay strictly below bustThreshold (99 in 2022!) */
  bustThreshold: number;
  /** Clamp -10 at 0 (never negative in 2022); Classic 1980s allows negative totals */
  allowNegativeTotal: boolean;
  /** If true (2022), no 3-chip system -> instant elimination when unable to play < 99 */
  instantElimination: boolean;
  /** Classic 1980s 3-chip starting count */
  startingChips: number;
  /** Whether discarding 4x ONO 99 resets total to 0 (false in 2022, true in 1980s) */
  quadOno99ResetsTotal: boolean;
}

export const ONO99_CONFIG_2022: Ono99RuleConfig = {
  edition: '2022',
  bustThreshold: 99,
  allowNegativeTotal: false,
  instantElimination: true,
  startingChips: 1,
  quadOno99ResetsTotal: false,
};

export const ONO99_CONFIG_CLASSIC_1980S: Ono99RuleConfig = {
  edition: 'classic_1980s',
  bustThreshold: 99,
  allowNegativeTotal: true,
  instantElimination: false,
  startingChips: 3,
  quadOno99ResetsTotal: true,
};

export function resolveOno99Config(settings: VariantSettings): Ono99RuleConfig {
  return settings.ono99Edition === 'classic_1980s'
    ? ONO99_CONFIG_CLASSIC_1980S
    : ONO99_CONFIG_2022;
}

/**
 * Official 2022 Edition ONO 99 Deck (Exact 112 Cards, 2–6 players):
 * -  8 × Number 0
 * - 54 × Numbers 1–9 (6 copies each)
 * - 10 × Number 10
 * - 10 × ONO 99 (unplayable dead card unless holding all 4!)
 * - 10 × Reverse
 * - 10 × -10
 * - 10 × Play 2
 * Total = 8 + 54 + 10 + 10 + 10 + 10 + 10 = 112 cards!
 */
function buildOno99Deck2022(): HubCard[] {
  const cards: HubCard[] = [];
  for (let i = 0; i < 8; i += 1) {
    cards.push({ id: uid('ono'), color: 'blue', type: 'number', value: 0 });
  }
  for (let v = 1; v <= 9; v += 1) {
    const col = v >= 7 ? 'red' : v >= 4 ? 'yellow' : 'blue';
    for (let i = 0; i < 6; i += 1) {
      cards.push({ id: uid('ono'), color: col, type: 'number', value: v });
    }
  }
  for (let i = 0; i < 10; i += 1) {
    cards.push({ id: uid('ono'), color: 'red', type: 'number', value: 10 });
    cards.push({ id: uid('ono'), color: 'red', type: 'ono_99_dead', value: 99 });
    cards.push({ id: uid('ono'), color: 'yellow', type: 'reverse', value: 0 });
    cards.push({ id: uid('ono'), color: 'green', type: 'ono_minus10', value: -10 });
    cards.push({ id: uid('ono'), color: 'purple', type: 'ono_play2', value: 0 });
  }
  return cards;
}

/**
 * Compute next running total for a card.
 * In 2022 mode: -10 clamps at 0 (total NEVER goes negative, so -10 is always safe even when total < 10!).
 */
export function computeNextOnoTotal(
  currentTotal: number,
  card: HubCard,
  allowNegative = false
): number {
  if (card.type === 'ono_minus10') {
    return allowNegative ? currentTotal - 10 : Math.max(0, currentTotal - 10);
  }
  if (card.type === 'ono_hold' || card.type === 'reverse' || card.type === 'ono_play2') {
    return currentTotal;
  }
  return currentTotal + (card.value ?? 0);
}

/** Check if a single card can be legally played without reaching/exceeding 99 */
export function canPlayOnoCard(
  hand: HubCard[],
  card: HubCard,
  currentTotal: number,
  cfg: Ono99RuleConfig
): boolean {
  if (card.type === 'ono_99_dead') {
    return hand.filter((c) => c.type === 'ono_99_dead').length === 4;
  }
  const nextTotal = computeNextOnoTotal(currentTotal, card, cfg.allowNegativeTotal);
  return nextTotal < cfg.bustThreshold;
}

export function hasAnyLegalOnoMove(
  hand: HubCard[],
  currentTotal: number,
  cfg: Ono99RuleConfig
): boolean {
  return hand.some((c) => canPlayOnoCard(hand, c, currentTotal, cfg));
}

/** Eliminate a player (2022: instant elimination with hand revealed, Play 2 expires!) */
function eliminateOnoPlayer(
  state: HubGameState,
  playerIdx: number,
  reason: string
): HubGameState {
  const cfg = resolveOno99Config(state.settings);
  const target = state.players[playerIdx];
  if (!target) return state;

  let players = state.players.map((p, idx) => {
    if (idx !== playerIdx) return p;
    if (cfg.instantElimination) {
      return { ...p, onoChips: 0, eliminated: true }; // Hand stays visible/revealed!
    }
    const nextChips = Math.max(0, (p.onoChips ?? 3) - 1);
    return { ...p, onoChips: nextChips, eliminated: nextChips <= 0 };
  });

  const nextTotal = cfg.instantElimination ? (state.onoTotal ?? 0) : 0;
  let next = appendEvent(
    {
      ...state,
      players,
      onoTotal: nextTotal,
      onoMustPlayCount: 1, // Play 2 effect EXPIRES upon elimination!
    },
    'eliminated',
    reason
  );

  next = ono99Ruleset.checkWinCondition(next);
  if (next.phase === 'round_over' || next.phase === 'game_over') return next;
  return ono99Ruleset.advanceTurn(next, 1);
}

function createOno99RoundState(
  deck: HubCard[],
  players: HubPlayer[],
  mode: 'local' | 'ai' | 'online',
  settings: VariantSettings,
  roundNumber: number,
  roundHistory: HubRoundSummary[]
): HubGameState {
  const cfg = resolveOno99Config(settings);
  return appendEvent(
    {
      version: 1,
      variantId: 'ono-99',
      mode,
      phase: 'playing',
      roundNumber,
      players,
      currentPlayerIndex: 0,
      direction: 1,
      drawPile: deck,
      discardPile: [],
      activeColor: 'red',
      pendingDrawCount: 0,
      onoTotal: 0,
      onoMustPlayCount: 1,
      onoLastSuccessfulPlayerId: null,
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
    `🔥 Ronde ${roundNumber} ONO 99 (${cfg.edition === '2022' ? 'Edisi 2022 • 112 Kartu' : 'Classic 1980s'}) dimulai! Jaga total DI BAWAH 99! Giliran ${players[0]?.name}.`
  );
}

export const ono99Ruleset: UnoRuleset = {
  id: 'ono-99',

  createDeck() {
    return buildOno99Deck2022();
  },

  shuffleDeck(deck) {
    return shuffleCards(deck);
  },

  dealCards(deck, players, settings) {
    const cfg = resolveOno99Config(settings);
    const remaining = [...deck];
    const dealt = players.map((p) => ({
      ...p,
      hand: remaining.splice(0, 4), // 4 cards dealt at start!
      onoChips: cfg.startingChips,
      eliminated: false,
      calledUno: false,
    }));
    return { players: dealt, remainingDeck: remaining };
  },

  initializeGame(playerInits, mode, settings) {
    const cfg = resolveOno99Config(settings);
    const deck = this.shuffleDeck(this.createDeck(settings));
    const clamped = playerInits.slice(0, 6); // 2–6 players
    const initialPlayers: HubPlayer[] = clamped.map((p) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      hand: [],
      score: 0,
      onoChips: cfg.startingChips,
      eliminated: false,
      calledUno: false,
    }));
    const { players, remainingDeck } = this.dealCards(deck, initialPlayers, settings);
    return createOno99RoundState(remainingDeck, players, mode, settings, 1, []);
  },

  validateMove(state: HubGameState, playerId: string, move: MoveInput): ValidationResult {
    if (state.phase !== 'playing') return { valid: false, reason: 'Permainan tidak aktif.' };
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.id !== playerId || current.eliminated) {
      return { valid: false, reason: 'Bukan giliranmu.' };
    }
    const card = current.hand.find((c) => c.id === move.cardId);
    if (!card) return { valid: false, reason: 'Kartu tidak ditemukan.' };

    const cfg = resolveOno99Config(state.settings);
    if (card.type === 'ono_99_dead') {
      const deadCount = current.hand.filter((c) => c.type === 'ono_99_dead').length;
      if (deadCount < 4) {
        return {
          valid: false,
          reason: 'Kartu ONO 99 tidak bisa dimainkan kecuali memegang tepat 4 kartu ONO 99 sekaligus!',
        };
      }
      return { valid: true };
    }

    const nextTotal = computeNextOnoTotal(state.onoTotal ?? 0, card, cfg.allowNegativeTotal);
    if (nextTotal >= cfg.bustThreshold) {
      return {
        valid: false,
        reason: `Kartu ini membuat total menjadi ${nextTotal} (≥ 99)! Pilih kartu lain yang menjaga total < 99.`,
      };
    }

    return { valid: true };
  },

  executeAction(state: HubGameState, playerId: string, move: MoveInput): HubGameState {
    const val = this.validateMove(state, playerId, move);
    if (!val.valid) return state;

    const cfg = resolveOno99Config(state.settings);
    const current = state.players[state.currentPlayerIndex];
    const card = current.hand.find((c) => c.id === move.cardId)!;
    const prevTotal = state.onoTotal ?? 0;
    const activeCount = getActivePlayers(state.players).length;
    const underPlay2 = (state.onoMustPlayCount ?? 1) === 2;
    let direction = state.direction;

    // 1) QUAD ONO 99: Holding all 4 ONO 99 cards -> discard all 4 & draw 4 new cards!
    if (
      card.type === 'ono_99_dead' &&
      current.hand.filter((c) => c.type === 'ono_99_dead').length === 4
    ) {
      const drawRes = drawCardsFromDeck(state.drawPile, [...state.discardPile, ...current.hand], 4);
      const players = state.players.map((p, idx) =>
        idx === state.currentPlayerIndex ? { ...p, hand: drawRes.drawn } : p
      );
      const next = appendEvent(
        {
          ...state,
          players,
          drawPile: drawRes.drawPile,
          discardPile: drawRes.discardPile,
          onoTotal: cfg.quadOno99ResetsTotal ? 0 : prevTotal,
          onoMustPlayCount: 1,
          onoLastSuccessfulPlayerId: current.id,
        },
        'ono_quad_reset',
        `🌟 4× ONO 99! ${current.name} membuang keempat kartu ONO 99 sekaligus & mengambil 4 kartu baru!`
      );
      return this.advanceTurn(next, 1);
    }

    // 2) Play card & immediately draw 1 replacement card (auto-reshuffling discard pile if needed!)
    const newTotal = computeNextOnoTotal(prevTotal, card, cfg.allowNegativeTotal);
    const remaining = current.hand.filter((c) => c.id !== card.id);
    const drawRes = drawCardsFromDeck(state.drawPile, [...state.discardPile, card], 1);
    const newHand = [...remaining, ...drawRes.drawn];

    const players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex ? { ...p, hand: newHand } : p
    );

    // 3) EDGE CASE: Counter/Deflect Play 2 with Play 2 OR Reverse (works even in 2-player!)
    if (underPlay2 && (card.type === 'ono_play2' || card.type === 'reverse')) {
      if (card.type === 'reverse' && activeCount > 2) {
        direction = (direction * -1) as 1 | -1;
      }
      const next = appendEvent(
        {
          ...state,
          players,
          direction,
          drawPile: drawRes.drawPile,
          discardPile: drawRes.discardPile,
          onoTotal: newTotal,
          onoMustPlayCount: 2, // Deflected (NOT stacked to 4)!
          onoLastSuccessfulPlayerId: current.id,
        },
        'play',
        `🛡️ DEFLECT PLAY 2! ${current.name} memantulkan efek Play 2 dengan ${card.type === 'reverse' ? 'REVERSE' : 'PLAY 2'} ke pemain berikutnya!`
      );
      return this.advanceTurn(next, 1);
    }

    // 4) Normal Reverse (in 2-player acts like 0 -> turn simply continues to opponent!)
    if (card.type === 'reverse' && activeCount > 2) {
      direction = (direction * -1) as 1 | -1;
    }

    // 5) Normal Play 2 played on a normal turn -> next player must play 2 cards!
    if (!underPlay2 && card.type === 'ono_play2') {
      const next = appendEvent(
        {
          ...state,
          players,
          direction,
          drawPile: drawRes.drawPile,
          discardPile: drawRes.discardPile,
          onoTotal: newTotal,
          onoMustPlayCount: 2,
          onoLastSuccessfulPlayerId: current.id,
        },
        'play',
        `⚡ ${current.name} memainkan PLAY 2! Pemain berikutnya wajib main 2 kartu berturut-turut (atau tangkis dengan Play 2 / Reverse)!`
      );
      return this.advanceTurn(next, 1);
    }

    // 6) Player was under Play 2 and just played their 1st card -> still owes 2nd card!
    if (underPlay2) {
      const midState = appendEvent(
        {
          ...state,
          players,
          direction,
          drawPile: drawRes.drawPile,
          discardPile: drawRes.discardPile,
          onoTotal: newTotal,
          onoMustPlayCount: 1, // 1 card left to play on this turn!
          onoLastSuccessfulPlayerId: current.id,
        },
        'play',
        `⚡ ${current.name} memainkan kartu ke-1 dari Play 2 (Total: ${newTotal}/98). Masih wajib memainkan kartu ke-2!`
      );

      // Edge Case: Failed on Card #2 -> immediately eliminated AND Play 2 effect EXPIRES!
      if (!hasAnyLegalOnoMove(newHand, newTotal, cfg)) {
        return eliminateOnoPlayer(
          midState,
          state.currentPlayerIndex,
          `💥 GAGAL KARTU KE-2 PLAY 2! ${current.name} tidak punya kartu aman (< 99) → TERSINGKIR! Efek Play 2 hangus.`
        );
      }

      // Stay on current player to play their 2nd card!
      return midState;
    }

    // 7) Standard single card play -> advance turn!
    const msg =
      card.type === 'ono_minus10'
        ? `📉 ${current.name} memainkan -10 → Total kini ${newTotal}/98!`
        : card.type === 'reverse'
        ? activeCount === 2
          ? `🔄 ${current.name} memainkan REVERSE (2 pemain = 0) → Total tetap ${newTotal}/98!`
          : `🔄 ${current.name} membalik arah giliran → Total tetap ${newTotal}/98!`
        : `➕ ${current.name} memainkan +${card.value} → Total kini ${newTotal}/98!`;

    const next = appendEvent(
      {
        ...state,
        players,
        direction,
        drawPile: drawRes.drawPile,
        discardPile: drawRes.discardPile,
        onoTotal: newTotal,
        onoMustPlayCount: 1,
        onoLastSuccessfulPlayerId: current.id,
      },
      'play',
      msg
    );
    return this.advanceTurn(next, 1);
  },

  advanceTurn(state, steps = 1) {
    const nextIdx = getNextPlayerIndex(state.players, state.currentPlayerIndex, state.direction, steps);
    return transitionTurnWithPrivacy(state, nextIdx);
  },

  calculateScore() {
    return 100;
  },

  checkWinCondition(state) {
    const alive = state.players.filter((p) => !p.eliminated);
    if (alive.length === 1) {
      return finalizeStandardRoundWin(
        state,
        alive[0].id,
        100,
        `🏆 ${alive[0].name} adalah penyintas terakhir ONO 99!`
      );
    }
    // Edge case: all players eliminated -> last player who successfully played a card wins!
    if (alive.length === 0) {
      const lastOkId = state.onoLastSuccessfulPlayerId ?? state.players[0].id;
      const winner = state.players.find((p) => p.id === lastOkId) ?? state.players[0];
      return finalizeStandardRoundWin(
        state,
        winner.id,
        100,
        `🏆 Semua pemain kehabisan kartu aman! ${winner.name} (pemain terakhir yang berhasil main) menang!`
      );
    }
    return state;
  },

  resetRound(state) {
    const cfg = resolveOno99Config(state.settings);
    const deck = this.shuffleDeck(this.createDeck(state.settings));
    const resetPlayers = state.players.map((p) => ({
      ...p,
      hand: [],
      onoChips: cfg.startingChips,
      eliminated: false,
    }));
    const { players, remainingDeck } = this.dealCards(deck, resetPlayers, state.settings);
    return createOno99RoundState(
      remainingDeck,
      players,
      state.mode,
      state.settings,
      state.roundNumber + 1,
      state.roundHistory
    );
  },

  /** Called when a player has NO valid card that keeps running total < 99 (Elimination!) */
  handleDrawOrPass(state, playerId) {
    const idx = state.players.findIndex((p) => p.id === playerId);
    if (idx < 0) return state;
    const p = state.players[idx];
    return eliminateOnoPlayer(
      state,
      idx,
      `💥 ${p.name} tidak memiliki kartu aman (< 99) → TERSINGKIR! Kartu di tangan dibuka.`
    );
  },

  resolvePrompt(state) {
    return state;
  },

  decideAIMove(state) {
    const curr = state.players[state.currentPlayerIndex];
    const total = state.onoTotal ?? 0;
    const cfg = resolveOno99Config(state.settings);

    const legal = curr.hand.filter((c) => canPlayOnoCard(curr.hand, c, total, cfg));
    if (legal.length === 0) {
      return { type: 'draw' as const }; // Triggers elimination cleanly!
    }

    // If under Play 2 and holding Play 2 or Reverse, strongly prefer deflecting!
    if ((state.onoMustPlayCount ?? 1) === 2) {
      const deflect = legal.find((c) => c.type === 'ono_play2' || c.type === 'reverse');
      if (deflect) return { type: 'play' as const, move: { cardId: deflect.id } };
    }

    // Prefer keeping total safe when >= 80, otherwise push total up!
    const sorted = [...legal].sort((a, b) => {
      const ta = computeNextOnoTotal(total, a, cfg.allowNegativeTotal);
      const tb = computeNextOnoTotal(total, b, cfg.allowNegativeTotal);
      return total >= 80 ? ta - tb : tb - ta;
    });
    return { type: 'play' as const, move: { cardId: sorted[0].id } };
  },
};
