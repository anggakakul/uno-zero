import { getVariantMetadata } from '../catalog';
import { getRuleset } from '../rulesets';
import { callHubUno, catchHubUno, makeDefaultPlayers } from './core';
import { applyOptionalMercyRule } from './houseRules';
import { resolveReflexRaceTap } from '../expansions/addOnPacks';
import { triggerComebackUnoCombo } from '../expansions/packSystemEngine';
import { finishDosMatching } from '../rulesets/dosMode';
import { passAfterFlipDraw } from '../rulesets/unoFlip';
import { challengeLiarsClaim, passAfterLiarsDraw } from '../rulesets/unoLiars';
import { attemptSpeedPlayCutIn, passAfterPartyDraw, takePartyPileUp } from '../rulesets/unoParty';
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
 * Anti-cheat sanitizer for online multiplayer across all Hub UNO modes.
 * Never leaks opponents' hidden hands, drawPile cards,
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

    return {
      ...p,
      hand: sanitizedHand,
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

  return {
    ...state,
    players,
    drawPile: sanitizedDrawPile,
    liarClaim: sanitizedLiarClaim,
    wildLiarsChallenge: sanitizedWildLiars,
  };
}

/**
 * Server-authoritative action dispatcher for all Hub UNO modes.
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
      return applyOptionalMercyRule(catchHubUno(state, actor.name));
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
      return attemptSpeedPlayCutIn(state, actorId, action.cardId);
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
      if (variantId === 'uno-party') return passAfterPartyDraw(state, actorId);
      if (variantId === 'uno-liars') return passAfterLiarsDraw(state, actorId);
      return passAfterFlipDraw(state, actorId);
    }

    case 'party_take_pile_up': {
      if (!isActorsTurn || state.phase !== 'party_pile_up' || !state.partyPileUp) return state;
      return takePartyPileUp(state, actorId);
    }

    case 'dos_finish_matching': {
      if (!isActorsTurn || variantId !== 'dos-mode' || !state.dosTurnState) return state;
      return finishDosMatching(state, actorId);
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
 * never deadlock an online Hub match across any of the Hub variants.
 */
export function autoStepHubState(state: HubGameState): HubGameState {
  if (
    state.variantId === 'uno-zero' ||
    state.phase === 'round_over' ||
    state.phase === 'game_over'
  ) {
    return state;
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
