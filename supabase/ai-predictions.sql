-- Garage League — AI prediction log (private, service-role only)
-- Run this in the Supabase SQL editor, after schema.sql.
--
-- Deliberately NOT part of the app data model:
--   * no row in profiles  -> the AI never appears in the leaderboard or user list
--   * no row in predictions -> the AI never appears in the global prediction list
--   * RLS enabled with NO policies -> anon/authenticated get zero rows, even
--     when hitting PostgREST directly with the anon key. Only the service role
--     (which bypasses RLS) can read or write this table.
-- This exists purely to measure prediction quality against real results.

-- =========================================================
-- ai_predictions
-- =========================================================
create table if not exists public.ai_predictions (
  id           uuid primary key default gen_random_uuid(),
  fixture_id   bigint not null references public.fixtures (id) on delete cascade,
  home_score   int not null,
  away_score   int not null,
  confidence   text,                                -- Wysoka | Średnia | Niska
  rationale    text,                                -- one-line decisive factor
  model        text not null default 'unknown',     -- e.g. claude-opus-5
  points       numeric(5,2),                        -- null until fixture is scored
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (fixture_id, model)                        -- one row per model per fixture
);

create index if not exists ai_predictions_fixture_idx on public.ai_predictions (fixture_id);
create index if not exists ai_predictions_model_idx on public.ai_predictions (model);

-- =========================================================
-- Lock it down. RLS on + zero policies = deny-all for anon/authenticated.
-- =========================================================
alter table public.ai_predictions enable row level security;
alter table public.ai_predictions force row level security;

revoke all on public.ai_predictions from anon, authenticated;

-- NOTE for disaster recovery: scripts/backup.sh runs pg_dump with
-- --no-privileges, which strips GRANT/REVOKE from the dump. The RLS lines
-- above ARE dumped (they are schema, not ACLs), so a restored table still
-- returns zero rows to anon/authenticated — but the REVOKE belt-and-braces
-- layer is not. Re-run this file after any restore; it is idempotent.

-- updated_at maintenance (reuses the helper from schema.sql)
drop trigger if exists trg_ai_predictions_updated on public.ai_predictions;
create trigger trg_ai_predictions_updated before update on public.ai_predictions
  for each row execute function public.touch_updated_at();

-- =========================================================
-- function: score_ai_predictions(fixture_id)
-- Mirrors public.score_fixture exactly, so AI points are directly comparable
-- to human points. Keep the two formulas in sync if the scoring ever changes.
--   exact score = 3 pts (max for a game; no goal bonuses added)
--   correct outcome (home win / draw / away win) = 1 pt
--     + 0.25 pt per correctly predicted team goals (home and/or away)
--   wrong outcome = 0 pts + 0.25 pt per correctly predicted team goals
-- =========================================================
create or replace function public.score_ai_predictions(f_fixture_id bigint)
returns void language plpgsql security definer as $$
declare
  v_home int;
  v_away int;
  v_status text;
begin
  select home_score, away_score, status into v_home, v_away, v_status
  from public.fixtures where id = f_fixture_id;

  if v_status = 'POSTPONED' then
    update public.ai_predictions set points = null where fixture_id = f_fixture_id;
    return;
  end if;

  if v_status <> 'FINISHED' or v_home is null or v_away is null then
    return;
  end if;

  update public.ai_predictions
  set points = case
    when home_score = v_home and away_score = v_away then 3
    else
      (case when sign(home_score - away_score) = sign(v_home - v_away) then 1 else 0 end)
      + (case when home_score = v_home then 0.25 else 0 end)
      + (case when away_score = v_away then 0.25 else 0 end)
  end
  where fixture_id = f_fixture_id;
end $$;

-- Separate trigger from trg_fixtures_autoscore so this file stays additive
-- and schema.sql needs no edits.
create or replace function public.auto_score_ai_trigger()
returns trigger language plpgsql security definer as $$
begin
  if new.status in ('FINISHED', 'POSTPONED') then
    perform public.score_ai_predictions(new.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_fixtures_autoscore_ai on public.fixtures;
create trigger trg_fixtures_autoscore_ai after update on public.fixtures
  for each row execute function public.auto_score_ai_trigger();

-- =========================================================
-- Backfill any fixtures already finished before this table existed.
-- =========================================================
do $$
declare f record;
begin
  for f in select id from public.fixtures where status in ('FINISHED', 'POSTPONED') loop
    perform public.score_ai_predictions(f.id);
  end loop;
end $$;
