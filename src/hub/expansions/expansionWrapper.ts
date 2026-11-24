import { getNextPlayerIndex, transitionTurnWithPrivacy } from '../engine/core';
import { HubGameState, MoveInput, UnoRuleset, VariantSettings } from '../types';
import {
  injectAddOnPackCards,
  isAddOnCardType,
  resolveAddOnCardEffect,
} from './addOnPacks';
import {
  applyTippoDrop,
  createInitialToolState,
  injectDigitalToolCards,
  isDigitalToolCardType,
  resolveDigitalToolCard,
  triggerBlastLauncher,
  triggerRobotoAndFlash,
} from './digitalTools';

/**
 * Wraps any UnoRuleset with active Add-On Expansion Packs & Digital Table Tools
 * cleanly via Strategy Decoration — zero mutation of the underlying ruleset!
 */
export function wrapRulesetWithExpansions(base: UnoRuleset): UnoRuleset {
  return {
    id: base.id,

    createDeck(settings: VariantSettings) {
      let deck = base.createDeck(settings);
      // Do not inject standard UNO expansion cards into spinoffs with totally different card structures
      if (base.id !== 'ono-99' && base.id !== 'uno-golf' && base.id !== 'uno-hearts') {
        deck = injectAddOnPackCards(deck, settings.activePacks);
        deck = injectDigitalToolCards(deck, settings.activeTools);
      }
      return deck;
    },

    shuffleDeck(deck) {
      return base.shuffleDeck(deck);
    },

    dealCards(deck, players, settings) {
      return base.dealCards(deck, players, settings);
    },

    initializeGame(players, mode, settings) {
      // Temporarily initialize using expanded deck
      const expandedDeck = this.shuffleDeck(this.createDeck(settings));
      const baseState = base.initializeGame(players, mode, settings);
      const hasExpansions =
        (settings.activePacks && settings.activePacks.length > 0) ||
        (settings.activeTools && settings.activeTools.length > 0);

      if (!hasExpansions || base.id === 'ono-99' || base.id === 'uno-golf' || base.id === 'uno-hearts') {
        return {
          ...baseState,
          toolState: createInitialToolState(settings),
        };
      }

      // Re-deal cleanly from expandedDeck so expansion cards enter hands & drawPile!
      const resetPlayers = baseState.players.map((p) => ({ ...p, hand: [] }));
      const { players: dealt, remainingDeck } = this.dealCards(
        expandedDeck,
        resetPlayers,
        settings
      );
      return {
        ...baseState,
        players: dealt,
        drawPile: remainingDeck,
        toolState: createInitialToolState(settings),
        alliances: [],
      };
    },

    validateMove(state: HubGameState, playerId: string, move: MoveInput) {
      const current = state.players[state.currentPlayerIndex];
      const card = current?.hand.find((c) => c.id === move.cardId);

      // Stack Pack global stacking validation
      if (
        card &&
        state.pendingDrawCount > 0 &&
        (state.settings.activePacks ?? []).includes('stack-pack')
      ) {
        const stackVal =
          card.type === 'draw2' || card.type === 'stack_plus2'
            ? 2
            : card.type === 'stack_plus3'
            ? 3
            : card.type === 'wild_draw4' || card.type === 'stack_plus4'
            ? 4
            : card.type === 'wild_stack_x2' || card.type === 'wild_stack_transfer'
            ? 99
            : 0;
        const minVal = state.pendingDrawMinValue ?? 2;
        if (stackVal >= minVal) {
          return { valid: true, requiresColor: card.color === 'wild' };
        }
      }

      if (card && (isAddOnCardType(card.type) || isDigitalToolCardType(card.type))) {
        if (state.phase !== 'playing' || !current || current.id !== playerId) {
          return { valid: false, reason: 'Bukan giliranmu.' };
        }
        if (
          card.color === 'wild' ||
          card.color === state.activeColor ||
          state.variantId === 'uno-all-wild'
        ) {
          return { valid: true, requiresColor: card.color === 'wild' };
        }
        return { valid: false, reason: 'Kartu ekspansi harus cocok dengan warna aktif!' };
      }

      return base.validateMove(state, playerId, move);
    },

    executeAction(state: HubGameState, playerId: string, move: MoveInput) {
      const current = state.players[state.currentPlayerIndex];
      const card = current?.hand.find((c) => c.id === move.cardId);

      // Handle Add-On Pack or Digital Tool cards first
      if (card && (isAddOnCardType(card.type) || isDigitalToolCardType(card.type))) {
        const val = this.validateMove(state, playerId, move);
        if (!val.valid) return state;

        if (card.color === 'wild' && !move.chosenColor) {
          return {
            ...state,
            phase: 'choose_color',
            pendingPrompt: {
              type: 'color',
              actorId: playerId,
              cardId: card.id,
              message: 'Pilih warna aktif untuk kartu Ekspansi:',
            },
          };
        }

        const remainingHand = current.hand.filter((c) => c.id !== card.id);
        let working: HubGameState = {
          ...state,
          phase: 'playing',
          pendingPrompt: null,
          discardPile: [...state.discardPile, card],
          players: state.players.map((p, idx) =>
            idx === state.currentPlayerIndex
              ? { ...p, hand: remainingHand, calledUno: remainingHand.length === 1 ? p.calledUno : false }
              : p
          ),
        };

        let steps = 1;
        if (isAddOnCardType(card.type)) {
          const res = resolveAddOnCardEffect(
            working,
            card,
            playerId,
            move.chosenColor,
            move.targetPlayerId
          );
          working = res.state;
          steps = res.steps;
        } else {
          const res = resolveDigitalToolCard(working, card, playerId, move.chosenColor);
          working = res.state;
        }

        // Apply Tippo drop if active
        working = applyTippoDrop(working, card, playerId, move.tippoSide ?? 'left');
        working = base.checkWinCondition(working);
        if (working.phase === 'round_over' || working.phase === 'game_over') return working;

        working = triggerRobotoAndFlash(working);
        if (steps === 0) return working;
        return base.advanceTurn(working, steps);
      }

      // Otherwise delegate to base ruleset, then run Tippo + Roboto/Flash hooks!
      let next = base.executeAction(state, playerId, move);
      if (card && next.discardPile.length > state.discardPile.length) {
        next = applyTippoDrop(next, card, playerId, move.tippoSide ?? 'left');
        if (next.phase === 'playing') {
          next = triggerRobotoAndFlash(next);
        }
      }
      return next;
    },

    advanceTurn(state, steps = 1) {
      return base.advanceTurn(state, steps);
    },

    calculateScore(state, winnerId) {
      return base.calculateScore(state, winnerId);
    },

    checkWinCondition(state) {
      return base.checkWinCondition(state);
    },

    resetRound(state) {
      const next = base.resetRound(state);
      return {
        ...next,
        toolState: createInitialToolState(state.settings),
      };
    },

    handleDrawOrPass(state, playerId) {
      // If UNO Blast Digital Tool is enabled, replace normal draw with Blast Launcher!
      if (
        (state.settings.activeTools ?? []).includes('uno-blast') &&
        state.variantId !== 'uno-attack' &&
        state.variantId !== 'ono-99' &&
        state.variantId !== 'uno-golf' &&
        state.variantId !== 'uno-hearts'
      ) {
        const blasted = triggerBlastLauncher(state, playerId);
        const nextIdx = getNextPlayerIndex(
          blasted.players,
          blasted.currentPlayerIndex,
          blasted.direction,
          1
        );
        return transitionTurnWithPrivacy(blasted, nextIdx);
      }
      return base.handleDrawOrPass(state, playerId);
    },

    resolvePrompt(state, payload) {
      if (state.pendingPrompt?.cardId) {
        const actor = state.players.find((p) => p.id === state.pendingPrompt?.actorId);
        const card = actor?.hand.find((c) => c.id === state.pendingPrompt?.cardId);
        if (card && (isAddOnCardType(card.type) || isDigitalToolCardType(card.type))) {
          return this.executeAction(
            { ...state, phase: 'playing', pendingPrompt: null },
            state.pendingPrompt.actorId,
            {
              cardId: card.id,
              chosenColor: payload.color,
              targetPlayerId: payload.targetPlayerId,
            }
          );
        }
      }
      return base.resolvePrompt(state, payload);
    },

    decideAIMove(state) {
      return base.decideAIMove(state);
    },
  };
}
