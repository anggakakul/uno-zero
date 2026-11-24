export type CardColor = 'red' | 'yellow' | 'green' | 'blue';

export type CardType = 'number' | 'skip' | 'reverse' | 'draw2' | 'double_draw2';

export interface Card {
  id: string;
  type: CardType;
  color: CardColor;
  /** 0-6 for number cards in official Mattel UNO Zero */
  value?: number;
}

export interface GridSlot {
  /** Null when sanitized by online server for face-down anti-cheat protection */
  card: Card | null;
  faceUp: boolean;
}

export interface GridColumn {
  id: string;
  top: GridSlot | null;
  bottom: GridSlot | null;
}

export type SlotPosition = 'top' | 'bottom';

export type GameMode = 'local' | 'ai' | 'online';

export interface DeckConfig {
  /** Number cards 0-6 per color (official: 3 of each 0-6 per color = 84 cards) */
  numbersPerColor: number;
  skipsPerColor: number;
  reversesPerColor: number;
  draw2PerColor: number;
  doubleDraw2PerColor: number;
}

export type ReverseTwoPlayerRule = 'reverse_only' | 'act_as_skip';

export interface HouseRules {
  reverseInTwoPlayers: ReverseTwoPlayerRule;
}

export const OFFICIAL_ACTION_CARD_POINTS = {
  reverse: 10,
  skip: 11,
  draw2: 12,
  double_draw2: 22,
} as const;

export interface GameConfig {
  /** Official Mattel UNO Zero Golf-style game runs for 9 rounds (or 3/5 quick mode) */
  totalRounds: number;
  deckConfig: DeckConfig;
  houseRules: HouseRules;
}

export interface Player {
  id: string;
  name: string;
  isAI?: boolean;
  connected?: boolean;
  /** Starts as 3 columns x 2 rows (2x3 = 6 face-down cards). Eliminated columns are removed cleanly; Draw Two/UNO penalty appends new columns on the right. */
  columns: GridColumn[];
  totalScore: number;
  hasFlippedInitial: boolean;
  hasCalledUno: boolean;
  eliminatedColumnsThisRound: number;
  extraColumnsThisRound: number;
}

export interface RoundPlayerScore {
  playerId: string;
  playerName: string;
  points: number;
  remainingCards: Card[];
  eliminatedColumnsCount: number;
  extraColumnsAdded: number;
  cumulativeTotal: number;
}

export interface RoundRecord {
  roundNumber: number;
  triggerPlayerId: string;
  triggerPlayerName: string;
  lowestRoundPlayerId: string;
  scores: RoundPlayerScore[];
  completedAt: number;
}

export type ActionEventType =
  | 'info'
  | 'draw'
  | 'swap'
  | 'discard'
  | 'flip'
  | 'column_match'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'double_draw2'
  | 'uno_call'
  | 'uno_penalty'
  | 'round_end'
  | 'game_win'
  | 'reshuffle'
  | 'timeout';

export interface ActionEvent {
  id: string;
  type: ActionEventType;
  message: string;
  actorName?: string;
  targetName?: string;
  timestamp: number;
}

export interface UnoVulnerability {
  playerId: string;
  playerName: string;
  createdAt: number;
}

export type GamePhase =
  | 'setup'
  | 'initial_flip'
  | 'playing'
  | 'choose_double_draw2_target'
  | 'round_over'
  | 'game_over';

export type TurnStep =
  | 'choose_source'
  | 'resolve_drawn'
  | 'must_flip';

export type PlayDirection = 1 | -1;

export interface GameState {
  phase: GamePhase;
  turnStep: TurnStep;
  config: GameConfig;
  players: Player[];
  dealerIndex: number;
  currentPlayerIndex: number;
  direction: PlayDirection;
  roundNumber: number;
  drawPile: Card[];
  /** Used in sanitized online state where drawPile array is stripped for anti-cheat */
  drawPileCount?: number;
  discardPile: Card[];
  /** Card currently held by active player during resolve_drawn (null for other online viewers if drawn from Draw Pile) */
  drawnCard: Card | null;
  drawnFrom: 'draw' | 'discard' | null;
  /** True when online viewer knows active player holds a hidden drawn card */
  hasHiddenDrawnCard?: boolean;
  pendingDiscardedAction: Card | null;
  unoArmed: boolean;
  unoVulnerability: UnoVulnerability | null;
  roundHistory: RoundRecord[];
  actionLog: ActionEvent[];
  lastEvent: ActionEvent | null;
  winnerIds: string[];
  /** Optional epoch ms deadline for online 20s turn timer */
  turnDeadline?: number | null;
}

export interface OnlineLobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
}

export interface OnlineRoomInfo {
  code: string;
  hostId: string;
  totalRounds: number;
  started: boolean;
  players: OnlineLobbyPlayer[];
}

export const CARD_COLORS: CardColor[] = ['red', 'yellow', 'green', 'blue'];

export const COLOR_LABELS_ID: Record<CardColor, string> = {
  red: 'Merah',
  yellow: 'Kuning',
  green: 'Hijau',
  blue: 'Biru',
};

/**
 * Official 112-card UNO Zero deck:
 * - Numbers 0-6: 3 per number per color = 7 * 3 * 4 = 84 cards
 * - Action cards: 2 Skip + 2 Reverse + 2 Draw Two + 1 Double Draw Two per color = 7 * 4 = 28 cards
 * Total = 84 + 28 = 112 cards
 */
export const DEFAULT_DECK_CONFIG: DeckConfig = {
  numbersPerColor: 3,
  skipsPerColor: 2,
  reversesPerColor: 2,
  draw2PerColor: 2,
  doubleDraw2PerColor: 1,
};

export const DEFAULT_HOUSE_RULES: HouseRules = {
  reverseInTwoPlayers: 'reverse_only',
};

export const DEFAULT_GAME_CONFIG: GameConfig = {
  totalRounds: 9,
  deckConfig: DEFAULT_DECK_CONFIG,
  houseRules: DEFAULT_HOUSE_RULES,
};
