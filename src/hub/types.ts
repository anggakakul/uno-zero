export type VariantId =
  | 'uno-zero'
  | 'uno-classic'
  | 'uno-flip'
  | 'uno-flex'
  | 'uno-all-wild'
  | 'uno-no-mercy'
  | 'uno-teams'
  | 'uno-party'
  | 'uno-liars'
  | 'dos-mode'
  | 'ono-99';

export type AddOnPackId =
  | 'reverse-pack'
  | 'stack-pack'
  | 'swap-pack'
  | 'speed-pack'
  | 'defense-pack'
  | 'comeback-pack'
  | 'frenemies-pack';

export type GameCategory =
  | 'CLASSIC UNO'
  | 'STRATEGY UNO'
  | 'ACTION UNO'
  | 'TEAM UNO'
  | 'PARTY & SOCIAL'
  | 'SPINOFF';

export type DifficultyLevel = 'Mudah' | 'Menengah' | 'Sulit' | 'Ekstrem';

export type VariantStatus = 'AVAILABLE' | 'COMING SOON' | 'UNDER DEVELOPMENT';

export type HubCardColor =
  | 'red'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'pink'
  | 'teal'
  | 'orange'
  | 'purple'
  | 'wild';

export type HubCardType =
  | 'number'
  | 'skip'
  | 'skip_everyone'
  | 'skip_two'
  | 'reverse'
  | 'draw1'
  | 'draw2'
  | 'draw4'
  | 'draw5'
  | 'draw6'
  | 'draw10'
  | 'discard_all'
  | 'flip'
  | 'wild'
  | 'wild_draw2'
  | 'wild_draw4'
  | 'wild_draw6'
  | 'wild_draw10'
  | 'wild_draw_color'
  | 'wild_reverse_draw4'
  | 'wild_color_roulette'
  | 'wild_reverse'
  | 'wild_skip'
  | 'wild_skip_two'
  | 'wild_forced_swap'
  | 'wild_target_draw2'
  | 'wild_all_draw'
  | 'wild_all_flip'
  | 'wild_team_play'
  | 'wild_team_draw4'
  | 'flex_skip'
  | 'flex_reverse'
  | 'flex_draw2'
  // Party & Liar's Mode Cards
  | 'point_taken'
  | 'drawn_together'
  | 'wild_pile_up'
  | 'wild_liars_challenge'
  // Add-On Pack Cards (16 cards per pack)
  | 'reverse_draw2'
  | 'double_reverse'
  | 'reverse_skip'
  | 'wild_reverse_all_skip'
  | 'stack_plus2'
  | 'stack_plus3'
  | 'stack_plus4'
  | 'wild_stack_x2'
  | 'wild_stack_transfer'
  | 'swap_target'
  | 'swap_rotate_all'
  | 'swap_random'
  | 'wild_blind_trade'
  | 'speed_burst'
  | 'speed_drop'
  | 'wild_reflex_race'
  | 'blitz_turn'
  | 'shield_deflect'
  | 'shield_block'
  | 'mirror_deflect'
  | 'wild_fortress'
  | 'comeback_boost'
  | 'underdog_relief'
  | 'robin_hood_balance'
  | 'wild_second_wind'
  | 'frenemy_alliance'
  | 'frenemy_betrayal'
  | 'wild_double_agent'
  // DOS Special Cards
  | 'wild_dos'
  | 'wild_number'
  // ONO 99 Cards
  | 'ono_minus10'
  | 'ono_hold'
  | 'ono_play2'
  | 'ono_99_dead';

export interface CardFace {
  color: HubCardColor;
  type: HubCardType;
  value?: number;
}

export interface HubCard {
  id: string;
  color: HubCardColor;
  type: HubCardType;
  value?: number;
  lightFace?: CardFace;
  darkFace?: CardFace;
  flexColor?: HubCardColor;
  flexType?: HubCardType;
  hasPowerFlip?: boolean;
  hasPassSymbol?: boolean;
  /** Liar's UNO: true = Liar's Card (always played face-down); false = Regular Card (face-up) */
  isLiarsCard?: boolean;
  /** Optional pack origin badge */
  packId?: AddOnPackId;
  /** Comeback Pack corner letter for U-N-O combo */
  unoLetter?: 'U' | 'N' | 'O';
}

export interface HubPlayer {
  id: string;
  name: string;
  isAI: boolean;
  connected?: boolean;
  hand: HubCard[];
  score: number;
  calledUno: boolean;
  powerActive?: boolean;
  eliminated?: boolean;
  teamId?: number;
  isOut?: boolean;
  /** ONO 99 lives/chips (starts at 3) */
  onoChips?: number;
  /** Defense Pack Wild Fortress immunity turns remaining */
  fortressTurns?: number;
}

export type PlayDirection = 1 | -1;

export type HubGamePhase =
  | 'playing'
  | 'pass_device'
  | 'choose_color'
  | 'choose_target'
  | 'choose_pass_card'
  | 'choose_roulette_color'
  | 'liar_challenge'
  | 'liars_wild_challenge'
  | 'flip_challenge'
  | 'flex_challenge'
  | 'party_wild4_challenge'
  | 'party_pile_up'
  | 'round_over'
  | 'game_over';

export type PendingPromptType =
  | 'color'
  | 'target_swap'
  | 'target_draw2'
  | 'target_draw4'
  | 'target_point_taken'
  | 'target_drawn_together'
  | 'target_alliance'
  | 'target_betrayal'
  | 'pass_to_partner'
  | 'roulette_color'
  | 'flex_choice'
  | 'liar_claim'
  | 'liars_wild_challenge'
  | 'flip_wild_challenge'
  | 'flex_wild4_challenge'
  | 'party_wild4_challenge';

export interface PendingPrompt {
  type: PendingPromptType;
  actorId: string;
  cardId?: string;
  pileIndex?: number;
  useFlex?: boolean;
  message: string;
}

export interface FlexChallengeState {
  actorId: string;
  actorName: string;
  challengerId: string;
  challengerName: string;
  chosenColor: HubCardColor;
  /** True if actor held a card matching previous activeColor OR another Wild card */
  actorWasGuilty: boolean;
}

export interface FlipChallengeState {
  actorId: string;
  actorName: string;
  challengerId: string;
  challengerName: string;
  cardType: 'wild_draw2' | 'wild_draw_color';
  chosenColor: HubCardColor;
  /** True if actor held a card matching the previous active color when playing the Wild Draw */
  actorWasGuilty: boolean;
}

export interface LiarClaimState {
  actorId: string;
  actorName: string;
  actualCard: HubCard;
  previousActiveColor: HubCardColor;
  claimedColor: HubCardColor;
  claimedType: HubCardType;
  claimedValue?: number;
  challengerId: string;
  /** If player declared 7, target swap player chosen or to be chosen */
  pendingSwapTargetId?: string;
  /** For 7's Swap / 0's Pass edge case: penalty card drawn AFTER swap/pass completes! */
  pendingPenaltyPlayerId?: string;
}

export interface WildLiarsChallengeState {
  actorId: string;
  actorName: string;
  chosenColor: HubCardColor;
  submissions: {
    playerId: string;
    playerName: string;
    card: HubCard;
    status: 'pending' | 'caught_lying' | 'honest_passed';
  }[];
}

export interface DosTurnState {
  matchedPileIndices: number[];
  matchedHandCards: HubCard[];
  pendingBonusDiscards: number;
  pendingOpponentDraws: number;
  mustDiscardToCenterIfNoMatch: boolean;
  stage: 'matching' | 'discard_to_center';
}

export interface HubEvent {
  id: string;
  type: string;
  message: string;
  timestamp: number;
}

export type WinConditionMode = 'classic_points' | 'quick_single' | 'elimination';

export interface HubRoundStanding {
  playerId: string;
  playerName: string;
  rank: number;
  status: 'finished' | 'active' | 'eliminated';
  score: number;
  handCount: number;
}

export interface VariantSettings {
  targetScore: number;
  singleRound: boolean;
  /** Custom Win Condition Mode: classic_points (500pt), quick_single (1 ronde), or elimination (3+ pemain) */
  winConditionMode?: WinConditionMode;
  /** Optional Mercy Rule toggle (eliminates player reaching mercyCardLimit cards) */
  mercyRuleEnabled?: boolean;
  /** Card limit for optional Mercy Rule (default: 25) */
  mercyCardLimit?: number;
  strictWildDraw4?: boolean;
  /** Optional Lobby House Rules: 7-0 Swap/Pass, Draw Stacking (+2/+4), and Jump-In */
  houseRuleSevenZero?: boolean;
  houseRuleStacking?: boolean;
  houseRuleJumpIn?: boolean;
  /** Enabled Add-On Expansion Packs */
  activePacks?: AddOnPackId[];
  /** UNO Flip alternative scoring option */
  flipScoringMode?: 'classic_500' | 'lowest_at_500';
  /** ONO 99 edition ('2022' official default vs 'classic_1980s') */
  ono99Edition?: '2022' | 'classic_1980s';
}

export interface HubRoundSummary {
  roundNumber: number;
  winnerId: string;
  winnerName: string;
  winnerTeamId?: number;
  pointsAwarded: number;
  playerPoints: {
    playerId: string;
    playerName: string;
    handPoints: number;
    totalScore: number;
    eliminated?: boolean;
  }[];
  reason: string;
  /** Ranked standings for Elimination Mode or Mercy Rule matches */
  finalStandings?: HubRoundStanding[];
}

export interface HubGameState {
  version: number;
  variantId: VariantId;
  mode: 'local' | 'ai' | 'online';
  phase: HubGamePhase;
  roundNumber: number;
  players: HubPlayer[];
  currentPlayerIndex: number;
  direction: PlayDirection;
  drawPile: HubCard[];
  discardPile: HubCard[];
  activeColor: HubCardColor;
  pendingDrawCount: number;
  pendingDrawMinValue?: number;
  flipSide: 'light' | 'dark';
  pendingPrompt?: PendingPrompt | null;
  unoVulnerablePlayerId?: string | null;
  hasDrawnThisTurn: boolean;
  settings: VariantSettings;
  roundHistory: HubRoundSummary[];
  actionLog: HubEvent[];
  lastEvent: HubEvent | null;
  winnerId: string | null;
  winnerTeamId?: number | null;
  teamScores?: Record<number, number>;
  startedAt: number;
  /** Frenemies Pack active alliances [playerA, playerB] */
  alliances?: [string, string][];
  /** UNO Party! Wild Pile Up active mini-pile */
  partyPileUp?: {
    cards: HubCard[];
    color: HubCardColor;
  } | null;
  /** UNO Party! Wild Drawn Together linked pair [playerA, playerB] */
  drawnTogetherPair?: [string, string] | null;
  /** Speed Pack / Party speed phase active */
  speedPhaseTurns?: number;
  /** UNO No Mercy separate pool for eliminated players' cards (reshuffled only when Draw Pile empties) */
  eliminatedCardsPool?: HubCard[];
  /** Extra consecutive turns remaining for current player (e.g. 2-player UNO All Wild Skip Two) */
  extraTurnsRemaining?: number;
  /** UNO Flip Wild Draw Two / Wild Draw Color Challenge state */
  flipChallenge?: FlipChallengeState | null;
  /** UNO Flex Wild Draw Four Regular-side Challenge state */
  flexChallenge?: FlexChallengeState | null;
  /** Newly drawn card ID that can be played immediately or passed */
  drawnPlayableCardId?: string | null;
  /** Liar's UNO pending bluff claim */
  liarClaim?: LiarClaimState | null;
  /** Liar's UNO active Wild Liar's Challenge phase */
  wildLiarsChallenge?: WildLiarsChallengeState | null;
  /** Liar's UNO effective top card claim when last played card stayed face-down */
  liarsTopClaim?: { color: HubCardColor; type: HubCardType; value?: number } | null;
  /** DOS Mode 2+ active center piles & strict turn-sequence state */
  dosCenterPiles?: HubCard[][];
  dosTurnState?: DosTurnState | null;
  /** ONO 99 running cumulative total, Play 2 forced plays remaining & last successful player */
  onoTotal?: number;
  onoMustPlayCount?: number;
  onoLastSuccessfulPlayerId?: string | null;
  /** Speed Pack Blitz Mode turns remaining & Wild Reflex Race active state */
  blitzTurnsRemaining?: number;
  reflexRaceActive?: { startedAt: number; tappedPlayerIds: string[]; secondsLeft: number } | null;
  /** Unified 7-Pack Global Trackers (Speed Level 1-3, Nemesis Link, Bounce Cap, Comeback U-N-O Progress) */
  speedLevel?: 1 | 2 | 3;
  chainBounces?: number;
  nemesisLink?: {
    hunterId: string;
    targetId: string;
    targetName: string;
    chargesLeft: number;
  } | null;
  comebackUnoProgress?: Record<string, ('U' | 'N' | 'O')[]>;
  /** Elimination Mode finish ranking [1st, 2nd, ...] */
  finishOrder?: string[];
  /** Mercy Rule elimination order */
  eliminatedOrder?: string[];
  /** Server-authoritative turn deadline epoch ms for online matches */
  turnDeadline?: number | null;
}

export interface HubOnlineLobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
  teamId?: number;
}

export interface HubOnlineSpectator {
  id: string;
  name: string;
  connected: boolean;
  queuedForNextRound: boolean;
}

export interface HubOnlineRoomInfo {
  code: string;
  hostId: string;
  variantId: Exclude<VariantId, 'uno-zero'>;
  settings: VariantSettings;
  fillWithBots: boolean;
  targetPlayerCount: number;
  started: boolean;
  players: HubOnlineLobbyPlayer[];
  spectators?: HubOnlineSpectator[];
}

export interface HubResolvePromptPayload {
  color?: HubCardColor;
  targetPlayerId?: string;
  secondTargetPlayerId?: string;
  passCardId?: string;
  useFlex?: boolean;
  textValue?: string;
  challengeChoice?: 'trust' | 'challenge';
}

export type HubOnlineAction =
  | { type: 'play_card'; move: MoveInput }
  | { type: 'draw_or_pass' }
  | { type: 'resolve_prompt'; payload: HubResolvePromptPayload }
  | { type: 'cancel_prompt' }
  | { type: 'call_uno' }
  | { type: 'catch_uno' }
  | { type: 'pass_after_draw' }
  | { type: 'challenge_liars' }
  | { type: 'speed_jump_in'; cardId: string }
  | { type: 'party_take_pile_up' }
  | { type: 'dos_finish_matching' }
  | { type: 'pack_comeback_uno_combo' }
  | { type: 'pack_reflex_race_tap' }
  | { type: 'next_round' }
  | { type: 'play_again' };

export interface MoveInput {
  cardId: string;
  /** Optional second cardId for DOS double-card addition */
  secondCardId?: string;
  chosenColor?: HubCardColor;
  targetPlayerId?: string;
  useFlex?: boolean;
  pileIndex?: number;
  /** Liar's UNO bluff claim */
  claimedColor?: HubCardColor;
  claimedType?: HubCardType;
  claimedValue?: number;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  requiresColor?: boolean;
  requiresTarget?: PendingPromptType;
  canUseFlex?: boolean;
}

export interface RulesetGuide {
  objective: string;
  players: string;
  components: string;
  setup: string;
  howToPlay: string[];
  specialCards: { name: string; effect: string }[];
  specialMechanics: string[];
  penalties: string[];
  scoring: string;
  winning: string;
  ruleClassification: {
    official: string;
    digitalAdaptation?: string;
    optionalHouseRules?: string;
  };
}

export interface VariantMetadata {
  id: VariantId;
  number: string;
  name: string;
  tagline: string;
  description: string;
  category: GameCategory;
  minPlayers: number;
  maxPlayers: number;
  estimatedDuration: string;
  difficulty: DifficultyLevel;
  status: VariantStatus;
  accentGradient: string;
  tableThemeClass: string;
  badgeText: string;
  isTeamGame?: boolean;
  isSpinoff?: boolean;
  defaultSettings: VariantSettings;
  guide: RulesetGuide;
}

export interface UnoRuleset {
  id: VariantId;
  createDeck(settings: VariantSettings): HubCard[];
  shuffleDeck(deck: HubCard[]): HubCard[];
  dealCards(
    deck: HubCard[],
    players: HubPlayer[],
    settings: VariantSettings
  ): { players: HubPlayer[]; remainingDeck: HubCard[] };
  initializeGame(
    players: { id: string; name: string; isAI: boolean; teamId?: number }[],
    mode: 'local' | 'ai' | 'online',
    settings: VariantSettings
  ): HubGameState;
  validateMove(state: HubGameState, playerId: string, move: MoveInput): ValidationResult;
  executeAction(state: HubGameState, playerId: string, move: MoveInput): HubGameState;
  advanceTurn(state: HubGameState, steps?: number): HubGameState;
  calculateScore(state: HubGameState, winnerId: string): number;
  checkWinCondition(state: HubGameState): HubGameState;
  resetRound(state: HubGameState): HubGameState;
  handleDrawOrPass(state: HubGameState, playerId: string): HubGameState;
  resolvePrompt(
    state: HubGameState,
    payload: {
      color?: HubCardColor;
      targetPlayerId?: string;
      secondTargetPlayerId?: string;
      passCardId?: string;
      useFlex?: boolean;
      textValue?: string;
      challengeChoice?: 'trust' | 'challenge';
    }
  ): HubGameState;
  decideAIMove(state: HubGameState):
    | { type: 'play'; move: MoveInput }
    | { type: 'draw' }
    | {
        type: 'resolve_prompt';
        payload: {
          color?: HubCardColor;
          targetPlayerId?: string;
          secondTargetPlayerId?: string;
          passCardId?: string;
          textValue?: string;
          challengeChoice?: 'trust' | 'challenge';
        };
      };
}
