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
  finalizeStandardRoundWin,
  genericAIDecision,
  standardColorMatchValid,
} from './baseHelpers';

/**
 * Official 224-card UNO Party! Deck (for 6–16 players):
 * - 144 Number cards (1–9 × 4 copies × 4 colors)
 * -  16 Skip (4/color)
 * -  16 Reverse (4/color)
 * -  16 Draw Two (4/color)
 * -   8 Point Taken (2/color)
 * -   8 Wild
 * -   8 Wild Draw Four
 * -   4 Wild Drawn Together
 * -   4 Wild Pile Up
 * Total = 144 + 56 + 24 = 224 cards!
 * (Direction Tracker Card & 2 Link Cards are separate table trackers in UI/state.)
 */
function buildPartyDeck(): HubCard[] {
  const cards: HubCard[] = [];
  for (const color of STANDARD_COLORS) {
    for (let v = 1; v <= 9; v += 1) {
      for (let copy = 0; copy < 4; copy += 1) {
        cards.push({ id: uid('pty'), color, type: 'number', value: v });
      }
    }
    for (let i = 0; i < 4; i += 1) {
      cards.push({ id: uid('pty'), color, type: 'skip' });
      cards.push({ id: uid('pty'), color, type: 'reverse' });
      cards.push({ id: uid('pty'), color, type: 'draw2' });
    }
    for (let i = 0; i < 2; i += 1) {
      cards.push({ id: uid('pty'), color, type: 'point_taken' });
    }
  }
  for (let i = 0; i < 8; i += 1) {
    cards.push({ id: uid('pty'), color: 'wild', type: 'wild' });
    cards.push({ id: uid('pty'), color: 'wild', type: 'wild_draw4' });
  }
  for (let i = 0; i < 4; i += 1) {
    cards.push({ id: uid('pty'), color: 'wild', type: 'drawn_together' });
    cards.push({ id: uid('pty'), color: 'wild', type: 'wild_pile_up' });
  }
  return cards;
}

/**
 * Official UNO Party! Scoring:
 * - Numbers (1–9): face value
 * - Color Action Cards (Skip, Reverse, Draw 2, Point Taken): 20 pts
 * - Wild Action Cards (Wild, Wild Draw 4, Wild Drawn Together, Wild Pile Up): 50 pts
 */
export function calculatePartyHandPoints(hand: HubCard[]): number {
  return hand.reduce((sum, card) => {
    if (card.type === 'number') return sum + (card.value ?? 0);
    if (card.color === 'wild' || card.type.startsWith('wild') || card.type === 'drawn_together') {
      return sum + 50;
    }
    return sum + 20;
  }, 0);
}

/**
 * Mirror draw penalty to Wild Drawn Together linked partner!
 */
function drawWithLink(
  state: HubGameState,
  victimId: string,
  count: number
): { players: HubPlayer[]; drawPile: HubCard[]; discardPile: HubCard[]; linkNote: string } {
  let drawPile = [...state.drawPile];
  let discardPile = [...state.discardPile];
  let players = [...state.players];
  let linkNote = '';

  const victims = [victimId];
  const pair = state.drawnTogetherPair;
  if (pair && pair.includes(victimId)) {
    const partnerId = pair[0] === victimId ? pair[1] : pair[0];
    if (!victims.includes(partnerId)) {
      victims.push(partnerId);
      const partnerName = players.find((p) => p.id === partnerId)?.name ?? 'Pasangan';
      linkNote = ` 🔗 LINK CARD: ${partnerName} ikut mengambil +${count} kartu!`;
    }
  }

  for (const vid of victims) {
    const res = drawCardsFromDeck(drawPile, discardPile, count);
    drawPile = res.drawPile;
    discardPile = res.discardPile;
    players = players.map((p) =>
      p.id === vid ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
    );
  }

  return { players, drawPile, discardPile, linkNote };
}

/**
 * Official UNO Party! Setup:
 * - 6–16 players, 7 cards each.
 * - First Discard card MUST be a numbered card (Action/Wild skipped back to bottom of Draw Pile).
 * - First turn starts left of dealer (index 1) clockwise.
 */
function createPartyRoundState(
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
      variantId: 'uno-party',
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
      drawnTogetherPair: null,
      partyPileUp: null,
      flexChallenge: null,
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
    `🎉 Ronde ${roundNumber} UNO Party! (${players.length} pemain) dimulai searah jarum jam! Giliran ${players[starterIdx]?.name}.`
  );
}

/**
 * Official UNO Party! Speed Play (Potong Giliran):
 * - ONLY valid for NUMBER CARDS with identical Number AND Color as the top Discard card!
 * - Turn continues immediately from the player who performed Speed Play.
 * - PENALTY: If attempted with a non-matching card, card returns to hand + +1 penalty card from Draw Pile!
 */
export function attemptSpeedPlayCutIn(
  state: HubGameState,
  playerId: string,
  cardId: string
): HubGameState {
  if (state.phase !== 'playing') return state;
  const top = state.discardPile[state.discardPile.length - 1];
  if (!top) return state;

  const playerIdx = state.players.findIndex((p) => p.id === playerId);
  const player = state.players[playerIdx];
  if (!player) return state;

  const card = player.hand.find((c) => c.id === cardId);
  if (!card) return state;

  const isValidNumberCutIn =
    card.type === 'number' &&
    top.type === 'number' &&
    card.color === top.color &&
    card.value === top.value;

  if (!isValidNumberCutIn) {
    // Official Speed Play Penalty: card stays in hand + draw 1 penalty card!
    const res = drawWithLink(state, playerId, 1);
    return appendEvent(
      {
        ...state,
        players: res.players,
        drawPile: res.drawPile,
        discardPile: res.discardPile,
      },
      'uno_penalty',
      `❌ SALAH SPEED PLAY! ${player.name} bukan kartu angka identik → Penalti +1 kartu!${res.linkNote}`
    );
  }

  const remaining = player.hand.filter((c) => c.id !== card.id);
  const players = state.players.map((p, idx) =>
    idx === playerIdx
      ? { ...p, hand: remaining, calledUno: remaining.length === 1 ? p.calledUno : false }
      : p
  );

  let next = appendEvent(
    {
      ...state,
      players,
      currentPlayerIndex: playerIdx,
      discardPile: [...state.discardPile, card],
      activeColor: card.color,
      drawnPlayableCardId: null,
      unoVulnerablePlayerId: remaining.length === 1 && !player.calledUno ? player.id : null,
    },
    'speed_play',
    `⚡ SPEED PLAY! ${player.name} memotong giliran dengan ${getColorLabel(card.color)} ${card.value} identik!`
  );

  next = unoPartyRuleset.checkWinCondition(next);
  if (next.phase === 'round_over' || next.phase === 'game_over') return next;
  return unoPartyRuleset.advanceTurn(next, 1);
}

/** Take entire Wild Pile Up mini-pile when unable to stack a same-color/Wild card */
export function takePartyPileUp(state: HubGameState, playerId: string): HubGameState {
  if (state.phase !== 'party_pile_up' || !state.partyPileUp) return state;
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId) return state;

  const miniCards = state.partyPileUp.cards;
  const pileColor = state.partyPileUp.color;

  let players = state.players.map((p, idx) =>
    idx === state.currentPlayerIndex
      ? { ...p, hand: [...p.hand, ...miniCards], calledUno: false }
      : p
  );

  // Mirror mini-pile draw count to Linked partner if Wild Drawn Together is active!
  let drawPile = [...state.drawPile];
  let discardPile = [...state.discardPile];
  let linkNote = '';
  const pair = state.drawnTogetherPair;
  if (pair && pair.includes(playerId)) {
    const partnerId = pair[0] === playerId ? pair[1] : pair[0];
    const partner = players.find((p) => p.id === partnerId);
    if (partner) {
      const res = drawCardsFromDeck(drawPile, discardPile, miniCards.length);
      drawPile = res.drawPile;
      discardPile = res.discardPile;
      players = players.map((p) =>
        p.id === partnerId ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
      );
      linkNote = ` 🔗 LINK CARD: ${partner.name} ikut mengambil +${res.drawn.length} kartu!`;
    }
  }

  const next = appendEvent(
    {
      ...state,
      phase: 'playing',
      players,
      drawPile,
      discardPile,
      activeColor: pileColor, // Active color stays the mini-pile's color!
      partyPileUp: null,
    },
    'pile_up_end',
    `📚 PILE UP SELESAI! ${current.name} tidak bisa menumpuk dan mengambil seluruh ${miniCards.length} kartu mini-pile!${linkNote}`
  );
  return unoPartyRuleset.advanceTurn(next, 1);
}

/** Pass after drawing a playable card in UNO Party */
export function passAfterPartyDraw(state: HubGameState, playerId: string): HubGameState {
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId || !state.drawnPlayableCardId) return state;
  const next = appendEvent(
    { ...state, drawnPlayableCardId: null, hasDrawnThisTurn: false },
    'pass',
    `${current.name} menyimpan kartu yang baru diambil dan melewatkan giliran.`
  );
  return unoPartyRuleset.advanceTurn(next, 1);
}

export const unoPartyRuleset: UnoRuleset = {
  id: 'uno-party',

  createDeck() {
    return buildPartyDeck();
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
    const clamped = playerInits.slice(0, 16); // Supports 6–16 players
    const initialPlayers: HubPlayer[] = clamped.map((p) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      hand: [],
      score: 0,
      calledUno: false,
    }));
    const { players, remainingDeck } = this.dealCards(deck, initialPlayers, settings);
    return createPartyRoundState(remainingDeck, players, mode, settings, 1, []);
  },

  validateMove(state: HubGameState, playerId: string, move: MoveInput): ValidationResult {
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.id !== playerId) return { valid: false, reason: 'Bukan giliranmu.' };

    const card = current.hand.find((c) => c.id === move.cardId);
    if (!card) return { valid: false, reason: 'Kartu tidak ditemukan.' };

    // During WILD PILE UP phase: only same-color cards or Wild cards can be stacked onto the mini-pile!
    if (state.phase === 'party_pile_up' && state.partyPileUp) {
      if (card.color === state.partyPileUp.color || card.color === 'wild') {
        return { valid: true };
      }
      return {
        valid: false,
        reason: `WILD PILE UP aktif! Harus tumpuk kartu warna ${getColorLabel(state.partyPileUp.color)} atau Wild (atau ambil seluruh mini-pile)!`,
      };
    }

    if (state.phase !== 'playing') return { valid: false, reason: 'Permainan tidak aktif.' };

    if (state.drawnPlayableCardId && move.cardId !== state.drawnPlayableCardId) {
      return { valid: false, reason: 'Mainkan kartu yang baru diambil atau klik Lewati Giliran!' };
    }

    if (!standardColorMatchValid(state, card)) {
      return { valid: false, reason: 'Kartu tidak cocok dengan warna, angka, atau simbol!' };
    }

    return {
      valid: true,
      requiresColor: card.color === 'wild' && card.type !== 'wild_pile_up',
      requiresTarget:
        card.type === 'point_taken'
          ? 'target_point_taken'
          : card.type === 'drawn_together'
          ? 'target_drawn_together'
          : undefined,
    };
  },

  executeAction(state: HubGameState, playerId: string, move: MoveInput): HubGameState {
    const val = this.validateMove(state, playerId, move);
    if (!val.valid) return state;

    const current = state.players[state.currentPlayerIndex];
    const card = current.hand.find((c) => c.id === move.cardId)!;

    // === HANDLING WILD PILE UP STACKING ===
    if (state.phase === 'party_pile_up' && state.partyPileUp) {
      const remaining = current.hand.filter((c) => c.id !== card.id);
      const players = state.players.map((p, idx) =>
        idx === state.currentPlayerIndex
          ? { ...p, hand: remaining, calledUno: remaining.length === 1 ? p.calledUno : false }
          : p
      );
      const updatedPile = {
        ...state.partyPileUp,
        cards: [...state.partyPileUp.cards, card],
      };
      let next = appendEvent(
        {
          ...state,
          players,
          partyPileUp: updatedPile,
        },
        'pile_up_stack',
        `📚 ${current.name} menumpuk kartu ke mini-pile (${updatedPile.cards.length} kartu, warna tetap ${getColorLabel(updatedPile.color)})!`
      );
      next = this.checkWinCondition(next);
      if (next.phase === 'round_over' || next.phase === 'game_over') return next;
      const nextIdx = getNextPlayerIndex(players, state.currentPlayerIndex, state.direction, 1);
      return { ...next, currentPlayerIndex: nextIdx };
    }

    // Wild color choice (NOT Wild Pile Up — Pile Up uses the mini-pile's color!)
    if (card.color === 'wild' && card.type !== 'wild_pile_up' && !move.chosenColor) {
      return {
        ...state,
        phase: 'choose_color',
        pendingPrompt: {
          type: 'color',
          actorId: playerId,
          cardId: card.id,
          message: 'Pilih warna aktif untuk kartu Party Wild:',
        },
      };
    }

    if ((card.type === 'point_taken' || card.type === 'drawn_together') && !move.targetPlayerId) {
      return {
        ...state,
        phase: 'choose_target',
        pendingPrompt: {
          type: card.type === 'point_taken' ? 'target_point_taken' : 'target_drawn_together',
          actorId: playerId,
          cardId: card.id,
          message:
            card.type === 'point_taken'
              ? '👉 3... 2... 1! POINT TAKEN: Tunjuk 1 pemain!'
              : '🔗 WILD DRAWN TOGETHER: Pilih pemain pertama untuk diikat dengan pemain lain!',
        },
      };
    }

    // Check Wild Draw Four legality BEFORE removing card (other Wild cards count as matching!)
    const actorWasGuiltyForWild4 = current.hand.some(
      (c) => c.id !== card.id && (c.color === state.activeColor || c.color === 'wild')
    );

    const remainingHand = current.hand.filter((c) => c.id !== card.id);
    const isLastCard = remainingHand.length === 0;
    let direction = state.direction;
    let steps = 1;
    let drawPile = [...state.drawPile];
    let discardPile = [...state.discardPile, card];
    let activeColor: HubCardColor =
      card.color === 'wild' ? move.chosenColor ?? state.activeColor : card.color;
    let drawnTogetherPair = state.drawnTogetherPair ?? null;

    let players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex
        ? { ...p, hand: remainingHand, calledUno: remainingHand.length === 1 ? p.calledUno : false }
        : p
    );

    const unoVulnerablePlayerId =
      remainingHand.length === 1 && !current.calledUno ? current.id : null;

    let msg = `${current.name} memainkan ${card.type === 'number' ? `${getColorLabel(card.color)} ${card.value}` : card.type.toUpperCase()}.`;

    // === WILD PILE UP ===
    if (card.type === 'wild_pile_up') {
      const miniCards: HubCard[] = [];
      let pileColor: HubCardColor = 'red';
      for (let guard = 0; guard < 15; guard += 1) {
        const res = drawCardsFromDeck(drawPile, discardPile, 1);
        drawPile = res.drawPile;
        discardPile = res.discardPile;
        if (res.drawn.length === 0) break;
        const c = res.drawn[0];
        miniCards.push(c);
        if (c.color !== 'wild') {
          pileColor = c.color;
          break;
        }
      }
      const nextIdx = getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1);
      let nextState = appendEvent(
        {
          ...state,
          phase: 'party_pile_up',
          players,
          currentPlayerIndex: nextIdx,
          drawPile,
          discardPile,
          activeColor: pileColor,
          partyPileUp: { cards: miniCards, color: pileColor },
          drawnPlayableCardId: null,
          pendingPrompt: null,
          unoVulnerablePlayerId,
        },
        'wild_pile_up',
        `📚 WILD PILE UP! Mini-pile dimulai dengan warna ${getColorLabel(pileColor)} (${miniCards.length} kartu)! Giliran ${players[nextIdx].name} menumpuk!`
      );
      return this.checkWinCondition(nextState);
    }

    // === WILD DRAW FOUR + OFFICIAL CHALLENGE ===
    if (card.type === 'wild_draw4') {
      const victimIdx = getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1);
      const victim = players[victimIdx];
      if (isLastCard) {
        const res = drawWithLink(
          { ...state, players, drawPile, discardPile, drawnTogetherPair },
          victim.id,
          4
        );
        players = res.players;
        drawPile = res.drawPile;
        discardPile = res.discardPile;
        msg = `${current.name} menutup ronde dengan WILD +4! ${victim.name} ambil 4 kartu.${res.linkNote}`;
      } else {
        return appendEvent(
          {
            ...state,
            phase: 'party_wild4_challenge',
            players,
            currentPlayerIndex: victimIdx,
            direction,
            drawPile,
            discardPile,
            activeColor,
            drawnTogetherPair,
            drawnPlayableCardId: null,
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
              type: 'party_wild4_challenge',
              actorId: victim.id,
              message: `⚔️ ${current.name} memainkan WILD +4 (${getColorLabel(activeColor)})! ${victim.name}: Terima +4 atau Challenge?`,
            },
          },
          'wild_draw4',
          `${current.name} memainkan WILD +4 (${getColorLabel(activeColor)})! Menunggu keputusan ${victim.name}...`
        );
      }
    } else if (card.type === 'reverse') {
      direction = (direction * -1) as 1 | -1;
      msg = `🔄 DIRECTION TRACKER DIBALIK! Arah kini ${direction === 1 ? 'searah jarum jam ↻' : 'berlawanan jarum jam ↺'}!`;
    } else if (card.type === 'skip') {
      steps = 2;
      msg = `🚫 ${current.name} melewati pemain berikutnya!`;
    } else if (card.type === 'draw2') {
      const victimIdx = getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1);
      const res = drawWithLink(
        { ...state, players, drawPile, discardPile, drawnTogetherPair },
        players[victimIdx].id,
        2
      );
      players = res.players;
      drawPile = res.drawPile;
      discardPile = res.discardPile;
      steps = 2;
      msg = `${current.name} menyerang ${players[victimIdx].name} (+2 kartu)!${res.linkNote}`;
    } else if (card.type === 'point_taken') {
      // POINT TAKEN: 3...2...1! All players point; each draws min(5, fingers), AND breaks Drawn Together link!
      const counts: Record<string, number> = {};
      const actorTarget =
        move.targetPlayerId ??
        players[getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1)].id;
      counts[actorTarget] = (counts[actorTarget] ?? 0) + 1;

      for (const p of players) {
        if (p.id === current.id || p.eliminated) continue;
        const others = players.filter((o) => o.id !== p.id && !o.eliminated);
        if (others.length === 0) continue;
        const pick = others[Math.floor(Math.random() * others.length)];
        counts[pick.id] = (counts[pick.id] ?? 0) + 1;
      }

      const summaryParts: string[] = [];
      for (const [vid, fingers] of Object.entries(counts)) {
        const capped = Math.min(5, fingers); // Official max 5 cards cap!
        const res = drawCardsFromDeck(drawPile, discardPile, capped);
        drawPile = res.drawPile;
        discardPile = res.discardPile;
        const pName = players.find((p) => p.id === vid)?.name ?? vid;
        summaryParts.push(`${pName} (+${res.drawn.length})`);
        players = players.map((p) =>
          p.id === vid ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
        );
      }

      const brokeLink = drawnTogetherPair ? ' 🔗 Link Card terputus!' : '';
      drawnTogetherPair = null;
      msg = `👉 3..2..1! POINT TAKEN (maks 5): ${summaryParts.join(', ')}.${brokeLink}`;
    } else if (card.type === 'drawn_together') {
      // Official rule: link 2 OTHER players (replacing any previous link!)
      const firstId =
        move.targetPlayerId ??
        players[getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1)].id;
      const otherCandidates = players.filter((p) => p.id !== current.id && p.id !== firstId);
      const secondId =
        otherCandidates[0]?.id ??
        players.find((p) => p.id !== firstId)?.id ??
        current.id;
      drawnTogetherPair = [firstId, secondId];
      const n1 = players.find((p) => p.id === firstId)?.name ?? 'Pemain A';
      const n2 = players.find((p) => p.id === secondId)?.name ?? 'Pemain B';
      msg = `🔗 WILD DRAWN TOGETHER (${getColorLabel(activeColor)})! Link Card dipasang ke ${n1} & ${n2}!`;
    }

    let nextState = appendEvent(
      {
        ...state,
        phase: 'playing',
        players,
        direction,
        drawPile,
        discardPile,
        activeColor,
        drawnTogetherPair,
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
      .reduce((sum, p) => sum + calculatePartyHandPoints(p.hand), 0);
  },

  checkWinCondition(state) {
    const winner = state.players.find((p) => p.hand.length === 0);
    if (!winner) return state;
    const pts = this.calculateScore(state, winner.id);
    return finalizeStandardRoundWin(state, winner.id, pts, 'Juara UNO Party!');
  },

  resetRound(state) {
    const deck = this.shuffleDeck(this.createDeck(state.settings));
    const resetPlayers = state.players.map((p) => ({ ...p, hand: [], calledUno: false }));
    const { players, remainingDeck } = this.dealCards(deck, resetPlayers, state.settings);
    return createPartyRoundState(
      remainingDeck,
      players,
      state.mode,
      state.settings,
      state.roundNumber + 1,
      state.roundHistory
    );
  },

  handleDrawOrPass(state, playerId) {
    if (state.phase === 'party_pile_up') {
      return takePartyPileUp(state, playerId);
    }
    const player = state.players[state.currentPlayerIndex];
    if (!player || player.id !== playerId || state.phase !== 'playing') return state;

    if (state.drawnPlayableCardId) {
      return passAfterPartyDraw(state, playerId);
    }

    const res = drawWithLink(state, playerId, 1);
    const drawnCard = res.players[state.currentPlayerIndex].hand[
      res.players[state.currentPlayerIndex].hand.length - 1
    ];
    const canPlayDrawn = Boolean(drawnCard && standardColorMatchValid(state, drawnCard));

    if (canPlayDrawn && !player.isAI) {
      return appendEvent(
        {
          ...state,
          players: res.players,
          drawPile: res.drawPile,
          discardPile: res.discardPile,
          drawnPlayableCardId: drawnCard.id,
          hasDrawnThisTurn: true,
        },
        'draw',
        `${player.name} mengambil 1 kartu yang COCOK! Mainkan sekarang atau klik Lewati Giliran.${res.linkNote}`
      );
    }

    const nextIdx = getNextPlayerIndex(res.players, state.currentPlayerIndex, state.direction, 1);
    const withEv = appendEvent(
      {
        ...state,
        players: res.players,
        drawPile: res.drawPile,
        discardPile: res.discardPile,
        drawnPlayableCardId: null,
        hasDrawnThisTurn: false,
      },
      'draw',
      `${player.name} mengambil 1 kartu.${res.linkNote}`
    );
    return transitionTurnWithPrivacy(withEv, nextIdx);
  },

  resolvePrompt(state, payload) {
    // Official UNO Party! Wild Draw Four Challenge (+4 illegal actor / +6 legal challenger)
    if (state.pendingPrompt?.type === 'party_wild4_challenge' && state.flexChallenge) {
      const ch = state.flexChallenge;
      const challengerIdx = state.players.findIndex((p) => p.id === ch.challengerId);
      let players = [...state.players];
      let drawPile = [...state.drawPile];
      let discardPile = [...state.discardPile];
      let msg = '';
      let nextTurnIdx = challengerIdx;

      if (payload.challengeChoice === 'challenge') {
        if (ch.actorWasGuilty) {
          // Illegal +4! Actor draws 4 (mirrored if linked), challenger plays!
          const res = drawWithLink(
            { ...state, players, drawPile, discardPile },
            ch.actorId,
            4
          );
          players = res.players;
          drawPile = res.drawPile;
          discardPile = res.discardPile;
          msg = `🚨 TANTANGAN BERHASIL! ${ch.actorName} ilegal (+4) → ${ch.actorName} ambil 4 kartu!${res.linkNote} Giliran ${ch.challengerName}.`;
          nextTurnIdx = challengerIdx;
        } else {
          // Legal +4! Challenger draws 6 (mirrored if linked) & skipped!
          const res = drawWithLink(
            { ...state, players, drawPile, discardPile },
            ch.challengerId,
            6
          );
          players = res.players;
          drawPile = res.drawPile;
          discardPile = res.discardPile;
          msg = `😎 TANTANGAN GAGAL! ${ch.actorName} legal → ${ch.challengerName} ambil 6 kartu & dilewati!${res.linkNote}`;
          nextTurnIdx = getNextPlayerIndex(players, challengerIdx, state.direction, 1);
        }
      } else {
        const res = drawWithLink(
          { ...state, players, drawPile, discardPile },
          ch.challengerId,
          4
        );
        players = res.players;
        drawPile = res.drawPile;
        discardPile = res.discardPile;
        msg = `${ch.challengerName} menerima WILD +4 (+4 kartu) & dilewati.${res.linkNote}`;
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
    if (state.pendingPrompt?.type === 'party_wild4_challenge') {
      return {
        type: 'resolve_prompt' as const,
        payload: { challengeChoice: Math.random() < 0.35 ? ('challenge' as const) : ('trust' as const) },
      };
    }
    if (state.phase === 'party_pile_up' && state.partyPileUp) {
      const curr = state.players[state.currentPlayerIndex];
      const match = curr.hand.find(
        (c) => c.color === state.partyPileUp!.color || c.color === 'wild'
      );
      if (match) return { type: 'play' as const, move: { cardId: match.id } };
      return { type: 'draw' as const };
    }
    return genericAIDecision(this, state);
  },
};
