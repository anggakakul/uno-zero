import fs from 'node:fs';
import path from 'node:path';

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

export interface MatchResultInput {
  playerName: string;
  score: number;
  won: boolean;
}

const LEADERBOARD_FILE = path.resolve(process.cwd(), 'server', 'leaderboard.json');

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, '') ?? '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const useSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);

function sortEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    if (a.avgScore !== b.avgScore) return a.avgScore - b.avgScore;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.bestScore - b.bestScore;
  });
}

function readLocalFile(): LeaderboardEntry[] {
  try {
    if (!fs.existsSync(LEADERBOARD_FILE)) return [];
    const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as LeaderboardEntry[];
    return Array.isArray(parsed) ? sortEntries(parsed) : [];
  } catch {
    return [];
  }
}

function writeLocalFile(entries: LeaderboardEntry[]): void {
  try {
    fs.mkdirSync(path.dirname(LEADERBOARD_FILE), { recursive: true });
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(entries, null, 2), 'utf-8');
  } catch {
    // Ignore local write error in read-only cloud containers
  }
}

interface SupabaseRow {
  player_key: string;
  player_name: string;
  wins: number;
  games_played: number;
  best_score: number;
  total_score_sum: number;
  avg_score: number;
  win_rate: number;
  updated_at: string;
}

function rowToEntry(row: SupabaseRow): LeaderboardEntry {
  return {
    playerName: row.player_name,
    wins: row.wins,
    gamesPlayed: row.games_played,
    bestScore: row.best_score,
    totalScoreSum: row.total_score_sum,
    avgScore: Number(row.avg_score),
    winRate: row.win_rate,
    updatedAt: new Date(row.updated_at).getTime() || Date.now(),
  };
}

export async function getGlobalLeaderboard(): Promise<{
  entries: LeaderboardEntry[];
  storage: 'supabase' | 'file';
}> {
  if (useSupabase) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/uno_zero_leaderboard?select=*&order=avg_score.asc,wins.desc,best_score.asc&limit=50`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          signal: AbortSignal.timeout(5000),
        }
      );
      if (!res.ok) throw new Error(`Supabase GET ${res.status}`);
      const rows = (await res.json()) as SupabaseRow[];
      return { entries: sortEntries(rows.map(rowToEntry)), storage: 'supabase' };
    } catch (err) {
      console.error('[Leaderboard] Supabase read failed, falling back to local file:', err);
    }
  }
  return { entries: readLocalFile(), storage: 'file' };
}

export async function recordGlobalLeaderboard(
  results: MatchResultInput[]
): Promise<LeaderboardEntry[]> {
  const { entries: existing } = await getGlobalLeaderboard();
  const map = new Map<string, LeaderboardEntry>();
  for (const e of existing) {
    map.set(e.playerName.toLowerCase(), e);
  }

  const now = Date.now();
  const upserts: SupabaseRow[] = [];

  for (const r of results) {
    const clean = r.playerName?.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    const prev = map.get(key);

    const gamesPlayed = (prev?.gamesPlayed ?? 0) + 1;
    const wins = (prev?.wins ?? 0) + (r.won ? 1 : 0);
    const totalScoreSum = (prev?.totalScoreSum ?? 0) + r.score;
    const bestScore = prev ? Math.min(prev.bestScore, r.score) : r.score;
    const avgScore = Math.round((totalScoreSum / gamesPlayed) * 10) / 10;
    const winRate = Math.round((wins / gamesPlayed) * 100);

    const nextEntry: LeaderboardEntry = {
      playerName: clean,
      wins,
      gamesPlayed,
      bestScore,
      totalScoreSum,
      avgScore,
      winRate,
      updatedAt: now,
    };
    map.set(key, nextEntry);

    upserts.push({
      player_key: key,
      player_name: clean,
      wins,
      games_played: gamesPlayed,
      best_score: bestScore,
      total_score_sum: totalScoreSum,
      avg_score: avgScore,
      win_rate: winRate,
      updated_at: new Date(now).toISOString(),
    });
  }

  const sorted = sortEntries(Array.from(map.values()));

  if (useSupabase && upserts.length > 0) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/uno_zero_leaderboard?on_conflict=player_key`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify(upserts),
          signal: AbortSignal.timeout(5000),
        }
      );
      if (!res.ok) throw new Error(`Supabase UPSERT ${res.status}`);
    } catch (err) {
      console.error('[Leaderboard] Supabase upsert failed, saved to local fallback:', err);
      writeLocalFile(sorted);
    }
  } else {
    writeLocalFile(sorted);
  }

  return sorted;
}
