import {
  appendEvent,
  drawCardsFromDeck,
  getNextPlayerIndex,
  uid,
} from '../engine/core';
import {
  DigitalToolId,
  DigitalToolState,
  HubCard,
  HubCardColor,
  HubGameState,
  VariantSettings,
} from '../types';

const BASE_COLORS: HubCardColor[] = ['red', 'yellow', 'green', 'blue'];

export const SPIN_WHEEL_SEGMENTS = [
  { id: 'discard_color', label: 'Buang Semua 1 Warna', desc: 'Buang semua kartu warna aktif dari tanganmu!' },
  { id: 'swap_hands', label: 'Tukar Tangan', desc: 'Tukar seluruh kartumu dengan pemain berikutnya!' },
  { id: 'war_highest', label: 'Perang Angka Tertinggi', desc: 'Pemain dengan angka terbesar membuang 1 kartu gratis!' },
  { id: 'draw_two', label: 'Ambil +2 Kartu', desc: 'Roda berhenti di Draw 2 — kamu ambil 2 kartu!' },
  { id: 'free_discard', label: 'Buang 2 Kartu Gratis', desc: 'Keberuntungan! Buang 2 kartu dari tanganmu!' },
  { id: 'all_draw_one', label: 'Semua Ambil +1', desc: 'Semua pemain lain mengambil 1 kartu!' },
] as const;

const JACKPOT_SYMBOLS = ['🍒', '⭐', '💎', '🔥', '⚡', '🃏'];

const ROBOTO_RULES = [
  'Semua pemain selain target wajib menyapa sebelum buang kartu!',
  'Target mendapat bonus: kartu aksi berikutnya tidak mempan!',
  'Aturan Dadakan: Kartu angka besar (≥7) diutamakan!',
  'Roboto Alert: Pemain dengan kartu terbanyak wajib waspada!',
  'Bonus Roboto: Warna aktif boleh diganti jika cocok simbol!',
];

export function createInitialToolState(settings: VariantSettings): DigitalToolState {
  return {
    lastSpin: null,
    tippoLeftWeight: 0,
    tippoRightWeight: 0,
    tippoThreshold: 5 + Math.floor(Math.random() * 4), // Secret random threshold 5-8 per round
    tippoTippedBy: null,
    lastJackpot: null,
    powerHolderId: null,
    robotoRule: null,
    flashActive: null,
    blastNoMercyExtreme: Boolean(settings.blastExtreme),
  };
}

/**
 * Official UNO Tippo Weight Value:
 * - Number 0-4 = Weight 1
 * - Number 5-9 = Weight 2
 * - Action (Skip, Reverse, Draw 2, etc.) = Weight 3
 * - Wild / Wild Draw 4 = Weight 4
 */
export function getTippoCardWeight(card: HubCard): number {
  if (card.color === 'wild' || card.type.startsWith('wild')) return 4;
  if (card.type === 'number') {
    return (card.value ?? 0) <= 4 ? 1 : 2;
  }
  return 3;
}

export function injectDigitalToolCards(
  deck: HubCard[],
  activeTools: DigitalToolId[] = []
): HubCard[] {
  if (!activeTools || activeTools.length === 0) return deck;
  const extra: HubCard[] = [];

  if (activeTools.includes('uno-spin')) {
    for (const color of BASE_COLORS) {
      extra.push({ id: uid('spn'), color, type: 'spin_card', toolId: 'uno-spin' });
    }
  }

  if (activeTools.includes('uno-jackpot')) {
    for (let i = 0; i < 4; i += 1) {
      extra.push({ id: uid('jkp'), color: 'wild', type: 'jackpot_card', toolId: 'uno-jackpot' });
    }
  }

  if (activeTools.includes('uno-power-grab')) {
    for (const color of BASE_COLORS) {
      extra.push({ id: uid('pwr'), color, type: 'power_grab', toolId: 'uno-power-grab' });
    }
  }

  return [...deck, ...extra];
}

export function isDigitalToolCardType(type: string): boolean {
  return type === 'spin_card' || type === 'jackpot_card' || type === 'power_grab';
}

export function triggerSpinWheel(
  state: HubGameState,
  actorId: string,
  rng: () => number = Math.random
): HubGameState {
  const actorIdx = state.players.findIndex((p) => p.id === actorId);
  const actor = state.players[actorIdx];
  if (!actor) return state;

  const seg = SPIN_WHEEL_SEGMENTS[Math.floor(rng() * SPIN_WHEEL_SEGMENTS.length)];
  let players = [...state.players];
  let drawPile = [...state.drawPile];
  let discardPile = [...state.discardPile];

  if (seg.id === 'discard_color') {
    const matching = actor.hand.filter((c) => c.color === state.activeColor);
    const rest = actor.hand.filter((c) => c.color !== state.activeColor);
    discardPile = [...discardPile, ...matching];
    players = players.map((p, idx) => (idx === actorIdx ? { ...p, hand: rest } : p));
  } else if (seg.id === 'swap_hands') {
    const nextIdx = getNextPlayerIndex(players, actorIdx, state.direction, 1);
    const aHand = [...actor.hand];
    const bHand = [...players[nextIdx].hand];
    players = players.map((p, idx) => {
      if (idx === actorIdx) return { ...p, hand: bHand, calledUno: false };
      if (idx === nextIdx) return { ...p, hand: aHand, calledUno: false };
      return p;
    });
  } else if (seg.id === 'war_highest') {
    let bestIdx = actorIdx;
    let bestVal = -1;
    players.forEach((p, idx) => {
      const topNum = Math.max(-1, ...p.hand.map((c) => c.value ?? 0));
      if (topNum > bestVal) {
        bestVal = topNum;
        bestIdx = idx;
      }
    });
    if (players[bestIdx].hand.length > 0) {
      const dropped = players[bestIdx].hand[0];
      discardPile = [...discardPile, dropped];
      players = players.map((p, idx) =>
        idx === bestIdx ? { ...p, hand: p.hand.slice(1) } : p
      );
    }
  } else if (seg.id === 'draw_two') {
    const res = drawCardsFromDeck(drawPile, discardPile, 2);
    drawPile = res.drawPile;
    discardPile = res.discardPile;
    players = players.map((p, idx) =>
      idx === actorIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
    );
  } else if (seg.id === 'free_discard') {
    const dropped = actor.hand.slice(0, 2);
    discardPile = [...discardPile, ...dropped];
    players = players.map((p, idx) => (idx === actorIdx ? { ...p, hand: p.hand.slice(2) } : p));
  } else if (seg.id === 'all_draw_one') {
    players = players.map((p) => {
      if (p.id === actor.id || p.eliminated) return p;
      const res = drawCardsFromDeck(drawPile, discardPile, 1);
      drawPile = res.drawPile;
      discardPile = res.discardPile;
      return { ...p, hand: [...p.hand, ...res.drawn], calledUno: false };
    });
  }

  const toolState: DigitalToolState = {
    ...(state.toolState ?? createInitialToolState(state.settings)),
    lastSpin: { label: seg.label, effect: seg.desc, timestamp: Date.now() },
  };

  return appendEvent(
    { ...state, players, drawPile, discardPile, toolState },
    'uno_spin',
    `🎡 UNO SPIN (${actor.name}): [${seg.label}] — ${seg.desc}`
  );
}

export function triggerJackpotRoller(
  state: HubGameState,
  actorId: string,
  rng: () => number = Math.random
): HubGameState {
  const actorIdx = state.players.findIndex((p) => p.id === actorId);
  const actor = state.players[actorIdx];
  if (!actor) return state;

  const r1 = JACKPOT_SYMBOLS[Math.floor(rng() * JACKPOT_SYMBOLS.length)];
  const r2 = JACKPOT_SYMBOLS[Math.floor(rng() * JACKPOT_SYMBOLS.length)];
  const r3 = JACKPOT_SYMBOLS[Math.floor(rng() * JACKPOT_SYMBOLS.length)];
  const reels: [string, string, string] = [r1, r2, r3];

  let players = [...state.players];
  let drawPile = [...state.drawPile];
  let discardPile = [...state.discardPile];
  let outcome = '';

  if (r1 === r2 && r2 === r3) {
    const dropped = actor.hand.slice(0, 2);
    discardPile = [...discardPile, ...dropped];
    players = players.map((p, idx) => (idx === actorIdx ? { ...p, hand: p.hand.slice(2) } : p));
    outcome = 'JACKPOT 3 KEMBAR! Buang 2 kartu gratis!';
  } else if (r1 === r2 || r2 === r3 || r1 === r3) {
    const dropped = actor.hand.slice(0, 1);
    discardPile = [...discardPile, ...dropped];
    players = players.map((p, idx) => (idx === actorIdx ? { ...p, hand: p.hand.slice(1) } : p));
    outcome = 'MINI WIN (2 Kembar)! Buang 1 kartu gratis!';
  } else {
    const res = drawCardsFromDeck(drawPile, discardPile, 2);
    drawPile = res.drawPile;
    discardPile = res.discardPile;
    players = players.map((p, idx) =>
      idx === actorIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
    );
    outcome = 'ZONK! Ambil +2 kartu penalti!';
  }

  const toolState: DigitalToolState = {
    ...(state.toolState ?? createInitialToolState(state.settings)),
    lastJackpot: { reels, outcome, timestamp: Date.now() },
  };

  return appendEvent(
    { ...state, players, drawPile, discardPile, toolState },
    'uno_jackpot',
    `🎰 WILD JACKPOT [${reels.join(' ')}]: ${actor.name} — ${outcome}`
  );
}

/**
 * UNO Tippo virtual seesaw balance check.
 * Selisih = |TotalBobotKiri - TotalBobotKanan|.
 * If Selisih > Batas Kritis (5-8, default 6) -> TIPPED! (+3 cards penalty & reset to 0-0).
 */
export function applyTippoDrop(
  state: HubGameState,
  card: HubCard,
  actorId: string,
  side: 'left' | 'right' = 'left'
): HubGameState {
  if (!(state.settings.activeTools ?? []).includes('uno-tippo')) return state;
  const weight = getTippoCardWeight(card);
  const prev = state.toolState ?? createInitialToolState(state.settings);
  const threshold = prev.tippoThreshold ?? 6;
  const left = prev.tippoLeftWeight + (side === 'left' ? weight : 0);
  const right = prev.tippoRightWeight + (side === 'right' ? weight : 0);
  const diff = Math.abs(left - right);

  if (diff > threshold) {
    const actorIdx = state.players.findIndex((p) => p.id === actorId);
    const actor = state.players[actorIdx];
    const res = drawCardsFromDeck(state.drawPile, state.discardPile, 3);
    const players = state.players.map((p, idx) =>
      idx === actorIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
    );
    return appendEvent(
      {
        ...state,
        players,
        drawPile: res.drawPile,
        discardPile: res.discardPile,
        toolState: {
          ...prev,
          tippoLeftWeight: 0,
          tippoRightWeight: 0,
          tippoThreshold: 5 + Math.floor(Math.random() * 4),
          tippoTippedBy: actor?.name ?? 'Pemain',
        },
      },
      'tippo_fall',
      `⚖️ PAPAN TIPPO JATUH (Selisih ${diff} > Batas ${threshold})! ${actor?.name} kena penalti +${res.drawn.length} kartu & papan direset seimbang!`
    );
  }

  return {
    ...state,
    toolState: {
      ...prev,
      tippoLeftWeight: left,
      tippoRightWeight: right,
      tippoThreshold: threshold,
      tippoTippedBy: null,
    },
  };
}

export function triggerRobotoAndFlash(
  state: HubGameState,
  rng: () => number = Math.random
): HubGameState {
  if (!(state.settings.activeTools ?? []).includes('uno-roboto-flash')) return state;
  const prev = state.toolState ?? createInitialToolState(state.settings);
  const alive = state.players.filter((p) => !p.eliminated && !p.isOut);
  if (alive.length === 0) return state;

  // 35% chance each turn for Roboto sudden announcement or Flash reflex trigger
  const roll = rng();
  if (roll < 0.2) {
    const target = alive[Math.floor(rng() * alive.length)];
    const ruleText = ROBOTO_RULES[Math.floor(rng() * ROBOTO_RULES.length)];
    return appendEvent(
      {
        ...state,
        toolState: {
          ...prev,
          robotoRule: { targetName: target.name, ruleText, timestamp: Date.now() },
        },
      },
      'roboto',
      `🤖 UNO ROBOTO memanggil ${target.name}: "${ruleText}"`
    );
  }

  if (roll < 0.35) {
    const target = state.players[state.currentPlayerIndex];
    if (target && !target.isAI) {
      return {
        ...state,
        toolState: {
          ...prev,
          flashActive: { targetPlayerId: target.id, secondsLeft: 4 },
        },
      };
    }
  }

  return state;
}

export function resolveFlashReflex(
  state: HubGameState,
  playerId: string,
  succeeded: boolean
): HubGameState {
  const prev = state.toolState ?? createInitialToolState(state.settings);
  const playerIdx = state.players.findIndex((p) => p.id === playerId);
  const player = state.players[playerIdx];
  if (!player) return state;

  if (succeeded) {
    return appendEvent(
      {
        ...state,
        toolState: { ...prev, flashActive: null },
      },
      'flash_ok',
      `⚡ UNO FLASH REFLEX! ${player.name} menekan lampu tepat waktu — aman!`
    );
  }

  const res = drawCardsFromDeck(state.drawPile, state.discardPile, 2);
  const players = state.players.map((p, idx) =>
    idx === playerIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
  );
  return appendEvent(
    {
      ...state,
      players,
      drawPile: res.drawPile,
      discardPile: res.discardPile,
      toolState: { ...prev, flashActive: null },
    },
    'flash_fail',
    `🚨 UNO FLASH TERLAMBAT! ${player.name} kena penalti +${res.drawn.length} kartu!`
  );
}

/**
 * UNO Blast / Show 'Em No Mercy Attack! Virtual Launcher
 */
export function triggerBlastLauncher(
  state: HubGameState,
  playerId: string,
  rng: () => number = Math.random
): HubGameState {
  const playerIdx = state.players.findIndex((p) => p.id === playerId);
  const player = state.players[playerIdx];
  if (!player) return state;

  const extreme = Boolean(state.settings.blastExtreme || state.toolState?.blastNoMercyExtreme);
  const basePending = state.pendingDrawCount > 0 ? state.pendingDrawCount : 0;
  const fireChance = extreme ? 0.78 : 0.58;
  let burst = 0;

  if (rng() < fireChance) {
    const r = rng();
    if (extreme) {
      burst = r < 0.35 ? 4 : r < 0.7 ? 6 : r < 0.9 ? 8 : 10;
    } else {
      burst = r < 0.45 ? 2 : r < 0.8 ? 4 : 6;
    }
  }

  const totalDraw = burst + basePending;
  const res = drawCardsFromDeck(state.drawPile, state.discardPile, totalDraw);
  const players = state.players.map((p, idx) =>
    idx === playerIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
  );

  const msg =
    res.drawn.length === 0
      ? `💥 UNO BLAST (${player.name}): KLIK! Aman (0 kartu ditembakkan)!`
      : `🔥 ${extreme ? 'NO MERCY BLAST!' : 'UNO BLAST!'} Peluncur menembakkan ${res.drawn.length} kartu ke ${player.name}!`;

  return appendEvent(
    {
      ...state,
      players,
      drawPile: res.drawPile,
      discardPile: res.discardPile,
      pendingDrawCount: 0,
      pendingDrawMinValue: undefined,
      lastAttackResult: {
        triggeredBy: player.name,
        cardsLaunched: res.drawn.length,
        presses: 1,
        timestamp: Date.now(),
      },
    },
    'launcher_blast',
    msg
  );
}

export function resolveDigitalToolCard(
  state: HubGameState,
  card: HubCard,
  actorId: string,
  chosenColor?: HubCardColor
): { state: HubGameState; handled: boolean } {
  if (!isDigitalToolCardType(card.type)) return { state, handled: false };

  const activeColor = card.color === 'wild' ? chosenColor ?? state.activeColor : card.color;
  let working: HubGameState = { ...state, activeColor };

  if (card.type === 'spin_card') {
    working = triggerSpinWheel(working, actorId);
  } else if (card.type === 'jackpot_card') {
    working = triggerJackpotRoller(working, actorId);
  } else if (card.type === 'power_grab') {
    working = grabOrStealPowerRelic(working, actorId);
  }

  return { state: working, handled: true };
}

export type PowerRelicKey = 'U' | 'N' | 'O' | '!';
export const ALL_POWER_RELICS: PowerRelicKey[] = ['U', 'N', 'O', '!'];

export const OVERDRIVE_TOOL_PRESETS: {
  id: 'ranked_tactical' | 'chaos_party';
  name: string;
  badge: string;
  description: string;
  tools: ('uno-spin' | 'uno-tippo' | 'uno-jackpot' | 'uno-power-grab' | 'uno-roboto-flash' | 'uno-blast')[];
  blastExtreme: boolean;
  targetScore: number;
  singleRound: boolean;
}[] = [
  {
    id: 'ranked_tactical',
    name: 'Ranked Tactical Mode',
    badge: '🏆 KOMPETITIF',
    description: 'Power Grab (4 Relic U-N-O-!) + Tippo Balance — fokus skill & strategi (500 Poin).',
    tools: ['uno-power-grab', 'uno-tippo'],
    blastExtreme: false,
    targetScore: 500,
    singleRound: false,
  },
  {
    id: 'chaos_party',
    name: 'Chaos Party Mode',
    badge: '🎉 OVERDRIVE',
    description: 'Semua 6 Alat Digital aktif + No Mercy Overcharge Blast! Adrenalin penuh!',
    tools: ['uno-spin', 'uno-tippo', 'uno-jackpot', 'uno-power-grab', 'uno-roboto-flash', 'uno-blast'],
    blastExtreme: true,
    targetScore: 250,
    singleRound: true,
  },
];

/**
 * UNO Power Grab 4-Relic System (U • N • O • !):
 * Grabs an unowned relic or steals one from another player.
 * Collecting ALL 4 relics simultaneously triggers an INSTANT WIN!
 */
export function grabOrStealPowerRelic(
  state: HubGameState,
  actorId: string,
  preferredRelic?: PowerRelicKey
): HubGameState {
  const actor = state.players.find((p) => p.id === actorId);
  if (!actor) return state;

  const prevTool = state.toolState ?? createInitialToolState(state.settings);
  const relics: Record<PowerRelicKey, string | null> = {
    U: prevTool.powerRelics?.U ?? null,
    N: prevTool.powerRelics?.N ?? null,
    O: prevTool.powerRelics?.O ?? null,
    '!': prevTool.powerRelics?.['!'] ?? null,
  };

  // Pick preferred relic (if not already owned by actor), else first unowned, else steal from opponent!
  const chosenKey: PowerRelicKey | undefined =
    preferredRelic && relics[preferredRelic] !== actorId
      ? preferredRelic
      : ALL_POWER_RELICS.find((k) => relics[k] === null) ??
        ALL_POWER_RELICS.find((k) => relics[k] !== actorId);

  if (!chosenKey) return state;
  const prevOwnerId = relics[chosenKey];
  const prevOwnerName = prevOwnerId
    ? state.players.find((p) => p.id === prevOwnerId)?.name
    : null;
  relics[chosenKey] = actorId;

  const ownedCount = ALL_POWER_RELICS.filter((k) => relics[k] === actorId).length;
  const nextTool: DigitalToolState = {
    ...prevTool,
    powerHolderId: actorId,
    powerRelics: relics,
  };

  // INSTANT WIN if player holds ALL 4 Relics U-N-O-!
  if (ownedCount === 4) {
    return appendEvent(
      {
        ...state,
        phase: 'game_over',
        winnerId: actorId,
        toolState: nextTool,
        roundHistory: [
          ...state.roundHistory,
          {
            roundNumber: state.roundNumber,
            winnerId: actorId,
            winnerName: actor.name,
            pointsAwarded: 500,
            reason: `⚡ INSTANT WIN POWER GRAB! ${actor.name} mengumpulkan 4 Relic [U-N-O-!] sekaligus!`,
            playerPoints: state.players.map((p) => ({
              playerId: p.id,
              playerName: p.name,
              handPoints: 0,
              totalScore: p.id === actorId ? p.score + 500 : p.score,
            })),
          },
        ],
      },
      'game_win',
      `🏆 INSTANT WIN! ${actor.name} mengumpulkan seluruh 4 Relic [U • N • O • !] Power Grab!`
    );
  }

  return appendEvent(
    { ...state, toolState: nextTool },
    'power_grab',
    prevOwnerName
      ? `⚡ POWER GRAB! ${actor.name} MENCURI Relic [${chosenKey}] dari ${prevOwnerName}! (${ownedCount}/4)`
      : `⚡ POWER GRAB! ${actor.name} merebut Relic [${chosenKey}]! (${ownedCount}/4 menuju Instant Win)`
  );
}

/**
 * UNO Show 'Em No Mercy Attack! Hold-to-Charge Overcharge Launcher:
 * - Level 1 (Safe): +2 attack stack
 * - Level 2 (High): +4 attack stack
 * - Level 3 (OVERLOAD): 70% brutal +8 attack, 30% BACKFIRE (+4 to actor!)
 */
export function triggerOverchargeBlast(
  state: HubGameState,
  actorId: string,
  chargeLevel: 1 | 2 | 3,
  rng: () => number = Math.random
): HubGameState {
  const actorIdx = state.players.findIndex((p) => p.id === actorId);
  const actor = state.players[actorIdx];
  if (!actor) return state;

  if (chargeLevel === 3 && rng() < 0.3) {
    // BACKFIRE!
    const res = drawCardsFromDeck(state.drawPile, state.discardPile, 4);
    const players = state.players.map((p, i) =>
      i === actorIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
    );
    return appendEvent(
      { ...state, players, drawPile: res.drawPile, discardPile: res.discardPile },
      'overload',
      `💥 OVERCHARGE BACKFIRE! Pelontar ${actor.name} kelebihan tekanan → ${actor.name} kena +4 kartu!`
    );
  }

  const add = chargeLevel === 3 ? 8 : chargeLevel === 2 ? 4 : 2;
  return appendEvent(
    {
      ...state,
      pendingDrawCount: state.pendingDrawCount + add,
    },
    'launcher_blast',
    `🔥 OVERCHARGE LV.${chargeLevel}! ${actor.name} menembakkan serangan +${add} (Total tumpukan: +${state.pendingDrawCount + add})!`
  );
}

/**
 * AI Host Roboto Rubber-Banding Director:
 * Triggers a dynamic comeback event when a leader has <= 2 cards while another player has >= 8 cards!
 */
export function triggerRobotoDirectorCheck(state: HubGameState): HubGameState {
  if (!(state.settings.activeTools ?? []).includes('uno-roboto-flash')) return state;
  const leader = state.players.find((p) => !p.eliminated && p.hand.length <= 2);
  const trailing = state.players.find((p) => !p.eliminated && p.hand.length >= 8);
  if (!leader || !trailing) return state;

  const prev = state.toolState ?? createInitialToolState(state.settings);
  return appendEvent(
    {
      ...state,
      toolState: {
        ...prev,
        robotoRule: {
          targetName: leader.name,
          ruleText: `ALERT LEADER! ${leader.name} sisa ${leader.hand.length} kartu — Misi Dadakan: Serang leader atau buang angka 7 untuk -2 kartu!`,
          timestamp: Date.now(),
        },
      },
    },
    'roboto',
    `🤖 ROBOTO DIRECTOR ALERT! ${leader.name} mendominasi (${leader.hand.length} kartu) — Event Comeback aktif untuk ${trailing.name}!`
  );
}
