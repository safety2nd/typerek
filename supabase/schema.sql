-- Garage League — Supabase schema
-- Run this in the Supabase SQL editor.

-- =========================================================
-- profiles (linked 1:1 to auth.users)
-- =========================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text unique not null,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- =========================================================
-- fixtures
-- =========================================================
create table if not exists public.fixtures (
  id              bigint primary key,                 -- football-data.org match id
  matchday        int,
  matchday_name   text,
  season          text,
  competition     text,
  home_team       text not null,
  away_team       text not null,
  home_team_crest text,
  away_team_crest text,
  utc_date        timestamptz not null,
  status          text not null default 'SCHEDULED', -- SCHEDULED | IN_PLAY | FINISHED
  home_score      int,
  away_score      int,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists fixtures_utc_date_idx on public.fixtures (utc_date);
create index if not exists fixtures_status_idx on public.fixtures (status);

-- =========================================================
-- predictions
-- =========================================================
create table if not exists public.predictions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  fixture_id   bigint not null references public.fixtures (id) on delete cascade,
  home_score   int not null,
  away_score   int not null,
  points       int,                                  -- null until fixture is finished & scored
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, fixture_id)
);

create index if not exists predictions_fixture_idx on public.predictions (fixture_id);
create index if not exists predictions_user_idx on public.predictions (user_id);

-- =========================================================
-- RLS
-- =========================================================
alter table public.profiles enable row level security;
alter table public.fixtures enable row level security;
alter table public.predictions enable row level security;

-- profiles: everyone logged in can read; users can update their own row (but not is_admin)
create policy "profiles: read" on public.profiles
  for select using (auth.role() = 'authenticated');
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- fixtures: readable by any authenticated user
create policy "fixtures: read" on public.fixtures
  for select using (auth.role() = 'authenticated');

-- predictions: read all (global list), insert/update/delete own only
create policy "predictions: read all" on public.predictions
  for select using (auth.role() = 'authenticated');
create policy "predictions: insert own" on public.predictions
  for insert with check (auth.uid() = user_id);
create policy "predictions: update own" on public.predictions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "predictions: delete own" on public.predictions
  for delete using (auth.uid() = user_id);

-- =========================================================
-- updated_at triggers
-- =========================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_fixtures_updated on public.fixtures;
create trigger trg_fixtures_updated before update on public.fixtures
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_predictions_updated on public.predictions;
create trigger trg_predictions_updated before update on public.predictions
  for each row execute function public.touch_updated_at();

-- =========================================================
-- view: leaderboard (computed from scored predictions)
-- =========================================================
create or replace view public.leaderboard as
select
  p.user_id,
  pr.username,
  coalesce(sum(p.points), 0) as total_points,
  count(p.points) filter (where p.points is not null) as scored_predictions,
  count(p.points) filter (where p.points = 2) as exact_hits,
  count(p.points) filter (where p.points = 1) as outcome_hits,
  count(*) as total_predictions
from public.predictions p
join public.profiles pr on pr.id = p.user_id
group by p.user_id, pr.username;

-- =========================================================
-- function: score_fixture(fixture_id)
-- Recomputes points for all predictions of a finished fixture.
--   exact score = 2 pts
--   correct outcome (home win / draw / away win) = 1 pt
--   otherwise = 0 pts
-- =========================================================
create or replace function public.score_fixture(f_fixture_id bigint)
returns void language plpgsql security definer as $$
declare
  v_home int;
  v_away int;
  v_status text;
begin
  select home_score, away_score, status into v_home, v_away, v_status
  from public.fixtures where id = f_fixture_id;

  if v_status <> 'FINISHED' or v_home is null or v_away is null then
    return;
  end if;

  update public.predictions
  set points = case
    when home_score = v_home and away_score = v_away then 2
    when sign(home_score - away_score) = sign(v_home - v_away) then 1
    else 0
  end
  where fixture_id = f_fixture_id;
end $$;

-- Trigger: auto-score when a fixture is marked FINISHED with scores set.
create or replace function public.auto_score_trigger()
returns trigger language plpgsql security definer as $$
begin
  if new.status = 'FINISHED' and new.home_score is not null and new.away_score is not null then
    perform public.score_fixture(new.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_fixtures_autoscore on public.fixtures;
create trigger trg_fixtures_autoscore after update on public.fixtures
  for each row execute function public.auto_score_trigger();

-- =========================================================
-- profile auto-creation trigger (on auth.users insert)
-- Sets username from email and default is_admin=false.
-- =========================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();