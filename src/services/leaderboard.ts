import { getServerBaseUrl } from './onlineClient';

export interface LeaderboardEntry {
  playerName: string;
  wins: number;
  gamesPlayed: number;
  bestScore: number;
  totalScoreSum: number;
  avgScore: number;
  winRate: number;
  updatedAt: number;
}

export interface MatchResultPayload {
  playerName: string;
  score: number;
  won: boolean;
}

const LOCAL_LEADERBOARD_KEY = 'uno_zero_leaderboard_v1';

export function sortLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    if (a.avgScore !== b.avgScore) return a.avgScore - b.avgScore;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.bestScore - b.bestScore;
  });
}

export function loadLocalLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_LEADERBOARD_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LeaderboardEntry[];
    return Array.isArray(parsed) ? sortLeaderboard(parsed) : [];
  } catch {
    return [];
  }
}

export function recordLocalMatchResults(results: MatchResultPayload[]): LeaderboardEntry[] {
  const existing = loadLocalLeaderboard();
  const map = new Map<string, LeaderboardEntry>();
  for (const item of existing) {
    map.set(item.playerName.toLowerCase(), item);
  }

  const now = Date.now();
  for (const r of results) {
    const cleanName = r.playerName.trim();
    if (!cleanName) continue;
    const key = cleanName.toLowerCase();
    const prev = map.get(key);

    if (prev) {
      const gamesPlayed = prev.gamesPlayed + 1;
      const wins = prev.wins + (r.won ? 1 : 0);
      const totalScoreSum = prev.totalScoreSum + r.score;
      const bestScore = Math.min(prev.bestScore, r.score);
      map.set(key, {
        playerName: cleanName,
        wins,
        gamesPlayed,
        bestScore,
        totalScoreSum,
        avgScore: Math.round((totalScoreSum / gamesPlayed) * 10) / 10,
        winRate: Math.round((wins / gamesPlayed) * 100),
        updatedAt: now,
      });
    } else {
      map.set(key, {
        playerName: cleanName,
        wins: r.won ? 1 : 0,
        gamesPlayed: 1,
        bestScore: r.score,
        totalScoreSum: r.score,
        avgScore: r.score,
        winRate: r.won ? 100 : 0,
        updatedAt: now,
      });
    }
  }

  const updated = sortLeaderboard(Array.from(map.values()));
  try {
    localStorage.setItem(LOCAL_LEADERBOARD_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage error
  }
  return updated;
}

export async function fetchGlobalLeaderboard(): Promise<{
  entries: LeaderboardEntry[];
  online: boolean;
}> {
  try {
    const res = await fetch(`${getServerBaseUrl()}/api/leaderboard`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error('HTTP error');
    const data = (await res.json()) as { entries: LeaderboardEntry[] };
    return { entries: sortLeaderboard(data.entries ?? []), online: true };
  } catch {
    return { entries: loadLocalLeaderboard(), online: false };
  }
}

export async function submitGlobalMatchResults(results: MatchResultPayload[]): Promise<void> {
  recordLocalMatchResults(results);
  try {
    await fetch(`${getServerBaseUrl()}/api/leaderboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // Offline fallback already saved
  }
}
