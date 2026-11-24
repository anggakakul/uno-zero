export type VariantId =
  | 'uno-zero'
  | 'uno-classic'
  | 'uno-flip'
  | 'uno-flex'
  | 'uno-all-wild'
  | 'uno-no-mercy'
  | 'uno-teams'
  | 'uno-attack'
  | 'uno-triple-play'
  | 'uno-junior'
  | 'uno-party'
  | 'uno-golf'
  | 'uno-liars'
  | 'uno-house-remix'
  | 'uno-dare-emoji'
  | 'uno-express'
  | 'uno-rummy-up'
  | 'uno-hearts'
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

export type DigitalToolId =
  | 'uno-spin'
  | 'uno-tippo'
  | 'uno-jackpot'
  | 'uno-power-grab'
  | 'uno-roboto-flash'
  | 'uno-blast';

export type GameCategory =
  | 'CLASSIC UNO'
  | 'STRATEGY UNO'
  | 'ACTION UNO'
  | 'TEAM UNO'
  | 'FAMILY UNO'
  | 'SPECIAL UNO'
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
  | 'double_draw2'
  | 'draw4'
  | 'draw5'
  | 'draw6'
  | 'draw10'
  | 'hit2'
  | 'discard_all'
  | 'discard_two'
  | 'flip'
  | 'clear'
  | 'wild'
  | 'wild_clear'
  | 'wild_give_away'
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
  | 'wild_attack_attack'
  | 'wild_hit4'
  | 'trade_hands'
  | 'wild_all_hit'
  | 'wild_hit_fire'
  | 'flex_skip'
  | 'flex_reverse'
  | 'flex_draw2'
  // New Mode Cards
  | 'point_taken'
  | 'drawn_together'
  | 'wild_pile_up'
  | 'wild_liars_challenge'
  | 'wild_express_swap'
  | 'wild_skip_all'
  | 'hazard5'
  | 'wild_shift'
  | 'tactical_swap'
  | 'wild_game_changer'
  | 'add_a_rule'
  | 'dare_card'
  | 'wild_dare'
  | 'wild_emoji'
  | 'wild_customizable'
  | 'emoji_card'
  // Digital Tool Cards
  | 'spin_card'
  | 'jackpot_card'
  | 'power_grab'
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
  // DOS & Rummy Special Cards
  | 'wild_dos'
  | 'wild_number'
  | 'wild_rummy'
  // ONO 99 Cards
  | 'ono_minus10'
  | 'ono_hold'
  | 'ono_play2'
  | 'ono_99_dead';

export interface CardFace {
  color: HubCardColor;
  type: HubCardType;
  value?: number;
  animal?: string;
  animalName?: string;
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
  /** UNO House Rules: speech bubble icon indicating Add-a-Rule trigger number */
  hasRuleBubble?: boolean;
  /** UNO Dare! & Emoji: dare number (1-10) & emoji face metadata */
  dareNumber?: number;
  emoji?: string;
  emojiLabel?: string;
  /** UNO Rummy-Up: true once a Word/Wild tile has settled on the table (effect inactive thereafter) */
  rummyEffectConsumed?: boolean;
  animal?: string;
  animalName?: string;
  /** Optional Remix Legacy modification label */
  remixTag?: string;
  /** Optional pack origin badge */
  packId?: AddOnPackId;
  /** Comeback Pack corner letter for U-N-O combo */
  unoLetter?: 'U' | 'N' | 'O';
  /** Optional tool origin badge */
  toolId?: DigitalToolId;
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
  /** UNO Golf grid (6 slots) */
  golfSlots?: { card: HubCard; faceUp: boolean }[];
  /** UNO Hearts tricks penalty points this round */
  heartsPenalty?: number;
  /** UNO Hearts collected cards this round (for Shooting the Moon check) */
  heartsCollected?: HubCard[];
  /** ONO 99 lives/chips (starts at 3) */
  onoChips?: number;
  /** UNO Rummy-Up whether player completed initial >= 15pt meld */
  hasOpenedMeld?: boolean;
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
  | 'golf_double_draw2'
  | 'dare_prompt'
  | 'wild_dare_pick'
  | 'wild_emoji_pick'
  | 'wild_custom_rule'
  | 'add_rule_prompt'
  | 'house_rule_qte'
  | 'house_wild4_challenge'
  | 'house_game_changer'
  | 'rummy_choose_effect'
  | 'remix_upgrade'
  | 'round_over'
  | 'game_over';

export type PendingPromptType =
  | 'color'
  | 'target_swap'
  | 'target_draw2'
  | 'target_draw4'
  | 'target_attack'
  | 'target_give_away'
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
  | 'party_wild4_challenge'
  | 'golf_double_draw2'
  | 'dare_action'
  | 'wild_dare_pick'
  | 'wild_emoji_pick'
  | 'wild_custom_rule'
  | 'add_rule'
  | 'house_wild4_challenge'
  | 'house_game_changer'
  | 'rummy_choose_effect'
  | 'remix_pick';

export interface PendingPrompt {
  type: PendingPromptType;
  actorId: string;
  cardId?: string;
  pileIndex?: number;
  useFlex?: boolean;
  message: string;
}

export interface TriplePlayPile {
  id: number;
  cards: HubCard[];
  activeColor: HubCardColor;
  lit: boolean;
  pressure: number;
  overloadThreshold: number;
}

export interface AttackLauncherResult {
  triggeredBy: string;
  cardsLaunched: number;
  presses: number;
  halfStuck?: boolean;
  timestamp: number;
}

export interface DigitalToolState {
  /** UNO Spin last wheel outcome */
  lastSpin?: { label: string; effect: string; timestamp: number } | null;
  /** UNO Tippo 2-side balance weights & secret tipping threshold (5-8) */
  tippoLeftWeight: number;
  tippoRightWeight: number;
  tippoThreshold?: number;
  tippoTippedBy?: string | null;
  /** UNO Wild Jackpot 3-reel result */
  lastJackpot?: { reels: [string, string, string]; outcome: string; timestamp: number } | null;
  /** UNO Power Grab current token holder playerId & 4-Relic U-N-O-! map */
  powerHolderId?: string | null;
  powerRelics?: Record<'U' | 'N' | 'O' | '!', string | null>;
  /** UNO Roboto active sudden rule */
  robotoRule?: { targetName: string; ruleText: string; timestamp: number } | null;
  /** UNO Flash reflex prompt */
  flashActive?: { targetPlayerId: string; secondsLeft: number } | null;
  /** UNO Blast extreme No Mercy Attack toggle */
  blastNoMercyExtreme?: boolean;
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

export interface HouseRuleSlot {
  slotIndex: number;
  triggerNumber: number;
  title: string;
  actionLabel: string;
  createdBy: string;
}

export interface ActiveRuleQTE {
  rule: HouseRuleSlot;
  triggeredBy: string;
  completedPlayerIds: string[];
  startedAt: number;
}

export interface HouseRemixConfig {
  stackingMode: 'off' | 'same_type' | 'mixed';
  reverseOnDraw: boolean;
  zeroHandSwapMode: 'off' | 'pass_left' | 'choose_target';
  multiCardPlay: boolean;
  speedJumpIn: boolean;
  maxHouseRules: number;
}

export interface AITrackingMemory {
  colorPlayCounts: Record<string, Partial<Record<HubCardColor, number>>>;
  colorDrawFailures: Record<string, Partial<Record<HubCardColor, number>>>;
}

export type DareCategory = 'family' | 'showoff' | 'daredevil' | 'custom';

export interface DarePromptState {
  targetId: string;
  targetName: string;
  dareNumber: number;
  dareText: string;
  penaltyDraw: number;
  /** True if target also has active Emoji Hold (Combo Lock: fail = +4 cards!) */
  comboLock?: boolean;
}

export interface EmojiChallengeState {
  targetId: string;
  targetName: string;
  emoji: string;
  label: string;
  maintained: boolean;
}

export interface RummyMeld {
  id: string;
  ownerName: string;
  kind: 'set' | 'run' | 'starting_single';
  cards: HubCard[];
}

export interface RummyTurnTransaction {
  actorId: string;
  snapshotMelds: RummyMeld[];
  snapshotHand: HubCard[];
  rackTileIdsPlayed: string[];
  pendingSubstitutedWildIds: string[];
  triggeredActionTiles: HubCard[];
}

export interface DosTurnState {
  matchedPileIndices: number[];
  matchedHandCards: HubCard[];
  pendingBonusDiscards: number;
  pendingOpponentDraws: number;
  mustDiscardToCenterIfNoMatch: boolean;
  stage: 'matching' | 'discard_to_center';
}

export interface HeartsTrickPlay {
  playerId: string;
  playerName: string;
  card: HubCard;
}

export interface HubEvent {
  id: string;
  type: string;
  message: string;
  timestamp: number;
}

export interface VariantSettings {
  targetScore: number;
  singleRound: boolean;
  strictWildDraw4?: boolean;
  triplePlayMode?: 'regular' | 'timer';
  triplePlayScoringMode?: 'classic_500' | 'lowest_at_500';
  triplePlayPartyRules?: boolean;
  juniorLevel?: 'beginner' | 'intermediate' | 'advanced';
  attackIntensity?: 'mild' | 'official' | 'chaos';
  attackDeckMode?: 'standard' | 'classic';
  attackScoringMode?: 'classic_500' | 'lowest_at_500';
  /** Enabled Add-On Expansion Packs */
  activePacks?: AddOnPackId[];
  /** Enabled Digital Table Tools */
  activeTools?: DigitalToolId[];
  /** Enable extreme No Mercy Blast */
  blastExtreme?: boolean;
  /** UNO Flip alternative scoring option */
  flipScoringMode?: 'classic_500' | 'lowest_at_500';
  /** UNO House Rules & Remix lobby toggle settings */
  houseRemixConfig?: Partial<HouseRemixConfig>;
  /** UNO Dare! & Emoji active Dare List category */
  dareCategory?: DareCategory;
  /** UNO Express deck & mode options */
  expressDeckMode?: 'classic_56' | 'plus_60';
  expressScoringMode?: 'points_250' | 'points_100' | 'first_to_3' | 'knockout_sprint';
  expressStacking?: boolean;
  expressTurboMatch?: boolean;
  /** UNO Rummy-Up scoring mode */
  rummyScoringMode?: 'points_200' | 'casual_2_rounds' | 'casual_4_rounds';
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
  triplePiles?: TriplePlayPile[];
  turnTimerSeconds?: number;
  lastAttackResult?: AttackLauncherResult | null;
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
  /** Digital Table Tools runtime state */
  toolState?: DigitalToolState;
  /** Frenemies Pack active alliances [playerA, playerB] */
  alliances?: [string, string][];
  /** UNO Party! Wild Pile Up active mini-pile */
  partyPileUp?: {
    cards: HubCard[];
    color: HubCardColor;
  } | null;
  /** UNO Golf currently held drawn/picked card waiting for swap or discard */
  golfDrawnCard?: {
    card: HubCard;
    source: 'draw' | 'discard';
  } | null;
  /** UNO Party! Wild Drawn Together linked pair [playerA, playerB] */
  drawnTogetherPair?: [string, string] | null;
  /** Speed Pack / Party speed phase active */
  speedPhaseTurns?: number;
  /** UNO House Rules active rules list */
  activeHouseRules?: string[];
  /** UNO House Rules structured 5-slot rule tracker */
  houseRuleSlots?: HouseRuleSlot[];
  /** UNO House Rules active QTE reaction challenge */
  activeRuleQTE?: ActiveRuleQTE | null;
  /** UNO House Rules & Remix resolved lobby config */
  houseRemixConfig?: HouseRemixConfig;
  /** Strategic AI tracking memory (color plays & draw failures per opponent) */
  aiMemory?: AITrackingMemory;
  /** UNO Remix Legacy permanent card modifiers across rounds */
  remixModifiers?: { cardTypeOrValue: string; bonusEffect: string }[];
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
  /** UNO Dare! active dare prompt */
  darePrompt?: DarePromptState | null;
  /** UNO Emoji active expression reflex challenge */
  emojiChallenge?: EmojiChallengeState | null;
  /** UNO Rummy-Up table melds & active turn transaction */
  rummyMelds?: RummyMeld[];
  rummyTransaction?: RummyTurnTransaction | null;
  /** UNO Hearts current trick plays & lead color */
  heartsTrick?: HeartsTrickPlay[];
  heartsLeadColor?: HubCardColor | null;
  heartsTrickReversed?: boolean;
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

export interface HubOnlineRoomInfo {
  code: string;
  hostId: string;
  variantId: Exclude<VariantId, 'uno-zero'>;
  settings: VariantSettings;
  fillWithBots: boolean;
  targetPlayerCount: number;
  started: boolean;
  players: HubOnlineLobbyPlayer[];
}

export interface HubResolvePromptPayload {
  color?: HubCardColor;
  targetPlayerId?: string;
  secondTargetPlayerId?: string;
  passCardId?: string;
  useFlex?: boolean;
  textValue?: string;
  challengeChoice?: 'trust' | 'challenge' | 'complete_dare' | 'skip_dare';
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
  | { type: 'golf_take_draw' }
  | { type: 'golf_take_discard' }
  | { type: 'golf_discard_drawn' }
  | { type: 'dos_finish_matching' }
  | { type: 'rummy_play_meld' }
  | { type: 'rummy_commit_turn' }
  | { type: 'rummy_revert_turn' }
  | { type: 'house_complete_qte' }
  | { type: 'dare_maintain_emoji' }
  | { type: 'dare_break_emoji' }
  | { type: 'tool_flash_reflex' }
  | { type: 'tool_overcharge_blast'; level: 1 | 2 | 3 }
  | { type: 'pack_comeback_uno_combo' }
  | { type: 'pack_reflex_race_tap' }
  | { type: 'next_round' }
  | { type: 'play_again' };

export interface MoveInput {
  cardId: string;
  /** Optional second cardId for DOS double-card addition */
  secondCardId?: string;
  /** Optional extra identical cardIds for Multi-Card Play (UNO House Rules & Remix) */
  extraCardIds?: string[];
  /** Optional multiple cardIds for Rummy-Up meld */
  meldCardIds?: string[];
  chosenColor?: HubCardColor;
  targetPlayerId?: string;
  useFlex?: boolean;
  pileIndex?: number;
  /** Tippo side choice ('left' | 'right') */
  tippoSide?: 'left' | 'right';
  /** Liar's UNO bluff claim */
  claimedColor?: HubCardColor;
  claimedType?: HubCardType;
  claimedValue?: number;
  /** Golf slot index to swap */
  golfSlotIndex?: number;
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
      challengeChoice?: 'trust' | 'challenge' | 'complete_dare' | 'skip_dare';
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
          challengeChoice?: 'trust' | 'challenge' | 'complete_dare' | 'skip_dare';
        };
      };
}
