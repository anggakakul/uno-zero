import { getVariantMetadata } from '../catalog';
import { getRuleset } from '../rulesets';
import { callHubUno, catchHubUno, makeDefaultPlayers } from './core';
import { resolveReflexRaceTap } from '../expansions/addOnPacks';
import { resolveFlashReflex, triggerOverchargeBlast } from '../expansions/digitalTools';
import { triggerComebackUnoCombo } from '../expansions/packSystemEngine';
import { finishDosMatching } from '../rulesets/dosMode';
import { catchAttackUno } from '../rulesets/unoAttack';
import { breakEmojiHold, maintainEmojiExpression } from '../rulesets/unoDareEmoji';
import { passAfterExpressDraw } from '../rulesets/unoExpress';
import { passAfterFlipDraw } from '../rulesets/unoFlip';
import {
  catchGolfUno,
  golfDiscardDrawn,
  golfTakeDiscard,
  golfTakeDraw,
} from '../rulesets/unoGolf';
import { attemptHouseRemixJumpIn, completeRuleQTE } from '../rulesets/unoHouseRemix';
import { passAfterJuniorDraw } from '../rulesets/unoJunior';
import { challengeLiarsClaim, passAfterLiarsDraw } from '../rulesets/unoLiars';
import { attemptSpeedPlayCutIn, passAfterPartyDraw, takePartyPileUp } from '../rulesets/unoParty';
import {
  commitRummyTurn,
  passAfterRummyDraw,
  playRummyMeld,
  revertRummyTurn,
} from '../rulesets/unoRummyUp';
import { passAfterTeamsDraw } from '../rulesets/unoTeams';
import { HubCard, HubGameState, HubOnlineAction, VariantId } from '../types';

function makeHiddenCard(id: string): HubCard {
  return {
    id,
    color: 'wild',
    type: 'number',
  };
}

/**
 * Anti-cheat sanitizer for online multiplayer across ALL 19 Hub UNO modes.
 * Never leaks opponents' hidden hands, drawPile cards, face-down golf slots,
 * or Liar's UNO hidden face-down bluff cards.
 */
export function sanitizeHubGameStateForPlayer(
  state: HubGameState,
  viewerId: string
): HubGameState {
  const isEndOfRoundOrGame = state.phase === 'round_over' || state.phase === 'game_over';

  const players = state.players.map((p) => {
    const isSelf = p.id === viewerId;
    const sanitizedHand =
      isSelf || isEndOfRoundOrGame
        ? p.hand
        : p.hand.map((_, idx) => makeHiddenCard(`hidden_${p.id}_${idx}`));

    const sanitizedGolfSlots = p.golfSlots
      ? p.golfSlots.map((slot, idx) =>
          slot.faceUp || isEndOfRoundOrGame
            ? slot
            : { card: makeHiddenCard(`hidden_golf_${p.id}_${idx}`), faceUp: false }
        )
      : undefined;

    return {
      ...p,
      hand: sanitizedHand,
      ...(sanitizedGolfSlots ? { golfSlots: sanitizedGolfSlots } : {}),
    };
  });

  const sanitizedDrawPile = state.drawPile.map((_, idx) => makeHiddenCard(`hidden_draw_${idx}`));

  const sanitizedLiarClaim =
    state.liarClaim && state.liarClaim.actorId !== viewerId && !isEndOfRoundOrGame
      ? {
          ...state.liarClaim,
          actualCard: makeHiddenCard('hidden_liar_card'),
        }
      : state.liarClaim;

  const sanitizedWildLiars = state.wildLiarsChallenge
    ? {
        ...state.wildLiarsChallenge,
        submissions: state.wildLiarsChallenge.submissions.map((sub, idx) =>
          sub.playerId === viewerId || sub.status !== 'pending' || isEndOfRoundOrGame
            ? sub
            : { ...sub, card: makeHiddenCard(`hidden_wl_${idx}`) }
        ),
      }
    : state.wildLiarsChallenge;

  // Hide active player's drawn card from other players in UNO Golf if drawn from draw pile
  const activePlayer = state.players[state.currentPlayerIndex];
  const sanitizedGolfDrawn =
    state.golfDrawnCard &&
    state.golfDrawnCard.source === 'draw' &&
    activePlayer?.id !== viewerId &&
    !isEndOfRoundOrGame
      ? { ...state.golfDrawnCard, card: makeHiddenCard('hidden_golf_drawn') }
      : state.golfDrawnCard;

  return {
    ...state,
    players,
    drawPile: sanitizedDrawPile,
    liarClaim: sanitizedLiarClaim,
    wildLiarsChallenge: sanitizedWildLiars,
    golfDrawnCard: sanitizedGolfDrawn,
    // Strip internal AI tracking memory to reduce payload size
    aiMemory: undefined,
  };
}

/**
 * Server-authoritative action dispatcher for ALL 19 Hub UNO modes.
 * Enforces strict turn ownership, prompt ownership, and out-of-turn rule legality.
 */
export function applyHubOnlineAction(
  state: HubGameState,
  actorId: string,
  isHost: boolean,
  action: HubOnlineAction
): HubGameState {
  if (state.variantId === 'uno-zero') return state;
  const variantId = state.variantId as Exclude<VariantId, 'uno-zero'>;
  const ruleset = getRuleset(variantId);
  const actor = state.players.find((p) => p.id === actorId);
  if (!actor) return state;

  const currentPlayer = state.players[state.currentPlayerIndex];
  const isActorsTurn = Boolean(currentPlayer && currentPlayer.id === actorId);

  switch (action.type) {
    case 'next_round': {
      if (state.phase === 'round_over' && isHost) {
        return ruleset.resetRound(state);
      }
      return state;
    }

    case 'play_again': {
      if (state.phase === 'game_over' && isHost) {
        const meta = getVariantMetadata(variantId);
        const playerInits = state.players.map((p, idx) => ({
          id: p.id,
          name: p.name,
          isAI: p.isAI,
          teamId: meta.isTeamGame ? idx % (state.players.length === 6 ? 3 : 2) : undefined,
        }));
        const fresh = ruleset.initializeGame(playerInits, 'online', state.settings);
        return {
          ...fresh,
          players: fresh.players.map((fp) => {
            const prevP = state.players.find((op) => op.id === fp.id);
            return { ...fp, connected: prevP?.connected ?? true };
          }),
        };
      }
      return state;
    }

    case 'call_uno': {
      if (state.phase === 'round_over' || state.phase === 'game_over') return state;
      return callHubUno(state, actorId);
    }

    case 'catch_uno': {
      if (!state.unoVulnerablePlayerId || state.unoVulnerablePlayerId === actorId) return state;
      if (variantId === 'uno-attack') return catchAttackUno(state, actor.name);
      if (variantId === 'uno-golf') return catchGolfUno(state, actor.name);
      return catchHubUno(state, actor.name);
    }

    case 'resolve_prompt': {
      if (!state.pendingPrompt || state.pendingPrompt.actorId !== actorId) return state;
      return ruleset.resolvePrompt(state, action.payload);
    }

    case 'cancel_prompt': {
      if (
        !state.pendingPrompt ||
        state.pendingPrompt.actorId !== actorId ||
        state.phase !== 'choose_color'
      ) {
        return state;
      }
      return { ...state, phase: 'playing', pendingPrompt: null };
    }

    case 'challenge_liars': {
      if (
        variantId !== 'uno-liars' ||
        state.phase !== 'liar_challenge' ||
        !state.liarClaim ||
        state.liarClaim.actorId === actorId
      ) {
        return state;
      }
      return challengeLiarsClaim(state, actorId);
    }

    case 'speed_jump_in': {
      if (state.phase !== 'playing' || isActorsTurn) return state;
      if (variantId === 'uno-house-remix') {
        return attemptHouseRemixJumpIn(state, actorId, action.cardId);
      }
      return attemptSpeedPlayCutIn(state, actorId, action.cardId);
    }

    case 'house_complete_qte': {
      if (state.phase !== 'house_rule_qte' || !state.activeRuleQTE) return state;
      return completeRuleQTE(state, actorId);
    }

    case 'dare_maintain_emoji': {
      if (!state.emojiChallenge || state.emojiChallenge.targetId !== actorId) return state;
      return maintainEmojiExpression(state, actorId);
    }

    case 'dare_break_emoji': {
      if (!state.emojiChallenge || state.emojiChallenge.targetId === actorId) return state;
      return breakEmojiHold(state, actor.name);
    }

    case 'tool_flash_reflex': {
      if (!state.toolState?.flashActive || state.toolState.flashActive.targetPlayerId !== actorId) {
        return state;
      }
      return resolveFlashReflex(state, actorId, true);
    }

    case 'pack_reflex_race_tap': {
      if (!state.reflexRaceActive) return state;
      return resolveReflexRaceTap(state, actorId);
    }

    // --- Strictly Turn-Bound Actions ---
    case 'play_card': {
      if (!isActorsTurn || (state.phase !== 'playing' && state.phase !== 'party_pile_up')) {
        return state;
      }
      return ruleset.executeAction(state, actorId, action.move);
    }

    case 'draw_or_pass': {
      if (!isActorsTurn || state.phase !== 'playing') return state;
      return ruleset.handleDrawOrPass(state, actorId);
    }

    case 'pass_after_draw': {
      if (!isActorsTurn || !state.drawnPlayableCardId) return state;
      if (variantId === 'uno-teams') return passAfterTeamsDraw(state, actorId);
      if (variantId === 'uno-junior') return passAfterJuniorDraw(state, actorId);
      if (variantId === 'uno-party') return passAfterPartyDraw(state, actorId);
      if (variantId === 'uno-liars') return passAfterLiarsDraw(state, actorId);
      if (variantId === 'uno-express') return passAfterExpressDraw(state, actorId);
      if (variantId === 'uno-rummy-up') return passAfterRummyDraw(state, actorId);
      return passAfterFlipDraw(state, actorId);
    }

    case 'party_take_pile_up': {
      if (!isActorsTurn || state.phase !== 'party_pile_up' || !state.partyPileUp) return state;
      return takePartyPileUp(state, actorId);
    }

    case 'golf_take_draw': {
      if (!isActorsTurn || variantId !== 'uno-golf' || state.phase !== 'playing') return state;
      return golfTakeDraw(state, actorId);
    }

    case 'golf_take_discard': {
      if (!isActorsTurn || variantId !== 'uno-golf' || state.phase !== 'playing') return state;
      return golfTakeDiscard(state, actorId);
    }

    case 'golf_discard_drawn': {
      if (!isActorsTurn || variantId !== 'uno-golf' || !state.golfDrawnCard) return state;
      return golfDiscardDrawn(state, actorId);
    }

    case 'dos_finish_matching': {
      if (!isActorsTurn || variantId !== 'dos-mode' || !state.dosTurnState) return state;
      return finishDosMatching(state, actorId);
    }

    case 'rummy_play_meld': {
      if (!isActorsTurn || variantId !== 'uno-rummy-up' || state.phase !== 'playing') return state;
      return playRummyMeld(state, actorId);
    }

    case 'rummy_commit_turn': {
      if (!isActorsTurn || variantId !== 'uno-rummy-up' || !state.rummyTransaction) return state;
      return commitRummyTurn(state, actorId);
    }

    case 'rummy_revert_turn': {
      if (!isActorsTurn || variantId !== 'uno-rummy-up' || !state.rummyTransaction) return state;
      return revertRummyTurn(state, actorId);
    }

    case 'tool_overcharge_blast': {
      if (!isActorsTurn || state.phase !== 'playing') return state;
      const lvl = action.level === 1 || action.level === 2 || action.level === 3 ? action.level : 1;
      return triggerOverchargeBlast(state, actorId, lvl);
    }

    case 'pack_comeback_uno_combo': {
      if (!isActorsTurn || state.phase !== 'playing') return state;
      return triggerComebackUnoCombo(state, actorId);
    }

    default:
      return state;
  }
}

/**
 * Server-authoritative timeout/AI resolver so disconnected or AFK players
 * never deadlock an online Hub match across any of the 19 variants.
 */
export function autoStepHubState(state: HubGameState): HubGameState {
  if (
    state.variantId === 'uno-zero' ||
    state.phase === 'round_over' ||
    state.phase === 'game_over'
  ) {
    return state;
  }

  if (state.phase === 'house_rule_qte' && state.activeRuleQTE) {
    const pending = state.players.find(
      (p) => !state.activeRuleQTE?.completedPlayerIds.includes(p.id)
    );
    return pending ? completeRuleQTE(state, pending.id) : state;
  }

  const variantId = state.variantId as Exclude<VariantId, 'uno-zero'>;
  const ruleset = getRuleset(variantId);
  const curr = state.players[state.currentPlayerIndex];
  if (!curr) return state;

  const decision = ruleset.decideAIMove(state);
  if (decision.type === 'resolve_prompt') {
    return ruleset.resolvePrompt(state, decision.payload);
  }
  if (decision.type === 'draw') {
    return ruleset.handleDrawOrPass(state, curr.id);
  }
  return ruleset.executeAction(state, curr.id, decision.move);
}

/**
 * Helper to build player init list for a Hub online room (supporting optional AI bot fill).
 */
export function buildHubOnlinePlayerInits(
  humans: { id: string; name: string }[],
  variantId: Exclude<VariantId, 'uno-zero'>,
  fillWithBots: boolean,
  targetPlayerCount: number
): { id: string; name: string; isAI: boolean; teamId?: number }[] {
  const meta = getVariantMetadata(variantId);
  let total = Math.max(humans.length, meta.minPlayers);
  if (fillWithBots) {
    total = Math.max(total, Math.min(meta.maxPlayers, targetPlayerCount));
  }
  if (meta.isTeamGame && total % 2 !== 0) {
    total = Math.min(meta.maxPlayers, total + 1);
  }
  total = Math.min(meta.maxPlayers, total);

  const botCount = fillWithBots ? Math.max(0, total - humans.length) : 0;
  const combined: { id: string; name: string; isAI: boolean; teamId?: number }[] = [];

  for (let i = 0; i < humans.length; i += 1) {
    combined.push({
      id: humans[i].id,
      name: humans[i].name,
      isAI: false,
      teamId: meta.isTeamGame ? i % (humans.length + botCount === 6 ? 3 : 2) : undefined,
    });
  }

  for (let b = 0; b < botCount; b += 1) {
    const idx = humans.length + b;
    combined.push({
      id: `bot_${b + 1}`,
      name: `Bot ${b + 1}`,
      isAI: true,
      teamId: meta.isTeamGame ? idx % (humans.length + botCount === 6 ? 3 : 2) : undefined,
    });
  }

  return combined.length > 0 ? combined : makeDefaultPlayers(['Host', 'Bot 1'], 'ai', meta.isTeamGame);
}
