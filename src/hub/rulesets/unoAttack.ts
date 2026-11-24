import {
  appendEvent,
  drawCardsFromDeck,
  getActivePlayers,
  getColorLabel,
  getNextPlayerIndex,
  shuffleCards,
  transitionTurnWithPrivacy,
  uid,
} from '../engine/core';
import {
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
  genericAIDecision,
  standardColorMatchValid,
} from './baseHelpers';

/**
 * Official 112-card UNO Attack Deck:
 * - Mode Standar (Modern): 72 numbers (1–9 × 2/color) + 32 actions (2 Hit 2, 2 Reverse, 2 Skip, 2 Discard All / color)
 *   + 4 Wild + 4 Wild Attack-Attack = 112 cards!
 * - Mode Klasik (Classic): 72 numbers (1–9 × 2/color) + 32 actions (2 Hit 2, 2 Reverse, 2 Skip, 1 Discard All, 1 Trade Hands / color)
 *   + 2 Wild + 2 Wild All Hit + 2 Wild Hit Fire + 2 Wild Attack-Attack = 112 cards!
 */
function buildAttackDeck(settings: VariantSettings): HubCard[] {
  const mode = settings.attackDeckMode ?? 'standard';
  const cards: HubCard[] = [];

  for (const color of STANDARD_COLORS) {
    for (let v = 1; v <= 9; v += 1) {
      cards.push({ id: uid('atk'), color, type: 'number', value: v });
      cards.push({ id: uid('atk'), color, type: 'number', value: v });
    }
    for (let i = 0; i < 2; i += 1) {
      cards.push({ id: uid('atk'), color, type: 'hit2' });
      cards.push({ id: uid('atk'), color, type: 'reverse' });
      cards.push({ id: uid('atk'), color, type: 'skip' });
    }
    if (mode === 'classic') {
      cards.push({ id: uid('atk'), color, type: 'discard_all' });
      cards.push({ id: uid('atk'), color, type: 'trade_hands' });
    } else {
      cards.push({ id: uid('atk'), color, type: 'discard_all' });
      cards.push({ id: uid('atk'), color, type: 'discard_all' });
    }
  }

  if (mode === 'classic') {
    for (let i = 0; i < 2; i += 1) {
      cards.push({ id: uid('atk'), color: 'wild', type: 'wild' });
      cards.push({ id: uid('atk'), color: 'wild', type: 'wild_all_hit' });
      cards.push({ id: uid('atk'), color: 'wild', type: 'wild_hit_fire' });
      cards.push({ id: uid('atk'), color: 'wild', type: 'wild_attack_attack' });
    }
  } else {
    for (let i = 0; i < 4; i += 1) {
      cards.push({ id: uid('atk'), color: 'wild', type: 'wild' });
      cards.push({ id: uid('atk'), color: 'wild', type: 'wild_attack_attack' });
    }
  }

  return cards;
}

/**
 * Balanced Bell-Tailed Launcher RNG (0–12 cards) with Dynamic Damping!
 * Official balanced profile (EV ~ 1.78 cards/press):
 * - 48% -> 0 cards (Safe click!)
 * - 22% -> 2 cards
 * - 14% -> 3–4 cards
 * -  9% -> 5–6 cards
 * -  5% -> 7–9 cards
 * -  2% -> 10–12 cards (Mega Blast!)
 * If victim already holds >= 14 cards (dynamic damping), heavy blasts are damped to keep match length ideal!
 */
export function simulateLauncherPresses(
  presses: number,
  intensity: 'mild' | 'official' | 'chaos' = 'official',
  rng: () => number = Math.random,
  victimHandSize = 7
): number {
  const safeChance = intensity === 'mild' ? 0.58 : intensity === 'chaos' ? 0.35 : 0.48;
  const damped = victimHandSize >= 14;
  let total = 0;

  for (let i = 0; i < presses; i += 1) {
    const r = rng();
    if (r < safeChance) continue;

    // Normalize remaining probability space [safeChance..1) -> [0..1)
    const norm = (r - safeChance) / (1 - safeChance);
    if (norm < 0.42) {
      total += 2;
    } else if (norm < 0.69) {
      total += 3 + Math.floor(rng() * 2); // 3–4
    } else if (norm < 0.86) {
      total += damped ? 3 : 5 + Math.floor(rng() * 2); // 5–6 (damped -> 3)
    } else if (norm < 0.96) {
      total += damped ? 4 : 7 + Math.floor(rng() * 3); // 7–9 (damped -> 4)
    } else {
      total += damped ? 5 : 10 + Math.floor(rng() * 3); // 10–12 (Mega Blast!)
    }
  }

  return Math.min(12 * presses, total);
}

/**
 * Official UNO Attack Scoring:
 * - Numbers 1–9: face value
 * - Reverse / Skip / Hit 2: 20 pts
 * - Discard All / Trade Hands: 30 pts
 * - Wild / Wild All Hit / Wild Hit Fire / Wild Attack-Attack: 50 pts
 */
export function calculateAttackHandPoints(hand: HubCard[]): number {
  return hand.reduce((sum, card) => {
    if (card.type === 'number') return sum + (card.value ?? 0);
    if (card.type === 'reverse' || card.type === 'skip' || card.type === 'hit2') return sum + 20;
    if (card.type === 'discard_all' || card.type === 'trade_hands') return sum + 30;
    return sum + 50;
  }, 0);
}

/**
 * Official UNO Attack Setup with Opening Card Edge Cases:
 * - Reshuffles Wild Attack-Attack, Wild Hit Fire, Trade Hands if drawn first.
 * - Reverse -> dealer goes first counter-clockwise; Skip -> skip first player; Hit 2 -> first player hits launcher 2x & skipped.
 */
function createAttackRoundState(
  deck: HubCard[],
  players: HubPlayer[],
  mode: 'local' | 'ai' | 'online',
  settings: VariantSettings,
  roundNumber: number,
  roundHistory: HubRoundSummary[]
): HubGameState {
  let drawPile = [...deck];
  let firstCard: HubCard | undefined;

  for (let guard = 0; guard < drawPile.length; guard += 1) {
    const cand = drawPile.pop();
    if (!cand) break;
    if (
      cand.type === 'wild_attack_attack' ||
      cand.type === 'wild_hit_fire' ||
      cand.type === 'wild_all_hit' ||
      cand.type === 'trade_hands'
    ) {
      drawPile.unshift(cand);
      continue;
    }
    firstCard = cand;
    break;
  }

  let direction: 1 | -1 = 1;
  let currentPlayerIndex = players.length > 1 ? 1 % players.length : 0;
  let discardPile = firstCard ? [firstCard] : [];
  let updatedPlayers = [...players];
  const activeColor: HubCardColor =
    firstCard && firstCard.color !== 'wild' ? firstCard.color : 'red';
  let startMsg = `Ronde ${roundNumber} UNO Attack (${settings.attackDeckMode === 'classic' ? 'Mode Klasik' : 'Mode Standar'}) dimulai! Giliran ${players[currentPlayerIndex]?.name}.`;

  if (firstCard) {
    if (firstCard.type === 'reverse') {
      direction = -1;
      currentPlayerIndex = 0;
      startMsg = `🔄 Kartu pembuka REVERSE! ${players[0].name} (Dealer) jalan duluan berlawanan jarum jam!`;
    } else if (firstCard.type === 'skip') {
      const skippedName = players[currentPlayerIndex].name;
      currentPlayerIndex = getNextPlayerIndex(players, currentPlayerIndex, 1, 1);
      startMsg = `🚫 Kartu pembuka SKIP! ${skippedName} dilewati, giliran ${players[currentPlayerIndex].name}!`;
    } else if (firstCard.type === 'hit2') {
      const victim = players[currentPlayerIndex];
      const launched = simulateLauncherPresses(2, settings.attackIntensity ?? 'official');
      const res = drawCardsFromDeck(drawPile, discardPile, launched);
      drawPile = res.drawPile;
      discardPile = res.discardPile;
      updatedPlayers = updatedPlayers.map((p, idx) =>
        idx === currentPlayerIndex ? { ...p, hand: [...p.hand, ...res.drawn] } : p
      );
      currentPlayerIndex = getNextPlayerIndex(updatedPlayers, currentPlayerIndex, 1, 1);
      startMsg = `💥 Kartu pembuka HIT 2! ${victim.name} menekan peluncur 2× (${res.drawn.length} kartu) & dilewati!`;
    }
  }

  return appendEvent(
    {
      version: 1,
      variantId: 'uno-attack',
      mode,
      phase: 'playing',
      roundNumber,
      players: updatedPlayers,
      currentPlayerIndex,
      direction,
      drawPile,
      discardPile,
      activeColor,
      pendingDrawCount: 0,
      flipSide: 'light',
      lastAttackResult: null,
      hasDrawnThisTurn: false,
      settings,
      roundHistory,
      actionLog: [],
      lastEvent: null,
      winnerId: null,
      startedAt: Date.now(),
    },
    'info',
    startMsg
  );
}

/**
 * Official UNO Attack Catch Penalty:
 * Player caught forgetting to call UNO must press the Card Launcher 2 TIMES!
 */
export function catchAttackUno(state: HubGameState, catcherName: string): HubGameState {
  if (!state.unoVulnerablePlayerId) return state;
  const targetIdx = state.players.findIndex((p) => p.id === state.unoVulnerablePlayerId);
  if (targetIdx < 0) return state;
  const target = state.players[targetIdx];

  const launched = simulateLauncherPresses(
    2,
    state.settings.attackIntensity ?? 'official',
    Math.random,
    target.hand.length
  );
  const res = drawCardsFromDeck(state.drawPile, state.discardPile, launched);
  const players = state.players.map((p, idx) =>
    idx === targetIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
  );

  return appendEvent(
    {
      ...state,
      players,
      drawPile: res.drawPile,
      discardPile: res.discardPile,
      unoVulnerablePlayerId: null,
      lastAttackResult: {
        triggeredBy: target.name,
        cardsLaunched: res.drawn.length,
        presses: 2,
        halfStuck: res.drawn.length > 0 && Math.random() < 0.15,
        timestamp: Date.now(),
      },
    },
    'uno_penalty',
    `🚨 ${catcherName} menangkap ${target.name} lupa UNO! Hukuman tekan Peluncur 2× → ${res.drawn.length} kartu keluar!`
  );
}

export const unoAttackRuleset: UnoRuleset = {
  id: 'uno-attack',

  createDeck(settings) {
    return buildAttackDeck(settings);
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
    const clamped = playerInits.slice(0, 10); // 2–10 players
    const initialPlayers: HubPlayer[] = clamped.map((p) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      hand: [],
      score: 0,
      calledUno: false,
    }));
    const { players, remainingDeck } = this.dealCards(deck, initialPlayers, settings);
    return createAttackRoundState(remainingDeck, players, mode, settings, 1, []);
  },

  validateMove(state: HubGameState, playerId: string, move: MoveInput): ValidationResult {
    if (state.phase !== 'playing') return { valid: false, reason: 'Permainan tidak aktif.' };
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.id !== playerId) return { valid: false, reason: 'Bukan giliranmu.' };

    const card = current.hand.find((c) => c.id === move.cardId);
    if (!card) return { valid: false, reason: 'Kartu tidak ditemukan.' };

    // Official Trade Hands restriction: CANNOT be played as your last card to immediately win!
    if (card.type === 'trade_hands' && current.hand.length === 1) {
      return {
        valid: false,
        reason: 'Trade Hands tidak boleh dimainkan sebagai kartu terakhir untuk langsung menang!',
      };
    }

    if (!standardColorMatchValid(state, card)) {
      return { valid: false, reason: 'Kartu tidak cocok dengan warna, angka, atau simbol!' };
    }

    return {
      valid: true,
      requiresColor:
        card.type === 'wild' ||
        card.type === 'wild_attack_attack' ||
        card.type === 'wild_all_hit' ||
        card.type === 'wild_hit_fire' ||
        card.type === 'wild_hit4',
      requiresTarget:
        card.type === 'wild_attack_attack'
          ? 'target_attack'
          : card.type === 'trade_hands'
          ? 'target_swap'
          : undefined,
    };
  },

  executeAction(state: HubGameState, playerId: string, move: MoveInput): HubGameState {
    const validation = this.validateMove(state, playerId, move);
    if (!validation.valid) return state;

    const current = state.players[state.currentPlayerIndex];
    const card = current.hand.find((c) => c.id === move.cardId)!;
    const isWild = card.color === 'wild' || card.type.startsWith('wild');

    if (isWild && !move.chosenColor) {
      return {
        ...state,
        phase: 'choose_color',
        pendingPrompt: {
          type: 'color',
          actorId: playerId,
          cardId: card.id,
          message: 'Pilih warna aktif untuk kartu Wild Attack:',
        },
      };
    }

    if ((card.type === 'wild_attack_attack' || card.type === 'trade_hands') && !move.targetPlayerId) {
      return {
        ...state,
        phase: 'choose_target',
        pendingPrompt: {
          type: card.type === 'trade_hands' ? 'target_swap' : 'target_attack',
          actorId: playerId,
          cardId: card.id,
          message:
            card.type === 'trade_hands'
              ? '🔀 TRADE HANDS: Pilih 1 lawan untuk menukar seluruh kartu tangan!'
              : '🎯 WILD ATTACK-ATTACK: Arahkan peluncur ke 1 lawan (tekan 2×)!',
        },
      };
    }

    let remainingHand = current.hand.filter((c) => c.id !== card.id);
    const activeCount = getActivePlayers(state.players).length;
    let direction = state.direction;
    let steps = 1;
    let drawPile = [...state.drawPile];
    let discardPile = [...state.discardPile];
    let activeColor: HubCardColor = isWild ? move.chosenColor ?? 'red' : card.color;
    let lastAttackResult = state.lastAttackResult;
    const intensity = state.settings.attackIntensity ?? 'official';

    // Discard All puts same-color cards underneath Discard All so Discard All stays on top!
    if (card.type === 'discard_all') {
      const sameColor = remainingHand.filter((c) => c.color === card.color);
      remainingHand = remainingHand.filter((c) => c.color !== card.color);
      discardPile = [...discardPile, ...sameColor, card];
    } else {
      discardPile = [...discardPile, card];
    }

    let players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex
        ? { ...p, hand: remainingHand, calledUno: remainingHand.length === 1 ? p.calledUno : false }
        : p
    );

    let eventType: string = card.type;
    let message = `${current.name} memainkan ${card.type === 'number' ? `${getColorLabel(card.color)} ${card.value}` : card.type.toUpperCase()}.`;

    if (card.type === 'discard_all') {
      message = `💥 DISCARD ALL! ${current.name} membuang seluruh kartu ${getColorLabel(card.color)} sekaligus!`;
    } else if (card.type === 'reverse') {
      direction = (direction * -1) as 1 | -1;
      if (activeCount === 2) {
        steps = 0; // 2-player Reverse acts as Skip -> player goes again!
        message = `🔄 REVERSE (2 pemain = Skip)! ${current.name} langsung main lagi!`;
      } else {
        message = `🔄 ${current.name} membalik arah permainan!`;
      }
    } else if (card.type === 'skip') {
      steps = 2;
      const skipped = players[getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1)];
      message = `🚫 SKIP! ${skipped?.name} kehilangan giliran.`;
    } else if (card.type === 'trade_hands') {
      const targetIdx = players.findIndex((p) => p.id === move.targetPlayerId);
      if (targetIdx >= 0 && targetIdx !== state.currentPlayerIndex) {
        const myCards = [...remainingHand];
        const targetCards = [...players[targetIdx].hand];
        const targetName = players[targetIdx].name;
        players = players.map((p, idx) => {
          if (idx === state.currentPlayerIndex) return { ...p, hand: targetCards, calledUno: false };
          if (idx === targetIdx) return { ...p, hand: myCards, calledUno: false };
          return p;
        });
        message = `🔀 TRADE HANDS! ${current.name} menukar seluruh kartu tangan dengan ${targetName}!`;
      }
    } else if (card.type === 'wild_all_hit') {
      // Every OTHER player presses launcher 1x!
      let totalShot = 0;
      const notes: string[] = [];
      players = players.map((p) => {
        if (p.id === current.id || p.eliminated) return p;
        const launched = simulateLauncherPresses(1, intensity, Math.random, p.hand.length);
        const res = drawCardsFromDeck(drawPile, discardPile, launched);
        drawPile = res.drawPile;
        discardPile = res.discardPile;
        totalShot += res.drawn.length;
        notes.push(`${p.name}(+${res.drawn.length})`);
        return { ...p, hand: [...p.hand, ...res.drawn], calledUno: false };
      });
      lastAttackResult = {
        triggeredBy: 'Semua Lawan',
        cardsLaunched: totalShot,
        presses: players.length - 1,
        halfStuck: totalShot > 0 && Math.random() < 0.15,
        timestamp: Date.now(),
      };
      eventType = totalShot === 0 ? 'launcher_safe' : 'launcher_blast';
      message = `🔥 WILD ALL HIT (${getColorLabel(activeColor)})! Hasil peluncur: ${notes.join(', ')}!`;
    } else if (card.type === 'wild_hit_fire') {
      // Next player presses launcher repeatedly until >= 1 card fires (hard cap 6 presses), then loses turn!
      const victimIdx = getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1);
      const victim = players[victimIdx];
      let pressesUsed = 0;
      let launchedTotal = 0;
      while (launchedTotal === 0 && pressesUsed < 6) {
        pressesUsed += 1;
        launchedTotal = simulateLauncherPresses(1, intensity, Math.random, victim.hand.length);
      }
      if (launchedTotal === 0) launchedTotal = 2; // Hard cap safety guarantee!
      const res = drawCardsFromDeck(drawPile, discardPile, launchedTotal);
      drawPile = res.drawPile;
      discardPile = res.discardPile;
      players = players.map((p, idx) =>
        idx === victimIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
      );
      lastAttackResult = {
        triggeredBy: victim.name,
        cardsLaunched: res.drawn.length,
        presses: pressesUsed,
        halfStuck: Math.random() < 0.2,
        timestamp: Date.now(),
      };
      steps = 2;
      eventType = 'launcher_blast';
      message = `🌋 WILD HIT FIRE (${getColorLabel(activeColor)})! ${victim.name} menekan peluncur ${pressesUsed}× hingga keluar ${res.drawn.length} kartu & dilewati!`;
    } else if (card.type === 'hit2' || card.type === 'wild_hit4' || card.type === 'wild_attack_attack') {
      const presses = card.type === 'wild_hit4' ? 4 : 2;
      const victimIdx =
        card.type === 'wild_attack_attack'
          ? players.findIndex((p) => p.id === move.targetPlayerId)
          : getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1);

      if (victimIdx >= 0) {
        const victim = players[victimIdx];
        const launchedCount = simulateLauncherPresses(presses, intensity, Math.random, victim.hand.length);
        const res = drawCardsFromDeck(drawPile, discardPile, launchedCount);
        drawPile = res.drawPile;
        discardPile = res.discardPile;
        players = players.map((p, idx) =>
          idx === victimIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
        );
        const halfStuck = res.drawn.length > 0 && Math.random() < 0.15;
        lastAttackResult = {
          triggeredBy: victim.name,
          cardsLaunched: res.drawn.length,
          presses,
          halfStuck,
          timestamp: Date.now(),
        };
        // Official 2-player Hit 2 rule: turn immediately returns to actor (steps = 0)!
        if (card.type === 'hit2' && activeCount === 2) {
          steps = 0;
        } else if (card.type !== 'wild_attack_attack') {
          steps = 2;
        }
        eventType = res.drawn.length === 0 ? 'launcher_safe' : 'launcher_blast';
        message =
          res.drawn.length === 0
            ? `🔫 PELUNCUR (${presses}×) ke ${victim.name}: KLIK! Aman — 0 kartu keluar!`
            : `💥 PELUNCUR MELEDAK (${presses}×)! ${victim.name} menerima ${res.drawn.length} kartu${halfStuck ? ' (termasuk kartu tersangkut!)' : ''}!`;
      }
    } else if (card.type === 'wild') {
      message = `🌈 ${current.name} memainkan WILD → ${getColorLabel(activeColor)}!`;
    }

    const updatedSelf = players[state.currentPlayerIndex];
    const unoVulnerablePlayerId =
      updatedSelf.hand.length === 1 && !updatedSelf.calledUno ? updatedSelf.id : null;

    let nextState: HubGameState = appendEvent(
      {
        ...state,
        phase: 'playing',
        players,
        direction,
        drawPile,
        discardPile,
        activeColor,
        lastAttackResult,
        pendingPrompt: null,
        unoVulnerablePlayerId,
      },
      eventType,
      message
    );

    nextState = this.checkWinCondition(nextState);
    if (nextState.phase === 'round_over' || nextState.phase === 'game_over') return nextState;
    if (steps === 0) return nextState;
    return this.advanceTurn(nextState, steps);
  },

  advanceTurn(state, steps = 1) {
    const nextIdx = getNextPlayerIndex(state.players, state.currentPlayerIndex, state.direction, steps);
    return transitionTurnWithPrivacy(state, nextIdx);
  },

  calculateScore(state, winnerId) {
    return state.players
      .filter((p) => p.id !== winnerId)
      .reduce((sum, p) => sum + calculateAttackHandPoints(p.hand), 0);
  },

  checkWinCondition(state) {
    const roundWinner = state.players.find((p) => p.hand.length === 0);
    if (!roundWinner) return state;

    const isLowestMode = state.settings.attackScoringMode === 'lowest_at_500';
    let updatedPlayers: HubPlayer[];
    let pointsAwarded = 0;

    if (isLowestMode) {
      // Alternative Golf-Style Scoring: every player records points from their OWN remaining hand!
      updatedPlayers = state.players.map((p) => ({
        ...p,
        score: p.score + calculateAttackHandPoints(p.hand),
      }));
      pointsAwarded = 0;
    } else {
      pointsAwarded = this.calculateScore(state, roundWinner.id);
      updatedPlayers = state.players.map((p) =>
        p.id === roundWinner.id ? { ...p, score: p.score + pointsAwarded } : p
      );
    }

    const anyReachedTarget = updatedPlayers.some((p) => p.score >= state.settings.targetScore);
    const matchOver = state.settings.singleRound || anyReachedTarget;
    const matchWinner =
      matchOver && isLowestMode
        ? [...updatedPlayers].sort((a, b) => a.score - b.score)[0]
        : roundWinner;

    const summary: HubRoundSummary = {
      roundNumber: state.roundNumber,
      winnerId: matchOver ? matchWinner.id : roundWinner.id,
      winnerName: matchOver ? matchWinner.name : roundWinner.name,
      pointsAwarded,
      reason: isLowestMode
        ? `${roundWinner.name} menutup ronde (0 poin)! Mode Skor Terendah.`
        : `${roundWinner.name} menghabiskan seluruh kartu (+${pointsAwarded} poin)!`,
      playerPoints: updatedPlayers.map((p) => ({
        playerId: p.id,
        playerName: p.name,
        handPoints: calculateAttackHandPoints(p.hand),
        totalScore: p.score,
      })),
    };

    return appendEvent(
      {
        ...state,
        players: updatedPlayers,
        phase: matchOver ? 'game_over' : 'round_over',
        winnerId: matchOver ? matchWinner.id : null,
        pendingPrompt: null,
        unoVulnerablePlayerId: null,
        roundHistory: [...state.roundHistory, summary],
      },
      matchOver ? 'game_win' : 'round_end',
      matchOver
        ? `🏆 ${matchWinner.name} memenangkan UNO ATTACK (${matchWinner.score} poin)!`
        : `🎉 ${roundWinner.name} memenangkan Ronde ${state.roundNumber}!`
    );
  },

  resetRound(state) {
    const deck = this.shuffleDeck(this.createDeck(state.settings));
    const resetPlayers = state.players.map((p) => ({ ...p, hand: [], calledUno: false }));
    const { players, remainingDeck } = this.dealCards(deck, resetPlayers, state.settings);
    return createAttackRoundState(
      remainingDeck,
      players,
      state.mode,
      state.settings,
      state.roundNumber + 1,
      state.roundHistory
    );
  },

  /** Pressing the Digital Card Launcher (1x) when unable/unwilling to play */
  handleDrawOrPass(state, playerId) {
    const player = state.players[state.currentPlayerIndex];
    if (!player || player.id !== playerId || state.phase !== 'playing') return state;

    const launchedCount = simulateLauncherPresses(
      1,
      state.settings.attackIntensity ?? 'official',
      Math.random,
      player.hand.length
    );
    const res = drawCardsFromDeck(state.drawPile, state.discardPile, launchedCount);
    const players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex
        ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false }
        : p
    );

    const halfStuck = res.drawn.length > 0 && Math.random() < 0.15;
    const lastAttackResult = {
      triggeredBy: player.name,
      cardsLaunched: res.drawn.length,
      presses: 1,
      halfStuck,
      timestamp: Date.now(),
    };

    const msg =
      res.drawn.length === 0
        ? `🔫 ${player.name} menekan Peluncur → KLIK! Aman (0 kartu keluar)!`
        : `💥 ${player.name} menekan Peluncur → MELEDAK ${res.drawn.length} kartu${halfStuck ? ' (1 tersangkut setengah!)' : ''}!`;

    const nextState = appendEvent(
      {
        ...state,
        players,
        drawPile: res.drawPile,
        discardPile: res.discardPile,
        lastAttackResult,
        unoVulnerablePlayerId: null,
      },
      res.drawn.length === 0 ? 'launcher_safe' : 'launcher_blast',
      msg
    );
    return this.advanceTurn(nextState, 1);
  },

  resolvePrompt(state, payload) {
    if (!state.pendingPrompt?.cardId) return state;
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

  decideAIMove(state) {
    return genericAIDecision(this, state);
  },
};
