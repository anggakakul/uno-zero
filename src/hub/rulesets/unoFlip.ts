import {
  appendEvent,
  drawCardsFromDeck,
  getActivePlayers,
  getCardDisplayColor,
  getCardDisplayType,
  getCardDisplayValue,
  getColorLabel,
  getNextPlayerIndex,
  getValidColorsForState,
  pickMostFrequentColor,
  shuffleCards,
  transitionTurnWithPrivacy,
  uid,
} from '../engine/core';
import {
  CardFace,
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
  DARK_COLORS,
  STANDARD_COLORS,
  genericAIDecision,
  standardColorMatchValid,
} from './baseHelpers';

/**
 * Official 112-card double-sided UNO Flip! deck:
 * - Light Side (Blue, Green, Yellow, Red): 1-9 (2x/color=72), Draw One (2x/color=8),
 *   Skip (2x/color=8), Reverse (2x/color=8), Flip (2x/color=8), Wild (4), Wild Draw Two (4) = 112.
 * - Dark Side (Pink, Teal, Purple, Orange): 1-9 (2x/color=72), Draw Five (2x/color=8),
 *   Skip Everyone (2x/color=8), Reverse (2x/color=8), Flip (2x/color=8), Wild (4), Wild Draw Color (4) = 112.
 */
function buildFlipDeck(): HubCard[] {
  const lightFaces: CardFace[] = [];
  const darkFaces: CardFace[] = [];

  for (const color of STANDARD_COLORS) {
    for (let v = 1; v <= 9; v += 1) {
      lightFaces.push({ color, type: 'number', value: v });
      lightFaces.push({ color, type: 'number', value: v });
    }
    for (let i = 0; i < 2; i += 1) {
      lightFaces.push({ color, type: 'draw1' });
      lightFaces.push({ color, type: 'skip' });
      lightFaces.push({ color, type: 'reverse' });
      lightFaces.push({ color, type: 'flip' });
    }
  }
  for (let i = 0; i < 4; i += 1) {
    lightFaces.push({ color: 'wild', type: 'wild' });
    lightFaces.push({ color: 'wild', type: 'wild_draw2' });
  }

  for (const color of DARK_COLORS) {
    for (let v = 1; v <= 9; v += 1) {
      darkFaces.push({ color, type: 'number', value: v });
      darkFaces.push({ color, type: 'number', value: v });
    }
    for (let i = 0; i < 2; i += 1) {
      darkFaces.push({ color, type: 'draw5' });
      darkFaces.push({ color, type: 'skip_everyone' });
      darkFaces.push({ color, type: 'reverse' });
      darkFaces.push({ color, type: 'flip' });
    }
  }
  for (let i = 0; i < 4; i += 1) {
    darkFaces.push({ color: 'wild', type: 'wild' });
    darkFaces.push({ color: 'wild', type: 'wild_draw_color' });
  }

  const shuffledDark = shuffleCards(darkFaces);
  return lightFaces.map((lf, idx) => ({
    id: uid('flp'),
    color: lf.color,
    type: lf.type,
    value: lf.value,
    lightFace: lf,
    darkFace: shuffledDark[idx],
  }));
}

/**
 * Official UNO Flip! Scoring — calculated ONLY from the active side when the round ends:
 * - Numbers 0-9: face value
 * - Draw One: 10
 * - Draw Five / Reverse / Skip / Flip: 20
 * - Skip Everyone: 30
 * - Wild: 40 (both Light & Dark!)
 * - Wild Draw Two: 50
 * - Wild Draw Color: 60
 */
export function calculateUnoFlipHandPoints(
  hand: HubCard[],
  flipSide: 'light' | 'dark'
): number {
  return hand.reduce((sum, card) => {
    const t = getCardDisplayType(card, flipSide);
    const v = getCardDisplayValue(card, flipSide);
    if (t === 'number') return sum + (v ?? 0);
    if (t === 'draw1') return sum + 10;
    if (t === 'draw5' || t === 'reverse' || t === 'skip' || t === 'flip') return sum + 20;
    if (t === 'skip_everyone') return sum + 30;
    if (t === 'wild') return sum + 40;
    if (t === 'wild_draw2') return sum + 50;
    if (t === 'wild_draw_color') return sum + 60;
    return sum + 20;
  }, 0);
}

/** Helper: Draw cards from deck until finding a card matching chosenColor on Dark Side (+ optional bonus cards) */
function drawUntilDarkColor(
  drawPile: HubCard[],
  discardPile: HubCard[],
  chosenColor: HubCardColor,
  extraCards = 0
): { drawn: HubCard[]; drawPile: HubCard[]; discardPile: HubCard[] } {
  let dPile = [...drawPile];
  let discPile = [...discardPile];
  const collected: HubCard[] = [];

  for (let guard = 0; guard < 40; guard += 1) {
    const res = drawCardsFromDeck(dPile, discPile, 1);
    dPile = res.drawPile;
    discPile = res.discardPile;
    if (res.drawn.length === 0) break;
    const card = res.drawn[0];
    collected.push(card);
    if (getCardDisplayColor(card, 'dark') === chosenColor) break;
  }

  if (extraCards > 0) {
    const bonus = drawCardsFromDeck(dPile, discPile, extraCards);
    dPile = bonus.drawPile;
    discPile = bonus.discardPile;
    collected.push(...bonus.drawn);
  }

  return { drawn: collected, drawPile: dPile, discardPile: discPile };
}

/**
 * Initialize a new UNO Flip round, always starting on LIGHT SIDE.
 * Handles official first-card rules:
 * - If first discard is Reverse: dealer (index 0) goes first & direction becomes counter-clockwise (-1)!
 * - Never starts on Wild Draw Two (reshuffled back in).
 */
function createFlipRoundState(
  deck: HubCard[],
  players: HubPlayer[],
  mode: 'local' | 'ai' | 'online',
  settings: VariantSettings,
  roundNumber: number,
  roundHistory: HubRoundSummary[]
): HubGameState {
  const drawPile = [...deck];
  let firstCard: HubCard | undefined;

  // Avoid starting on Wild Draw Two
  const validIdx = drawPile.findIndex(
    (c) => getCardDisplayType(c, 'light') !== 'wild_draw2' && getCardDisplayType(c, 'light') !== 'wild'
  );
  if (validIdx >= 0) {
    firstCard = drawPile.splice(validIdx, 1)[0];
  } else {
    firstCard = drawPile.pop();
  }

  let direction: 1 | -1 = 1;
  let currentPlayerIndex = 0;
  let flipSide: 'light' | 'dark' = 'light';
  let discardPile = firstCard ? [firstCard] : [];
  let activeColor: HubCardColor =
    firstCard && getCardDisplayColor(firstCard, 'light') !== 'wild'
      ? getCardDisplayColor(firstCard, 'light')
      : 'red';

  let startMsg = `Ronde ${roundNumber} UNO Flip! dimulai di LIGHT SIDE ☀️. Giliran ${players[0]?.name}!`;

  if (firstCard) {
    const firstType = getCardDisplayType(firstCard, 'light');
    if (firstType === 'reverse') {
      direction = -1;
      currentPlayerIndex = 0; // Dealer goes first counter-clockwise!
      startMsg = `🔄 Kartu pembuka REVERSE! ${players[0]?.name} (Dealer) jalan duluan berlawanan jarum jam!`;
    } else if (firstType === 'skip') {
      currentPlayerIndex = getNextPlayerIndex(players, 0, 1, 1);
      startMsg = `🚫 Kartu pembuka SKIP! ${players[0]?.name} dilewati, giliran ${players[currentPlayerIndex]?.name}!`;
    } else if (firstType === 'flip') {
      flipSide = 'dark';
      const newTopColor = getCardDisplayColor(firstCard, 'dark');
      activeColor = newTopColor === 'wild' ? 'pink' : newTopColor;
      startMsg = `🔄 Kartu pembuka FLIP! Permainan langsung dibalik ke DARK SIDE 🌙!`;
    }
  }

  return appendEvent(
    {
      version: 1,
      variantId: 'uno-flip',
      mode,
      phase: 'playing',
      roundNumber,
      players,
      currentPlayerIndex,
      direction,
      drawPile,
      discardPile,
      activeColor,
      pendingDrawCount: 0,
      flipSide,
      flipChallenge: null,
      drawnPlayableCardId: null,
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

/** Pass turn after drawing a playable card if player chooses not to play it */
export function passAfterFlipDraw(state: HubGameState, playerId: string): HubGameState {
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId || !state.drawnPlayableCardId) return state;
  const next = appendEvent(
    { ...state, drawnPlayableCardId: null, hasDrawnThisTurn: false },
    'pass',
    `${current.name} memilih menyimpan kartu yang baru diambil dan melewatkan giliran.`
  );
  return unoFlipRuleset.advanceTurn(next, 1);
}

export const unoFlipRuleset: UnoRuleset = {
  id: 'uno-flip',

  createDeck() {
    return buildFlipDeck();
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
    return createFlipRoundState(remainingDeck, players, mode, settings, 1, []);
  },

  validateMove(state: HubGameState, playerId: string, move: MoveInput): ValidationResult {
    if (state.phase !== 'playing') return { valid: false, reason: 'Permainan tidak aktif.' };
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.id !== playerId) return { valid: false, reason: 'Bukan giliranmu.' };

    // If player just drew a playable card, they may ONLY play that newly drawn card (or Pass)!
    if (state.drawnPlayableCardId && move.cardId !== state.drawnPlayableCardId) {
      return {
        valid: false,
        reason: 'Kamu hanya boleh memainkan kartu yang baru diambil atau klik Lewati Giliran!',
      };
    }

    const card = current.hand.find((c) => c.id === move.cardId);
    if (!card) return { valid: false, reason: 'Kartu tidak ditemukan.' };

    if (!standardColorMatchValid(state, card)) {
      return {
        valid: false,
        reason: `Kartu harus cocok warna, angka, atau simbol pada ${state.flipSide === 'dark' ? 'Dark Side' : 'Light Side'}!`,
      };
    }

    const cType = getCardDisplayType(card, state.flipSide);
    return {
      valid: true,
      requiresColor: cType === 'wild' || cType === 'wild_draw2' || cType === 'wild_draw_color',
    };
  },

  executeAction(state: HubGameState, playerId: string, move: MoveInput): HubGameState {
    const validation = this.validateMove(state, playerId, move);
    if (!validation.valid) return state;

    const current = state.players[state.currentPlayerIndex];
    const card = current.hand.find((c) => c.id === move.cardId)!;
    const cType = getCardDisplayType(card, state.flipSide);
    const cColor = getCardDisplayColor(card, state.flipSide);
    const cVal = getCardDisplayValue(card, state.flipSide);

    // Wild cards need a chosen color on the active side
    if (
      (cType === 'wild' || cType === 'wild_draw2' || cType === 'wild_draw_color') &&
      !move.chosenColor
    ) {
      return {
        ...state,
        phase: 'choose_color',
        pendingPrompt: {
          type: 'color',
          actorId: playerId,
          cardId: card.id,
          message:
            state.flipSide === 'dark'
              ? 'Pilih warna DARK SIDE aktif (Pink / Teal / Oranye / Ungu):'
              : 'Pilih warna LIGHT SIDE aktif (Merah / Kuning / Hijau / Biru):',
        },
      };
    }

    // Check BEFORE removing card whether actor had a card matching previous activeColor (for official Challenge rule!)
    const actorHadMatchingColor = current.hand.some(
      (c) => c.id !== card.id && getCardDisplayColor(c, state.flipSide) === state.activeColor
    );

    const remainingHand = current.hand.filter((c) => c.id !== card.id);
    const isLastCard = remainingHand.length === 0;
    const activeCount = getActivePlayers(state.players).length;
    let direction = state.direction;
    let steps = 1;
    let flipSide = state.flipSide;
    let drawPile = [...state.drawPile];
    let discardPile = [...state.discardPile, card];
    let activeColor: HubCardColor =
      cType === 'wild' || cType === 'wild_draw2' || cType === 'wild_draw_color'
        ? move.chosenColor ?? (flipSide === 'dark' ? 'pink' : 'red')
        : cColor;

    let players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex
        ? { ...p, hand: remainingHand, calledUno: remainingHand.length === 1 ? p.calledUno : false }
        : p
    );

    const unoVulnerablePlayerId =
      remainingHand.length === 1 && !current.calledUno ? current.id : null;

    let eventType: string = 'play';
    let message = `${current.name} memainkan ${cType === 'number' ? `${getColorLabel(cColor)} ${cVal}` : cType.toUpperCase()}.`;

    // === FLIP CARD (Official rule: flip entire Discard Pile & Draw Pile so the played Flip card moves to the BOTTOM of Discard Pile!) ===
    if (cType === 'flip') {
      flipSide = flipSide === 'light' ? 'dark' : 'light';
      // Reversing discardPile places the newly played Flip card at index 0 (bottom)
      // and brings the old bottom card (now showing the opposite side) to the top!
      discardPile = [...discardPile].reverse();
      drawPile = [...drawPile].reverse();
      const newTop = discardPile[discardPile.length - 1];
      const newTopColor = newTop ? getCardDisplayColor(newTop, flipSide) : 'wild';
      activeColor =
        newTopColor === 'wild'
          ? flipSide === 'dark'
            ? 'pink'
            : 'red'
          : newTopColor;
      eventType = 'flip';
      message = `🔄 FLIP! ${current.name} membalik seluruh kartu ke ${flipSide === 'dark' ? 'DARK SIDE 🌙' : 'LIGHT SIDE ☀️'}! Kartu Flip berpindah ke dasar Discard Pile.`;
    } else if (cType === 'reverse') {
      if (activeCount === 2) {
        steps = 2;
        message = `🔄 ${current.name} memainkan REVERSE (2 pemain = Skip)!`;
      } else {
        direction = (direction * -1) as 1 | -1;
        message = `🔄 ${current.name} membalik arah permainan!`;
      }
      eventType = 'reverse';
    } else if (cType === 'skip') {
      steps = 2;
      eventType = 'skip';
      const skipped = players[getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1)];
      message = `🚫 ${current.name} melewati giliran ${skipped?.name}!`;
    } else if (cType === 'skip_everyone') {
      steps = 0;
      eventType = 'skip_everyone';
      message = `⚡ SKIP EVERYONE! ${current.name} melewati SEMUA lawan dan langsung bermain lagi!`;
    } else if (cType === 'draw1' || cType === 'draw5') {
      // Official rule: No stacking! Victim draws immediately & loses turn.
      // Even if this is actor's last card, victim draws BEFORE scoring!
      const count = cType === 'draw1' ? 1 : 5;
      const victimIdx = getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1);
      const drawRes = drawCardsFromDeck(drawPile, discardPile, count);
      drawPile = drawRes.drawPile;
      discardPile = drawRes.discardPile;
      players = players.map((p, idx) =>
        idx === victimIdx ? { ...p, hand: [...p.hand, ...drawRes.drawn], calledUno: false } : p
      );
      steps = 2;
      eventType = cType;
      message = `${current.name} memainkan ${cType === 'draw1' ? 'DRAW ONE (+1)' : 'DRAW FIVE (+5)'}! ${players[victimIdx].name} ambil ${drawRes.drawn.length} kartu & dilewati.`;
    } else if (cType === 'wild_draw2' || cType === 'wild_draw_color') {
      const victimIdx = getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1);
      const victim = players[victimIdx];

      // Official Last Card rule: if played as winning last card, victim MUST draw immediately before scoring!
      if (isLastCard) {
        if (cType === 'wild_draw2') {
          const drawRes = drawCardsFromDeck(drawPile, discardPile, 2);
          drawPile = drawRes.drawPile;
          discardPile = drawRes.discardPile;
          players = players.map((p, idx) =>
            idx === victimIdx ? { ...p, hand: [...p.hand, ...drawRes.drawn], calledUno: false } : p
          );
          message = `${current.name} menutup ronde dengan WILD +2! ${victim.name} wajib ambil 2 kartu sebelum skor dihitung.`;
        } else {
          const res = drawUntilDarkColor(drawPile, discardPile, activeColor, 0);
          drawPile = res.drawPile;
          discardPile = res.discardPile;
          players = players.map((p, idx) =>
            idx === victimIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
          );
          message = `🌙 ${current.name} menutup ronde dengan WILD DRAW COLOR (${getColorLabel(activeColor)})! ${victim.name} menarik ${res.drawn.length} kartu sebelum skor dihitung.`;
        }
      } else {
        // Trigger Official Challenge Prompt for the next player!
        return appendEvent(
          {
            ...state,
            phase: 'flip_challenge',
            players,
            currentPlayerIndex: victimIdx,
            direction,
            flipSide,
            drawPile,
            discardPile,
            activeColor,
            drawnPlayableCardId: null,
            hasDrawnThisTurn: false,
            unoVulnerablePlayerId,
            flipChallenge: {
              actorId: current.id,
              actorName: current.name,
              challengerId: victim.id,
              challengerName: victim.name,
              cardType: cType,
              chosenColor: activeColor,
              actorWasGuilty: actorHadMatchingColor,
            },
            pendingPrompt: {
              type: 'flip_wild_challenge',
              actorId: victim.id,
              message:
                cType === 'wild_draw2'
                  ? `⚔️ ${current.name} memainkan WILD DRAW TWO (${getColorLabel(activeColor)})! ${victim.name}: Terima +2 atau Tantang (Challenge)?`
                  : `🌙⚔️ ${current.name} memainkan WILD DRAW COLOR (${getColorLabel(activeColor)})! ${victim.name}: Terima atau Tantang (Challenge)?`,
            },
          },
          cType,
          `${current.name} memainkan ${cType === 'wild_draw2' ? 'WILD DRAW TWO' : 'WILD DRAW COLOR'} (${getColorLabel(activeColor)})! Menunggu keputusan ${victim.name}...`
        );
      }
    }

    let nextState: HubGameState = appendEvent(
      {
        ...state,
        phase: 'playing',
        players,
        direction,
        flipSide,
        drawPile,
        discardPile,
        activeColor,
        flipChallenge: null,
        drawnPlayableCardId: null,
        hasDrawnThisTurn: false,
        pendingPrompt: null,
        unoVulnerablePlayerId,
      },
      eventType,
      message
    );

    nextState = this.checkWinCondition(nextState);
    if (nextState.phase === 'round_over' || nextState.phase === 'game_over') {
      return nextState;
    }

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
      .filter((p) => p.id !== winnerId)
      .reduce((sum, p) => sum + calculateUnoFlipHandPoints(p.hand, state.flipSide), 0);
  },

  checkWinCondition(state) {
    const winner = state.players.find((p) => p.hand.length === 0);
    if (!winner) return state;

    const pointsAwarded = this.calculateScore(state, winner.id);
    const updatedPlayers = state.players.map((p) =>
      p.id === winner.id ? { ...p, score: p.score + pointsAwarded } : p
    );

    const anyHitTarget = updatedPlayers.some((p) => p.score >= state.settings.targetScore);
    const isLowestMode = state.settings.flipScoringMode === 'lowest_at_500';
    const reachedTarget = state.settings.singleRound || anyHitTarget;

    let matchWinner = winner;
    if (reachedTarget && isLowestMode) {
      matchWinner = [...updatedPlayers].sort((a, b) => a.score - b.score)[0];
    }

    const summary: HubRoundSummary = {
      roundNumber: state.roundNumber,
      winnerId: reachedTarget ? matchWinner.id : winner.id,
      winnerName: reachedTarget ? matchWinner.name : winner.name,
      pointsAwarded,
      reason: `Menghabiskan seluruh kartu di ${state.flipSide === 'dark' ? 'Dark Side 🌙' : 'Light Side ☀️'} (+${pointsAwarded} poin)!`,
      playerPoints: updatedPlayers.map((p) => ({
        playerId: p.id,
        playerName: p.name,
        handPoints: calculateUnoFlipHandPoints(p.hand, state.flipSide),
        totalScore: p.score,
      })),
    };

    return appendEvent(
      {
        ...state,
        players: updatedPlayers,
        phase: reachedTarget ? 'game_over' : 'round_over',
        winnerId: reachedTarget ? matchWinner.id : null,
        pendingPrompt: null,
        flipChallenge: null,
        drawnPlayableCardId: null,
        unoVulnerablePlayerId: null,
        roundHistory: [...state.roundHistory, summary],
      },
      reachedTarget ? 'game_win' : 'round_end',
      reachedTarget
        ? `🏆 ${matchWinner.name} memenangkan UNO FLIP! (${matchWinner.score} poin)`
        : `🎉 ${winner.name} menang Ronde ${state.roundNumber} (+${pointsAwarded} poin di ${state.flipSide === 'dark' ? 'Dark Side' : 'Light Side'})!`
    );
  },

  resetRound(state) {
    const deck = this.shuffleDeck(this.createDeck(state.settings));
    const resetPlayers = state.players.map((p) => ({ ...p, hand: [], calledUno: false }));
    const { players, remainingDeck } = this.dealCards(deck, resetPlayers, state.settings);
    return createFlipRoundState(
      remainingDeck,
      players,
      state.mode,
      state.settings,
      state.roundNumber + 1,
      state.roundHistory
    );
  },

  /**
   * Official UNO Flip! Draw Rule:
   * Draw 1 card. If it is playable on the active side, allow the player to play it immediately OR pass!
   * Otherwise advance turn automatically.
   */
  handleDrawOrPass(state, playerId) {
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.id !== playerId || state.phase !== 'playing') return state;

    // If already drew a playable card, clicking Draw/Pass again passes the turn
    if (state.drawnPlayableCardId) {
      return passAfterFlipDraw(state, playerId);
    }

    const { drawn, drawPile, discardPile } = drawCardsFromDeck(state.drawPile, state.discardPile, 1);
    const drawnCard = drawn[0];
    const players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex
        ? { ...p, hand: [...p.hand, ...drawn], calledUno: false }
        : p
    );

    const canPlayDrawn = Boolean(drawnCard && standardColorMatchValid(state, drawnCard));

    if (canPlayDrawn && !current.isAI) {
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
        `${current.name} mengambil 1 kartu yang COCOK! Mainkan sekarang atau klik Lewati Giliran.`
      );
    }

    // If AI drew a playable card, AI immediately plays it!
    if (canPlayDrawn && current.isAI && drawnCard) {
      const updatedState: HubGameState = {
        ...state,
        players,
        drawPile,
        discardPile,
        drawnPlayableCardId: drawnCard.id,
        hasDrawnThisTurn: true,
        unoVulnerablePlayerId: null,
      };
      const validColors = getValidColorsForState(updatedState);
      const chosenColor = pickMostFrequentColor(
        players[state.currentPlayerIndex].hand,
        validColors,
        state.flipSide
      );
      return this.executeAction(updatedState, current.id, {
        cardId: drawnCard.id,
        chosenColor,
      });
    }

    const withEvent = appendEvent(
      {
        ...state,
        players,
        drawPile,
        discardPile,
        drawnPlayableCardId: null,
        hasDrawnThisTurn: false,
        unoVulnerablePlayerId: null,
      },
      'draw',
      `${current.name} mengambil 1 kartu dari Draw Pile (tidak cocok).`
    );
    return this.advanceTurn(withEvent, 1);
  },

  resolvePrompt(state, payload) {
    // Handle Official Wild Draw Two & Wild Draw Color Challenge!
    if (state.pendingPrompt?.type === 'flip_wild_challenge' && state.flipChallenge) {
      const ch = state.flipChallenge;
      const actorIdx = state.players.findIndex((p) => p.id === ch.actorId);
      const challengerIdx = state.players.findIndex((p) => p.id === ch.challengerId);
      let drawPile = [...state.drawPile];
      let discardPile = [...state.discardPile];
      let players = [...state.players];
      let msg = '';
      let nextTurnIdx = challengerIdx; // Default: challenger plays if they won the challenge!

      if (payload.challengeChoice === 'challenge') {
        if (ch.actorWasGuilty) {
          // GUILTY! Actor suffers the draw penalty & Challenger keeps their turn!
          if (ch.cardType === 'wild_draw2') {
            const res = drawCardsFromDeck(drawPile, discardPile, 2);
            drawPile = res.drawPile;
            discardPile = res.discardPile;
            players = players.map((p, idx) =>
              idx === actorIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
            );
            msg = `🚨 TANTANGAN BERHASIL! ${ch.actorName} terbukti punya warna cocok → ${ch.actorName} ambil +2 kartu! Giliran ${ch.challengerName}.`;
          } else {
            const res = drawUntilDarkColor(drawPile, discardPile, ch.chosenColor, 0);
            drawPile = res.drawPile;
            discardPile = res.discardPile;
            players = players.map((p, idx) =>
              idx === actorIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
            );
            msg = `🚨 TANTANGAN BERHASIL! ${ch.actorName} bersalah → ${ch.actorName} menarik ${res.drawn.length} kartu hingga ${getColorLabel(ch.chosenColor)}! Giliran ${ch.challengerName}.`;
          }
          nextTurnIdx = challengerIdx;
        } else {
          // INNOCENT! Challenger suffers enhanced penalty & loses their turn!
          if (ch.cardType === 'wild_draw2') {
            const res = drawCardsFromDeck(drawPile, discardPile, 4);
            drawPile = res.drawPile;
            discardPile = res.discardPile;
            players = players.map((p, idx) =>
              idx === challengerIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
            );
            msg = `😎 TANTANGAN GAGAL! ${ch.actorName} tidak bersalah → ${ch.challengerName} kena penalti +4 kartu & dilewati!`;
          } else {
            const res = drawUntilDarkColor(drawPile, discardPile, ch.chosenColor, 2);
            drawPile = res.drawPile;
            discardPile = res.discardPile;
            players = players.map((p, idx) =>
              idx === challengerIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
            );
            msg = `😎 TANTANGAN GAGAL! ${ch.actorName} tidak bersalah → ${ch.challengerName} menarik ${res.drawn.length} kartu (sampai ${getColorLabel(ch.chosenColor)} + 2 ekstra) & dilewati!`;
          }
          nextTurnIdx = getNextPlayerIndex(players, challengerIdx, state.direction, 1);
        }
      } else {
        // Accepted (No challenge): Challenger takes standard penalty & loses turn
        if (ch.cardType === 'wild_draw2') {
          const res = drawCardsFromDeck(drawPile, discardPile, 2);
          drawPile = res.drawPile;
          discardPile = res.discardPile;
          players = players.map((p, idx) =>
            idx === challengerIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
          );
          msg = `${ch.challengerName} menerima WILD +2 (+${res.drawn.length} kartu) dan kehilangan giliran.`;
        } else {
          const res = drawUntilDarkColor(drawPile, discardPile, ch.chosenColor, 0);
          drawPile = res.drawPile;
          discardPile = res.discardPile;
          players = players.map((p, idx) =>
            idx === challengerIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
          );
          msg = `🌙 ${ch.challengerName} menerima WILD DRAW COLOR (${getColorLabel(ch.chosenColor)}) → menarik ${res.drawn.length} kartu & dilewati.`;
        }
        nextTurnIdx = getNextPlayerIndex(players, challengerIdx, state.direction, 1);
      }

      const resolved = appendEvent(
        {
          ...state,
          phase: 'playing',
          players,
          drawPile,
          discardPile,
          flipChallenge: null,
          pendingPrompt: null,
        },
        'challenge_resolved',
        msg
      );
      return transitionTurnWithPrivacy(resolved, nextTurnIdx);
    }

    if (!state.pendingPrompt?.cardId) return state;
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
    if (state.pendingPrompt?.type === 'flip_wild_challenge') {
      // AI challenges 35% of the time
      return {
        type: 'resolve_prompt' as const,
        payload: { challengeChoice: Math.random() < 0.35 ? ('challenge' as const) : ('trust' as const) },
      };
    }
    return genericAIDecision(this, state);
  },
};
