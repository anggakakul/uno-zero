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

export const TEAM_NAMES: Record<number, string> = {
  0: 'Tim Biru',
  1: 'Tim Merah',
  2: 'Tim Hijau',
  3: 'Tim Kuning',
};

/**
 * Official 112-card UNO Teams! deck:
 * - 4 colors × 25 cards = 100 cards:
 *   * One 0 (with Pass symbol), Two each of 1–9 (multiples of 3 carry Pass symbol) = 19 numbers
 *   * 2 Skip, 2 Reverse, 2 Draw Two = 6 actions
 * - 12 Wild cards:
 *   * 4 Wild (Standard)
 *   * 4 Wild Team Play
 *   * 4 Wild Team Draw Four
 * Total = 100 + 12 = 112 cards!
 */
function buildTeamsDeck(): HubCard[] {
  const cards: HubCard[] = [];
  for (const color of STANDARD_COLORS) {
    cards.push({ id: uid('tm'), color, type: 'number', value: 0, hasPassSymbol: true });
    for (let v = 1; v <= 9; v += 1) {
      cards.push({ id: uid('tm'), color, type: 'number', value: v, hasPassSymbol: v % 3 === 0 });
      cards.push({ id: uid('tm'), color, type: 'number', value: v });
    }
    for (let i = 0; i < 2; i += 1) {
      cards.push({ id: uid('tm'), color, type: 'skip' });
      cards.push({ id: uid('tm'), color, type: 'reverse' });
      cards.push({ id: uid('tm'), color, type: 'draw2' });
    }
  }
  for (let i = 0; i < 4; i += 1) {
    cards.push({ id: uid('tm'), color: 'wild', type: 'wild' });
    cards.push({ id: uid('tm'), color: 'wild', type: 'wild_team_play' });
    cards.push({ id: uid('tm'), color: 'wild', type: 'wild_team_draw4' });
  }
  return cards;
}

export function getPartner(players: HubPlayer[], playerId: string): HubPlayer | undefined {
  const me = players.find((p) => p.id === playerId);
  if (!me || me.teamId === undefined) return undefined;
  return players.find((p) => p.id !== playerId && p.teamId === me.teamId);
}

/**
 * Official UNO Teams! Scoring:
 * - Number cards (0–9): face value
 * - Action cards (Skip, Reverse, Draw 2): 20 pts
 * - Wild cards (Wild, Wild Team Play, Wild Team Draw Four): 50 pts
 */
export function calculateTeamsHandPoints(hand: HubCard[]): number {
  return hand.reduce((sum, card) => {
    if (card.type === 'number') return sum + (card.value ?? 0);
    if (card.color === 'wild' || card.type.startsWith('wild')) return sum + 50;
    return sum + 20;
  }, 0);
}

/**
 * Official GOING OUT & TAGGING BACK IN Half-Hand Split:
 * - Whenever player A has 0 cards AND partner B has >= 2 cards:
 *   Partner B immediately gives floor(B.hand.length / 2) cards to A (B keeps the larger half if odd, e.g., 9 -> gives 4, keeps 5!).
 *   Player A is immediately active (`isOut: false`)!
 * - Exception: If partner B has ONLY 1 card left, NO cards are transferred and A stays `isOut: true` temporarily.
 */
export function applyGoingOutOrTagBackIn(
  players: HubPlayer[],
  triggerPlayerId: string,
  reason: 'going_out' | 'tag_back_in'
): { players: HubPlayer[]; note?: string } {
  const trigger = players.find((p) => p.id === triggerPlayerId);
  const partner = getPartner(players, triggerPlayerId);
  if (!trigger || !partner) return { players };

  // Determine donor (has cards) and receiver (has 0 cards)
  const donor = reason === 'going_out' ? partner : trigger;
  const receiver = reason === 'going_out' ? trigger : partner;

  if (receiver.hand.length !== 0) return { players };

  // Exception: donor only has 1 card left -> receiver stays Out!
  if (donor.hand.length === 1) {
    const updated = players.map((p) =>
      p.id === receiver.id ? { ...p, isOut: true } : p
    );
    return {
      players: updated,
      note: `🌟 ${receiver.name} habis kartu (rekan ${donor.name} sisa 1 kartu → ${receiver.name} keluar sementara)!`,
    };
  }

  // Both have 0 cards -> Team Win will be caught by checkWinCondition!
  if (donor.hand.length === 0) return { players };

  // Split half: odd count -> donor keeps larger half (e.g., 9 -> gives 4, keeps 5)
  const giveCount = Math.floor(donor.hand.length / 2);
  const transferred = donor.hand.slice(0, giveCount);
  const kept = donor.hand.slice(giveCount);

  const updated = players.map((p) => {
    if (p.id === donor.id) return { ...p, hand: kept, isOut: false, calledUno: kept.length === 1 ? p.calledUno : false };
    if (p.id === receiver.id) return { ...p, hand: [...transferred], isOut: false, calledUno: false };
    return p;
  });

  const note =
    reason === 'going_out'
      ? `🤝 GOING OUT SPLIT! ${donor.name} membagi ${giveCount} kartu (menyimpan ${kept.length}) ke ${receiver.name} agar permainan berlanjut!`
      : `🤝 TAGGING BACK IN! ${donor.name} membagi ${giveCount} kartu ke ${receiver.name} sehingga kembali aktif bermain!`;

  return { players: updated, note };
}

/**
 * Official UNO Teams! Setup:
 * - 2–4 teams (4, 6, or 8 players), partners seated across from each other (idx % teamCount).
 * - First Discard card MUST be a numbered card (0–9).
 * - First turn starts at left of dealer (index 1) clockwise.
 * - Initial Pass Phase: all pairs exchange 1 card (bots exchange automatically; human picks 1 card to exchange with partner!).
 */
function createTeamsRoundState(
  deck: HubCard[],
  players: HubPlayer[],
  mode: 'local' | 'ai' | 'online',
  settings: VariantSettings,
  roundNumber: number,
  roundHistory: HubRoundSummary[],
  teamScores: Record<number, number>
): HubGameState {
  const drawPile = [...deck];
  let firstCard: HubCard | undefined;

  for (let guard = 0; guard < drawPile.length; guard += 1) {
    const candidate = drawPile.pop();
    if (!candidate) break;
    if (candidate.type === 'number') {
      firstCard = candidate;
      break;
    }
    drawPile.unshift(candidate);
  }

  const starterIdx = players.length > 1 ? 1 % players.length : 0;
  const activeColor: HubCardColor =
    firstCard && firstCard.color !== 'wild' ? firstCard.color : 'red';

  // Perform automatic Initial Pass for all AI-only teams; if human player exists, prompt them to choose 1 card for Initial Pass!
  const firstHuman = players.find((p) => !p.isAI);
  const firstHumanPartner = firstHuman ? getPartner(players, firstHuman.id) : undefined;

  let workingPlayers = [...players];
  // Auto-exchange 1 card for every AI-only team
  const teamIds = Array.from(new Set(players.map((p) => p.teamId ?? 0)));
  for (const tid of teamIds) {
    const members = workingPlayers.filter((p) => p.teamId === tid);
    if (members.length === 2 && members.every((m) => m.isAI)) {
      const [m1, m2] = members;
      const c1 = m1.hand[0];
      const c2 = m2.hand[0];
      if (c1 && c2) {
        workingPlayers = workingPlayers.map((p) => {
          if (p.id === m1.id) return { ...p, hand: [...p.hand.slice(1), c2] };
          if (p.id === m2.id) return { ...p, hand: [...p.hand.slice(1), c1] };
          return p;
        });
      }
    }
  }

  const baseState: HubGameState = {
    version: 1,
    variantId: 'uno-teams',
    mode,
    phase: firstHuman && firstHumanPartner ? 'choose_pass_card' : 'playing',
    roundNumber,
    players: workingPlayers,
    currentPlayerIndex: starterIdx,
    direction: 1,
    drawPile,
    discardPile: firstCard ? [firstCard] : [],
    activeColor,
    pendingDrawCount: 0,
    drawnPlayableCardId: null,
    flipSide: 'light',
    hasDrawnThisTurn: false,
    settings,
    roundHistory,
    actionLog: [],
    lastEvent: null,
    winnerId: null,
    winnerTeamId: null,
    teamScores,
    pendingPrompt:
      firstHuman && firstHumanPartner
        ? {
            type: 'pass_to_partner',
            actorId: firstHuman.id,
            message: `🤝 INITIAL PASS (Sebelum Giliran 1): Pilih 1 kartu untuk ditukar dengan rekan timmu (${firstHumanPartner.name})!`,
          }
        : null,
    startedAt: Date.now(),
  };

  return appendEvent(
    baseState,
    'info',
    `Ronde ${roundNumber} UNO Teams! dimulai (${teamIds.length} Tim). Selesaikan Initial Pass sebelum giliran ${players[starterIdx].name}!`
  );
}

/** Pass turn after drawing a playable card in UNO Teams */
export function passAfterTeamsDraw(state: HubGameState, playerId: string): HubGameState {
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId || !state.drawnPlayableCardId) return state;
  const next = appendEvent(
    { ...state, drawnPlayableCardId: null, hasDrawnThisTurn: false },
    'pass',
    `${current.name} menyimpan kartu yang baru diambil dan melewatkan giliran.`
  );
  return unoTeamsRuleset.advanceTurn(next, 1);
}

export const unoTeamsRuleset: UnoRuleset = {
  id: 'uno-teams',

  createDeck() {
    return buildTeamsDeck();
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
      isOut: false,
    }));
    return { players: dealt, remainingDeck: remaining };
  },

  initializeGame(playerInits, mode, settings) {
    const deck = this.shuffleDeck(this.createDeck(settings));
    // Supports 2–4 teams (4, 6, or 8 players) seated across from each other (idx % teamCount)
    const clampedCount = playerInits.length >= 8 ? 8 : playerInits.length >= 6 ? 6 : 4;
    const teamCount = clampedCount / 2;
    const initialPlayers: HubPlayer[] = playerInits.slice(0, clampedCount).map((p, idx) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      teamId: p.teamId ?? idx % teamCount,
      hand: [],
      score: 0,
      calledUno: false,
      isOut: false,
    }));
    const { players, remainingDeck } = this.dealCards(deck, initialPlayers, settings);
    const teamScores: Record<number, number> = {};
    for (let t = 0; t < teamCount; t += 1) teamScores[t] = 0;
    return createTeamsRoundState(remainingDeck, players, mode, settings, 1, [], teamScores);
  },

  validateMove(state: HubGameState, playerId: string, move: MoveInput): ValidationResult {
    if (state.phase !== 'playing') return { valid: false, reason: 'Permainan tidak aktif.' };
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.id !== playerId || current.isOut) {
      return { valid: false, reason: 'Bukan giliranmu.' };
    }

    if (state.drawnPlayableCardId && move.cardId !== state.drawnPlayableCardId) {
      return {
        valid: false,
        reason: 'Mainkan kartu yang baru diambil atau klik Lewati Giliran!',
      };
    }

    const card = current.hand.find((c) => c.id === move.cardId);
    if (!card) return { valid: false, reason: 'Kartu tidak ditemukan.' };

    if (!standardColorMatchValid(state, card)) {
      return { valid: false, reason: 'Kartu harus cocok dengan warna, angka, atau simbol!' };
    }

    return {
      valid: true,
      requiresColor:
        card.type === 'wild' ||
        card.type === 'wild_team_play' ||
        card.type === 'wild_team_draw4',
    };
  },

  executeAction(state: HubGameState, playerId: string, move: MoveInput): HubGameState {
    const validation = this.validateMove(state, playerId, move);
    if (!validation.valid) return state;

    const current = state.players[state.currentPlayerIndex];
    const card = current.hand.find((c) => c.id === move.cardId)!;

    if (
      (card.type === 'wild' ||
        card.type === 'wild_team_play' ||
        card.type === 'wild_team_draw4') &&
      !move.chosenColor
    ) {
      return {
        ...state,
        phase: 'choose_color',
        pendingPrompt: {
          type: 'color',
          actorId: playerId,
          cardId: card.id,
          message: 'Pilih warna aktif untuk kartu Wild:',
        },
      };
    }

    const remainingHand = current.hand.filter((c) => c.id !== card.id);
    const wentOut = remainingHand.length === 0;
    let direction = state.direction;
    let steps = 1;
    let jumpToPlayerIdx: number | null = null;
    let drawPile = [...state.drawPile];
    let discardPile = [...state.discardPile, card];
    let activeColor: HubCardColor =
      card.type === 'wild' ||
      card.type === 'wild_team_play' ||
      card.type === 'wild_team_draw4'
        ? move.chosenColor ?? 'red'
        : card.color;

    let players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex
        ? {
            ...p,
            hand: remainingHand,
            calledUno: remainingHand.length === 1 ? p.calledUno : false,
          }
        : p
    );

    let eventType: string = card.type;
    let message = `${current.name} memainkan ${card.type === 'number' ? `${getColorLabel(card.color)} ${card.value}` : card.type.toUpperCase()}.`;

    if (card.type === 'reverse') {
      direction = (direction * -1) as 1 | -1;
      message = `🔄 ${current.name} membalik arah permainan!`;
    } else if (card.type === 'skip') {
      steps = 2;
      const skipped = players[getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1)];
      message = `🚫 SKIP! ${skipped?.name} kehilangan giliran.`;
    } else if (card.type === 'draw2') {
      const victimIdx = getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1);
      const victim = players[victimIdx];
      const res = drawCardsFromDeck(drawPile, discardPile, 2);
      drawPile = res.drawPile;
      discardPile = res.discardPile;
      players = players.map((p, idx) =>
        idx === victimIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
      );
      const tagRes = applyGoingOutOrTagBackIn(players, victim.id, 'tag_back_in');
      players = tagRes.players;
      steps = 2;
      message = `${current.name} memainkan +2! ${victim.name} ambil 2 kartu & dilewati.${tagRes.note ? ` ${tagRes.note}` : ''}`;
    } else if (card.type === 'wild') {
      message = `🌈 ${current.name} memainkan WILD → warna ${getColorLabel(activeColor)}!`;
    } else if (card.type === 'wild_team_play') {
      // OFFICIAL WILD TEAM PLAY:
      // 1. Actor chooses color.
      // 2. Turn JUMPS immediately to actor's partner!
      // 3. If partner CANNOT play any card on chosen color -> ACTOR draws +2 penalty cards, and play still continues from partner!
      const partner = getPartner(players, current.id);
      if (partner) {
        const partnerIdx = players.findIndex((p) => p.id === partner.id);
        const tempState: HubGameState = {
          ...state,
          players,
          discardPile,
          activeColor,
        };
        const partnerCanPlay =
          !partner.isOut && partner.hand.some((c) => standardColorMatchValid(tempState, c));

        if (partnerCanPlay) {
          jumpToPlayerIdx = partnerIdx;
          message = `🤝 WILD TEAM PLAY (${getColorLabel(activeColor)})! Giliran langsung melompat ke rekan ${partner.name}!`;
        } else {
          // Partner cannot play -> Actor takes +2 penalty, turn continues from partner's position!
          const res = drawCardsFromDeck(drawPile, discardPile, 2);
          drawPile = res.drawPile;
          discardPile = res.discardPile;
          players = players.map((p, idx) =>
            idx === state.currentPlayerIndex
              ? { ...p, hand: [...p.hand, ...res.drawn], isOut: false, calledUno: false }
              : p
          );
          jumpToPlayerIdx = getNextPlayerIndex(players, partnerIdx, direction, 1);
          message = `🤝⚠️ WILD TEAM PLAY (${getColorLabel(activeColor)})! ${partner.name} tidak punya kartu cocok → ${current.name} penalti +2 kartu!`;
        }
      }
    } else if (card.type === 'wild_team_draw4') {
      // OFFICIAL WILD TEAM DRAW FOUR:
      // 1. Next opponent draws 2 cards & loses turn.
      // 2. Their partner ALSO draws 2 cards EVEN IF currently Out (automatically bringing them back in!)
      const nextIdx = getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1);
      const nextOpp = players[nextIdx];
      const oppPartner = nextOpp ? getPartner(players, nextOpp.id) : undefined;
      const targetIds = [nextOpp?.id, oppPartner?.id].filter(Boolean) as string[];
      const victimNames: string[] = [];

      players = players.map((p) => {
        if (targetIds.includes(p.id)) {
          const res = drawCardsFromDeck(drawPile, discardPile, 2);
          drawPile = res.drawPile;
          discardPile = res.discardPile;
          victimNames.push(p.isOut ? `${p.name} (TAGGED BACK IN!)` : p.name);
          return {
            ...p,
            hand: [...p.hand, ...res.drawn],
            isOut: false, // Automatically tags out partner back into the game!
            calledUno: false,
          };
        }
        return p;
      });
      steps = 2;
      message = `💥 WILD TEAM +4 (${getColorLabel(activeColor)})! ${victimNames.join(' & ')} masing-masing mengambil 2 kartu!`;
    }

    // OFFICIAL GOING OUT RULE: if current player just hit 0 cards, check team win first, else split partner's half!
    if (wentOut && players[state.currentPlayerIndex].hand.length === 0) {
      const preWinCheck = this.checkWinCondition({
        ...state,
        players,
        drawPile,
        discardPile,
        activeColor,
      });
      if (preWinCheck.phase === 'round_over' || preWinCheck.phase === 'game_over') {
        return preWinCheck;
      }
      const goRes = applyGoingOutOrTagBackIn(players, current.id, 'going_out');
      players = goRes.players;
      if (goRes.note) message += ` ${goRes.note}`;
    }

    const updatedSelf = players[state.currentPlayerIndex];
    let nextState: HubGameState = appendEvent(
      {
        ...state,
        phase: 'playing',
        players,
        direction,
        drawPile,
        discardPile,
        activeColor,
        drawnPlayableCardId: null,
        hasDrawnThisTurn: false,
        pendingPrompt: null,
        unoVulnerablePlayerId:
          updatedSelf.hand.length === 1 && !updatedSelf.calledUno ? updatedSelf.id : null,
      },
      eventType,
      message
    );

    nextState = this.checkWinCondition(nextState);
    if (nextState.phase === 'round_over' || nextState.phase === 'game_over') return nextState;

    // OFFICIAL PASSING SYMBOL: simultaneous 1-card mutual exchange between actor and partner!
    const partner = getPartner(nextState.players, current.id);
    if (
      card.hasPassSymbol &&
      updatedSelf.hand.length > 0 &&
      partner &&
      partner.hand.length > 0
    ) {
      return {
        ...nextState,
        phase: 'choose_pass_card',
        pendingPrompt: {
          type: 'pass_to_partner',
          actorId: current.id,
          message: `↔️ PASSING SYMBOL! Pilih 1 kartu untuk saling bertukar secara bersamaan dengan ${partner.name}!`,
        },
      };
    }

    if (jumpToPlayerIdx !== null) {
      return transitionTurnWithPrivacy(nextState, jumpToPlayerIdx);
    }

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
    const winner = state.players.find((p) => p.id === winnerId);
    const winTeam = winner?.teamId;
    return state.players
      .filter((p) => p.teamId !== winTeam)
      .reduce((sum, p) => sum + calculateTeamsHandPoints(p.hand), 0);
  },

  checkWinCondition(state) {
    const teamIds = Array.from(new Set(state.players.map((p) => p.teamId ?? 0)));
    for (const tid of teamIds) {
      const members = state.players.filter((p) => p.teamId === tid);
      if (members.length > 0 && members.every((m) => m.hand.length === 0)) {
        const pts = this.calculateScore(state, members[0].id);
        const teamScores = { ...(state.teamScores ?? {}) };
        teamScores[tid] = (teamScores[tid] ?? 0) + pts;
        const updatedPlayers = state.players.map((p) =>
          p.teamId === tid ? { ...p, score: teamScores[tid] } : p
        );
        const reached = state.settings.singleRound || teamScores[tid] >= state.settings.targetScore;
        const teamLabel = TEAM_NAMES[tid] ?? `Tim ${tid + 1}`;
        const summary: HubRoundSummary = {
          roundNumber: state.roundNumber,
          winnerId: members[0].id,
          winnerName: `${teamLabel} (${members.map((m) => m.name).join(' & ')})`,
          winnerTeamId: tid,
          pointsAwarded: pts,
          reason: 'Kedua anggota tim sama-sama menghabiskan 0 kartu!',
          playerPoints: updatedPlayers.map((p) => ({
            playerId: p.id,
            playerName: `${p.name} (${TEAM_NAMES[p.teamId ?? 0]})`,
            handPoints: calculateTeamsHandPoints(p.hand),
            totalScore: p.score,
          })),
        };
        return appendEvent(
          {
            ...state,
            players: updatedPlayers,
            teamScores,
            phase: reached ? 'game_over' : 'round_over',
            winnerId: reached ? members[0].id : null,
            winnerTeamId: reached ? tid : null,
            pendingPrompt: null,
            drawnPlayableCardId: null,
            roundHistory: [...state.roundHistory, summary],
          },
          reached ? 'game_win' : 'round_end',
          reached
            ? `🏆 ${teamLabel} MEMENANGKAN PERTANDINGAN UNO TEAMS! (${teamScores[tid]} poin)`
            : `🎉 ${teamLabel} memenangkan Ronde ${state.roundNumber} (+${pts} poin)!`
        );
      }
    }
    return state;
  },

  resetRound(state) {
    const deck = this.shuffleDeck(this.createDeck(state.settings));
    const resetPlayers = state.players.map((p) => ({
      ...p,
      hand: [],
      calledUno: false,
      isOut: false,
    }));
    const { players, remainingDeck } = this.dealCards(deck, resetPlayers, state.settings);
    return createTeamsRoundState(
      remainingDeck,
      players,
      state.mode,
      state.settings,
      state.roundNumber + 1,
      state.roundHistory,
      state.teamScores ?? {}
    );
  },

  /**
   * Official UNO Teams! Draw Option:
   * - Player may draw 1 card even if they have a playable card.
   * - Automatically triggers Tagging Back In if partner is currently Out!
   * - If the drawn card is playable, human player may play it immediately or click Pass!
   */
  handleDrawOrPass(state, playerId) {
    const player = state.players[state.currentPlayerIndex];
    if (!player || player.id !== playerId || state.phase !== 'playing') return state;

    if (state.drawnPlayableCardId) {
      return passAfterTeamsDraw(state, playerId);
    }

    const { drawn, drawPile, discardPile } = drawCardsFromDeck(state.drawPile, state.discardPile, 1);
    const drawnCard = drawn[0];
    let players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex
        ? { ...p, hand: [...p.hand, ...drawn], calledUno: false }
        : p
    );

    const tagRes = applyGoingOutOrTagBackIn(players, player.id, 'tag_back_in');
    players = tagRes.players;

    const canPlayDrawn = Boolean(
      drawnCard &&
        !tagRes.note &&
        standardColorMatchValid(state, drawnCard) &&
        players[state.currentPlayerIndex].hand.some((c) => c.id === drawnCard.id)
    );

    if (canPlayDrawn && !player.isAI) {
      return appendEvent(
        {
          ...state,
          players,
          drawPile,
          discardPile,
          drawnPlayableCardId: drawnCard.id,
          hasDrawnThisTurn: true,
          unoVulnerablePlayerId: null,
        },
        'draw',
        `${player.name} mengambil 1 kartu yang COCOK! Mainkan sekarang atau klik Lewati Giliran.`
      );
    }

    const msg =
      `${player.name} mengambil 1 kartu.` + (tagRes.note ? ` ${tagRes.note}` : '');

    const nextState = appendEvent(
      {
        ...state,
        players,
        drawPile,
        discardPile,
        drawnPlayableCardId: null,
        hasDrawnThisTurn: false,
        unoVulnerablePlayerId: null,
      },
      tagRes.note ? 'tag_in' : 'draw',
      msg
    );
    return this.advanceTurn(nextState, 1);
  },

  resolvePrompt(state, payload) {
    if (!state.pendingPrompt) return state;

    // Mutual 1-card exchange (both Initial Pass & Passing Symbol!)
    if (state.pendingPrompt.type === 'pass_to_partner' && payload.passCardId) {
      const isInitialPass = state.pendingPrompt.message.includes('INITIAL PASS');
      const actor = state.players.find((p) => p.id === state.pendingPrompt?.actorId);
      const partner = actor ? getPartner(state.players, actor.id) : undefined;
      if (!actor || !partner) return state;

      const actorCard = actor.hand.find((c) => c.id === payload.passCardId);
      if (!actorCard) return state;

      // Partner simultaneously chooses 1 card to send back (if partner has cards)
      const partnerCard = partner.hand[0];

      const players = state.players.map((p) => {
        if (p.id === actor.id) {
          const rest = p.hand.filter((c) => c.id !== actorCard.id);
          return {
            ...p,
            hand: partnerCard ? [...rest, partnerCard] : rest,
            isOut: false,
            calledUno: false,
          };
        }
        if (p.id === partner.id) {
          const rest = partnerCard ? p.hand.filter((c) => c.id !== partnerCard.id) : p.hand;
          return {
            ...p,
            hand: [...rest, actorCard],
            isOut: false,
            calledUno: false,
          };
        }
        return p;
      });

      const nextState = appendEvent(
        {
          ...state,
          phase: 'playing',
          players,
          pendingPrompt: null,
        },
        'pass_card',
        isInitialPass
          ? `🤝 INITIAL PASS SELESAI! ${actor.name} & ${partner.name} saling bertukar 1 kartu. Giliran ${state.players[state.currentPlayerIndex].name}!`
          : `↔️ PASSING SYMBOL! ${actor.name} & ${partner.name} saling bertukar 1 kartu secara bersamaan!`
      );

      // On Initial Pass, do NOT advance turn: turn 1 belongs to starterIdx (left of dealer)!
      if (isInitialPass) return nextState;
      return this.advanceTurn(nextState, 1);
    }

    if (!state.pendingPrompt.cardId) return state;
    return this.executeAction(
      { ...state, phase: 'playing', pendingPrompt: null },
      state.pendingPrompt.actorId,
      {
        cardId: state.pendingPrompt.cardId,
        chosenColor: payload.color,
      }
    );
  },

  decideAIMove(state) {
    return genericAIDecision(this, state);
  },
};
