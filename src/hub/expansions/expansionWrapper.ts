import { applyOptionalMercyRule } from '../engine/houseRules';
import { HubCard, HubCardColor, HubGameState, MoveInput, UnoRuleset, VariantSettings } from '../types';
import {
  injectAddOnPackCards,
  isAddOnCardType,
  isAddOnPackSupported,
  resolveAddOnCardEffect,
  sanitizeAddOnPacksForVariant,
} from './addOnPacks';

function pullStartingDiscard(deck: HubCard[]): {
  firstCard: HubCard | undefined;
  remaining: HubCard[];
  activeColor: HubCardColor;
} {
  const remaining = [...deck];
  const nonWildIdx = remaining.findIndex(
    (c) => c.color !== 'wild' && !c.type.startsWith('wild') && !isAddOnCardType(c.type)
  );
  const firstCard =
    nonWildIdx >= 0 ? remaining.splice(nonWildIdx, 1)[0] : remaining.pop();
  const activeColor: HubCardColor =
    firstCard && firstCard.color !== 'wild' ? firstCard.color : 'red';
  return { firstCard, remaining, activeColor };
}

/**
 * Wraps any UnoRuleset with UNO Classic-only Add-On Expansion Packs
 * cleanly via Strategy Decoration: zero mutation of the underlying ruleset!
 *
 * Defensive Guard: Add-On Packs are STRICTLY restricted to `uno-classic`.
 * Any non-classic variant receiving `activePacks` will have them ignored & stripped with a warning.
 */
export function wrapRulesetWithExpansions(base: UnoRuleset): UnoRuleset {
  return {
    id: base.id,

    createDeck(settings: VariantSettings) {
      const deck = base.createDeck(settings);
      const validPacks = sanitizeAddOnPacksForVariant(base.id, settings.activePacks, true);
      if (validPacks.length === 0) {
        return deck;
      }
      // Inject exact 16 cards per selected Add-On Pack into UNO Classic deck before shuffling
      return injectAddOnPackCards(deck, validPacks);
    },

    shuffleDeck(deck) {
      return base.shuffleDeck(deck);
    },

    dealCards(deck, players, settings) {
      return base.dealCards(deck, players, settings);
    },

    initializeGame(players, mode, settings) {
      const validPacks = sanitizeAddOnPacksForVariant(base.id, settings.activePacks, true);
      const safeSettings: VariantSettings = {
        ...settings,
        activePacks: validPacks,
      };

      const baseState = base.initializeGame(players, mode, safeSettings);
      if (!isAddOnPackSupported(base.id) || validPacks.length === 0) {
        return baseState;
      }

      // Build UNO Classic (108) + 16 cards per active pack, shuffle, deal, and pick opening discard
      const expandedDeck = this.shuffleDeck(this.createDeck(safeSettings));
      const resetPlayers = baseState.players.map((p) => ({ ...p, hand: [], calledUno: false }));
      const { players: dealt, remainingDeck } = this.dealCards(
        expandedDeck,
        resetPlayers,
        safeSettings
      );
      const { firstCard, remaining, activeColor } = pullStartingDiscard(remainingDeck);

      return {
        ...baseState,
        players: dealt,
        drawPile: remaining,
        discardPile: firstCard ? [firstCard] : [],
        activeColor,
        settings: safeSettings,
        alliances: [],
      };
    },

    validateMove(state: HubGameState, playerId: string, move: MoveInput) {
      if (!isAddOnPackSupported(state.variantId)) {
        return base.validateMove(state, playerId, move);
      }

      const current = state.players[state.currentPlayerIndex];
      const card = current?.hand.find((c) => c.id === move.cardId);

      // Stack Pack global stacking validation (UNO Classic only)
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

      if (card && isAddOnCardType(card.type)) {
        if (state.phase !== 'playing' || !current || current.id !== playerId) {
          return { valid: false, reason: 'Bukan giliranmu.' };
        }
        if (card.color === 'wild' || card.color === state.activeColor) {
          return { valid: true, requiresColor: card.color === 'wild' };
        }
        return { valid: false, reason: 'Kartu ekspansi harus cocok dengan warna aktif!' };
      }

      return base.validateMove(state, playerId, move);
    },

    executeAction(state: HubGameState, playerId: string, move: MoveInput) {
      if (!isAddOnPackSupported(state.variantId)) {
        return applyOptionalMercyRule(base.executeAction(state, playerId, move));
      }

      const current = state.players[state.currentPlayerIndex];
      const card = current?.hand.find((c) => c.id === move.cardId);

      // Handle Add-On Pack cards first (UNO Classic only)
      if (card && isAddOnCardType(card.type)) {
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

        const res = resolveAddOnCardEffect(
          working,
          card,
          playerId,
          move.chosenColor,
          move.targetPlayerId
        );
        working = res.state;
        const steps = res.steps;

        working = applyOptionalMercyRule(working);
        if (working.phase === 'round_over' || working.phase === 'game_over') return working;

        working = base.checkWinCondition(working);
        if (working.phase === 'round_over' || working.phase === 'game_over') return working;

        if (steps === 0) return working;
        return base.advanceTurn(working, steps);
      }

      return applyOptionalMercyRule(base.executeAction(state, playerId, move));
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
      const validPacks = sanitizeAddOnPacksForVariant(base.id, state.settings.activePacks, true);
      const safeSettings: VariantSettings = {
        ...state.settings,
        activePacks: validPacks,
      };
      const nextBase = base.resetRound({ ...state, settings: safeSettings });

      if (!isAddOnPackSupported(base.id) || validPacks.length === 0) {
        return nextBase;
      }

      // Preserve Add-On Packs cleanly across subsequent UNO Classic rounds
      const expandedDeck = this.shuffleDeck(this.createDeck(safeSettings));
      const resetPlayers = nextBase.players.map((p) => ({ ...p, hand: [], calledUno: false }));
      const { players: dealt, remainingDeck } = this.dealCards(
        expandedDeck,
        resetPlayers,
        safeSettings
      );
      const { firstCard, remaining, activeColor } = pullStartingDiscard(remainingDeck);

      return {
        ...nextBase,
        players: dealt,
        drawPile: remaining,
        discardPile: firstCard ? [firstCard] : [],
        activeColor,
        settings: safeSettings,
        alliances: [],
      };
    },

    handleDrawOrPass(state, playerId) {
      return applyOptionalMercyRule(base.handleDrawOrPass(state, playerId));
    },

    resolvePrompt(state, payload) {
      if (isAddOnPackSupported(state.variantId) && state.pendingPrompt?.cardId) {
        const actor = state.players.find((p) => p.id === state.pendingPrompt?.actorId);
        const card = actor?.hand.find((c) => c.id === state.pendingPrompt?.cardId);
        if (card && isAddOnCardType(card.type)) {
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
      return applyOptionalMercyRule(base.resolvePrompt(state, payload));
    },

    decideAIMove(state) {
      return base.decideAIMove(state);
    },
  };
}
