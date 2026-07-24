-- Upcoming SCHEDULED Ekstraklasa fixtures, oldest first.
-- Run in Supabase SQL editor, paste the output into the prompt's FIXTURES section.
select
  id,
  to_char(utc_date at time zone 'Europe/Warsaw', 'YYYY-MM-DD HH24:MI') as kickoff,
  home_team,
  away_team,
  matchday_name
from public.fixtures
where status = 'SCHEDULED'
  and utc_date > now()
order by utc_date asc;