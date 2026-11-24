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
  DareCategory,
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

export const EMOJI_BY_NUMBER: Record<number, { emoji: string; label: string }> = {
  0: { emoji: '😱', label: 'Kaget Maksimal' },
  1: { emoji: '😜', label: 'Melet Lucu' },
  2: { emoji: '😎', label: 'Keren Santai' },
  3: { emoji: '😮', label: 'Terkejut Lebar' },
  4: { emoji: '🤨', label: 'Alis Terangkat' },
  5: { emoji: '😁', label: 'Senyum Lebar' },
  6: { emoji: '🥳', label: 'Pesta Ceria' },
  7: { emoji: '😤', label: 'Muka Cemberut' },
  8: { emoji: '🤪', label: 'Gokil Kocak' },
  9: { emoji: '😈', label: 'Senyum Licik' },
};

export const DARE_LISTS_BY_CATEGORY: Record<DareCategory, string[]> = {
  family: [
    'Berbicara seperti robot sampai giliran berikutnya!',
    'Puji pemain di sebelah kananmu dengan gaya dramatis!',
    'Ucapkan "UNO DARE!" dengan suara paling rendah!',
    'Mainkan giliran berikutnya dengan tangan non-dominan!',
    'Buat pantun kilat 2 baris tentang kartu UNO!',
    'Tersenyum lebar tanpa memperlihatkan gigi selama 15 detik!',
    'Berikan tepuk tangan meriah untuk pemain dengan kartu terbanyak!',
    'Tirukan suara hewan favoritmu dengan lantang!',
    'Sebutkan 3 makanan favoritmu secepat mungkin dalam 5 detik!',
    'Lakukan salam hormat ala bangsawan ke semua pemain!',
  ],
  showoff: [
    'Nyanyikan reff lagu favoritmu selama 10 detik!',
    'Peragakan gaya superhero favoritmu dengan pose penuh!',
    'Bicara dengan aksen pembawa berita TV sampai giliran berikutnya!',
    'Tunjukkan tarian selebrasi kemenangan selama 5 detik!',
    'Berakting seolah baru saja memenangkan piala Oscar!',
    'Ucapkan kalimat berikutnya sambil bernyanyi opera!',
    'Tirukan gaya berjalan model di catwalk!',
    'Lakukan beatbox singkat selama 5 detik!',
    'Bacakan teks event terakhir dengan suara trailer film epik!',
    'Tunjukkan 3 ekspresi wajah berbeda dalam 3 detik!',
  ],
  daredevil: [
    'Tahan tawa meski semua pemain mencoba membuatmu tertawa selama 15 detik!',
    'Berdiri dengan satu kaki sampai giliranmu berikutnya tiba!',
    'Sebutkan 1 kebiasaan unikmu yang jarang diketahui orang lain!',
    'Biarkan pemain sebelah kirimu memilih warna kartu berikutnya untukmu!',
    'Tutup mata selama 10 detik saat giliran lawan berlangsung!',
    'Ucapkan 3 kata pujian tulus ke pemain yang baru menyerangmu!',
    'Lakukan 5 kali gerakan jumping jack atau peregangan cepat!',
    'Bicara hanya dengan kalimat tanya sampai giliran berikutnya!',
    'Tunjukkan isi kartu paling rendahmu ke pemain di sebelah kanan!',
    'Ganti posisi duduk/gaya dudukmu menjadi super tegak sampai ronde selesai!',
  ],
  custom: [
    'Aturan Kustom #1: Ucapkan kata sandi ronde sebelum bermain!',
    'Aturan Kustom #2: Tepuk meja 2 kali setiap ada kartu Wild!',
    'Aturan Kustom #3: Dilarang menyebut kata "kartu" sampai giliran berikut!',
    'Aturan Kustom #4: Lakukan tos virtual ke pemain sebelah kanan!',
    'Aturan Kustom #5: Beri julukan lucu untuk kartu teratas Discard Pile!',
    'Aturan Kustom #6: Tahan pose patung selama 10 detik!',
    'Aturan Kustom #7: Gunakan suara bisik-bisik di giliran berikutnya!',
    'Aturan Kustom #8: Tebak warna kartu berikutnya sebelum lawan main!',
    'Aturan Kustom #9: Berikan semangat kepada pemain dengan kartu paling banyak!',
    'Aturan Kustom #10: Buat tantangan dadakan sendiri yang disetujui meja!',
  ],
};

export const QUICK_CUSTOM_RULES = [
  'Setiap pemain yang memainkan kartu Merah wajib bilang "MERAH MENYALA!"',
  'Dilarang tertawa selama 1 putaran penuh — ketawa = +1 kartu!',
  'Setiap kali Wild dimainkan, semua pemain wajib angkat tangan!',
  'Angka 7 kini mewajibkan ucapan "LUCKY SEVEN!"',
];

export function getDareText(category: DareCategory | undefined, dareNumber: number): string {
  const list = DARE_LISTS_BY_CATEGORY[category ?? 'family'] ?? DARE_LISTS_BY_CATEGORY.family;
  const idx = Math.max(0, Math.min(list.length - 1, dareNumber - 1));
  return list[idx];
}

/**
 * Combined 220-Card UNO Dare! (108) + UNO Emoji (112) Deck:
 * - UNO Dare (108): 76 numbers + 24 actions (Skip×2, Reverse×2, Draw2×1, Colored Dare×1 per color) + 4 Wild + 4 Wild Dare
 * - UNO Emoji (112): 76 emoji numbers (0–9 with emoji face) + 24 actions (Skip×2, Reverse×2, Draw2×2 per color) + 4 Wild Emoji + 4 Wild Draw 4 + 4 Wild Customizable
 * Total = 108 + 112 = 220 cards!
 */
function buildDareEmojiDeck(): HubCard[] {
  const cards: HubCard[] = [];

  // === PART 1: UNO DARE (108 cards) ===
  let dareCounter = 0;
  for (const color of STANDARD_COLORS) {
    for (let v = 0; v <= 9; v += 1) {
      cards.push({ id: uid('dr'), color, type: 'number', value: v });
      if (v > 0) cards.push({ id: uid('dr'), color, type: 'number', value: v });
    }
    for (let i = 0; i < 2; i += 1) {
      cards.push({ id: uid('dr'), color, type: 'skip' });
      cards.push({ id: uid('dr'), color, type: 'reverse' });
    }
    cards.push({ id: uid('dr'), color, type: 'draw2' });
    dareCounter += 1;
    cards.push({
      id: uid('dr'),
      color,
      type: 'dare_card',
      dareNumber: ((dareCounter - 1) % 10) + 1,
    });
  }
  for (let i = 0; i < 4; i += 1) {
    cards.push({ id: uid('dr'), color: 'wild', type: 'wild' });
    cards.push({ id: uid('dr'), color: 'wild', type: 'wild_dare' });
  }

  // === PART 2: UNO EMOJI (112 cards) ===
  for (const color of STANDARD_COLORS) {
    for (let v = 0; v <= 9; v += 1) {
      const em = EMOJI_BY_NUMBER[v];
      cards.push({
        id: uid('em'),
        color,
        type: 'number',
        value: v,
        emoji: em.emoji,
        emojiLabel: em.label,
      });
      if (v > 0) {
        cards.push({
          id: uid('em'),
          color,
          type: 'number',
          value: v,
          emoji: em.emoji,
          emojiLabel: em.label,
        });
      }
    }
    for (let i = 0; i < 2; i += 1) {
      cards.push({ id: uid('em'), color, type: 'skip' });
      cards.push({ id: uid('em'), color, type: 'reverse' });
      cards.push({ id: uid('em'), color, type: 'draw2' });
    }
  }
  for (let i = 0; i < 4; i += 1) {
    cards.push({ id: uid('em'), color: 'wild', type: 'wild_emoji' });
    cards.push({ id: uid('em'), color: 'wild', type: 'wild_draw4' });
    cards.push({ id: uid('em'), color: 'wild', type: 'wild_customizable' });
  }

  return cards;
}

/**
 * Official UNO Dare! & Emoji Scoring (Target 500 or 250 pts):
 * - Numbers 0–9 = face value (0–9 pts)
 * - Draw 2, Skip, Reverse, Dare = 20 pts
 * - Wild, Wild Draw 4, Wild Dare, Wild Emoji, Wild Customizable = 50 pts
 */
export function calculateDareEmojiHandPoints(hand: HubCard[]): number {
  return hand.reduce((sum, card) => {
    if (card.type === 'number') return sum + (card.value ?? 0);
    if (
      card.color === 'wild' ||
      card.type === 'wild' ||
      card.type === 'wild_draw4' ||
      card.type === 'wild_dare' ||
      card.type === 'wild_emoji' ||
      card.type === 'wild_customizable'
    ) {
      return sum + 50;
    }
    return sum + 20;
  }, 0);
}

/** Target confirms they maintained their Emoji Hold expression (online/bot mode) */
export function maintainEmojiExpression(state: HubGameState, playerId: string): HubGameState {
  if (!state.emojiChallenge || state.emojiChallenge.targetId !== playerId) return state;
  return appendEvent(
    {
      ...state,
      emojiChallenge: { ...state.emojiChallenge, maintained: true },
    },
    'emoji_ok',
    `${state.emojiChallenge.emoji} ${state.emojiChallenge.targetName} berhasil mempertahankan Emoji Hold "${state.emojiChallenge.label}"!`
  );
}

/** Another player reports that the Emoji Hold expression broke before the target's next turn (+4 penalty!) */
export function breakEmojiHold(state: HubGameState, reporterName: string): HubGameState {
  if (!state.emojiChallenge) return state;
  const targetId = state.emojiChallenge.targetId;
  const targetName = state.emojiChallenge.targetName;
  const res = drawCardsFromDeck(state.drawPile, state.discardPile, 4);
  const players = state.players.map((p) =>
    p.id === targetId ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
  );
  return appendEvent(
    {
      ...state,
      players,
      drawPile: res.drawPile,
      discardPile: res.discardPile,
      emojiChallenge: null,
    },
    'uno_penalty',
    `💥 EKSPRESI PECAH! ${reporterName} melaporkan ${targetName} gagal menahan Emoji Hold → Penalti +4 kartu!`
  );
}

function createDareEmojiRoundState(
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
  const cat = settings.dareCategory ?? 'family';

  return appendEvent(
    {
      version: 1,
      variantId: 'uno-dare-emoji',
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
      darePrompt: null,
      emojiChallenge: null,
      activeHouseRules: [],
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
    `🔥😜 Ronde ${roundNumber} UNO Dare! & Emoji (220 kartu • Kategori: ${cat.toUpperCase()}) dimulai! Giliran ${players[starterIdx]?.name}.`
  );
}

export const unoDareEmojiRuleset: UnoRuleset = {
  id: 'uno-dare-emoji',

  createDeck() {
    return buildDareEmojiDeck();
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
    return createDareEmojiRoundState(remainingDeck, players, mode, settings, 1, []);
  },

  validateMove(state: HubGameState, playerId: string, move: MoveInput): ValidationResult {
    if (state.phase !== 'playing') return { valid: false, reason: 'Permainan tidak aktif.' };
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.id !== playerId) return { valid: false, reason: 'Bukan giliranmu.' };

    const card = current.hand.find((c) => c.id === move.cardId);
    if (!card) return { valid: false, reason: 'Kartu tidak ditemukan.' };

    // Anti-Stacking for Dare / Wild Dare: standard Draw 2 can stack, Dare/Wild Dare CANNOT!
    if (state.pendingDrawCount > 0) {
      if (card.type === 'dare_card' || card.type === 'wild_dare') {
        return {
          valid: false,
          reason: 'Kartu Dare & Wild Dare TIDAK BISA ditumpuk atau menangkis kartu Draw!',
        };
      }
      if (card.type === 'draw2') {
        return { valid: true };
      }
      return { valid: false, reason: `Tumpuk Draw 2 atau ambil +${state.pendingDrawCount} kartu!` };
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

    // 1) WILD DARE: choose next color AND dare number (1-10)
    if (card.type === 'wild_dare' && (!move.chosenColor || move.pileIndex === undefined)) {
      return {
        ...state,
        phase: 'wild_dare_pick',
        pendingPrompt: {
          type: 'wild_dare_pick',
          actorId: playerId,
          cardId: card.id,
          message: '🔥 WILD DARE! Pilih warna berikutnya DAN nomor tantangan (1–10) dari Dare List:',
        },
      };
    }

    // 2) WILD EMOJI: choose 1 Emoji Number card (0-9) from hand to stack + choose next color
    if (card.type === 'wild_emoji' && !move.chosenColor) {
      return {
        ...state,
        phase: 'wild_emoji_pick',
        pendingPrompt: {
          type: 'wild_emoji_pick',
          actorId: playerId,
          cardId: card.id,
          message: '😜 WILD EMOJI! Pilih 1 kartu angka (0–9) untuk ditumpuk & pilih warna berikutnya:',
        },
      };
    }

    // 3) WILD CUSTOMIZABLE: write/pick custom rule + choose next color
    if (card.type === 'wild_customizable' && !move.chosenColor) {
      return {
        ...state,
        phase: 'wild_custom_rule',
        pendingPrompt: {
          type: 'wild_custom_rule',
          actorId: playerId,
          cardId: card.id,
          message: '✍️ WILD CUSTOMIZABLE! Tulis aturan kustom untuk ronde ini & pilih warna:',
        },
      };
    }

    // 4) Standard Wild / Wild Draw 4 color pick
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

    // Remove played card (and stacked emoji number card if Wild Emoji!)
    const stackedEmojiCard =
      card.type === 'wild_emoji' && move.secondCardId
        ? current.hand.find((c) => c.id === move.secondCardId && c.id !== card.id)
        : undefined;
    const removedIds = new Set([card.id, ...(stackedEmojiCard ? [stackedEmojiCard.id] : [])]);
    const remainingHand = current.hand.filter((c) => !removedIds.has(c.id));

    let direction = state.direction;
    let steps = 1;
    let pendingDrawCount = state.pendingDrawCount;
    let drawPile = [...state.drawPile];
    let discardPile = [
      ...state.discardPile,
      card,
      ...(stackedEmojiCard ? [stackedEmojiCard] : []),
    ];
    const activeColor: HubCardColor =
      card.color === 'wild' ? move.chosenColor ?? 'red' : card.color;
    let emojiChallenge = state.emojiChallenge ?? null;

    let players = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex
        ? { ...p, hand: remainingHand, calledUno: remainingHand.length === 1 ? p.calledUno : false }
        : p
    );
    const unoVulnerablePlayerId =
      remainingHand.length === 1 && !current.calledUno ? current.id : null;

    // Resolve Emoji Hold when the held player's next turn arrives!
    let emojiExpireNote = '';
    if (emojiChallenge && emojiChallenge.targetId === current.id) {
      const survived = emojiChallenge.maintained || (current.isAI && Math.random() < 0.7);
      if (!survived) {
        const res = drawCardsFromDeck(drawPile, discardPile, 4);
        drawPile = res.drawPile;
        discardPile = res.discardPile;
        players = players.map((p, idx) =>
          idx === state.currentPlayerIndex
            ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false }
            : p
        );
        emojiExpireNote = ` 💥 ${current.name} gagal menahan Emoji Hold → +4 kartu!`;
      } else {
        emojiExpireNote = ` 😎 ${current.name} sukses menahan Emoji Hold hingga gilirannya!`;
      }
      emojiChallenge = null;
    }

    // === DARE / WILD DARE (With Combo Lock check!) ===
    if (card.type === 'dare_card' || card.type === 'wild_dare') {
      const victimIdx = getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1);
      const victim = players[victimIdx];
      const dareNum =
        card.type === 'wild_dare'
          ? Math.max(1, Math.min(10, (move.pileIndex ?? 1)))
          : card.dareNumber ?? 1;
      const dareText = getDareText(state.settings.dareCategory, dareNum);
      const isComboLock = Boolean(emojiChallenge && emojiChallenge.targetId === victim.id);
      const penaltyDraw = isComboLock ? 4 : 2;

      const nextState = appendEvent(
        {
          ...state,
          phase: 'dare_prompt',
          players,
          currentPlayerIndex: victimIdx,
          direction,
          drawPile,
          discardPile,
          activeColor,
          emojiChallenge,
          unoVulnerablePlayerId,
          darePrompt: {
            targetId: victim.id,
            targetName: victim.name,
            dareNumber: dareNum,
            dareText,
            penaltyDraw,
            comboLock: isComboLock,
          },
          pendingPrompt: {
            type: 'dare_action',
            actorId: victim.id,
            message: isComboLock
              ? `🔒 COMBO LOCK! ${victim.name} harus lakukan Dare #${dareNum} TANPA memecahkan Emoji Hold (${emojiChallenge?.emoji})! Gagal = +4 kartu!`
              : `🔥 DARE #${dareNum} untuk ${victim.name}: "${dareText}"`,
          },
        },
        'dare',
        `🔥 ${current.name} memainkan ${card.type === 'wild_dare' ? `WILD DARE (${getColorLabel(activeColor)})` : 'DARE'} #${dareNum} ke ${victim.name}!${isComboLock ? ' 🔒 COMBO LOCK (+4 jika gagal)!' : ''}${emojiExpireNote}`
      );
      return this.checkWinCondition(nextState);
    }

    let msg = `${current.name} memainkan ${card.type === 'number' ? `${getColorLabel(card.color)} ${card.value}` : card.type.toUpperCase()}.${emojiExpireNote}`;

    // === WILD EMOJI ===
    if (card.type === 'wild_emoji' || card.type === 'emoji_card') {
      const victimIdx = getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1);
      const victim = players[victimIdx];
      const emojiNum = stackedEmojiCard?.value ?? Math.floor(Math.random() * 10);
      const em = EMOJI_BY_NUMBER[emojiNum] ?? EMOJI_BY_NUMBER[1];
      emojiChallenge = {
        targetId: victim.id,
        targetName: victim.name,
        emoji: em.emoji,
        label: em.label,
        maintained: false,
      };
      msg = `${em.emoji} WILD EMOJI (${getColorLabel(activeColor)})! ${victim.name} terkena EMOJI HOLD "${em.label}" hingga giliran berikutnya (Pecah = +4)!${emojiExpireNote}`;
    } else if (card.type === 'reverse') {
      if (players.length === 2) {
        steps = 2;
        msg = `🔄 ${current.name} memainkan REVERSE (2 pemain = Skip)!${emojiExpireNote}`;
      } else {
        direction = (direction * -1) as 1 | -1;
        msg = `🔄 ${current.name} membalik arah giliran!${emojiExpireNote}`;
      }
    } else if (card.type === 'skip') {
      steps = 2;
      msg = `🚫 ${current.name} melewati giliran berikutnya!${emojiExpireNote}`;
    } else if (card.type === 'draw2') {
      pendingDrawCount += 2;
      msg = `🔥 ${current.name} memainkan DRAW 2! Tumpukan penalti: +${pendingDrawCount} (hanya Draw 2 yang bisa menumpuk)!${emojiExpireNote}`;
    } else if (card.type === 'wild_draw4') {
      const victimIdx = getNextPlayerIndex(players, state.currentPlayerIndex, direction, 1);
      const res = drawCardsFromDeck(drawPile, discardPile, 4);
      drawPile = res.drawPile;
      discardPile = res.discardPile;
      players = players.map((p, i) =>
        i === victimIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
      );
      steps = 2;
      msg = `💥 ${current.name} memainkan WILD +4 (${getColorLabel(activeColor)})! ${players[victimIdx].name} ambil 4 kartu & dilewati.${emojiExpireNote}`;
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
        emojiChallenge,
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
    return transitionTurnWithPrivacy(state, nextIdx);
  },

  calculateScore(state, winnerId) {
    return state.players
      .filter((p) => p.id !== winnerId)
      .reduce((sum, p) => sum + calculateDareEmojiHandPoints(p.hand), 0);
  },

  checkWinCondition(state) {
    const winner = state.players.find((p) => p.hand.length === 0);
    if (!winner) return state;
    const pts = this.calculateScore(state, winner.id);
    return finalizeStandardRoundWin(state, winner.id, pts, 'Juara UNO Dare! & Emoji!');
  },

  resetRound(state) {
    const deck = this.shuffleDeck(this.createDeck(state.settings));
    const resetPlayers = state.players.map((p) => ({ ...p, hand: [], calledUno: false }));
    const { players, remainingDeck } = this.dealCards(deck, resetPlayers, state.settings);
    return createDareEmojiRoundState(
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
      state.pendingDrawCount > 0
        ? `💥 ${current.name} mengambil tumpukan penalti +${res.drawn.length} kartu!`
        : `${current.name} mengambil 1 kartu dari Draw Pile.`
    );
    return transitionTurnWithPrivacy(next, nextIdx);
  },

  resolvePrompt(state, payload) {
    if (!state.pendingPrompt) return state;

    // 1) Dare Action resolution (Berhasil vs Gagal/Ambil +2/+4)
    if (state.pendingPrompt.type === 'dare_action' && state.darePrompt) {
      const target = state.players.find((p) => p.id === state.darePrompt?.targetId);
      let players = [...state.players];
      let drawPile = [...state.drawPile];
      let discardPile = [...state.discardPile];
      let emojiChallenge = state.emojiChallenge ?? null;
      let msg = '';

      if (payload.challengeChoice === 'complete_dare') {
        msg = `👏 ${target?.name} BERHASIL menyelesaikan Dare #${state.darePrompt.dareNumber}!${state.darePrompt.comboLock ? ' Emoji Hold tetap terjaga!' : ''}`;
      } else {
        const res = drawCardsFromDeck(drawPile, discardPile, state.darePrompt.penaltyDraw);
        drawPile = res.drawPile;
        discardPile = res.discardPile;
        players = players.map((p) =>
          p.id === state.darePrompt?.targetId
            ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false }
            : p
        );
        if (state.darePrompt.comboLock) {
          emojiChallenge = null;
        }
        msg = `😅 ${target?.name} gagal/menolak Dare #${state.darePrompt.dareNumber} → Penalti +${res.drawn.length} kartu!${state.darePrompt.comboLock ? ' (Combo Lock +4!)' : ''}`;
      }

      return appendEvent(
        {
          ...state,
          phase: 'playing',
          players,
          drawPile,
          discardPile,
          darePrompt: null,
          emojiChallenge,
          pendingPrompt: null,
        },
        'dare_done',
        msg
      );
    }

    // 2) Wild Dare Picker (color + dareNumber 1..10)
    if (state.pendingPrompt.type === 'wild_dare_pick' && state.pendingPrompt.cardId) {
      const dareNum = payload.textValue ? Number(payload.textValue) : 1;
      return this.executeAction(
        { ...state, phase: 'playing', pendingPrompt: null },
        state.pendingPrompt.actorId,
        {
          cardId: state.pendingPrompt.cardId,
          chosenColor: payload.color ?? 'red',
          pileIndex: Number.isFinite(dareNum) ? dareNum : 1,
        }
      );
    }

    // 3) Wild Emoji Picker (stacked number card + color)
    if (state.pendingPrompt.type === 'wild_emoji_pick' && state.pendingPrompt.cardId) {
      return this.executeAction(
        { ...state, phase: 'playing', pendingPrompt: null },
        state.pendingPrompt.actorId,
        {
          cardId: state.pendingPrompt.cardId,
          secondCardId: payload.passCardId,
          chosenColor: payload.color ?? 'red',
        }
      );
    }

    // 4) Wild Customizable Rule (custom text + color)
    if (state.pendingPrompt.type === 'wild_custom_rule' && state.pendingPrompt.cardId) {
      const ruleText =
        payload.textValue?.trim() ||
        QUICK_CUSTOM_RULES[Math.floor(Math.random() * QUICK_CUSTOM_RULES.length)];
      const withRule: HubGameState = {
        ...state,
        phase: 'playing',
        pendingPrompt: null,
        activeHouseRules: [...(state.activeHouseRules ?? []), ruleText],
      };
      return this.executeAction(withRule, state.pendingPrompt.actorId, {
        cardId: state.pendingPrompt.cardId,
        chosenColor: payload.color ?? 'red',
      });
    }

    // 5) Standard Color Picker
    if (!state.pendingPrompt.cardId) return state;
    return this.executeAction(
      { ...state, phase: 'playing', pendingPrompt: null },
      state.pendingPrompt.actorId,
      { cardId: state.pendingPrompt.cardId, chosenColor: payload.color ?? 'red' }
    );
  },

  decideAIMove(state) {
    // 70% success / 30% fail on Dare!
    if (state.pendingPrompt?.type === 'dare_action') {
      return {
        type: 'resolve_prompt' as const,
        payload: { challengeChoice: Math.random() < 0.7 ? ('complete_dare' as const) : ('skip_dare' as const) },
      };
    }

    const curr = state.players[state.currentPlayerIndex];
    const bestColor = (() => {
      const freq: Record<string, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
      curr?.hand.forEach((c) => {
        if (c.color in freq) freq[c.color] += 1;
      });
      return (Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'red') as HubCardColor;
    })();

    if (state.pendingPrompt?.type === 'wild_dare_pick') {
      return {
        type: 'resolve_prompt' as const,
        payload: { color: bestColor, textValue: String(Math.floor(Math.random() * 10) + 1) },
      };
    }
    if (state.pendingPrompt?.type === 'wild_emoji_pick') {
      const emojiNumCard = curr?.hand.find((c) => c.type === 'number');
      return {
        type: 'resolve_prompt' as const,
        payload: { color: bestColor, passCardId: emojiNumCard?.id },
      };
    }
    if (state.pendingPrompt?.type === 'wild_custom_rule') {
      const preset = QUICK_CUSTOM_RULES[Math.floor(Math.random() * QUICK_CUSTOM_RULES.length)];
      return {
        type: 'resolve_prompt' as const,
        payload: { color: bestColor, textValue: preset },
      };
    }

    const playable = curr.hand.filter((c) => this.validateMove(state, curr.id, { cardId: c.id }).valid);
    if (playable.length === 0) return { type: 'draw' as const };

    // Prefer non-wild first, or special attack if next player is close to winning
    const nonWild = playable.find((c) => c.color !== 'wild');
    const chosen = nonWild ?? playable[0];
    const emojiNum = chosen.type === 'wild_emoji' ? curr.hand.find((c) => c.type === 'number') : undefined;

    return {
      type: 'play' as const,
      move: {
        cardId: chosen.id,
        chosenColor: chosen.color === 'wild' ? bestColor : undefined,
        secondCardId: emojiNum?.id,
        pileIndex: chosen.type === 'wild_dare' ? Math.floor(Math.random() * 10) + 1 : undefined,
      },
    };
  },
};
