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
  finalizeStandardRoundWin,
  standardColorMatchValid,
} from './baseHelpers';

/**
 * UNO Express Deck:
 * - classic_56 (default): 40 Numbers (0–9 × 4) + 4 Draw One (+1) + 4 Reverse + 4 Skip + 2 Wild + 2 Wild Draw Two (+2) = 56 cards!
 * - plus_60: Classic 56 + 2 Wild Express Swap (Quick Snatch) + 2 Wild Skip All (Turbo Turn) = 60 cards!
 */
function buildExpressDeck(settings: VariantSettings): HubCard[] {
  const cards: HubCard[] = [];
  for (const color of STANDARD_COLORS) {
    for (let v = 0; v <= 9; v += 1) {
      cards.push({ id: uid('exp'), color, type: 'number', value: v });
    }
    cards.push({ id: uid('exp'), color, type: 'draw1' });
    cards.push({ id: uid('exp'), color, type: 'reverse' });
    cards.push({ id: uid('exp'), color, type: 'skip' });
  }
  for (let i = 0; i < 2; i += 1) {
    cards.push({ id: uid('exp'), color: 'wild', type: 'wild' });
    cards.push({ id: uid('exp'), color: 'wild', type: 'wild_draw2' });
  }
  if (settings.expressDeckMode === 'plus_60') {
    for (let i = 0; i < 2; i += 1) {
      cards.push({ id: uid('exp'), color: 'wild', type: 'wild_express_swap' });
      cards.push({ id: uid('exp'), color: 'wild', type: 'wild_skip_all' });
    }
  }
  return cards;
}

/**
 * UNO Express Hand Scoring:
 * - Numbers 0–9 = face value
 * - Draw One (+1), Skip, Reverse = 20 pts
 * - Wild, Wild Draw Two (+2), Wild Express Swap, Wild Skip All = 50 pts
 */
export function calculateExpressHandPoints(hand: HubCard[]): number {
  return hand.reduce((sum, card) => {
    if (card.type === 'number') return sum + (card.value ?? 0);
    if (card.color === 'wild' || card.type.startsWith('wild')) return sum + 50;
    return sum + 20;
  }, 0);
}

function createExpressRoundState(
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

  const activePlayers = players.filter((p) => !p.eliminated);
  const firstActiveIdx = players.findIndex((p) => !p.eliminated);
  const starterIdx =
    activePlayers.length > 1
      ? getNextPlayerIndex(players, firstActiveIdx, 1, 1)
      : Math.max(0, firstActiveIdx);

  const activeColor: HubCardColor =
    firstCard && firstCard.color !== 'wild' ? firstCard.color : 'red';
  const deckTag = settings.expressDeckMode === 'plus_60' ? 'Express+ 60' : 'Classic 56';

  return appendEvent(
    {
      version: 1,
      variantId: 'uno-express',
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
    `⚡ Ronde ${roundNumber} UNO Express (${deckTag}) dimulai! 5 kartu awal • Giliran ${players[starterIdx]?.name}.`
  );
}

/** Pass after drawing a playable card in UNO Express */
export function passAfterExpressDraw(state: HubGameState, playerId: string): HubGameState {
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId || !state.drawnPlayableCardId) return state;
  const next = appendEvent(
    { ...state, drawnPlayableCardId: null, hasDrawnThisTurn: false },
    'pass',
    `${current.name} menyimpan kartu yang baru diambil dan melewatkan giliran.`
  );
  return unoExpressRuleset.advanceTurn(next, 1);
}

export const unoExpressRuleset: UnoRuleset = {
  id: 'uno-express',

  createDeck(settings) {
    return buildExpressDeck(settings);
  },

  shuffleDeck(deck) {
    return shuffleCards(deck);
  },

  dealCards(deck, players) {
    const remaining = [...deck];
    const dealt = players.map((p) => ({
      ...p,
      hand: p.eliminated ? [] : remaining.splice(0, 5), // Fast 5-card starting hand!
      calledUno: false,
    }));
    return { players: dealt, remainingDeck: remaining };
  },

  initializeGame(playerInits, mode, settings) {
    const deck = this.shuffleDeck(this.createDeck(settings));
    const clamped = playerInits.slice(0, 4); // Max 4 players
    const initialPlayers: HubPlayer[] = clamped.map((p) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      hand: [],
      score: 0,
      calledUno: false,
      eliminated: false,
    }));
    const { players, remainingDeck } = this.dealCards(deck, initialPlayers, settings);
    return createExpressRoundState(remainingDeck, players, mode, settings, 1, []);
  },

  validateMove(state: HubGameState, playerId: string, move: MoveInput): ValidationResult {
    if (state.phase !== 'playing') return { valid: false, reason: 'Permainan tidak aktif.' };
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.id !== playerId) return { valid: false, reason: 'Bukan giliranmu.' };

    if (state.drawnPlayableCardId && move.cardId !== state.drawnPlayableCardId) {
      return { valid: false, reason: 'Mainkan kartu yang baru diambil atau klik Lewati Giliran!' };
    }

    const card = current.hand.find((c) => c.id === move.cardId);
    if (!card) return { valid: false, reason: 'Kartu tidak ditemukan.' };

    const stackingOn = state.settings.expressStacking !== false;
    const turboOn = state.settings.expressTurboMatch !== false;
    const extras = move.extraCardIds ?? [];

    // Express Stacking (+1 / +2 stackable!)
    if (state.pendingDrawCount > 0) {
      if (extras.length > 0) {
        return { valid: false, reason: 'Turbo Match tidak berlaku saat menumpuk penalti.' };
      }
      if (stackingOn && (card.type === 'draw1' || card.type === 'wild_draw2')) {
        return { valid: true, requiresColor: card.color === 'wild' };
      }
      return { valid: false, reason: `Tumpuk +1/+2 atau ambil +${state.pendingDrawCount} kartu!` };
    }

    // Turbo Match: drop 2 same-number cards (different colors allowed!) in 1 turn
    if (extras.length > 0) {
      if (!turboOn || card.type !== 'number' || extras.length > 1) {
        return { valid: false, reason: 'Turbo Match hanya mengizinkan 1 kartu tambahan dengan angka yang sama!' };
      }
      const extraCard = current.hand.find((c) => c.id === extras[0]);
      if (!extraCard || extraCard.id === card.id || extraCard.type !== 'number' || extraCard.value !== card.value) {
        return { valid: false, reason: 'Kartu Turbo Match harus memiliki angka yang sama!' };
      }
    }

    if (!standardColorMatchValid(state, card)) {
      return { valid: false, reason: 'Kartu tidak cocok warna, angka, atau simbol!' };
    }
    return { valid: true, requiresColor: card.color === 'wild' };
  },

  executeAction(state: HubGameState, playerId: string, move: MoveInput): HubGameState {
    const val = this.validateMove(state, playerId, move);
    if (!val.valid) return state;

    const current = state.players[state.currentPlayerIndex];
    const card = current.hand.find((c) => c.id === move.cardId)!;

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

    const extras = (move.extraCardIds ?? [])
      .map((eid) => current.hand.find((c) => c.id === eid))
      .filter((c): c is HubCard => Boolean(c));
    const playedIds = new Set([card.id, ...extras.map((c) => c.id)]);
    const remainingHand = current.hand.filter((c) => !playedIds.has(c.id));

    const activeCount = getActivePlayers(state.players).length;
    const stackingOn = state.settings.expressStacking !== false;
    let direction = state.direction;
    let steps = 1;
    let pendingDrawCount = state.pendingDrawCount;
    let drawPile = [...state.drawPile];
    const topPlayed = extras.length > 0 ? extras[extras.length - 1] : card;
    let discardPile = [...state.discardPile, card, ...extras];
    const activeColor: HubCardColor =
      card.color === 'wild' ? move.chosenColor ?? 'red' : topPlayed.color;

    let players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex
        ? { ...p, hand: remainingHand, calledUno: remainingHand.length === 1 ? p.calledUno : false }
        : p
    );
    const unoVulnerablePlayerId =
      remainingHand.length === 1 && !current.calledUno ? current.id : null;

    const turboNote =
      extras.length > 0
        ? ` ⚡ TURBO MATCH (×2 angka ${card.value}, warna aktif: ${getColorLabel(activeColor)})!`
        : '';
    let msg = `${current.name} memainkan ${card.type === 'number' ? `${getColorLabel(card.color)} ${card.value}` : card.type.toUpperCase()}.${turboNote}`;

    if (card.type === 'reverse') {
      if (activeCount === 2) {
        steps = 2;
        msg = `🔄 ${current.name} memainkan REVERSE (2 pemain = Skip)!`;
      } else {
        direction = (direction * -1) as 1 | -1;
        msg = `🔄 ${current.name} membalik arah giliran!`;
      }
    } else if (card.type === 'skip') {
      steps = 2;
      msg = `🚫 ${current.name} melewati giliran pemain berikutnya!`;
    } else if (card.type === 'draw1') {
      if (stackingOn) {
        pendingDrawCount += 1;
        msg = `🔥 ${current.name} memainkan DRAW ONE (+1)! Total tumpukan: +${pendingDrawCount}!`;
      } else {
        const victimIdx = getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1);
        const res = drawCardsFromDeck(drawPile, discardPile, 1);
        drawPile = res.drawPile;
        discardPile = res.discardPile;
        players = players.map((p, i) =>
          i === victimIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
        );
        steps = 2;
        msg = `${current.name} memainkan +1! ${players[victimIdx].name} ambil 1 kartu & dilewati.`;
      }
    } else if (card.type === 'wild_draw2') {
      if (stackingOn) {
        pendingDrawCount += 2;
        msg = `🔥 ${current.name} memainkan WILD +2 (${getColorLabel(activeColor)})! Total tumpukan: +${pendingDrawCount}!`;
      } else {
        const victimIdx = getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1);
        const res = drawCardsFromDeck(drawPile, discardPile, 2);
        drawPile = res.drawPile;
        discardPile = res.discardPile;
        players = players.map((p, i) =>
          i === victimIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
        );
        steps = 2;
        msg = `${current.name} memainkan WILD +2 (${getColorLabel(activeColor)})! ${players[victimIdx].name} ambil 2 kartu & dilewati.`;
      }
    } else if (card.type === 'wild_express_swap') {
      // Quick Snatch: swap actor's highest-value card with 1 random card from the leader!
      const opponents = players
        .filter((p) => p.id !== current.id && !p.eliminated && p.hand.length > 0)
        .sort((a, b) => a.hand.length - b.hand.length);
      const leader = opponents[0];
      if (leader && remainingHand.length > 0) {
        const worstActorCard = [...remainingHand].sort(
          (a, b) => calculateExpressHandPoints([b]) - calculateExpressHandPoints([a])
        )[0];
        const snatchedCard = leader.hand[Math.floor(Math.random() * leader.hand.length)];
        players = players.map((p) => {
          if (p.id === current.id) {
            const newH = [...p.hand.filter((c) => c.id !== worstActorCard.id), snatchedCard];
            return { ...p, hand: newH, calledUno: newH.length === 1 ? p.calledUno : false };
          }
          if (p.id === leader.id) {
            const newH = [...p.hand.filter((c) => c.id !== snatchedCard.id), worstActorCard];
            return { ...p, hand: newH, calledUno: newH.length === 1 ? p.calledUno : false };
          }
          return p;
        });
        msg = `🔀 WILD EXPRESS SWAP (${getColorLabel(activeColor)})! ${current.name} menukar 1 kartu dengan leader ${leader.name}!`;
      } else {
        msg = `🔀 WILD EXPRESS SWAP (${getColorLabel(activeColor)})!`;
      }
    } else if (card.type === 'wild_skip_all') {
      // Turbo Turn: skips all opponents -> actor plays again!
      steps = 0;
      msg = `⚡ WILD SKIP ALL (${getColorLabel(activeColor)})! Semua lawan dilewati — ${current.name} main lagi!`;
    }

    let nextState = appendEvent(
      {
        ...state,
        phase: 'playing',
        players,
        direction,
        pendingDrawCount,
        drawPile,
        discardPile,
        activeColor,
        drawnPlayableCardId: null,
        hasDrawnThisTurn: false,
        pendingPrompt: null,
        unoVulnerablePlayerId,
      },
      card.type,
      msg
    );

    nextState = this.checkWinCondition(nextState);
    if (nextState.phase === 'round_over' || nextState.phase === 'game_over') return nextState;
    if (steps === 0) return nextState;
    return this.advanceTurn(nextState, steps);
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
      .filter((p) => p.id !== winnerId && !p.eliminated)
      .reduce((sum, p) => sum + calculateExpressHandPoints(p.hand), 0);
  },

  checkWinCondition(state) {
    const winner = state.players.find((p) => !p.eliminated && p.hand.length === 0);
    if (!winner) return state;

    const mode = state.settings.expressScoringMode ?? 'points_250';

    // Mode 1: First-to-3 Stars
    if (mode === 'first_to_3') {
      const updatedPlayers = state.players.map((p) =>
        p.id === winner.id ? { ...p, score: p.score + 1 } : p
      );
      const wNew = updatedPlayers.find((p) => p.id === winner.id)!;
      const done = state.settings.singleRound || wNew.score >= 3;
      return appendEvent(
        {
          ...state,
          players: updatedPlayers,
          phase: done ? 'game_over' : 'round_over',
          winnerId: done ? winner.id : null,
          roundHistory: [
            ...state.roundHistory,
            {
              roundNumber: state.roundNumber,
              winnerId: winner.id,
              winnerName: winner.name,
              pointsAwarded: 1,
              reason: `${winner.name} meraih ⭐ Bintang #${wNew.score}/3!`,
              playerPoints: updatedPlayers.map((p) => ({
                playerId: p.id,
                playerName: p.name,
                handPoints: calculateExpressHandPoints(p.hand),
                totalScore: p.score,
              })),
            },
          ],
        },
        done ? 'game_win' : 'round_end',
        `⭐ ${winner.name} memenangkan Ronde ${state.roundNumber} (${wNew.score}/3 Bintang)!`
      );
    }

    // Mode 2: Knockout Sprint (highest remaining hand points eliminated each round!)
    if (mode === 'knockout_sprint') {
      const activeNonWinners = state.players
        .filter((p) => !p.eliminated && p.id !== winner.id)
        .sort((a, b) => calculateExpressHandPoints(b.hand) - calculateExpressHandPoints(a.hand));
      const knockedOut = activeNonWinners[0];
      const updatedPlayers = state.players.map((p) =>
        knockedOut && p.id === knockedOut.id ? { ...p, eliminated: true } : p
      );
      const survivors = updatedPlayers.filter((p) => !p.eliminated);
      const done = state.settings.singleRound || survivors.length <= 1;
      const champion = survivors[0] ?? winner;

      return appendEvent(
        {
          ...state,
          players: updatedPlayers,
          phase: done ? 'game_over' : 'round_over',
          winnerId: done ? champion.id : null,
          roundHistory: [
            ...state.roundHistory,
            {
              roundNumber: state.roundNumber,
              winnerId: champion.id,
              winnerName: champion.name,
              pointsAwarded: 0,
              reason: knockedOut
                ? `KNOCKOUT SPRINT! ${knockedOut.name} tereliminasi (poin sisa tertinggi: ${calculateExpressHandPoints(knockedOut.hand)} pt)!`
                : `${winner.name} menang Knockout Sprint!`,
              playerPoints: updatedPlayers.map((p) => ({
                playerId: p.id,
                playerName: p.name,
                handPoints: calculateExpressHandPoints(p.hand),
                totalScore: p.score,
                eliminated: p.eliminated,
              })),
            },
          ],
        },
        done ? 'game_win' : 'round_end',
        done
          ? `🏆 JUARA KNOCKOUT SPRINT: ${champion.name}!`
          : `☠️ ${knockedOut?.name} tereliminasi! Tersisa ${survivors.length} pemain menuju ronde berikutnya!`
      );
    }

    // Mode 3: Points 100 or Points 250
    const pts = this.calculateScore(state, winner.id);
    const targetScore = mode === 'points_100' ? 100 : 250;
    return finalizeStandardRoundWin(
      { ...state, settings: { ...state.settings, targetScore } },
      winner.id,
      pts,
      `Juara Ronde UNO Express (+${pts} poin, target ${targetScore})!`
    );
  },

  resetRound(state) {
    const deck = this.shuffleDeck(this.createDeck(state.settings));
    const resetPlayers = state.players.map((p) => ({ ...p, hand: [], calledUno: false }));
    const { players, remainingDeck } = this.dealCards(deck, resetPlayers, state.settings);
    return createExpressRoundState(
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

    if (state.drawnPlayableCardId) {
      return passAfterExpressDraw(state, playerId);
    }

    // Taking stacked penalty
    if (state.pendingDrawCount > 0) {
      const res = drawCardsFromDeck(state.drawPile, state.discardPile, state.pendingDrawCount);
      const players = state.players.map((p, i) =>
        i === state.currentPlayerIndex
          ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false }
          : p
      );
      const nextIdx = getNextPlayerIndex(players, state.currentPlayerIndex, state.direction, 1);
      const next = appendEvent(
        {
          ...state,
          players,
          drawPile: res.drawPile,
          discardPile: res.discardPile,
          pendingDrawCount: 0,
        },
        'draw',
        `💥 ${current.name} mengambil tumpukan penalti +${res.drawn.length} kartu!`
      );
      return transitionTurnWithPrivacy(next, nextIdx);
    }

    // Draw-and-Play Langsung!
    const res = drawCardsFromDeck(state.drawPile, state.discardPile, 1);
    const drawn = res.drawn[0];
    const players = state.players.map((p, i) =>
      i === state.currentPlayerIndex
        ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false }
        : p
    );

    const canPlayDrawn = Boolean(drawn && standardColorMatchValid(state, drawn));
    if (canPlayDrawn && !current.isAI) {
      return appendEvent(
        {
          ...state,
          players,
          drawPile: res.drawPile,
          discardPile: res.discardPile,
          drawnPlayableCardId: drawn.id,
          hasDrawnThisTurn: true,
        },
        'draw',
        `⚡ ${current.name} mengambil 1 kartu yang COCOK! Mainkan langsung atau klik Lewati Giliran.`
      );
    }

    const nextIdx = getNextPlayerIndex(players, state.currentPlayerIndex, state.direction, 1);
    const next = appendEvent(
      {
        ...state,
        players,
        drawPile: res.drawPile,
        discardPile: res.discardPile,
        drawnPlayableCardId: null,
        hasDrawnThisTurn: false,
      },
      'draw',
      `${current.name} mengambil 1 kartu dari Draw Pile.`
    );
    return transitionTurnWithPrivacy(next, nextIdx);
  },

  resolvePrompt(state, payload) {
    if (!state.pendingPrompt?.cardId) return state;
    return this.executeAction(
      { ...state, phase: 'playing', pendingPrompt: null },
      state.pendingPrompt.actorId,
      { cardId: state.pendingPrompt.cardId, chosenColor: payload.color ?? 'red' }
    );
  },

  decideAIMove(state) {
    const curr = state.players[state.currentPlayerIndex];
    const playable = curr.hand.filter((c) => this.validateMove(state, curr.id, { cardId: c.id }).valid);
    if (playable.length === 0) return { type: 'draw' as const };

    const turboOn = state.settings.expressTurboMatch !== false;
    const freq: Record<string, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
    curr.hand.forEach((c) => {
      if (c.color in freq) freq[c.color] += 1;
    });
    const bestColor = (Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'red') as HubCardColor;

    // Prefer Turbo Match pair if available, else non-wild first
    const turboPairCard =
      turboOn && state.pendingDrawCount === 0
        ? playable.find(
            (c) =>
              c.type === 'number' &&
              curr.hand.some((o) => o.id !== c.id && o.type === 'number' && o.value === c.value)
          )
        : undefined;

    const chosen = turboPairCard ?? playable.find((c) => c.color !== 'wild') ?? playable[0];
    const extraCardIds =
      turboOn && chosen.type === 'number' && state.pendingDrawCount === 0
        ? curr.hand
            .filter((o) => o.id !== chosen.id && o.type === 'number' && o.value === chosen.value)
            .slice(0, 1)
            .map((o) => o.id)
        : undefined;

    return {
      type: 'play' as const,
      move: {
        cardId: chosen.id,
        chosenColor: chosen.color === 'wild' ? bestColor : undefined,
        extraCardIds,
      },
    };
  },
};
