import {
  appendEvent,
  drawCardsFromDeck,
  getColorLabel,
  getNextPlayerIndex,
  uid,
} from '../engine/core';
import { AddOnPackId, HubCard, HubCardColor, HubGameState } from '../types';

const BASE_COLORS: HubCardColor[] = ['red', 'yellow', 'green', 'blue'];

/**
 * Injects EXACTLY 16 cards per enabled Add-On Expansion Pack into the deck!
 */
export function injectAddOnPackCards(deck: HubCard[], activePacks: AddOnPackId[] = []): HubCard[] {
  if (!activePacks || activePacks.length === 0) return deck;
  const extra: HubCard[] = [];

  // 1. REVERSE PACK (16 cards: 8 Reverse Draw 2 + 4 Double Reverse + 4 Wild Reverse All-Skip)
  if (activePacks.includes('reverse-pack')) {
    for (const color of BASE_COLORS) {
      extra.push({ id: uid('rp'), color, type: 'reverse_draw2', packId: 'reverse-pack' });
      extra.push({ id: uid('rp'), color, type: 'reverse_draw2', packId: 'reverse-pack' });
      extra.push({ id: uid('rp'), color, type: 'double_reverse', packId: 'reverse-pack' });
    }
    for (let i = 0; i < 4; i += 1) {
      extra.push({ id: uid('rp'), color: 'wild', type: 'wild_reverse_all_skip', packId: 'reverse-pack' });
    }
  }

  // 2. STACK PACK (16 cards: 8 Stack +3 + 4 Wild Stack Multiplier x2 + 4 Wild Stack Transfer)
  if (activePacks.includes('stack-pack')) {
    for (const color of BASE_COLORS) {
      extra.push({ id: uid('sp'), color, type: 'stack_plus3', packId: 'stack-pack' });
      extra.push({ id: uid('sp'), color, type: 'stack_plus3', packId: 'stack-pack' });
    }
    for (let i = 0; i < 4; i += 1) {
      extra.push({ id: uid('sp'), color: 'wild', type: 'wild_stack_x2', packId: 'stack-pack' });
      extra.push({ id: uid('sp'), color: 'wild', type: 'wild_stack_transfer', packId: 'stack-pack' });
    }
  }

  // 3. SWAP PACK (16 cards: 8 Targeted Swap + 4 Cascade Swap + 4 Wild Blind Trade)
  if (activePacks.includes('swap-pack')) {
    for (const color of BASE_COLORS) {
      extra.push({ id: uid('swp'), color, type: 'swap_target', packId: 'swap-pack' });
      extra.push({ id: uid('swp'), color, type: 'swap_target', packId: 'swap-pack' });
      extra.push({ id: uid('swp'), color, type: 'swap_rotate_all', packId: 'swap-pack' });
    }
    for (let i = 0; i < 4; i += 1) {
      extra.push({ id: uid('swp'), color: 'wild', type: 'wild_blind_trade', packId: 'swap-pack' });
    }
  }

  // 4. SPEED PACK (16 cards: 8 Speed Drop + 4 Wild Reflex Race + 4 Blitz Turn)
  if (activePacks.includes('speed-pack')) {
    for (const color of BASE_COLORS) {
      extra.push({ id: uid('spd'), color, type: 'speed_drop', packId: 'speed-pack' });
      extra.push({ id: uid('spd'), color, type: 'speed_drop', packId: 'speed-pack' });
      extra.push({ id: uid('spd'), color, type: 'blitz_turn', packId: 'speed-pack' });
    }
    for (let i = 0; i < 4; i += 1) {
      extra.push({ id: uid('spd'), color: 'wild', type: 'wild_reflex_race', packId: 'speed-pack' });
    }
  }

  // 5. DEFENSE PACK (16 cards: 8 Shield Block + 4 Mirror Deflect + 4 Wild Fortress)
  if (activePacks.includes('defense-pack')) {
    for (const color of BASE_COLORS) {
      extra.push({ id: uid('def'), color, type: 'shield_block', packId: 'defense-pack' });
      extra.push({ id: uid('def'), color, type: 'shield_block', packId: 'defense-pack' });
      extra.push({ id: uid('def'), color, type: 'mirror_deflect', packId: 'defense-pack' });
    }
    for (let i = 0; i < 4; i += 1) {
      extra.push({ id: uid('def'), color: 'wild', type: 'wild_fortress', packId: 'defense-pack' });
    }
  }

  // 6. COMEBACK PACK (16 cards: 8 Underdog Relief + 4 Robin Hood Balance + 4 Wild Second Wind)
  if (activePacks.includes('comeback-pack')) {
    for (const color of BASE_COLORS) {
      extra.push({ id: uid('cbk'), color, type: 'underdog_relief', packId: 'comeback-pack' });
      extra.push({ id: uid('cbk'), color, type: 'underdog_relief', packId: 'comeback-pack' });
      extra.push({ id: uid('cbk'), color, type: 'robin_hood_balance', packId: 'comeback-pack' });
    }
    for (let i = 0; i < 4; i += 1) {
      extra.push({ id: uid('cbk'), color: 'wild', type: 'wild_second_wind', packId: 'comeback-pack' });
    }
  }

  // 7. FRENEMIES PACK (16 cards: 8 Pact/Alliance + 4 Betrayal/Backstab + 4 Wild Double Agent)
  if (activePacks.includes('frenemies-pack')) {
    for (const color of BASE_COLORS) {
      extra.push({ id: uid('frn'), color, type: 'frenemy_alliance', packId: 'frenemies-pack' });
      extra.push({ id: uid('frn'), color, type: 'frenemy_alliance', packId: 'frenemies-pack' });
      extra.push({ id: uid('frn'), color, type: 'frenemy_betrayal', packId: 'frenemies-pack' });
    }
    for (let i = 0; i < 4; i += 1) {
      extra.push({ id: uid('frn'), color: 'wild', type: 'wild_double_agent', packId: 'frenemies-pack' });
    }
  }

  return [...deck, ...extra];
}

export function isAddOnCardType(type: string): boolean {
  return [
    'reverse_draw2',
    'double_reverse',
    'reverse_skip',
    'wild_reverse_all_skip',
    'stack_plus2',
    'stack_plus3',
    'stack_plus4',
    'wild_stack_x2',
    'wild_stack_transfer',
    'swap_target',
    'swap_rotate_all',
    'swap_random',
    'wild_blind_trade',
    'speed_burst',
    'speed_drop',
    'wild_reflex_race',
    'blitz_turn',
    'shield_deflect',
    'shield_block',
    'mirror_deflect',
    'wild_fortress',
    'comeback_boost',
    'underdog_relief',
    'robin_hood_balance',
    'wild_second_wind',
    'frenemy_alliance',
    'frenemy_betrayal',
    'wild_double_agent',
  ].includes(type);
}

/**
 * Checks reactive defense (Shield Block / Mirror Deflect / Wild Fortress)
 * OR Power Grab immunity when a player is targeted by an action/penalty!
 */
export function checkDefenseOrImmunity(
  state: HubGameState,
  victimId: string,
  attackerId: string,
  penaltyCards: number
): {
  blocked: boolean;
  reflected: boolean;
  state: HubGameState;
} {
  const victim = state.players.find((p) => p.id === victimId);
  if (!victim || victimId === attackerId) {
    return { blocked: false, reflected: false, state };
  }

  // 1. UNO Power Grab OR Wild Fortress immunity
  if (state.toolState?.powerHolderId === victimId || (victim.fortressTurns ?? 0) > 0) {
    return {
      blocked: true,
      reflected: false,
      state: appendEvent(
        state,
        'power_immune',
        `🏰 KEBAL SERANGAN! ${victim.name} dilindungi oleh ${(victim.fortressTurns ?? 0) > 0 ? 'Wild Fortress' : 'Token Power Grab'}!`
      ),
    };
  }

  // 2. Defense Pack reactive cards: Mirror Deflect > Shield Block
  const activePacks = state.settings.activePacks ?? [];
  if (!activePacks.includes('defense-pack')) {
    return { blocked: false, reflected: false, state };
  }

  const mirrorCard = victim.hand.find((c) => c.type === 'mirror_deflect' || c.type === 'shield_deflect');
  if (mirrorCard) {
    let drawPile = [...state.drawPile];
    let discardPile = [...state.discardPile, mirrorCard];
    const drawRes = drawCardsFromDeck(drawPile, discardPile, penaltyCards);
    drawPile = drawRes.drawPile;
    discardPile = drawRes.discardPile;
    const attacker = state.players.find((p) => p.id === attackerId);
    const players = state.players.map((p) => {
      if (p.id === victimId) return { ...p, hand: p.hand.filter((c) => c.id !== mirrorCard.id) };
      if (p.id === attackerId) return { ...p, hand: [...p.hand, ...drawRes.drawn], calledUno: false };
      return p;
    });
    return {
      blocked: true,
      reflected: true,
      state: appendEvent(
        { ...state, players, drawPile, discardPile },
        'mirror_deflect',
        `🪞 MIRROR DEFLECT! ${victim.name} memantulkan serangan +${penaltyCards} kembali ke ${attacker?.name}!`
      ),
    };
  }

  const shieldCard = victim.hand.find((c) => c.type === 'shield_block');
  if (shieldCard) {
    const players = state.players.map((p) =>
      p.id === victimId ? { ...p, hand: p.hand.filter((c) => c.id !== shieldCard.id) } : p
    );
    const nextColor = shieldCard.color === 'wild' ? state.activeColor : shieldCard.color;
    return {
      blocked: true,
      reflected: false,
      state: appendEvent(
        {
          ...state,
          players,
          discardPile: [...state.discardPile, shieldCard],
          activeColor: nextColor,
        },
        'shield_block',
        `🛡️ SHIELD BLOCK! ${victim.name} membatalkan serangan +${penaltyCards} & mengubah warna menjadi ${getColorLabel(nextColor)}!`
      ),
    };
  }

  return { blocked: false, reflected: false, state };
}

/** Resolve Wild Reflex Race ("TAP CEPAT!") — slowest player draws 2 cards! */
export function resolveReflexRaceTap(state: HubGameState, playerId: string): HubGameState {
  const race = state.reflexRaceActive;
  if (!race) return state;
  const tapped = race.tappedPlayerIds.includes(playerId)
    ? race.tappedPlayerIds
    : [...race.tappedPlayerIds, playerId];

  // Everyone except 1 slowest player tapped (or timeout): penalize slowest!
  const alive = state.players.filter((p) => !p.eliminated && !p.isOut);
  const humanPlayers = alive.filter((p) => !p.isAI);
  const allHumansTapped = humanPlayers.every((h) => tapped.includes(h.id));

  if (allHumansTapped) {
    // Pick a random bot as slowest if humans tapped in time!
    const bots = alive.filter((p) => p.isAI);
    const loser = bots.length > 0 ? bots[Math.floor(Math.random() * bots.length)] : alive[alive.length - 1];
    const res = drawCardsFromDeck(state.drawPile, state.discardPile, 2);
    const players = state.players.map((p) =>
      p.id === loser.id ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
    );
    return appendEvent(
      { ...state, players, drawPile: res.drawPile, discardPile: res.discardPile, reflexRaceActive: null },
      'reflex_done',
      `⚡ TAP CEPAT SELESAI! ${loser.name} paling lambat → Penalti +2 kartu!`
    );
  }

  return {
    ...state,
    reflexRaceActive: { ...race, tappedPlayerIds: tapped },
  };
}

/**
 * Resolves the effect of any Add-On Expansion Pack card played.
 */
export function resolveAddOnCardEffect(
  state: HubGameState,
  card: HubCard,
  actorId: string,
  chosenColor?: HubCardColor,
  targetPlayerId?: string
): { state: HubGameState; steps: number; handled: boolean } {
  if (!isAddOnCardType(card.type)) {
    return { state, steps: 1, handled: false };
  }

  const actorIdx = state.players.findIndex((p) => p.id === actorId);
  const actor = state.players[actorIdx];
  if (!actor) return { state, steps: 1, handled: false };

  let direction = state.direction;
  let steps = 1;
  let drawPile = [...state.drawPile];
  let discardPile = [...state.discardPile];
  let players = [...state.players];
  let activeColor: HubCardColor =
    card.color === 'wild' ? chosenColor ?? state.activeColor : card.color;
  let pendingDrawCount = state.pendingDrawCount;
  let pendingDrawMinValue = state.pendingDrawMinValue;
  let blitzTurnsRemaining = state.blitzTurnsRemaining ?? 0;
  let reflexRaceActive = state.reflexRaceActive ?? null;
  let alliances = [...(state.alliances ?? [])];
  let drawnTogetherPair = state.drawnTogetherPair ?? null;
  let msg = `${actor.name} memainkan ${card.type.toUpperCase()}!`;

  // === 1. REVERSE PACK ===
  if (card.type === 'reverse_draw2') {
    direction = (direction * -1) as 1 | -1;
    const victimIdx = getNextPlayerIndex(players, actorIdx, direction, 1);
    const victim = players[victimIdx];
    const def = checkDefenseOrImmunity(
      { ...state, players, drawPile, discardPile, direction, activeColor },
      victim.id,
      actor.id,
      2
    );
    if (def.blocked) return { state: def.state, steps: 1, handled: true };
    const res = drawCardsFromDeck(drawPile, discardPile, 2);
    drawPile = res.drawPile;
    discardPile = res.discardPile;
    players = players.map((p, idx) =>
      idx === victimIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
    );
    steps = 2;
    msg = `🔄+2 REVERSE DRAW 2! Arah dibalik & ${victim.name} ambil 2 kartu serta dilewati!`;
  } else if (card.type === 'double_reverse') {
    steps = 0;
    msg = `🪃 DOUBLE REVERSE (BOOMERANG)! ${actor.name} mendapat 1 giliran ekstra!`;
  } else if (card.type === 'wild_reverse_all_skip') {
    direction = (direction * -1) as 1 | -1;
    steps = 0;
    msg = `🌪️ WILD REVERSE ALL-SKIP (${getColorLabel(activeColor)})! Arah dibalik & semua pemain dilewati — giliran kembali ke ${actor.name}!`;
  }
  // === 2. STACK PACK ===
  else if (card.type === 'stack_plus3' || card.type === 'stack_plus2' || card.type === 'stack_plus4') {
    const val = card.type === 'stack_plus4' ? 4 : card.type === 'stack_plus3' ? 3 : 2;
    pendingDrawCount += val;
    pendingDrawMinValue = val;
    msg = `🔥 STACK +${val}! Total tumpukan penalti kini +${pendingDrawCount}!`;
  } else if (card.type === 'wild_stack_x2') {
    const baseVal = pendingDrawCount > 0 ? pendingDrawCount : 2;
    pendingDrawCount = baseVal * 2;
    pendingDrawMinValue = Math.max(pendingDrawMinValue ?? 2, 2);
    msg = `💥 WILD STACK MULTIPLIER ×2 (${getColorLabel(activeColor)})! Tumpukan penalti berlipat menjadi +${pendingDrawCount}!`;
  } else if (card.type === 'wild_stack_transfer') {
    const targetIdx =
      players.findIndex((p) => p.id === targetPlayerId) >= 0
        ? players.findIndex((p) => p.id === targetPlayerId)
        : getNextPlayerIndex(players, actorIdx, direction, 1);
    const target = players[targetIdx];
    if (pendingDrawCount > 0 && target) {
      const res = drawCardsFromDeck(drawPile, discardPile, pendingDrawCount);
      drawPile = res.drawPile;
      discardPile = res.discardPile;
      players = players.map((p, idx) =>
        idx === targetIdx ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
      );
      msg = `🎯 WILD STACK TRANSFER (${getColorLabel(activeColor)})! Seluruh beban +${pendingDrawCount} dipindahkan ke ${target.name}!`;
      pendingDrawCount = 0;
      pendingDrawMinValue = undefined;
    } else {
      msg = `🎯 WILD STACK TRANSFER (${getColorLabel(activeColor)}) dimainkan sebagai Wild!`;
    }
  }
  // === 3. SWAP PACK ===
  else if (card.type === 'swap_target') {
    const targetIdx =
      players.findIndex((p) => p.id === targetPlayerId) >= 0
        ? players.findIndex((p) => p.id === targetPlayerId)
        : getNextPlayerIndex(players, actorIdx, direction, 1);
    const target = players[targetIdx];
    if (target && target.id !== actor.id) {
      const aHand = [...actor.hand];
      const tHand = [...target.hand];
      players = players.map((p, idx) => {
        if (idx === actorIdx) return { ...p, hand: tHand, calledUno: false };
        if (idx === targetIdx) return { ...p, hand: aHand, calledUno: false };
        return p;
      });
      msg = `🔀 TARGETED SWAP! ${actor.name} menukar seluruh kartu dengan ${target.name}!`;
    }
  } else if (card.type === 'swap_rotate_all') {
    const hands = players.map((p) => [...p.hand]);
    players = players.map((p, idx) => ({
      ...p,
      hand: hands[(idx - direction + players.length) % players.length],
      calledUno: false,
    }));
    msg = `🌪️ CASCADE SWAP! Semua pemain mengoper seluruh kartu mengikuti arah giliran!`;
  } else if (card.type === 'wild_blind_trade') {
    const targetIdx =
      players.findIndex((p) => p.id === targetPlayerId) >= 0
        ? players.findIndex((p) => p.id === targetPlayerId)
        : getNextPlayerIndex(players, actorIdx, direction, 1);
    const target = players[targetIdx];
    if (target && target.id !== actor.id) {
      const takeCount = Math.min(2, target.hand.length);
      const giveCount = Math.min(2, actor.hand.length);
      const taken = target.hand.slice(0, takeCount);
      const given = actor.hand.slice(0, giveCount);
      players = players.map((p, idx) => {
        if (idx === actorIdx) return { ...p, hand: [...p.hand.slice(giveCount), ...taken] };
        if (idx === targetIdx) return { ...p, hand: [...p.hand.slice(takeCount), ...given] };
        return p;
      });
      msg = `🎲 WILD BLIND TRADE (${getColorLabel(activeColor)})! ${actor.name} menukar ${giveCount} kartu dengan ${takeCount} kartu acak milik ${target.name}!`;
    }
  }
  // === 4. SPEED PACK ===
  else if (card.type === 'speed_drop') {
    const sameColorNums = actor.hand.filter((c) => c.type === 'number' && c.color === card.color).slice(0, 2);
    if (sameColorNums.length > 0) {
      const dropIds = new Set(sameColorNums.map((c) => c.id));
      discardPile = [...discardPile, ...sameColorNums];
      players = players.map((p, idx) =>
        idx === actorIdx ? { ...p, hand: p.hand.filter((c) => !dropIds.has(c.id)) } : p
      );
      msg = `⚡ SPEED DROP! ${actor.name} langsung membuang ${sameColorNums.length} kartu angka ${getColorLabel(card.color)} tambahan!`;
    } else {
      msg = `⚡ SPEED DROP (${getColorLabel(card.color)}) dimainkan!`;
    }
  } else if (card.type === 'wild_reflex_race') {
    reflexRaceActive = { startedAt: Date.now(), tappedPlayerIds: [], secondsLeft: 3 };
    msg = `🏁 WILD REFLEX RACE (${getColorLabel(activeColor)})! TEKAN "TAP CEPAT!" DALAM 3 DETIK — yang terlambat ambil +2 kartu!`;
  } else if (card.type === 'blitz_turn') {
    blitzTurnsRemaining = players.length;
    msg = `⏱️ BLITZ TURN AKTIF! 1 putaran penuh dengan batas waktu 5 detik per giliran!`;
  }
  // === 5. DEFENSE PACK ===
  else if (card.type === 'wild_fortress') {
    players = players.map((p, idx) =>
      idx === actorIdx ? { ...p, fortressTurns: players.length } : p
    );
    msg = `🏰 WILD FORTRESS (${getColorLabel(activeColor)})! ${actor.name} KEBAL serangan selama 1 putaran penuh!`;
  } else if (card.type === 'shield_block' || card.type === 'mirror_deflect') {
    msg = `🛡️ ${actor.name} memainkan ${card.type === 'mirror_deflect' ? 'Mirror Deflect' : 'Shield Block'} (${getColorLabel(activeColor)}).`;
  }
  // === 6. COMEBACK PACK ===
  else if (card.type === 'underdog_relief' || card.type === 'comeback_boost') {
    const others = players.filter((p) => p.id !== actor.id);
    const avg = others.length > 0 ? others.reduce((s, p) => s + p.hand.length, 0) / others.length : 0;
    if (actor.hand.length > avg && actor.hand.length > 0) {
      const drop = actor.hand.slice(0, Math.min(2, actor.hand.length));
      discardPile = [...discardPile, ...drop];
      players = players.map((p, idx) =>
        idx === actorIdx ? { ...p, hand: p.hand.slice(drop.length) } : p
      );
      msg = `🚀 UNDERDOG RELIEF! ${actor.name} (> rata-rata ${avg.toFixed(1)}) membuang ${drop.length} kartu tambahan gratis!`;
    } else {
      msg = `✨ UNDERDOG RELIEF dimainkan (${getColorLabel(activeColor)}).`;
    }
  } else if (card.type === 'robin_hood_balance') {
    const sorted = [...players].sort((a, b) => a.hand.length - b.hand.length);
    const fewest = sorted[0];
    const secondMost = sorted[Math.max(0, sorted.length - 2)];
    const diff = Math.max(0, secondMost.hand.length - fewest.hand.length);
    if (diff > 0) {
      const res = drawCardsFromDeck(drawPile, discardPile, diff);
      drawPile = res.drawPile;
      discardPile = res.discardPile;
      players = players.map((p) =>
        p.id === fewest.id ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
      );
      msg = `🏹 ROBIN HOOD BALANCE! ${fewest.name} (kartu tersedikit) wajib ambil +${res.drawn.length} kartu agar seimbang!`;
    } else {
      msg = `🏹 ROBIN HOOD BALANCE dimainkan — jumlah kartu sudah seimbang!`;
    }
  } else if (card.type === 'wild_second_wind') {
    if (actor.hand.length >= 7) {
      const dropColor = actor.hand.filter((c) => c.color === activeColor);
      if (dropColor.length > 0) {
        discardPile = [...discardPile, ...dropColor];
        players = players.map((p, idx) =>
          idx === actorIdx ? { ...p, hand: p.hand.filter((c) => c.color !== activeColor) } : p
        );
        msg = `🌬️ WILD SECOND WIND! ${actor.name} (≥7 kartu) membuang SEMUA ${dropColor.length} kartu warna ${getColorLabel(activeColor)} sekaligus!`;
      } else {
        msg = `🌬️ WILD SECOND WIND (${getColorLabel(activeColor)}) dimainkan!`;
      }
    } else {
      msg = `🌬️ WILD SECOND WIND (${getColorLabel(activeColor)}) dimainkan!`;
    }
  }
  // === 7. FRENEMIES PACK ===
  else if (card.type === 'frenemy_alliance') {
    const partnerIdx =
      players.findIndex((p) => p.id === targetPlayerId) >= 0
        ? players.findIndex((p) => p.id === targetPlayerId)
        : getNextPlayerIndex(players, actorIdx, direction, 1);
    const partner = players[partnerIdx];
    if (partner && partner.id !== actor.id) {
      alliances = alliances.filter((pair) => !pair.includes(actor.id) && !pair.includes(partner.id));
      alliances.push([actor.id, partner.id]);
      msg = `🤝 PACT / ALLIANCE! ${actor.name} & ${partner.name} bersekutu (ikut buang kartu angka sama)!`;
    }
  } else if (card.type === 'frenemy_betrayal') {
    const existing = alliances.find((pair) => pair.includes(actor.id));
    const targetId = existing
      ? existing[0] === actor.id
        ? existing[1]
        : existing[0]
      : players[getNextPlayerIndex(players, actorIdx, direction, 1)].id;
    const targetName = players.find((p) => p.id === targetId)?.name ?? 'Lawan';
    if (existing) alliances = alliances.filter((pair) => pair !== existing);
    const res = drawCardsFromDeck(drawPile, discardPile, 3);
    drawPile = res.drawPile;
    discardPile = res.discardPile;
    players = players.map((p) =>
      p.id === targetId ? { ...p, hand: [...p.hand, ...res.drawn], calledUno: false } : p
    );
    msg = `🗡️ BETRAYAL / BACKSTAB! ${actor.name} mengkhianati ${targetName} → Penalti +3 kartu!`;
  } else if (card.type === 'wild_double_agent') {
    const others = players.filter((p) => p.id !== actor.id);
    if (others.length >= 2) {
      drawnTogetherPair = [others[0].id, others[1].id];
      msg = `🕵️ WILD DOUBLE AGENT (${getColorLabel(activeColor)})! ${others[0].name} & ${others[1].name} kini saling terikat penalti!`;
    }
  }

  return {
    state: appendEvent(
      {
        ...state,
        players,
        direction,
        drawPile,
        discardPile,
        activeColor,
        pendingDrawCount,
        pendingDrawMinValue,
        blitzTurnsRemaining,
        reflexRaceActive,
        alliances,
        drawnTogetherPair,
      },
      card.type,
      msg
    ),
    steps,
    handled: true,
  };
}
