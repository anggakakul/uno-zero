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
  HubCardColor,
  HubGameState,
  HubPlayer,
  HubRoundSummary,
  MoveInput,
  UnoRuleset,
  ValidationResult,
  VariantSettings,
} from '../types';
import { STANDARD_COLORS } from './baseHelpers';

export const HEARTS_TARGET_LIMIT = 35;

/**
 * Redesigned 100-card UNO Hearts Deck:
 * - 4 colors × (0×2, 1–7×2, 9×2 = 18 numbers) = 72 cards
 * - 4 colors × (1 Tactical Swap #8, 2 Skip-Out #9, 2 Trick Reverse #10, 1 Hazard 5 #11 = 6 specials) = 24 cards
 * - 4 Balanced Wild Shift (+2 pts, mid-rank 7, playable only when opening or void!) = 4 cards
 * Total = 72 + 24 + 4 = 100 cards!
 */
function buildHeartsDeck(): HubCard[] {
  const cards: HubCard[] = [];
  for (const color of STANDARD_COLORS) {
    cards.push({ id: uid('hrt'), color, type: 'number', value: 0 });
    cards.push({ id: uid('hrt'), color, type: 'number', value: 0 });
    for (let v = 1; v <= 7; v += 1) {
      cards.push({ id: uid('hrt'), color, type: 'number', value: v });
      cards.push({ id: uid('hrt'), color, type: 'number', value: v });
    }
    cards.push({ id: uid('hrt'), color, type: 'number', value: 9 });
    cards.push({ id: uid('hrt'), color, type: 'number', value: 9 });

    cards.push({ id: uid('hrt'), color, type: 'tactical_swap', value: 8 });
    cards.push({ id: uid('hrt'), color, type: 'skip', value: 9 });
    cards.push({ id: uid('hrt'), color, type: 'skip', value: 9 });
    cards.push({ id: uid('hrt'), color, type: 'reverse', value: 10 });
    cards.push({ id: uid('hrt'), color, type: 'reverse', value: 10 });
    cards.push({ id: uid('hrt'), color, type: 'hazard5', value: 11 });
  }
  for (let i = 0; i < 4; i += 1) {
    cards.push({ id: uid('hrt'), color: 'wild', type: 'wild_shift', value: 7 });
  }
  return cards;
}

/**
 * Redesigned UNO Hearts Card Ranks:
 * - Numbers 0–7, 9 = face value
 * - Wild Shift = 7 (mid-rank, NOT 0 -> cannot be a guaranteed free escape!)
 * - Tactical Swap = 8
 * - Skip-Out = 9
 * - Trick Reverse = 10
 * - Hazard 5 = 11
 */
export function getHeartCardRank(card: HubCard): number {
  if (card.type === 'number') return card.value ?? 0;
  if (card.type === 'wild_shift') return 7;
  if (card.type === 'tactical_swap') return 8;
  if (card.type === 'skip') return 9;
  if (card.type === 'reverse') return 10;
  if (card.type === 'hazard5') return 11;
  return 0;
}

/**
 * Redesigned UNO Hearts Penalty Points:
 * - Hazard 5 (1 in EVERY color: Red, Yellow, Green, Blue) = +5 pts
 * - Wild Shift = +2 pts
 * - Any other Red card = +1 pt
 */
export function getHeartPenaltyPoints(card: HubCard): number {
  if (card.type === 'hazard5') return 5;
  if (card.type === 'wild_shift') return 2;
  if (card.color === 'red') return 1;
  return 0;
}

function createHeartsRoundState(
  deck: HubCard[],
  players: HubPlayer[],
  mode: 'local' | 'ai' | 'online',
  settings: VariantSettings,
  roundNumber: number,
  roundHistory: HubRoundSummary[]
): HubGameState {
  return appendEvent(
    {
      version: 1,
      variantId: 'uno-hearts',
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
      heartsTrick: [],
      heartsLeadColor: null,
      heartsTrickReversed: false,
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
    `❤️ Ronde ${roundNumber} UNO Hearts (Batas ${HEARTS_TARGET_LIMIT} Poin • 4× Hazard +5 • Trick Reverse)! Giliran ${players[0]?.name} membuka trik.`
  );
}

export const unoHeartsRuleset: UnoRuleset = {
  id: 'uno-hearts',

  createDeck() {
    return buildHeartsDeck();
  },

  shuffleDeck(deck) {
    return shuffleCards(deck);
  },

  dealCards(deck, players) {
    const remaining = [...deck];
    const perPlayer = Math.min(10, Math.floor(remaining.length / players.length));
    const dealt = players.map((p) => ({
      ...p,
      hand: remaining.splice(0, perPlayer),
      heartsPenalty: 0,
      heartsCollected: [],
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
      heartsPenalty: 0,
      heartsCollected: [],
      calledUno: false,
    }));
    const { players, remainingDeck } = this.dealCards(deck, initialPlayers, settings);
    return createHeartsRoundState(remainingDeck, players, mode, settings, 1, []);
  },

  validateMove(state: HubGameState, playerId: string, move: MoveInput): ValidationResult {
    if (state.phase !== 'playing') return { valid: false, reason: 'Permainan tidak aktif.' };
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.id !== playerId) return { valid: false, reason: 'Bukan giliranmu.' };
    const card = current.hand.find((c) => c.id === move.cardId);
    if (!card) return { valid: false, reason: 'Kartu tidak ditemukan.' };

    const lead = state.heartsLeadColor;
    // Balanced Wild Shift: ONLY playable when opening trick OR when VOID in lead color!
    if (card.type === 'wild_shift') {
      if (lead && current.hand.some((c) => c.color === lead)) {
        return {
          valid: false,
          reason: `Wild Shift hanya boleh dimainkan saat membuka trik atau saat kamu TIDAK punya warna ${getColorLabel(lead)}!`,
        };
      }
      return { valid: true, requiresColor: !lead };
    }

    if (lead && card.color !== lead && current.hand.some((c) => c.color === lead)) {
      return { valid: false, reason: `Wajib mengikuti warna pembuka (${getColorLabel(lead)})!` };
    }
    return { valid: true };
  },

  executeAction(state: HubGameState, playerId: string, move: MoveInput): HubGameState {
    const val = this.validateMove(state, playerId, move);
    if (!val.valid) return state;

    const current = state.players[state.currentPlayerIndex];
    const card = current.hand.find((c) => c.id === move.cardId)!;

    // If opening trick with Wild Shift, choose lead color
    if (card.type === 'wild_shift' && !state.heartsLeadColor && !move.chosenColor) {
      return {
        ...state,
        phase: 'choose_color',
        pendingPrompt: {
          type: 'color',
          actorId: playerId,
          cardId: card.id,
          message: '🌈 WILD SHIFT! Pilih warna pembuka trik ini:',
        },
      };
    }

    const remaining = current.hand.filter((c) => c.id !== card.id);
    const effectiveCard: HubCard =
      card.type === 'wild_shift'
        ? { ...card, color: state.heartsLeadColor ?? move.chosenColor ?? 'red' }
        : card;

    const leadColor: HubCardColor = state.heartsLeadColor ?? effectiveCard.color;
    const trick = [
      ...(state.heartsTrick ?? []),
      { playerId: current.id, playerName: current.name, card: effectiveCard },
    ];
    const reverseCount = trick.filter((t) => t.card.type === 'reverse').length;
    const isReversed = reverseCount % 2 === 1;

    let players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex ? { ...p, hand: remaining } : p
    );

    // UNO Skip-Out: skips next player in this trick (reduces required trick size by 1 if not last play)
    const skipCount = trick.filter((t) => t.card.type === 'skip').length;
    const targetTrickSize = Math.max(1, players.length - skipCount);

    // Trick complete?
    if (trick.length >= targetTrickSize) {
      const matchingLead = trick.filter((t) => t.card.color === leadColor);
      const pool = matchingLead.length > 0 ? matchingLead : trick;

      let winnerPlay = pool[0];
      for (const play of pool) {
        if (isReversed) {
          if (getHeartCardRank(play.card) < getHeartCardRank(winnerPlay.card)) {
            winnerPlay = play;
          }
        } else {
          if (getHeartCardRank(play.card) > getHeartCardRank(winnerPlay.card)) {
            winnerPlay = play;
          }
        }
      }

      const trickPenalty = trick.reduce((sum, t) => sum + getHeartPenaltyPoints(t.card), 0);
      const collectedCards = trick.map((t) => t.card);
      const winnerIdx = players.findIndex((p) => p.id === winnerPlay.playerId);

      players = players.map((p, idx) =>
        idx === winnerIdx
          ? {
              ...p,
              heartsPenalty: (p.heartsPenalty ?? 0) + trickPenalty,
              heartsCollected: [...(p.heartsCollected ?? []), ...collectedCards],
            }
          : p
      );

      // Tactical Swap (1-Card Controlled Swap if trick contained tactical_swap!)
      let swapNote = '';
      if (trick.some((t) => t.card.type === 'tactical_swap')) {
        const winnerP = players[winnerIdx];
        const leaderOpp = players
          .filter((p) => p.id !== winnerP.id && p.hand.length > 0)
          .sort((a, b) => a.score - b.score)[0];
        if (winnerP.hand.length > 0 && leaderOpp) {
          // Winner gives their most dangerous card (highest penalty/rank) and gets 1 random card from leader!
          const worstCard = [...winnerP.hand].sort(
            (a, b) =>
              getHeartPenaltyPoints(b) * 10 +
              getHeartCardRank(b) -
              (getHeartPenaltyPoints(a) * 10 + getHeartCardRank(a))
          )[0];
          const takenCard = leaderOpp.hand[Math.floor(Math.random() * leaderOpp.hand.length)];
          players = players.map((p) => {
            if (p.id === winnerP.id) {
              return { ...p, hand: [...p.hand.filter((c) => c.id !== worstCard.id), takenCard] };
            }
            if (p.id === leaderOpp.id) {
              return { ...p, hand: [...p.hand.filter((c) => c.id !== takenCard.id), worstCard] };
            }
            return p;
          });
          swapNote = ` 🔀 TACTICAL SWAP: ${winnerP.name} menukar 1 kartu dengan ${leaderOpp.name}!`;
        }
      }

      let nextState = appendEvent(
        {
          ...state,
          phase: 'playing',
          players,
          currentPlayerIndex: winnerIdx,
          heartsTrick: [],
          heartsLeadColor: null,
          heartsTrickReversed: false,
          activeColor: leadColor,
          pendingPrompt: null,
        },
        'hearts_trick',
        `❤️ ${winnerPlay.playerName} mengambil trik (${isReversed ? '🔄 Terbalik — Terendah menang' : 'Tertinggi menang'}) → +${trickPenalty} poin!${swapNote}`
      );

      nextState = this.checkWinCondition(nextState);
      if (nextState.phase === 'round_over' || nextState.phase === 'game_over') return nextState;
      return transitionTurnWithPrivacy(nextState, winnerIdx);
    }

    const steps = card.type === 'skip' ? 2 : 1;
    const nextIdx = getNextPlayerIndex(players, state.currentPlayerIndex, state.direction, steps);
    const revNote = card.type === 'reverse' ? ' 🔄 TRICK REVERSE AKTIF (Terendah menang)!' : '';
    const skipNote = card.type === 'skip' ? ' 🚫 SKIP-OUT: Pemain berikut dilewati di trik ini!' : '';
    const nextState = appendEvent(
      {
        ...state,
        phase: 'playing',
        players,
        heartsTrick: trick,
        heartsLeadColor: leadColor,
        heartsTrickReversed: isReversed,
        activeColor: leadColor,
        pendingPrompt: null,
      },
      'play',
      `${current.name} memainkan ${getColorLabel(effectiveCard.color)} ${effectiveCard.type === 'number' ? effectiveCard.value : effectiveCard.type.toUpperCase()}.${revNote}${skipNote}`
    );
    return transitionTurnWithPrivacy(nextState, nextIdx);
  },

  advanceTurn(state, steps = 1) {
    const nextIdx = getNextPlayerIndex(state.players, state.currentPlayerIndex, state.direction, steps);
    return transitionTurnWithPrivacy(state, nextIdx);
  },

  calculateScore(state, winnerId) {
    const p = state.players.find((pl) => pl.id === winnerId);
    return p?.score ?? 0;
  },

  checkWinCondition(state) {
    const allEmpty = state.players.every((p) => p.hand.length === 0);
    if (!allEmpty) return state;

    // Fast Shoot the Moon: collected ALL 4 Hazard 5 cards in 1 round -> 0 pts, all opponents +15!
    const moonShooter = state.players.find(
      (p) => (p.heartsCollected ?? []).filter((c) => c.type === 'hazard5').length >= 4
    );

    const updatedPlayers = state.players.map((p) => {
      if (moonShooter) {
        const delta = p.id === moonShooter.id ? 0 : 15;
        return { ...p, score: p.score + delta };
      }
      const pen = p.heartsPenalty ?? 0;
      // Clean Sweep Catch-Up (-3 pts / Heart Shield when 0 penalty in a round!)
      const nextScore = pen === 0 ? Math.max(0, p.score - 3) : p.score + pen;
      return { ...p, score: nextScore };
    });

    const sorted = [...updatedPlayers].sort((a, b) => a.score - b.score);
    const leader = sorted[0];
    const reachedLimit = updatedPlayers.some((p) => p.score >= HEARTS_TARGET_LIMIT);
    const done = state.settings.singleRound || reachedLimit;

    return appendEvent(
      {
        ...state,
        players: updatedPlayers,
        phase: done ? 'game_over' : 'round_over',
        winnerId: done ? leader.id : null,
        roundHistory: [
          ...state.roundHistory,
          {
            roundNumber: state.roundNumber,
            winnerId: leader.id,
            winnerName: leader.name,
            pointsAwarded: leader.heartsPenalty ?? 0,
            reason: moonShooter
              ? `🌙 SHOOT THE MOON! ${moonShooter.name} mengumpulkan 4× Hazard 5 → 0 poin (semua lawan +15)!`
              : `Skor terendah: ${leader.name} (${leader.score}/${HEARTS_TARGET_LIMIT} poin, Clean Sweep = -3)!`,
            playerPoints: updatedPlayers.map((p) => ({
              playerId: p.id,
              playerName: p.name,
              handPoints: p.heartsPenalty ?? 0,
              totalScore: p.score,
            })),
          },
        ],
      },
      done ? 'game_win' : 'round_end',
      moonShooter
        ? `🌙 SHOOT THE MOON oleh ${moonShooter.name}! Semua lawan +15 poin!`
        : `❤️ Ronde ${state.roundNumber} UNO Hearts selesai! Peringkat 1: ${leader.name} (${leader.score} poin terendah)!`
    );
  },

  resetRound(state) {
    const deck = this.shuffleDeck(this.createDeck(state.settings));
    const resetPlayers = state.players.map((p) => ({
      ...p,
      hand: [],
      heartsPenalty: 0,
      heartsCollected: [],
    }));
    const { players, remainingDeck } = this.dealCards(deck, resetPlayers, state.settings);
    return createHeartsRoundState(
      remainingDeck,
      players,
      state.mode,
      state.settings,
      state.roundNumber + 1,
      state.roundHistory
    );
  },

  handleDrawOrPass(state) {
    return state; // Trick-taking game: must play a card
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
    const valid = curr.hand.filter((c) => this.validateMove(state, curr.id, { cardId: c.id }).valid);
    const pool = valid.length > 0 ? valid : curr.hand;

    // If void in lead color, dump Hazard 5 first! Otherwise play low rank (or high rank if Trick Reversed!)
    const isVoid = Boolean(state.heartsLeadColor && !curr.hand.some((c) => c.color === state.heartsLeadColor));
    let chosen: HubCard;
    if (isVoid) {
      chosen =
        pool.find((c) => c.type === 'hazard5') ??
        [...pool].sort((a, b) => getHeartCardRank(b) - getHeartCardRank(a))[0];
    } else if (state.heartsTrickReversed) {
      // Trick Reversed: highest rank is safe!
      chosen = [...pool].sort((a, b) => getHeartCardRank(b) - getHeartCardRank(a))[0];
    } else {
      chosen = [...pool].sort((a, b) => getHeartCardRank(a) - getHeartCardRank(b))[0];
    }

    return {
      type: 'play' as const,
      move: {
        cardId: chosen.id,
        chosenColor: chosen.type === 'wild_shift' && !state.heartsLeadColor ? 'blue' : undefined,
      },
    };
  },
};
