-- Jalankan SQL ini di Supabase SQL Editor untuk membuat tabel Global Leaderboard permanen

create table if not exists public.uno_zero_leaderboard (
  player_key text primary key,
  player_name text not null,
  wins integer not null default 0,
  games_played integer not null default 0,
  best_score integer not null default 0,
  total_score_sum integer not null default 0,
  avg_score numeric(6,1) not null default 0,
  win_rate integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists idx_uno_zero_leaderboard_rank
  on public.uno_zero_leaderboard (avg_score asc, wins desc, best_score asc);

-- Aktifkan Row Level Security (opsional: izinkan akses publik jika menggunakan anon key)
alter table public.uno_zero_leaderboard enable row level security;

create policy "Public read leaderboard"
  on public.uno_zero_leaderboard for select using (true);

create policy "Public upsert leaderboard"
  on public.uno_zero_leaderboard for insert with check (true);

create policy "Public update leaderboard"
  on public.uno_zero_leaderboard for update using (true);
