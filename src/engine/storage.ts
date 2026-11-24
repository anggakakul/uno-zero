import { DEFAULT_GAME_CONFIG, GameConfig, GameState } from '../types/game';

const CONFIG_KEY = 'uno_zero_golf_config_v2';
const GAME_STATE_KEY = 'uno_zero_golf_saved_game_v2';

export function loadSavedConfig(): GameConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_GAME_CONFIG;
    const parsed = JSON.parse(raw) as Partial<GameConfig>;
    return {
      totalRounds:
        typeof parsed.totalRounds === 'number' && parsed.totalRounds >= 1 && parsed.totalRounds <= 18
          ? parsed.totalRounds
          : DEFAULT_GAME_CONFIG.totalRounds,
      deckConfig: {
        ...DEFAULT_GAME_CONFIG.deckConfig,
        ...(parsed.deckConfig ?? {}),
      },
      houseRules: {
        ...DEFAULT_GAME_CONFIG.houseRules,
        ...(parsed.houseRules ?? {}),
      },
    };
  } catch {
    return DEFAULT_GAME_CONFIG;
  }
}

export function saveConfig(config: GameConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadSavedGame(): GameState | null {
  try {
    const raw = localStorage.getItem(GAME_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (
      !parsed ||
      !Array.isArray(parsed.players) ||
      parsed.players.length < 2 ||
      !Array.isArray(parsed.players[0]?.columns)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(GAME_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearSavedGame(): void {
  try {
    localStorage.removeItem(GAME_STATE_KEY);
  } catch {
    // Ignore
  }
}
