import { sanitizeAddOnPacksForVariant } from './expansions/addOnPacks';
import { HubGameState, VariantId, VariantSettings } from './types';

const SCHEMA_VERSION = 1;
const HUB_PREFS_KEY = 'uno_hub_v1_preferences';

export interface HubPreferences {
  version: number;
  lastPlayedVariant?: VariantId;
  favoriteVariants: VariantId[];
  defaultPlayerName: string;
  soundEnabled: boolean;
  animationsEnabled: boolean;
  colorblindMode: boolean;
}

export interface VariantMatchHistoryItem {
  id: string;
  variantId: VariantId;
  winnerName: string;
  players: { name: string; score: number }[];
  rounds: number;
  completedAt: number;
}

const DEFAULT_PREFS: HubPreferences = {
  version: SCHEMA_VERSION,
  favoriteVariants: ['uno-zero', 'uno-classic'],
  defaultPlayerName: 'Pemain 1',
  soundEnabled: true,
  animationsEnabled: true,
  colorblindMode: false,
};

function saveKey(variantId: VariantId): string {
  return `uno_hub_v1_save_${variantId}`;
}

function historyKey(variantId: VariantId): string {
  return `uno_hub_v1_history_${variantId}`;
}

function settingsKey(variantId: VariantId): string {
  return `uno_hub_v1_settings_${variantId}`;
}

export function loadHubPreferences(): HubPreferences {
  try {
    const raw = localStorage.getItem(HUB_PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<HubPreferences>;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      version: SCHEMA_VERSION,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveHubPreferences(prefs: HubPreferences): void {
  try {
    localStorage.setItem(HUB_PREFS_KEY, JSON.stringify({ ...prefs, version: SCHEMA_VERSION }));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('uno-hub-prefs-changed'));
    }
  } catch {
    // ignore quota error
  }
}

export function loadVariantSave(variantId: VariantId): HubGameState | null {
  try {
    const raw = localStorage.getItem(saveKey(variantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HubGameState;
    if (!parsed || parsed.version !== SCHEMA_VERSION || parsed.variantId !== variantId) {
      return null;
    }
    if (!Array.isArray(parsed.players) || parsed.players.length < 2) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveVariantGame(state: HubGameState): void {
  try {
    localStorage.setItem(
      saveKey(state.variantId),
      JSON.stringify({ ...state, version: SCHEMA_VERSION })
    );
  } catch {
    // ignore quota error
  }
}

export function clearVariantSave(variantId: VariantId): void {
  try {
    localStorage.removeItem(saveKey(variantId));
    if (variantId === 'uno-zero') {
      localStorage.removeItem('uno_zero_golf_saved_game_v2');
    }
  } catch {
    // ignore
  }
}

export function hasVariantSave(variantId: VariantId): boolean {
  if (variantId === 'uno-zero') {
    try {
      return Boolean(localStorage.getItem('uno_zero_golf_saved_game_v2'));
    } catch {
      return false;
    }
  }
  return loadVariantSave(variantId) !== null;
}

export function loadVariantSettings(variantId: VariantId, fallback: VariantSettings): VariantSettings {
  try {
    const raw = localStorage.getItem(settingsKey(variantId));
    if (!raw) {
      return {
        ...fallback,
        activePacks: sanitizeAddOnPacksForVariant(variantId, fallback.activePacks),
      };
    }
    const parsed = JSON.parse(raw) as Partial<VariantSettings>;
    const merged = { ...fallback, ...parsed };
    return {
      ...merged,
      activePacks: sanitizeAddOnPacksForVariant(variantId, merged.activePacks),
    };
  } catch {
    return {
      ...fallback,
      activePacks: sanitizeAddOnPacksForVariant(variantId, fallback.activePacks),
    };
  }
}

export function saveVariantSettings(variantId: VariantId, settings: VariantSettings): void {
  try {
    const sanitized: VariantSettings = {
      ...settings,
      activePacks: sanitizeAddOnPacksForVariant(variantId, settings.activePacks),
    };
    localStorage.setItem(settingsKey(variantId), JSON.stringify(sanitized));
  } catch {
    // ignore
  }
}

export function loadVariantHistory(variantId: VariantId): VariantMatchHistoryItem[] {
  try {
    const raw = localStorage.getItem(historyKey(variantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordVariantMatchHistory(item: VariantMatchHistoryItem): void {
  try {
    const existing = loadVariantHistory(item.variantId);
    const updated = [item, ...existing].slice(0, 30);
    localStorage.setItem(historyKey(item.variantId), JSON.stringify(updated));
  } catch {
    // ignore
  }
}
