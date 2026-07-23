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

-- FK to profiles so PostgREST can join predictions -> profiles
alter table public.predictions
  add constraint predictions_user_id_fkey_profiles
  foreign key (user_id) references public.profiles (id) on delete cascade;

create index if not exists predictions_fixture_idx on public.predictions (fixture_id);
create index if not exists predictions_user_idx on public.predictions (user_id);

-- =========================================================
-- audit_log — tracks all changes to predictions & fixtures
-- =========================================================
create table if not exists public.audit_log (
  id           bigserial primary key,
  table_name   text not null,
  action       text not null,             -- INSERT | UPDATE | DELETE
  record_id    text not null,             -- pk of the changed row
  changed_by   uuid,                       -- auth.uid() of the actor
  changed_at   timestamptz not null default now(),
  old_values   jsonb,
  new_values   jsonb
);

create index if not exists audit_log_table_idx on public.audit_log (table_name);
create index if not exists audit_log_record_idx on public.audit_log (record_id);
create index if not exists audit_log_changed_at_idx on public.audit_log (changed_at desc);

-- =========================================================
-- auth_log — tracks login/logout events
-- =========================================================
create table if not exists public.auth_log (
  id           bigserial primary key,
  user_id      uuid,
  username     text,
  event        text not null,              -- LOGIN | LOGOUT | LOGIN_FAILED
  ip_address   text,
  user_agent   text,
  created_at   timestamptz not null default now()
);

create index if not exists auth_log_user_idx on public.auth_log (user_id);
create index if not exists auth_log_created_idx on public.auth_log (created_at desc);

-- =========================================================
-- RLS
-- =========================================================
alter table public.profiles enable row level security;
alter table public.fixtures enable row level security;
alter table public.predictions enable row level security;
alter table public.audit_log enable row level security;
alter table public.auth_log enable row level security;

-- audit_log: readable by admins only, writable by anyone authenticated (via trigger)
create policy "audit_log: admin read" on public.audit_log
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- auth_log: readable by admins only
create policy "auth_log: admin read" on public.auth_log
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- profiles: everyone logged in can read; users can update their own row
create policy "profiles: read" on public.profiles
  for select using (auth.role() = 'authenticated');
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Block non-service roles from changing is_admin (prevent privilege escalation)
create or replace function public.block_admin_tamper()
returns trigger language plpgsql security definer as $$
begin
  if current_setting('role') = 'authenticated' then
    if tg_op = 'INSERT' and new.is_admin = true then
      raise exception 'Nie możesz nadać sobie admina';
    end if;
    if tg_op = 'UPDATE' and new.is_admin is distinct from old.is_admin then
      raise exception 'Nie możesz zmienić flagi admina';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_block_admin_insert on public.profiles;
create trigger trg_block_admin_insert before insert on public.profiles
  for each row execute function public.block_admin_tamper();

drop trigger if exists trg_block_admin_update on public.profiles;
create trigger trg_block_admin_update before update on public.profiles
  for each row execute function public.block_admin_tamper();

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

-- Block non-service roles from setting points directly (prevent score inflation)
-- score_fixture is security definer so it bypasses this check
create or replace function public.block_points_tamper()
returns trigger language plpgsql security definer as $$
begin
  -- Only allow points to be set by service role (which bypasses RLS)
  -- authenticated users must NOT set points
  if current_setting('role') = 'authenticated' then
    if tg_op = 'INSERT' and new.points is not null then
      raise exception 'Nie możesz ustawić punktów';
    end if;
    if tg_op = 'UPDATE' and new.points is distinct from old.points then
      raise exception 'Nie możesz zmienić punktów';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_block_points_insert on public.predictions;
create trigger trg_block_points_insert before insert on public.predictions
  for each row execute function public.block_points_tamper();

drop trigger if exists trg_block_points_update on public.predictions;
create trigger trg_block_points_update before update on public.predictions
  for each row execute function public.block_points_tamper();

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
-- audit triggers — log all inserts/updates/deletes
-- =========================================================
create or replace function public.audit_predictions()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'DELETE' then
    insert into public.audit_log (table_name, action, record_id, changed_by, old_values)
    values ('predictions', 'DELETE', old.id::text, auth.uid(),
      jsonb_build_object('user_id', old.user_id, 'fixture_id', old.fixture_id, 'home_score', old.home_score, 'away_score', old.away_score, 'points', old.points));
    return old;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log (table_name, action, record_id, changed_by, old_values, new_values)
    values ('predictions', 'UPDATE', new.id::text, auth.uid(),
      jsonb_build_object('home_score', old.home_score, 'away_score', old.away_score, 'points', old.points),
      jsonb_build_object('home_score', new.home_score, 'away_score', new.away_score, 'points', new.points));
    return new;
  elsif tg_op = 'INSERT' then
    insert into public.audit_log (table_name, action, record_id, changed_by, new_values)
    values ('predictions', 'INSERT', new.id::text, auth.uid(),
      jsonb_build_object('user_id', new.user_id, 'fixture_id', new.fixture_id, 'home_score', new.home_score, 'away_score', new.away_score));
    return new;
  end if;
  return null;
end $$;

drop trigger if exists trg_audit_predictions on public.predictions;
create trigger trg_audit_predictions after insert or update or delete on public.predictions
  for each row execute function public.audit_predictions();

create or replace function public.audit_fixtures()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'DELETE' then
    insert into public.audit_log (table_name, action, record_id, changed_by, old_values)
    values ('fixtures', 'DELETE', old.id::text, auth.uid(),
      jsonb_build_object('home_team', old.home_team, 'away_team', old.away_team, 'home_score', old.home_score, 'away_score', old.away_score, 'status', old.status));
    return old;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log (table_name, action, record_id, changed_by, old_values, new_values)
    values ('fixtures', 'UPDATE', new.id::text, auth.uid(),
      jsonb_build_object('home_score', old.home_score, 'away_score', old.away_score, 'status', old.status),
      jsonb_build_object('home_score', new.home_score, 'away_score', new.away_score, 'status', new.status));
    return new;
  elsif tg_op = 'INSERT' then
    insert into public.audit_log (table_name, action, record_id, changed_by, new_values)
    values ('fixtures', 'INSERT', new.id::text, auth.uid(),
      jsonb_build_object('home_team', new.home_team, 'away_team', new.away_team, 'utc_date', new.utc_date, 'status', new.status));
    return new;
  end if;
  return null;
end $$;

drop trigger if exists trg_audit_fixtures on public.fixtures;
create trigger trg_audit_fixtures after insert or update or delete on public.fixtures
  for each row execute function public.audit_fixtures();

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

  if v_status = 'CANCELLED' then
    update public.predictions set points = null where fixture_id = f_fixture_id;
    return;
  end if;

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