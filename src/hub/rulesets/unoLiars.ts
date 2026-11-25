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
  HubCardType,
  HubGameState,
  HubPlayer,
  HubRoundSummary,
  LiarClaimState,
  MoveInput,
  UnoRuleset,
  ValidationResult,
  VariantSettings,
  WildLiarsChallengeState,
} from '../types';
import { STANDARD_COLORS, finalizeStandardRoundWin } from './baseHelpers';

/** Color-blind accessibility symbol per standard color */
export function getLiarsColorSymbol(color: HubCardColor): string {
  const map: Partial<Record<HubCardColor, string>> = {
    red: '◆',
    yellow: '★',
    green: '▲',
    blue: '●',
  };
  return map[color] ?? '';
}

/**
 * Official 112-Card Liar's UNO Deck (2–6 players):
 * - 40 Regular Number Cards (0–9 × 1/color, isLiarsCard: false -> FACE UP)
 * -  4 Wild Liar's Challenge Cards (isLiarsCard: false -> FACE UP)
 * - 40 Liar's Number Cards (0–9 × 1/color, isLiarsCard: true -> FACE DOWN)
 * - 24 Liar's Action Cards (Draw 2 × 2, Skip × 2, Reverse × 2 per color, isLiarsCard: true -> FACE DOWN)
 * -  4 Wild Draw Four Cards (isLiarsCard: true -> FACE DOWN)
 * Total = 40 + 4 + 40 + 24 + 4 = 112 cards!
 */
function buildLiarsDeck(): HubCard[] {
  const cards: HubCard[] = [];
  for (const color of STANDARD_COLORS) {
    for (let v = 0; v <= 9; v += 1) {
      cards.push({ id: uid('lr'), color, type: 'number', value: v, isLiarsCard: false });
      cards.push({ id: uid('lr'), color, type: 'number', value: v, isLiarsCard: true });
    }
    for (let i = 0; i < 2; i += 1) {
      cards.push({ id: uid('lr'), color, type: 'draw2', isLiarsCard: true });
      cards.push({ id: uid('lr'), color, type: 'skip', isLiarsCard: true });
      cards.push({ id: uid('lr'), color, type: 'reverse', isLiarsCard: true });
    }
  }
  for (let i = 0; i < 4; i += 1) {
    cards.push({ id: uid('lr'), color: 'wild', type: 'wild_draw4', isLiarsCard: true });
    cards.push({ id: uid('lr'), color: 'wild', type: 'wild_liars_challenge', isLiarsCard: false });
  }
  return cards;
}

/**
 * Official Liar's UNO Scoring (Target 500 pts):
 * - Numbers (0–9): face value
 * - Action Cards (Skip, Reverse, Draw 2): 20 pts
 * - Wild Cards (Wild Draw 4, Wild Liar's Challenge): 50 pts
 */
export function calculateLiarsHandPoints(hand: HubCard[]): number {
  return hand.reduce((sum, card) => {
    if (card.type === 'number') return sum + (card.value ?? 0);
    if (card.color === 'wild' || card.type === 'wild_draw4' || card.type === 'wild_liars_challenge') {
      return sum + 50;
    }
    return sum + 20;
  }, 0);
}

/** Check if a card (or plausible declaration) matches the current effective top of Discard Pile */
export function matchesLiarsTop(
  state: HubGameState,
  color: HubCardColor,
  type: HubCardType,
  value?: number
): boolean {
  if (color === 'wild' || type === 'wild_draw4' || type === 'wild_liars_challenge') return true;
  if (color === state.activeColor) return true;
  const effTop = state.liarsTopClaim ?? state.discardPile[state.discardPile.length - 1];
  if (!effTop) return true;
  if (effTop.type === 'number' && type === 'number' && value !== undefined && value === effTop.value) {
    return true;
  }
  if (effTop.type !== 'number' && effTop.type === type) {
    return true;
  }
  return false;
}

function formatClaimLabel(color: HubCardColor, type: HubCardType, value?: number): string {
  if (type === 'wild_draw4') return `WILD +4 (${getColorLabel(color)})`;
  if (type === 'number') return `${getColorLabel(color)} ${value ?? 0}`;
  return `${getColorLabel(color)} ${type.toUpperCase()}`;
}

/** Rotate all players' hands in play direction (0's Pass) */
function executeZeroPass(players: HubPlayer[], direction: 1 | -1): HubPlayer[] {
  const n = players.length;
  if (n < 2) return players;
  const oldHands = players.map((p) => p.hand);
  return players.map((p, idx) => {
    const giverIdx = (idx - direction + n) % n;
    const newHand = oldHands[giverIdx];
    return { ...p, hand: newHand, calledUno: newHand.length === 1 ? p.calledUno : false };
  });
}

/** Swap hands between two players (7's Swap) */
function executeSevenSwap(players: HubPlayer[], actorId: string, targetId: string): HubPlayer[] {
  const actor = players.find((p) => p.id === actorId);
  const target = players.find((p) => p.id === targetId);
  if (!actor || !target || actorId === targetId) return players;
  const actorHand = actor.hand;
  const targetHand = target.hand;
  return players.map((p) => {
    if (p.id === actorId) {
      return { ...p, hand: targetHand, calledUno: targetHand.length === 1 ? p.calledUno : false };
    }
    if (p.id === targetId) {
      return { ...p, hand: actorHand, calledUno: actorHand.length === 1 ? p.calledUno : false };
    }
    return p;
  });
}

/**
 * Setup initial Liar's UNO round:
 * - 2–6 players, 7 cards each.
 * - First Discard card: ignore Action Cards until a Number card appears;
 *   if it's a Liar's Number Card, treat it as a normal open card!
 * - Starts left of dealer (index 1) clockwise.
 */
function createLiarsRoundState(
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

  return appendEvent(
    {
      version: 1,
      variantId: 'uno-liars',
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
      liarClaim: null,
      wildLiarsChallenge: null,
      liarsTopClaim: null,
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
    `🎭 Ronde ${roundNumber} Liar's UNO dimulai! Kartu pembuka: ${getColorLabel(activeColor)} ${firstCard?.value ?? 0}. Giliran ${players[starterIdx]?.name}.`
  );
}

/**
 * Apply the resolved effect of a Liar's UNO card (either Regular, Honest Liar's, or Unchallenged Liar's).
 * CRITICAL EDGE CASE: If pendingPenaltyPlayerId is provided on a 7 or 0 card,
 * the penalty card is drawn AFTER the hand swap/pass completes!
 */
function applyResolvedLiarsEffect(
  state: HubGameState,
  actorId: string,
  effColor: HubCardColor,
  effType: HubCardType,
  effValue: number | undefined,
  baseMsg: string,
  pendingPenaltyPlayerId?: string,
  pendingSwapTargetId?: string
): HubGameState {
  const actorIdx = state.players.findIndex((p) => p.id === actorId);
  if (actorIdx < 0) return state;

  let players = [...state.players];
  let drawPile = [...state.drawPile];
  let discardPile = [...state.discardPile];
  let direction = state.direction;
  let steps = 1;
  let msg = baseMsg;

  // Helper to apply penalty card (used AFTER 7's Swap or 0's Pass!)
  const applyPenaltyNow = () => {
    if (!pendingPenaltyPlayerId) return;
    const res = drawCardsFromDeck(drawPile, discardPile, 1);
    drawPile = res.drawPile;
    discardPile = res.discardPile;
    const penName = players.find((p) => p.id === pendingPenaltyPlayerId)?.name ?? 'Penantang';
    players = players.map((p) =>
      p.id === pendingPenaltyPlayerId
        ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false }
        : p
    );
    msg += ` ${penName} mengambil +1 kartu penalti!`;
  };

  if (effType === 'reverse') {
    if (players.length === 2) {
      steps = 2;
      msg += ' 🔄 REVERSE (2 pemain = Skip)!';
    } else {
      direction = (direction * -1) as 1 | -1;
      msg += ` 🔄 REVERSE! Arah dibalik (${direction === 1 ? '↻' : '↺'}).`;
    }
    applyPenaltyNow();
  } else if (effType === 'skip') {
    steps = 2;
    msg += ' 🚫 SKIP! Pemain berikutnya dilewati!';
    applyPenaltyNow();
  } else if (effType === 'draw2') {
    const victimIdx = getNextPlayerIndex(players, actorIdx, direction, 1);
    const res = drawCardsFromDeck(drawPile, discardPile, 2);
    drawPile = res.drawPile;
    discardPile = res.discardPile;
    players = players.map((p, idx) =>
      idx === victimIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
    );
    steps = 2;
    msg += ` 💥 +2! ${players[victimIdx].name} ambil 2 kartu & dilewati!`;
    applyPenaltyNow();
  } else if (effType === 'wild_draw4') {
    const victimIdx = getNextPlayerIndex(players, actorIdx, direction, 1);
    const res = drawCardsFromDeck(drawPile, discardPile, 4);
    drawPile = res.drawPile;
    discardPile = res.discardPile;
    players = players.map((p, idx) =>
      idx === victimIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
    );
    steps = 2;
    msg += ` 💥 WILD +4! ${players[victimIdx].name} ambil 4 kartu & dilewati!`;
    applyPenaltyNow();
  } else if (effType === 'number' && effValue === 0) {
    // 0's PASS FIRST, THEN draw penalty card!
    players = executeZeroPass(players, direction);
    msg += ` 🔁 0's PASS! Semua pemain mengoper seluruh kartunya (${direction === 1 ? '↻' : '↺'})!`;
    applyPenaltyNow();
  } else if (effType === 'number' && effValue === 7) {
    // 7's SWAP FIRST, THEN draw penalty card!
    const actorHandLen = players[actorIdx].hand.length;
    if (actorHandLen === 0) {
      applyPenaltyNow();
    } else if (!pendingSwapTargetId) {
      return appendEvent(
        {
          ...state,
          phase: 'choose_target',
          players,
          currentPlayerIndex: actorIdx,
          direction,
          drawPile,
          discardPile,
          activeColor: effColor,
          liarClaim: pendingPenaltyPlayerId
            ? {
                actorId,
                actorName: players[actorIdx].name,
                actualCard: state.discardPile[state.discardPile.length - 1],
                previousActiveColor: state.activeColor,
                claimedColor: effColor,
                claimedType: 'number',
                claimedValue: 7,
                challengerId: pendingPenaltyPlayerId,
                pendingPenaltyPlayerId,
              }
            : null,
          pendingPrompt: {
            type: 'target_swap',
            actorId,
            message: `🔀 7's SWAP! ${players[actorIdx].name}, pilih pemain untuk bertukar seluruh kartu!`,
          },
        },
        'swap_prompt',
        `${msg} 🔀 7's SWAP! Pilih target pertukaran tangan...`
      );
    } else {
      const targetName = players.find((p) => p.id === pendingSwapTargetId)?.name ?? 'Lawan';
      players = executeSevenSwap(players, actorId, pendingSwapTargetId);
      msg += ` 🔀 7's SWAP! ${players[actorIdx].name} bertukar kartu dengan ${targetName}!`;
      applyPenaltyNow();
    }
  } else {
    applyPenaltyNow();
  }

  let next = appendEvent(
    {
      ...state,
      phase: 'playing',
      players,
      currentPlayerIndex: actorIdx,
      direction,
      drawPile,
      discardPile,
      activeColor: effColor,
      liarClaim: null,
      pendingPrompt: null,
      drawnPlayableCardId: null,
      hasDrawnThisTurn: false,
    },
    'bluff_resolved',
    msg
  );

  next = unoLiarsRuleset.checkWinCondition(next);
  if (next.phase === 'round_over' || next.phase === 'game_over') return next;
  return unoLiarsRuleset.advanceTurn(next, steps);
}

/**
 * Any player (not just next player!) can challenge a pending face-down Liar's Card claim!
 */
export function challengeLiarsClaim(state: HubGameState, challengerId: string): HubGameState {
  const claim = state.liarClaim;
  if (state.phase !== 'liar_challenge' || !claim || challengerId === claim.actorId) return state;

  const challenger = state.players.find((p) => p.id === challengerId);
  if (!challenger) return state;

  const actual = claim.actualCard;
  const wasHonest =
    actual.type === claim.claimedType &&
    (actual.type === 'wild_draw4' ||
      (actual.color === claim.claimedColor &&
        (actual.type !== 'number' || actual.value === claim.claimedValue)));

  if (!wasHonest) {
    // CAUGHT LYING! Actor takes back their card + 1 penalty card! (Prevents winning on last card!)
    const discardWithoutCard = state.discardPile.filter((c) => c.id !== actual.id);
    const res = drawCardsFromDeck(state.drawPile, discardWithoutCard, 1);
    const players = state.players.map((p) =>
      p.id === claim.actorId
        ? { ...p, hand: [...p.hand, actual, ...res.drawn], calledUno: false }
        : p
    );
    const actorIdx = players.findIndex((p) => p.id === claim.actorId);
    const nextIdx = getNextPlayerIndex(players, actorIdx, state.direction, 1);

    const revealedLabel = formatClaimLabel(actual.color, actual.type, actual.value);
    const next = appendEvent(
      {
        ...state,
        phase: 'playing',
        players,
        currentPlayerIndex: actorIdx,
        drawPile: res.drawPile,
        discardPile: res.discardPile,
        activeColor: claim.previousActiveColor,
        liarClaim: null,
        pendingPrompt: null,
        unoVulnerablePlayerId: null,
      },
      'bluff_resolved',
      `🚨 TERTANGKAP BOHONG! ${challenger.name} menantang ${claim.actorName} (aslinya: ${revealedLabel}). ${claim.actorName} tarik kembali kartunya + ambil 1 kartu penalti!`
    );
    return transitionTurnWithPrivacy(next, nextIdx);
  }

  // HONEST! Card stands, challenger draws +1 penalty (AFTER 7's Swap / 0's Pass if applicable!)
  const revealedLabel = formatClaimLabel(claim.claimedColor, actual.type, actual.value);
  return applyResolvedLiarsEffect(
    { ...state, liarsTopClaim: null },
    claim.actorId,
    claim.claimedColor,
    actual.type,
    actual.value,
    `😎 JUJUR! Kartu ${claim.actorName} benar-benar ${revealedLabel}!`,
    challengerId,
    claim.pendingSwapTargetId
  );
}

/** Finalize Wild Liar's Challenge phase: discard all remaining pending cards & check simultaneous co-winners! */
function finishWildLiarsChallenge(
  state: HubGameState,
  wlc: WildLiarsChallengeState,
  reasonMsg: string
): HubGameState {
  const pendingSubs = wlc.submissions.filter((s) => s.status === 'pending' || s.status === 'honest_passed');
  const discardedUnderWild = pendingSubs.map((s) => s.card);

  // Place discarded face-down cards UNDER the Wild Liar's Challenge top card!
  const topWild = state.discardPile[state.discardPile.length - 1];
  const restDiscard = state.discardPile.slice(0, -1);
  const newDiscardPile = topWild
    ? [...restDiscard, ...discardedUnderWild, topWild]
    : [...restDiscard, ...discardedUnderWild];

  const actorIdx = state.players.findIndex((p) => p.id === wlc.actorId);
  let next = appendEvent(
    {
      ...state,
      phase: 'playing',
      discardPile: newDiscardPile,
      activeColor: wlc.chosenColor,
      wildLiarsChallenge: null,
      pendingPrompt: null,
      liarsTopClaim: null,
    },
    'wild_liars_done',
    reasonMsg
  );

  // EDGE CASE: Check for single winner OR simultaneous CO-WINNERS!
  const zeroCardPlayers = next.players.filter((p) => p.hand.length === 0);
  if (zeroCardPlayers.length > 1) {
    const coNames = zeroCardPlayers.map((p) => p.name).join(' & ');
    const remainingPts = next.players
      .filter((p) => p.hand.length > 0)
      .reduce((sum, p) => sum + calculateLiarsHandPoints(p.hand), 0);
    const winnerIds = new Set(zeroCardPlayers.map((p) => p.id));
    const updatedPlayers = next.players.map((p) =>
      winnerIds.has(p.id) ? { ...p, score: p.score + remainingPts } : p
    );
    const done =
      next.settings.singleRound ||
      updatedPlayers.some((p) => winnerIds.has(p.id) && p.score >= next.settings.targetScore);

    return appendEvent(
      {
        ...next,
        players: updatedPlayers,
        phase: done ? 'game_over' : 'round_over',
        winnerId: done ? zeroCardPlayers[0].id : null,
        roundHistory: [
          ...next.roundHistory,
          {
            roundNumber: next.roundNumber,
            winnerId: zeroCardPlayers[0].id,
            winnerName: coNames,
            pointsAwarded: remainingPts,
            reason: `MENANG BERSAMA lewat Wild Liar's Challenge! (${coNames} habis kartu bersamaan!)`,
            playerPoints: updatedPlayers.map((p) => ({
              playerId: p.id,
              playerName: p.name,
              handPoints: calculateLiarsHandPoints(p.hand),
              totalScore: p.score,
            })),
          },
        ],
      },
      done ? 'game_win' : 'round_end',
      `🏆 MENANG BERSAMA! ${coNames} menghabiskan kartu terakhir secara bersamaan di Wild Liar's Challenge!`
    );
  }

  next = unoLiarsRuleset.checkWinCondition(next);
  if (next.phase === 'round_over' || next.phase === 'game_over') return next;
  return unoLiarsRuleset.advanceTurn({ ...next, currentPlayerIndex: actorIdx }, 1);
}

/** Actor challenges a specific pending player during Wild Liar's Challenge */
export function challengeWildSubmission(state: HubGameState, targetPlayerId: string): HubGameState {
  const wlc = state.wildLiarsChallenge;
  if (state.phase !== 'liars_wild_challenge' || !wlc) return state;

  const sub = wlc.submissions.find((s) => s.playerId === targetPlayerId && s.status === 'pending');
  if (!sub) return state;

  // Wild cards do NOT count as matching the requested color!
  const isHonest = sub.card.color === wlc.chosenColor;

  if (!isHonest) {
    // Target LIED -> takes back card + 1 penalty card; actor may keep challenging others!
    const res = drawCardsFromDeck(state.drawPile, state.discardPile, 1);
    const players = state.players.map((p) =>
      p.id === targetPlayerId
        ? { ...p, hand: [...p.hand, sub.card, ...res.drawn], calledUno: false }
        : p
    );
    const updatedSubs = wlc.submissions.map((s) =>
      s.playerId === targetPlayerId ? { ...s, status: 'caught_lying' as const } : s
    );
    const updatedWlc: WildLiarsChallengeState = { ...wlc, submissions: updatedSubs };
    const stillPending = updatedSubs.some((s) => s.status === 'pending');

    const msg = `🚨 ${sub.playerName} KETAHUAN BOHONG di Wild Liar's Challenge! (Kartu bukan ${getColorLabel(wlc.chosenColor)}) → tarik kembali + 1 penalti!`;
    if (!stillPending) {
      return finishWildLiarsChallenge(
        { ...state, players, drawPile: res.drawPile, discardPile: res.discardPile },
        updatedWlc,
        `${msg} Semua pemain telah diperiksa!`
      );
    }

    return appendEvent(
      {
        ...state,
        players,
        drawPile: res.drawPile,
        discardPile: res.discardPile,
        wildLiarsChallenge: updatedWlc,
        pendingPrompt: {
          type: 'liars_wild_challenge',
          actorId: wlc.actorId,
          message: `🎭 ${sub.playerName} BOHONG (+1)! ${wlc.actorName}, lanjut tantang pemain lain atau berhenti?`,
        },
      },
      'bluff_resolved',
      msg
    );
  }

  // Target was HONEST -> challenge phase STOPS immediately! Target & all remaining pending players discard face-down!
  const updatedSubs = wlc.submissions.map((s) =>
    s.playerId === targetPlayerId ? { ...s, status: 'honest_passed' as const } : s
  );
  return finishWildLiarsChallenge(
    state,
    { ...wlc, submissions: updatedSubs },
    `😎 ${sub.playerName} JUJUR (memang ${getColorLabel(wlc.chosenColor)})! Tantangan berhenti: semua kartu tersisa langsung dibuang!`
  );
}

/** Pass after drawing a playable card in Liar's UNO */
export function passAfterLiarsDraw(state: HubGameState, playerId: string): HubGameState {
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId || !state.drawnPlayableCardId) return state;
  const next = appendEvent(
    { ...state, drawnPlayableCardId: null, hasDrawnThisTurn: false },
    'pass',
    `${current.name} menyimpan kartu yang baru diambil dan melewatkan giliran.`
  );
  return unoLiarsRuleset.advanceTurn(next, 1);
}

export const unoLiarsRuleset: UnoRuleset = {
  id: 'uno-liars',

  createDeck() {
    return buildLiarsDeck();
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
    const clamped = playerInits.slice(0, 6); // 2–6 players
    const initialPlayers: HubPlayer[] = clamped.map((p) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      hand: [],
      score: 0,
      calledUno: false,
    }));
    const { players, remainingDeck } = this.dealCards(deck, initialPlayers, settings);
    return createLiarsRoundState(remainingDeck, players, mode, settings, 1, []);
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

    // Liar's Card (isLiarsCard === true): ALWAYS playable face-down (honestly or as plausible bluff)!
    if (card.isLiarsCard) {
      return { valid: true };
    }

    // Regular Card & Wild Liar's Challenge Card: ALWAYS played FACE UP, MUST match!
    if (!matchesLiarsTop(state, card.color, card.type, card.value)) {
      return {
        valid: false,
        reason: 'Kartu Regular wajib dimainkan TERBUKA dan cocok warna/angka! Tidak bisa menyamar sebagai Liar\'s Card.',
      };
    }

    return {
      valid: true,
      requiresColor: card.type === 'wild_liars_challenge',
      requiresTarget: card.type === 'number' && card.value === 7 ? 'target_swap' : undefined,
    };
  },

  executeAction(state: HubGameState, playerId: string, move: MoveInput): HubGameState {
    const val = this.validateMove(state, playerId, move);
    if (!val.valid) return state;

    const current = state.players[state.currentPlayerIndex];
    const card = current.hand.find((c) => c.id === move.cardId)!;

    // 1) WILD LIAR'S CHALLENGE CARD (Always FACE UP!)
    if (card.type === 'wild_liars_challenge') {
      if (!move.chosenColor) {
        return {
          ...state,
          phase: 'choose_color',
          pendingPrompt: {
            type: 'color',
            actorId: playerId,
            cardId: card.id,
            message: "🎭 WILD LIAR'S CHALLENGE! Pilih 1 warna yang wajib diletakkan semua lawan:",
          },
        };
      }

      const chosenColor = move.chosenColor;
      const remainingActorHand = current.hand.filter((c) => c.id !== card.id);
      const submissions: WildLiarsChallengeState['submissions'] = [];

      const updatedPlayers = state.players.map((p, idx) => {
        if (idx === state.currentPlayerIndex) {
          return {
            ...p,
            hand: remainingActorHand,
            calledUno: remainingActorHand.length === 1 ? p.calledUno : false,
          };
        }
        if (p.hand.length === 0) return p;
        // Opponent places 1 card face-down: prefer matching chosenColor (Wild does NOT count!), else bluff!
        const honestCard = p.hand.find((c) => c.color === chosenColor);
        const placed = honestCard ?? p.hand[0];
        submissions.push({
          playerId: p.id,
          playerName: p.name,
          card: placed,
          status: 'pending',
        });
        const nextHand = p.hand.filter((c) => c.id !== placed.id);
        return { ...p, hand: nextHand, calledUno: nextHand.length === 1 ? p.calledUno : false };
      });

      const wlc: WildLiarsChallengeState = {
        actorId: current.id,
        actorName: current.name,
        chosenColor,
        submissions,
      };

      const baseAfterPlay: HubGameState = {
        ...state,
        phase: 'liars_wild_challenge',
        players: updatedPlayers,
        discardPile: [...state.discardPile, card],
        activeColor: chosenColor,
        wildLiarsChallenge: wlc,
        liarsTopClaim: null,
        drawnPlayableCardId: null,
        unoVulnerablePlayerId:
          remainingActorHand.length === 1 && !current.calledUno ? current.id : null,
        pendingPrompt: {
          type: 'liars_wild_challenge',
          actorId: current.id,
          message: `🎭 WILD LIAR'S CHALLENGE (${getColorLabel(chosenColor)})! ${current.name}, pilih lawan untuk ditantang satu per satu atau Berhenti:`,
        },
      };

      if (submissions.length === 0) {
        return finishWildLiarsChallenge(
          baseAfterPlay,
          wlc,
          `🎭 ${current.name} memainkan Wild Liar's Challenge (${getColorLabel(chosenColor)})!`
        );
      }

      return appendEvent(
        baseAfterPlay,
        'wild_liars_challenge',
        `🎭 WILD LIAR'S CHALLENGE! ${current.name} meminta warna ${getColorLabel(chosenColor)}. Semua lawan meletakkan 1 kartu tertutup!`
      );
    }

    // 2) REGULAR NUMBER CARD (Always FACE UP!)
    if (!card.isLiarsCard) {
      const remaining = current.hand.filter((c) => c.id !== card.id);
      if (card.type === 'number' && card.value === 7 && remaining.length > 0 && !move.targetPlayerId) {
        return {
          ...state,
          phase: 'choose_target',
          pendingPrompt: {
            type: 'target_swap',
            actorId: playerId,
            cardId: card.id,
            message: `🔀 7's SWAP! ${current.name}, pilih pemain untuk menukar seluruh kartu:`,
          },
        };
      }

      const players = state.players.map((p, idx) =>
        idx === state.currentPlayerIndex
          ? { ...p, hand: remaining, calledUno: remaining.length === 1 ? p.calledUno : false }
          : p
      );

      return applyResolvedLiarsEffect(
        {
          ...state,
          players,
          discardPile: [...state.discardPile, card],
          liarsTopClaim: null,
          unoVulnerablePlayerId: remaining.length === 1 && !current.calledUno ? current.id : null,
        },
        current.id,
        card.color,
        card.type,
        card.value,
        `${current.name} memainkan kartu Regular TERBUKA: ${getColorLabel(card.color)} ${card.value}.`,
        undefined,
        move.targetPlayerId
      );
    }

    // 3) LIAR'S CARD (Always FACE DOWN: honest or plausible bluff!)
    const effTop = state.liarsTopClaim ?? state.discardPile[state.discardPile.length - 1];
    const cardIsHonestMatch = matchesLiarsTop(state, card.color, card.type, card.value);

    let claimedColor: HubCardColor =
      move.claimedColor ?? (card.color === 'wild' ? state.activeColor : cardIsHonestMatch ? card.color : state.activeColor);
    let claimedType: HubCardType =
      move.claimedType ?? (cardIsHonestMatch ? card.type : 'number');
    let claimedValue: number | undefined =
      move.claimedValue ??
      (claimedType === 'number'
        ? cardIsHonestMatch
          ? card.value
          : effTop?.type === 'number'
          ? effTop.value
          : 5
        : undefined);

    // Ensure declaration is plausible under UNO rules!
    if (!matchesLiarsTop(state, claimedColor, claimedType, claimedValue)) {
      claimedColor = state.activeColor;
    }

    const remainingHand = current.hand.filter((c) => c.id !== card.id);
    const players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex
        ? { ...p, hand: remainingHand, calledUno: remainingHand.length === 1 ? p.calledUno : false }
        : p
    );

    const nextIdx = getNextPlayerIndex(players, state.currentPlayerIndex, state.direction, 1);
    const challenger = players[nextIdx];
    const claim: LiarClaimState = {
      actorId: current.id,
      actorName: current.name,
      actualCard: card,
      previousActiveColor: state.activeColor,
      claimedColor,
      claimedType,
      claimedValue,
      challengerId: challenger.id,
      pendingSwapTargetId: move.targetPlayerId,
    };

    const claimText = formatClaimLabel(claimedColor, claimedType, claimedValue);

    return appendEvent(
      {
        ...state,
        phase: 'liar_challenge',
        players,
        currentPlayerIndex: nextIdx,
        discardPile: [...state.discardPile, card],
        activeColor: claimedColor,
        liarClaim: claim,
        drawnPlayableCardId: null,
        unoVulnerablePlayerId:
          remainingHand.length === 1 && !current.calledUno ? current.id : null,
        pendingPrompt: {
          type: 'liar_claim',
          actorId: challenger.id,
          message: `🎭 ${current.name} meletakkan Liar's Card TERTUTUP dan mengklaim: ${claimText}. Percaya atau Tantang?`,
        },
      },
      'bluff',
      `🎭 ${current.name} meletakkan kartu tertutup & mengklaim: ${claimText}! (Pemain mana pun dapat menantang!)`
    );
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
      .filter((p) => p.id !== winnerId)
      .reduce((sum, p) => sum + calculateLiarsHandPoints(p.hand), 0);
  },

  checkWinCondition(state) {
    const winner = state.players.find((p) => !p.isOut && !p.eliminated && p.hand.length === 0);
    if (!winner) return state;
    const pts = this.calculateScore(state, winner.id);
    return finalizeStandardRoundWin(state, winner.id, pts, "Menang di Liar's UNO!");
  },

  resetRound(state) {
    const deck = this.shuffleDeck(this.createDeck(state.settings));
    const resetPlayers = state.players.map((p) => ({ ...p, hand: [], calledUno: false }));
    const { players, remainingDeck } = this.dealCards(deck, resetPlayers, state.settings);
    return createLiarsRoundState(
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
      return passAfterLiarsDraw(state, playerId);
    }

    const res = drawCardsFromDeck(state.drawPile, state.discardPile, 1);
    const drawn = res.drawn[0];
    const players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
    );

    const canPlayDrawn = Boolean(
      drawn && (drawn.isLiarsCard || matchesLiarsTop(state, drawn.color, drawn.type, drawn.value))
    );

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
        `${current.name} mengambil 1 kartu yang BISA dimainkan! Mainkan sekarang atau klik Lewati Giliran.`
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
    // 1) Wild Liar's Challenge prompt
    if (state.pendingPrompt?.type === 'liars_wild_challenge' && state.wildLiarsChallenge) {
      if (payload.challengeChoice === 'trust' || !payload.targetPlayerId) {
        return finishWildLiarsChallenge(
          state,
          state.wildLiarsChallenge,
          `✅ ${state.wildLiarsChallenge.actorName} berhenti menantang. Semua kartu tersisa langsung dibuang!`
        );
      }
      return challengeWildSubmission(state, payload.targetPlayerId);
    }

    // 2) Liar's Card Challenge prompt (Trust or Challenge)
    if (state.pendingPrompt?.type === 'liar_claim' && state.liarClaim) {
      const claim = state.liarClaim;
      if (payload.challengeChoice === 'challenge') {
        return challengeLiarsClaim(state, payload.targetPlayerId ?? claim.challengerId);
      }
      // Accepted (Unchallenged): declared effect applies even if actor was lying!
      const claimLabel = formatClaimLabel(claim.claimedColor, claim.claimedType, claim.claimedValue);
      return applyResolvedLiarsEffect(
        {
          ...state,
          liarsTopClaim: {
            color: claim.claimedColor,
            type: claim.claimedType,
            value: claim.claimedValue,
          },
        },
        claim.actorId,
        claim.claimedColor,
        claim.claimedType,
        claim.claimedValue,
        `✅ Tidak ada yang menantang! Klaim ${claim.actorName} (${claimLabel}) dianggap sah!`,
        undefined,
        claim.pendingSwapTargetId
      );
    }

    // 3) 7's Swap target selection (may have deferred penalty card from Challenge!)
    if (state.pendingPrompt?.type === 'target_swap' && payload.targetPlayerId) {
      if (state.pendingPrompt.cardId) {
        return this.executeAction(
          { ...state, phase: 'playing', pendingPrompt: null },
          state.pendingPrompt.actorId,
          { cardId: state.pendingPrompt.cardId, targetPlayerId: payload.targetPlayerId }
        );
      }
      // Deferred 7's Swap after Liar's Challenge resolved!
      return applyResolvedLiarsEffect(
        { ...state, phase: 'playing', pendingPrompt: null },
        state.pendingPrompt.actorId,
        state.activeColor,
        'number',
        7,
        '',
        state.liarClaim?.pendingPenaltyPlayerId,
        payload.targetPlayerId
      );
    }

    // 4) Color picker for Wild Liar's Challenge
    if (state.pendingPrompt?.type === 'color' && state.pendingPrompt.cardId && payload.color) {
      return this.executeAction(
        { ...state, phase: 'playing', pendingPrompt: null },
        state.pendingPrompt.actorId,
        { cardId: state.pendingPrompt.cardId, chosenColor: payload.color }
      );
    }

    return state;
  },

  decideAIMove(state) {
    // 1) AI resolving Wild Liar's Challenge
    if (state.phase === 'liars_wild_challenge' && state.wildLiarsChallenge) {
      const pending = state.wildLiarsChallenge.submissions.filter((s) => s.status === 'pending');
      if (pending.length > 0 && Math.random() < 0.6) {
        return {
          type: 'resolve_prompt' as const,
          payload: { targetPlayerId: pending[0].playerId },
        };
      }
      return { type: 'resolve_prompt' as const, payload: { challengeChoice: 'trust' as const } };
    }

    // 2) AI resolving Liar's Claim Challenge
    if (state.phase === 'liar_challenge' && state.liarClaim) {
      const actor = state.players.find((p) => p.id === state.liarClaim?.actorId);
      const prob = actor && actor.hand.length === 0 ? 0.85 : actor && actor.hand.length <= 2 ? 0.65 : 0.35;
      return {
        type: 'resolve_prompt' as const,
        payload: { challengeChoice: Math.random() < prob ? ('challenge' as const) : ('trust' as const) },
      };
    }

    // 3) AI resolving Color or Target Swap prompt
    if (state.pendingPrompt?.type === 'color') {
      const curr = state.players.find((p) => p.id === state.pendingPrompt?.actorId);
      const freq: Record<string, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
      curr?.hand.forEach((c) => {
        if (c.color in freq) freq[c.color] += 1;
      });
      const best = (Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'red') as HubCardColor;
      return { type: 'resolve_prompt' as const, payload: { color: best } };
    }
    if (state.pendingPrompt?.type === 'target_swap') {
      const opp = state.players
        .filter((p) => p.id !== state.pendingPrompt?.actorId)
        .sort((a, b) => a.hand.length - b.hand.length)[0];
      return { type: 'resolve_prompt' as const, payload: { targetPlayerId: opp?.id ?? state.players[0].id } };
    }

    // 4) Normal AI turn
    const curr = state.players[state.currentPlayerIndex];
    const honestRegular = curr.hand.find(
      (c) => !c.isLiarsCard && matchesLiarsTop(state, c.color, c.type, c.value)
    );
    if (honestRegular) {
      return { type: 'play' as const, move: { cardId: honestRegular.id } };
    }

    const liarsCard = curr.hand.find((c) => c.isLiarsCard);
    if (liarsCard) {
      const isMatch = matchesLiarsTop(state, liarsCard.color, liarsCard.type, liarsCard.value);
      return {
        type: 'play' as const,
        move: {
          cardId: liarsCard.id,
          claimedColor: isMatch && liarsCard.color !== 'wild' ? liarsCard.color : state.activeColor,
          claimedType: isMatch ? liarsCard.type : 'number',
          claimedValue: isMatch ? liarsCard.value : 5,
        },
      };
    }

    return { type: 'draw' as const };
  },
};
