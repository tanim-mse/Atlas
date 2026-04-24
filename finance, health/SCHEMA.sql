-- =========================================================
-- ATLAS SCHEMA — run once in Supabase SQL editor
-- Row-Level Security: only the owner (auth.uid()) reads/writes.
-- =========================================================

-- Enable UUID helpers
create extension if not exists "pgcrypto";

-- -------- JOURNAL --------
create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  entry_date date not null default current_date,
  title text,
  content text not null default '',
  mood int check (mood between 1 and 10),
  energy int check (energy between 1 and 10),
  tags text[] default '{}',
  weather text,
  location text
);
create index if not exists idx_journal_user_date on journal_entries(user_id, entry_date desc);

-- -------- HABITS --------
create table if not exists habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text default '✦',
  color text default '#7c9cff',
  target_per_week int default 7,
  archived boolean default false,
  created_at timestamptz default now()
);

create table if not exists habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null references habits(id) on delete cascade,
  log_date date not null default current_date,
  unique (habit_id, log_date)
);
create index if not exists idx_habit_logs_user_date on habit_logs(user_id, log_date desc);

-- -------- GOALS --------
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  target_date date,
  progress int default 0 check (progress between 0 and 100),
  status text default 'active' check (status in ('active','done','paused','abandoned')),
  created_at timestamptz default now()
);

create table if not exists milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references goals(id) on delete cascade,
  title text not null,
  done boolean default false,
  done_at timestamptz
);

-- -------- MEDIA LOG (reading + watching) --------
create table if not exists media_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('book','film','series','paper','other')),
  title text not null,
  creator text,
  status text default 'active' check (status in ('active','done','abandoned','paused')),
  rating int check (rating between 1 and 5),
  notes text,
  started_at date,
  finished_at date,
  cover_url text,
  created_at timestamptz default now()
);

-- -------- GAMING SESSIONS --------
create table if not exists gaming_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  session_date date not null default current_date,
  duration_minutes int,
  highlight text,
  recorded_for_yt boolean default false,
  yt_video_url text,
  created_at timestamptz default now()
);

-- -------- EDIT PROJECTS --------
create table if not exists edit_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  status text default 'draft' check (status in ('draft','editing','review','published','archived')),
  software text,
  duration_seconds int,
  published_url text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- -------- FINANCE --------
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tx_date date not null default current_date,
  amount numeric(12,2) not null,
  kind text not null check (kind in ('income','expense')),
  category text,
  note text,
  created_at timestamptz default now()
);
create index if not exists idx_tx_user_date on transactions(user_id, tx_date desc);

-- -------- HEALTH --------
create table if not exists health_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null default current_date,
  sleep_hours numeric(3,1),
  water_ml int,
  workout_minutes int,
  weight_kg numeric(5,1),
  notes text,
  unique (user_id, log_date)
);

-- =========================================================
-- ROW-LEVEL SECURITY — lock everything to owner
-- =========================================================
alter table journal_entries enable row level security;
alter table habits enable row level security;
alter table habit_logs enable row level security;
alter table goals enable row level security;
alter table milestones enable row level security;
alter table media_log enable row level security;
alter table gaming_sessions enable row level security;
alter table edit_projects enable row level security;
alter table transactions enable row level security;
alter table health_logs enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'journal_entries','habits','habit_logs','goals','milestones',
    'media_log','gaming_sessions','edit_projects','transactions','health_logs'
  ])
  loop
    execute format('drop policy if exists "owner_all" on %I', t);
    execute format(
      'create policy "owner_all" on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t
    );
  end loop;
end $$;

-- =========================================================
-- PASSKEYS (WebAuthn credentials) — stored per user
-- Pure-client WebAuthn would need a verification server;
-- we use Supabase's built-in MFA enrollment instead at runtime
-- and keep this table for credential metadata only.
-- =========================================================
create table if not exists passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_label text,
  created_at timestamptz default now()
);
alter table passkeys enable row level security;
drop policy if exists "owner_all" on passkeys;
create policy "owner_all" on passkeys for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
