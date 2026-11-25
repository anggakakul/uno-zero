-- ============================================================================
-- UNO GAME HUB (uno-zero) - Production Supabase Schema with Strict RLS
-- Jalankan SQL ini di Supabase SQL Editor.
-- ============================================================================

-- 1. Player Profiles (Guest Login berbasis session_id yang bisa di-upgrade ke Supabase Auth)
create table if not exists public.player_profiles (
  id uuid primary key default gen_random_uuid(),
  guest_session_id text unique,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  display_name text not null check (char_length(trim(display_name)) between 1 and 24),
  colorblind_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_player_profiles_guest
  on public.player_profiles (guest_session_id);

alter table public.player_profiles enable row level security;

drop policy if exists "Public read player profiles" on public.player_profiles;
create policy "Public read player profiles"
  on public.player_profiles for select
  using (true);

drop policy if exists "Users manage own authenticated profile" on public.player_profiles;
create policy "Users manage own authenticated profile"
  on public.player_profiles for update
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

-- 2. Match History (Riwayat pertandingan lintas 11 mode UNO)
create table if not exists public.match_history (
  id uuid primary key default gen_random_uuid(),
  variant_id text not null,
  mode text not null check (mode in ('ai', 'local', 'online')),
  winner_name text not null,
  players_json jsonb not null default '[]'::jsonb,
  rounds integer not null default 1 check (rounds >= 1),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  completed_at timestamptz not null default now()
);

create index if not exists idx_match_history_variant_recent
  on public.match_history (variant_id, completed_at desc);

alter table public.match_history enable row level security;

drop policy if exists "Public read match history" on public.match_history;
create policy "Public read match history"
  on public.match_history for select
  using (true);

-- Insert/Update/Delete pada match_history hanya melalui service_role (backend authoritative).

-- 3. Global Leaderboard (UNO ZERO & Hub)
create table if not exists public.uno_zero_leaderboard (
  player_key text primary key,
  player_name text not null,
  wins integer not null default 0 check (wins >= 0),
  games_played integer not null default 0 check (games_played >= 0),
  best_score integer not null default 0 check (best_score >= 0),
  total_score_sum integer not null default 0 check (total_score_sum >= 0),
  avg_score numeric(6,1) not null default 0,
  win_rate integer not null default 0 check (win_rate between 0 and 100),
  updated_at timestamptz not null default now()
);

create index if not exists idx_uno_zero_leaderboard_rank
  on public.uno_zero_leaderboard (avg_score asc, wins desc, best_score asc);

alter table public.uno_zero_leaderboard enable row level security;

-- Hapus policy insert/update publik yang terlalu permisif jika pernah dibuat sebelumnya
drop policy if exists "Public upsert leaderboard" on public.uno_zero_leaderboard;
drop policy if exists "Public update leaderboard" on public.uno_zero_leaderboard;
drop policy if exists "Public read leaderboard" on public.uno_zero_leaderboard;

create policy "Public read leaderboard"
  on public.uno_zero_leaderboard for select
  using (true);

-- Catatan Keamanan RLS:
-- Seluruh operasi tulis (INSERT/UPDATE/DELETE) pada leaderboard & match_history
-- dilakukan oleh server backend menggunakan SUPABASE_SERVICE_ROLE_KEY (bypass RLS secara aman).
-- Client dengan SUPABASE_ANON_KEY hanya memiliki izin baca publik (SELECT).
