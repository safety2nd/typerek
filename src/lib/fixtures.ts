import { createServiceClient } from "./supabase/server";
import type { Fixture, FixtureStatus } from "./types";

// TheSportsDB — Polish Ekstraklasa league id.
// Free tier (api key "3") includes the current season and upcoming fixtures.
const EKSTRAKLASA_LEAGUE_ID = 4422;
const API_KEY = "3";

interface TSDBEvent {
  idEvent: string;
  strTimestamp: string | null;
  dateEvent: string;
  strTime: string | null;
  strHomeTeam: string;
  strAwayTeam: string;
  strHomeTeamBadge: string | null;
  strAwayTeamBadge: string | null;
  intHomeScore: string | number | null;
  intAwayScore: string | number | null;
  intRound: string | null;
  strSeason: string | null;
  strStatus: string | null;
  strPostponed: string | null;
}

interface TSDBResponse {
  events: TSDBEvent[] | null;
}

function mapStatus(e: TSDBEvent): FixtureStatus {
  if (e.strPostponed === "yes") return "SCHEDULED";
  const s = (e.strStatus ?? "").toUpperCase();
  // FT = Full Time, AET = After Extra Time, PEN = Penalties
  if (["FT", "AET", "PEN", "AWD", "CANC", "ABD", "APO"].includes(s)) return "FINISHED";
  // NS = Not Started, TBD = To Be Determined
  if (["NS", "TBD", "PST"].includes(s)) return "SCHEDULED";
  // If scores are present, treat as finished; otherwise scheduled
  if (e.intHomeScore != null && e.intAwayScore != null) return "FINISHED";
  // Match started but no final score yet
  if (s && !["NS", "TBD"].includes(s)) return "IN_PLAY";
  return "SCHEDULED";
}

function toIsoDate(e: TSDBEvent): string {
  if (e.strTimestamp) return e.strTimestamp;
  const date = e.dateEvent;
  const time = e.strTime ?? "00:00:00";
  return `${date}T${time}Z`;
}

function toNullableScore(v: string | number | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

function matchdayFromRound(round: string | null): number | null {
  if (!round) return null;
  const m = String(round).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function roundName(round: string | null): string | null {
  if (!round) return null;
  const n = matchdayFromRound(round);
  return n ? `Kolejka ${n}` : round;
}

/**
 * Fetch Ekstraklasa fixtures from TheSportsDB and upsert them into Supabase.
 * Uses the season endpoint to get the full season schedule (past + upcoming).
 * Returns the number of fixtures upserted.
 */
export async function syncFixtures(): Promise<number> {
  // The current season label is available from the league info; fall back to
  // deriving it from the current year (Ekstraklasa starts in July).
  const thisYear = new Date().getUTCFullYear();
  const month = new Date().getUTCMonth();
  // Season spans two years starting in July; label is "YYYY-YYYY".
  const startYear = month >= 6 ? thisYear : thisYear - 1;
  const seasonsToTry = [`${startYear}-${startYear + 1}`, `${startYear - 1}-${startYear}`];

  let events: TSDBEvent[] = [];
  for (const season of seasonsToTry) {
    events = await fetchSeasonEvents(season);
    if (events.length > 0) break;
  }

  const rows: Omit<Fixture, "created_at" | "updated_at">[] = events.map((e) => ({
    id: Number(e.idEvent),
    matchday: matchdayFromRound(e.intRound),
    matchday_name: roundName(e.intRound),
    season: e.strSeason ?? null,
    competition: "Ekstraklasa",
    home_team: e.strHomeTeam,
    away_team: e.strAwayTeam,
    home_team_crest: e.strHomeTeamBadge ?? null,
    away_team_crest: e.strAwayTeamBadge ?? null,
    utc_date: toIsoDate(e),
    status: mapStatus(e),
    home_score: toNullableScore(e.intHomeScore),
    away_score: toNullableScore(e.intAwayScore),
  }));

  if (rows.length === 0) return 0;

  const supabase = createServiceClient();

  // Delete fixtures from other seasons so stale data doesn't linger.
  if (rows[0].season) {
    await supabase
      .from("fixtures")
      .delete()
      .neq("season", rows[0].season);
  }

  const { error } = await supabase.from("fixtures").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`Supabase upsert failed: ${error.message}`);

  // Re-score any finished fixtures with scores (DB trigger also fires on update).
  const finished = rows.filter(
    (r) => r.status === "FINISHED" && r.home_score != null && r.away_score != null,
  );
  for (const f of finished) {
    await supabase.rpc("score_fixture", { f_fixture_id: f.id });
  }

  return rows.length;
}

async function fetchSeasonEvents(season: string): Promise<TSDBEvent[]> {
  const url = `https://www.thesportsdb.com/api/v1/json/${API_KEY}/eventsseason.php?id=${EKSTRAKLASA_LEAGUE_ID}&s=${season}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TheSportsDB responded ${res.status}: ${body}`);
  }
  const data = (await res.json()) as TSDBResponse;
  return data.events ?? [];
}