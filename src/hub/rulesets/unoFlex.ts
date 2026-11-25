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
  genericAIDecision,
  standardDrawOneAndAdvance,
} from './baseHelpers';

/** Official UNO Flex deck constants: 104 playable cards + 8 Power Cards = 112 total cards */
export const UNO_FLEX_POWER_CARDS_TOTAL = 8;

/**
 * Color-blindness accessibility triangular notch count per official Mattel UNO Flex:
 * - Yellow = 1 notch
 * - Green  = 2 notches
 * - Blue   = 3 notches
 * - Red    = 4 notches
 */
export function getFlexColorNotches(color: HubCardColor): number {
  if (color === 'yellow') return 1;
  if (color === 'green') return 2;
  if (color === 'blue') return 3;
  if (color === 'red') return 4;
  return 0;
}

/**
 * Official 104 playable cards (+ 8 Power Cards = 112 total cards):
 * Per color (4 colors × 23 = 92 cards):
 * - Numbers 1–8: 1 Classic (with Flip Power symbol on 2, 5, 8) + 1 Flex dual-color (1–8) = 16 cards/color
 * - Standard Actions (no Flex side): 1 Skip, 1 Reverse, 1 Draw Two = 3 cards/color
 * - Unique Flex Actions: 1 Flex Skip, 1 Flex Reverse, 1 Flex Draw Two (+ 1 extra Flex Draw Two/Skip) = 4 cards/color
 * Wilds (12 cards):
 * - 3 Wild All Flip (Standard Wild)
 * - 3 Flex Wild All Draw
 * - 3 Flex Wild Target Draw 2
 * - 3 Flex Wild Draw Four
 * Total playable = 92 + 12 = 104 cards (+ 8 Power Cards = 112 total!)
 */
function buildFlexDeck(): HubCard[] {
  const cards: HubCard[] = [];
  const nextColorMap: Record<string, HubCardColor> = {
    red: 'blue',
    blue: 'green',
    green: 'yellow',
    yellow: 'red',
  };

  for (const color of STANDARD_COLORS) {
    const alt = nextColorMap[color];
    // Official UNO Flex numbers 1-8 (Classic + Flip symbol + Flex dual-color)
    for (let v = 1; v <= 8; v += 1) {
      cards.push({
        id: uid('flx'),
        color,
        type: 'number',
        value: v,
        hasPowerFlip: v === 2 || v === 5 || v === 8,
      });
      cards.push({
        id: uid('flx'),
        color,
        flexColor: alt,
        type: 'number',
        value: v,
      });
    }
    // Standard Action Cards (no Flex side)
    cards.push({ id: uid('flx'), color, type: 'skip' });
    cards.push({ id: uid('flx'), color, type: 'reverse' });
    cards.push({ id: uid('flx'), color, type: 'draw2' });

    // Unique Flex Action Cards
    cards.push({ id: uid('flx'), color, type: 'flex_skip', flexType: 'flex_skip' });
    cards.push({ id: uid('flx'), color, type: 'flex_reverse', flexType: 'flex_reverse' });
    cards.push({ id: uid('flx'), color, type: 'flex_draw2', flexType: 'flex_draw2' });
    cards.push({ id: uid('flx'), color, type: 'flex_draw2', flexType: 'flex_draw2' });
  }

  // 12 Wilds (3 Wild All Flip + 3 Flex Wild All Draw + 3 Flex Wild Target Draw 2 + 3 Flex Wild Draw Four)
  for (let i = 0; i < 3; i += 1) {
    cards.push({ id: uid('flx'), color: 'wild', type: 'wild_all_flip' });
    cards.push({ id: uid('flx'), color: 'wild', type: 'wild_all_draw', flexType: 'wild_all_draw' });
    cards.push({ id: uid('flx'), color: 'wild', type: 'wild_target_draw2', flexType: 'wild_target_draw2' });
    cards.push({ id: uid('flx'), color: 'wild', type: 'wild_draw4', flexType: 'wild_draw4' });
  }

  return cards;
}

/**
 * Official UNO Flex Global Reset:
 * If ALL active players' Power Cards are Off (Red) at the same time, automatically flip ALL back to On (Green)!
 */
export function resetAllPowerCardsIfAllInactive(players: HubPlayer[]): {
  players: HubPlayer[];
  didGlobalReset: boolean;
} {
  const activePlayers = players.filter((p) => !p.eliminated && !p.isOut);
  const allInactive = activePlayers.length > 0 && activePlayers.every((p) => !p.powerActive);
  if (!allInactive) return { players, didGlobalReset: false };
  return {
    players: players.map((p) => ({ ...p, powerActive: true })),
    didGlobalReset: true,
  };
}

/**
 * Official UNO Flex Scoring:
 * - Number cards (1–8): face value
 * - Action cards (non-Wild): 20 pts
 * - Wild cards: 50 pts
 */
export function calculateUnoFlexHandPoints(hand: HubCard[]): number {
  return hand.reduce((sum, card) => {
    if (card.type === 'number') return sum + (card.value ?? 0);
    if (card.color === 'wild' || card.type.startsWith('wild')) return sum + 50;
    return sum + 20;
  }, 0);
}

/**
 * Official UNO Flex Setup:
 * - Every player gets 1 Power Card starting on GREEN (On / ✓): max 8 players.
 * - Deal 7 cards each.
 * - First Discard Pile card MUST be a numbered card; any Action/Wild card is returned to bottom of Draw Pile!
 */
function createFlexRoundState(
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
    const candidate = drawPile.pop();
    if (!candidate) break;
    if (candidate.type === 'number') {
      firstCard = candidate;
      break;
    }
    // Official rule: return Action/Wild card to bottom of Draw Pile
    drawPile.unshift(candidate);
  }

  const activeColor: HubCardColor =
    firstCard && firstCard.color !== 'wild' ? firstCard.color : 'red';

  return appendEvent(
    {
      version: 1,
      variantId: 'uno-flex',
      mode,
      phase: 'playing',
      roundNumber,
      players,
      currentPlayerIndex: 0,
      direction: 1,
      drawPile,
      discardPile: firstCard ? [firstCard] : [],
      activeColor,
      pendingDrawCount: 0,
      flipSide: 'light',
      flexChallenge: null,
      hasDrawnThisTurn: false,
      settings,
      roundHistory,
      actionLog: [],
      lastEvent: null,
      winnerId: null,
      startedAt: Date.now(),
    },
    'info',
    `Ronde ${roundNumber} UNO Flex dimulai! Semua Power Card di posisi HIJAU (On ✓). Giliran ${players[0]?.name}!`
  );
}

export const unoFlexRuleset: UnoRuleset = {
  id: 'uno-flex',

  createDeck() {
    return buildFlexDeck();
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
      powerActive: true, // Always starts on Green (On ✓)
    }));
    return { players: dealt, remainingDeck: remaining };
  },

  initializeGame(playerInits, mode, settings) {
    const deck = this.shuffleDeck(this.createDeck(settings));
    const clampedPlayers = playerInits.slice(0, UNO_FLEX_POWER_CARDS_TOTAL);
    const initialPlayers: HubPlayer[] = clampedPlayers.map((p) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      hand: [],
      score: 0,
      calledUno: false,
      powerActive: true,
    }));
    const { players, remainingDeck } = this.dealCards(deck, initialPlayers, settings);
    return createFlexRoundState(remainingDeck, players, mode, settings, 1, []);
  },

  validateMove(state: HubGameState, playerId: string, move: MoveInput): ValidationResult {
    if (state.phase !== 'playing') return { valid: false, reason: 'Permainan tidak aktif.' };
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.id !== playerId) return { valid: false, reason: 'Bukan giliranmu.' };

    const card = current.hand.find((c) => c.id === move.cardId);
    if (!card) return { valid: false, reason: 'Kartu tidak ditemukan.' };

    const isWild = card.color === 'wild' || card.type.startsWith('wild');
    const top = state.discardPile[state.discardPile.length - 1];
    const hasFlexCapability = Boolean(card.flexColor || card.flexType);

    if (move.useFlex && !current.powerActive) {
      return { valid: false, reason: 'Power Card sedang OFF (Merah)! Sisi Flex tidak dapat digunakan.' };
    }

    if (isWild) {
      return {
        valid: true,
        requiresColor: true,
        canUseFlex: Boolean(hasFlexCapability && current.powerActive),
      };
    }

    const regularMatches =
      !top ||
      card.color === state.activeColor ||
      (card.type === 'number' && top.type === 'number' && card.value === top.value) ||
      (card.type !== 'number' && card.type === top.type);

    const flexColorMatches = Boolean(card.flexColor && card.flexColor === state.activeColor);

    if (move.useFlex) {
      if (!hasFlexCapability) {
        return { valid: false, reason: 'Kartu standar ini tidak memiliki sisi Flex.' };
      }
      if (regularMatches || flexColorMatches) {
        return { valid: true, canUseFlex: true };
      }
      return { valid: false, reason: 'Warna Flex kartu ini tidak cocok dengan warna aktif.' };
    }

    if (regularMatches) {
      return {
        valid: true,
        canUseFlex: Boolean(hasFlexCapability && current.powerActive),
      };
    }

    if (flexColorMatches && current.powerActive) {
      return {
        valid: true,
        canUseFlex: true,
      };
    }

    return { valid: false, reason: 'Kartu tidak cocok (baik sisi Regular maupun Flex).' };
  },

  executeAction(state: HubGameState, playerId: string, move: MoveInput): HubGameState {
    const validation = this.validateMove(state, playerId, move);
    if (!validation.valid) return state;

    const current = state.players[state.currentPlayerIndex];
    const card = current.hand.find((c) => c.id === move.cardId)!;
    const isWild = card.color === 'wild' || card.type.startsWith('wild');
    const hasFlexCapability = Boolean(card.flexColor || card.flexType);

    const top = state.discardPile[state.discardPile.length - 1];
    const regularMatches =
      isWild ||
      !top ||
      card.color === state.activeColor ||
      (card.type === 'number' && top.type === 'number' && card.value === top.value) ||
      (card.type !== 'number' && card.type === top.type);

    const usingFlex = Boolean(
      hasFlexCapability &&
        current.powerActive &&
        (move.useFlex || (!regularMatches && card.flexColor === state.activeColor))
    );

    // Wild color choice prompt
    if (isWild && !move.chosenColor) {
      return {
        ...state,
        phase: 'choose_color',
        pendingPrompt: {
          type: 'color',
          actorId: playerId,
          cardId: card.id,
          useFlex: usingFlex,
          message: usingFlex
            ? 'Pilih warna aktif (Sisi FLEX Aktif ⚡):'
            : 'Pilih warna aktif untuk kartu Wild:',
        },
      };
    }

    // Flex Wild Target Draw 2 OR Flex Wild Draw Four (Flex side = Targeted Draw 4!)
    if (
      usingFlex &&
      (card.type === 'wild_target_draw2' || card.type === 'wild_draw4') &&
      !move.targetPlayerId
    ) {
      return {
        ...state,
        phase: 'choose_target',
        pendingPrompt: {
          type: card.type === 'wild_draw4' ? 'target_draw4' : 'target_draw2',
          actorId: playerId,
          cardId: card.id,
          useFlex: true,
          message:
            card.type === 'wild_draw4'
              ? '⚡ FLEX TARGETED +4: Pilih 1 pemain mana saja untuk mengambil 4 kartu!'
              : '⚡ FLEX TARGETED +2: Pilih 1 pemain mana saja untuk mengambil 2 kartu!',
        },
      };
    }

    // Official Flex Wild Draw Four Regular-side legality check BEFORE removing card:
    // Guilty if actor holds ANY card matching activeColor OR ANY other Wild card!
    const actorWasGuiltyForWild4 = current.hand.some(
      (c) => c.id !== card.id && (c.color === state.activeColor || c.color === 'wild')
    );

    const remainingHand = current.hand.filter((c) => c.id !== card.id);
    const isLastCard = remainingHand.length === 0;
    const activeCount = getActivePlayers(state.players).length;
    let direction = state.direction;
    let steps = 1;
    let drawPile = [...state.drawPile];
    let discardPile = [...state.discardPile, card];

    // Official rule: If a Flex number card matches Discard Pile's active color via flexColor, active color STAYS that color!
    const activeColor: HubCardColor = isWild
      ? move.chosenColor ?? 'red'
      : usingFlex && card.flexColor === state.activeColor
      ? state.activeColor
      : card.color;

    // Power Card Flip Rules (ONLY in 3 conditions: using Flex -> Off, Flip symbol -> toggle, Wild All Flip -> all toggle)
    let players = state.players.map((p, idx) => {
      if (idx !== state.currentPlayerIndex) return p;
      let nextPower = p.powerActive;
      if (usingFlex) nextPower = false; // Automatically flips to Off (Red)
      else if (card.hasPowerFlip) nextPower = !p.powerActive; // Mandatory flip (On <-> Off)
      return {
        ...p,
        hand: remainingHand,
        calledUno: remainingHand.length === 1 ? p.calledUno : false,
        powerActive: nextPower,
      };
    });

    const unoVulnerablePlayerId =
      remainingHand.length === 1 && !current.calledUno ? current.id : null;

    let eventType: string = usingFlex ? 'flex' : 'play';
    let message = `${current.name} memainkan ${card.type === 'number' ? `${getColorLabel(activeColor)} ${card.value}` : card.type.toUpperCase()}${usingFlex ? ' [FLEX ⚡]' : ''}.`;

    if (card.type === 'skip') {
      steps = 2;
      eventType = 'skip';
      message = `🚫 ${current.name} memainkan SKIP.`;
    } else if (card.type === 'reverse') {
      if (activeCount === 2) steps = 2;
      else direction = (direction * -1) as 1 | -1;
      eventType = 'reverse';
      message = `🔄 ${current.name} memainkan REVERSE.`;
    } else if (card.type === 'draw2') {
      const victimIdx = getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1);
      const res = drawCardsFromDeck(drawPile, discardPile, 2);
      drawPile = res.drawPile;
      discardPile = res.discardPile;
      players = players.map((p, idx) =>
        idx === victimIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
      );
      steps = 2;
      eventType = 'draw2';
      message = `${current.name} memainkan DRAW TWO (+2)! ${players[victimIdx].name} ambil 2 kartu & dilewati.`;
    } else if (card.type === 'wild_all_flip') {
      players = players.map((p) => ({ ...p, powerActive: !p.powerActive }));
      eventType = 'power_flip';
      message = `🔄 WILD ALL FLIP (${getColorLabel(activeColor)})! Power Card SEMUA pemain dibalik (On ↔ Off)!`;
    }
    else if (card.type === 'flex_skip') {
      if (usingFlex) {
        steps = 0; // Skip ALL other players -> actor goes again!
        message = `⚡ FLEX SKIP! ${current.name} melewati SEMUA pemain lain dan langsung main lagi!`;
      } else {
        steps = 2;
        message = `🚫 ${current.name} memainkan SKIP (Regular).`;
      }
    } else if (card.type === 'flex_reverse') {
      if (activeCount === 2) {
        steps = 2;
        message = `🔄 ${current.name} memainkan REVERSE (2 pemain = Skip)!`;
      } else {
        direction = (direction * -1) as 1 | -1;
        steps = usingFlex ? 2 : 1; // Flex side: reverse AND skip first player in new direction!
        message = usingFlex
          ? `⚡ FLEX REVERSE! Arah dibalik SEKALIGUS melewati pemain pertama di arah baru!`
          : `🔄 ${current.name} membalik arah permainan (Regular).`;
      }
    } else if (card.type === 'flex_draw2') {
      if (usingFlex) {
        // Flex side: EVERY other player draws 1 card; next player is NOT skipped (steps = 1)!
        players = players.map((p) => {
          if (p.id === current.id || p.eliminated) return p;
          const res = drawCardsFromDeck(drawPile, discardPile, 1);
          drawPile = res.drawPile;
          discardPile = res.discardPile;
          return { ...p, hand: [...p.hand, ...res.drawn], calledUno: false };
        });
        steps = 1;
        message = `⚡ FLEX DRAW TWO! SEMUA lawan mengambil 1 kartu (giliran berlanjut normal)!`;
      } else {
        const victimIdx = getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1);
        const res = drawCardsFromDeck(drawPile, discardPile, 2);
        drawPile = res.drawPile;
        discardPile = res.discardPile;
        players = players.map((p, idx) =>
          idx === victimIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
        );
        steps = 2;
        message = `${current.name} memainkan DRAW +2 (Regular)! ${players[victimIdx].name} ambil 2 kartu & dilewati.`;
      }
    }
    else if (card.type === 'wild_all_draw') {
      if (usingFlex) {
        // Flex side: ALL other players draw 2 cards; next player NOT skipped!
        players = players.map((p) => {
          if (p.id === current.id || p.eliminated) return p;
          const res = drawCardsFromDeck(drawPile, discardPile, 2);
          drawPile = res.drawPile;
          discardPile = res.discardPile;
          return { ...p, hand: [...p.hand, ...res.drawn], calledUno: false };
        });
        steps = 1;
        message = `⚡ FLEX WILD ALL DRAW (${getColorLabel(activeColor)})! Semua lawan mengambil +2 kartu (tidak dilewati)!`;
      } else {
        // Regular side: Normal Wild!
        steps = 1;
        message = `🌈 ${current.name} memainkan WILD (${getColorLabel(activeColor)}) [Sisi Regular].`;
      }
    } else if (card.type === 'wild_target_draw2') {
      if (usingFlex) {
        // Flex side: Targeted Draw 2; turn continues normally to next player!
        const targetId = move.targetPlayerId;
        const res = drawCardsFromDeck(drawPile, discardPile, 2);
        drawPile = res.drawPile;
        discardPile = res.discardPile;
        const targetName = players.find((p) => p.id === targetId)?.name ?? 'Lawan';
        players = players.map((p) =>
          p.id === targetId ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
        );
        steps = 1;
        message = `🎯 FLEX WILD TARGET +2 (${getColorLabel(activeColor)})! ${targetName} mengambil 2 kartu (giliran lanjut normal)!`;
      } else {
        // Regular side: Normal Wild!
        steps = 1;
        message = `🌈 ${current.name} memainkan WILD (${getColorLabel(activeColor)}) [Sisi Regular].`;
      }
    } else if (card.type === 'wild_draw4') {
      if (usingFlex) {
        // Flex side: Targeted Draw 4! Turn continues normally to next player!
        const targetId = move.targetPlayerId;
        const res = drawCardsFromDeck(drawPile, discardPile, 4);
        drawPile = res.drawPile;
        discardPile = res.discardPile;
        const targetName = players.find((p) => p.id === targetId)?.name ?? 'Lawan';
        players = players.map((p) =>
          p.id === targetId ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
        );
        steps = 1;
        message = `🎯 FLEX TARGETED DRAW FOUR (${getColorLabel(activeColor)})! ${targetName} mengambil 4 kartu (giliran lanjut normal)!`;
      } else {
        // Regular side: Wild Draw 4 with official Challenge (+4 guilty / +6 innocent)!
        const victimIdx = getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1);
        const victim = players[victimIdx];
        if (isLastCard) {
          const res = drawCardsFromDeck(drawPile, discardPile, 4);
          drawPile = res.drawPile;
          discardPile = res.discardPile;
          players = players.map((p, idx) =>
            idx === victimIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
          );
          message = `${current.name} menutup ronde dengan WILD +4! ${victim.name} ambil 4 kartu sebelum skor dihitung.`;
        } else {
          const resetCheck = resetAllPowerCardsIfAllInactive(players);
          players = resetCheck.players;
          return appendEvent(
            {
              ...state,
              phase: 'flex_challenge',
              players,
              currentPlayerIndex: victimIdx,
              direction,
              drawPile,
              discardPile,
              activeColor,
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
                type: 'flex_wild4_challenge',
                actorId: victim.id,
                message: `⚔️ ${current.name} memainkan WILD DRAW FOUR (${getColorLabel(activeColor)})! ${victim.name}: Terima +4 atau Tantang (Challenge)?`,
              },
            },
            'wild_draw4',
            `${current.name} memainkan WILD DRAW FOUR (${getColorLabel(activeColor)})! Menunggu keputusan ${victim.name}...`
          );
        }
      }
    }

    const resetCheck = resetAllPowerCardsIfAllInactive(players);
    players = resetCheck.players;
    if (resetCheck.didGlobalReset) {
      message += ' 🔄 GLOBAL RESET: Semua Power Card kembali ke HIJAU (On ✓)!';
    }

    let nextState: HubGameState = appendEvent(
      {
        ...state,
        phase: 'playing',
        players,
        direction,
        drawPile,
        discardPile,
        activeColor,
        flexChallenge: null,
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
      .reduce((sum, p) => sum + calculateUnoFlexHandPoints(p.hand), 0);
  },

  checkWinCondition(state) {
    const winner = state.players.find((p) => !p.isOut && !p.eliminated && p.hand.length === 0);
    if (!winner) return state;
    const pts = this.calculateScore(state, winner.id);
    return finalizeStandardRoundWin(state, winner.id, pts, 'Menghabiskan seluruh kartu di tangan!');
  },

  resetRound(state) {
    const deck = this.shuffleDeck(this.createDeck(state.settings));
    const resetPlayers = state.players.map((p) => ({
      ...p,
      hand: [],
      calledUno: false,
      powerActive: true,
    }));
    const { players, remainingDeck } = this.dealCards(deck, resetPlayers, state.settings);
    return createFlexRoundState(
      remainingDeck,
      players,
      state.mode,
      state.settings,
      state.roundNumber + 1,
      state.roundHistory
    );
  },

  handleDrawOrPass(state, playerId) {
    return standardDrawOneAndAdvance(state, playerId);
  },

  resolvePrompt(state, payload) {
    // Handle Official Wild Draw Four Regular-side Challenge (+4 guilty / +6 innocent)!
    if (state.pendingPrompt?.type === 'flex_wild4_challenge' && state.flexChallenge) {
      const ch = state.flexChallenge;
      const actorIdx = state.players.findIndex((p) => p.id === ch.actorId);
      const challengerIdx = state.players.findIndex((p) => p.id === ch.challengerId);
      let drawPile = [...state.drawPile];
      let discardPile = [...state.discardPile];
      let players = [...state.players];
      let msg = '';
      let nextTurnIdx = challengerIdx;

      if (payload.challengeChoice === 'challenge') {
        if (ch.actorWasGuilty) {
          const res = drawCardsFromDeck(drawPile, discardPile, 4);
          drawPile = res.drawPile;
          discardPile = res.discardPile;
          players = players.map((p, idx) =>
            idx === actorIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
          );
          msg = `🚨 TANTANGAN BERHASIL! ${ch.actorName} bersalah → ${ch.actorName} ambil +4 kartu! Giliran ${ch.challengerName}.`;
          nextTurnIdx = challengerIdx;
        } else {
          const res = drawCardsFromDeck(drawPile, discardPile, 6);
          drawPile = res.drawPile;
          discardPile = res.discardPile;
          players = players.map((p, idx) =>
            idx === challengerIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
          );
          msg = `😎 TANTANGAN GAGAL! ${ch.actorName} tidak bersalah → ${ch.challengerName} ambil +6 kartu & dilewati!`;
          nextTurnIdx = getNextPlayerIndex(players, challengerIdx, state.direction, 1);
        }
      } else {
        const res = drawCardsFromDeck(drawPile, discardPile, 4);
        drawPile = res.drawPile;
        discardPile = res.discardPile;
        players = players.map((p, idx) =>
          idx === challengerIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
        );
        msg = `${ch.challengerName} menerima WILD +4 (+${res.drawn.length} kartu) dan dilewati.`;
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
        useFlex: state.pendingPrompt.useFlex,
      }
    );
  },

  decideAIMove(state) {
    if (state.pendingPrompt?.type === 'flex_wild4_challenge') {
      return {
        type: 'resolve_prompt' as const,
        payload: { challengeChoice: Math.random() < 0.35 ? ('challenge' as const) : ('trust' as const) },
      };
    }
    return genericAIDecision(this, state);
  },
};
