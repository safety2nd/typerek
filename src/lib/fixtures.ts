import { createServiceClient } from "./supabase/server";
import type { Fixture, FixtureStatus } from "./types";

// API-Football (api-sports.io) — Ekstraklasa is league id 106.
// Free tier: 100 requests/day, enough for one daily sync.
const EKSTRAKLASA_LEAGUE_ID = 106;

// API-Football status short codes -> our internal status
//   NS = Not Started, TBD = To Be Determined
//   1H/2H/HT/ET/BT/LIVE/P = In Play
//   FT/AET/PEN/PST/CANC/ABD/AWD/APO = Finished/decided
function mapStatus(short: string): FixtureStatus {
  if (["NS", "TBD", "PST"].includes(short)) return "SCHEDULED";
  if (["1H", "2H", "HT", "ET", "BT", "LIVE", "P", "INT"].includes(short)) return "IN_PLAY";
  return "FINISHED";
}

interface APIFixture {
  fixture: {
    id: number;
    date: string;
    status: { short: string };
  };
  league: {
    round: string | null;
    season: string;
    name: string;
  };
  teams: {
    home: { id: number; name: string; logo: string | null };
    away: { id: number; name: string; logo: string | null };
  };
  goals: { home: number | null; away: number | null };
}

interface APIResponse {
  response: APIFixture[];
  errors: unknown;
}

function roundName(raw: string | null): string | null {
  if (!raw) return null;
  // API-Football: "Regular Season - 3" -> "Kolejka 3"
  const m = raw.match(/Regular Season\s*-\s*(\d+)/i);
  if (m) return `Kolejka ${m[1]}`;
  return raw;
}

function matchdayFromRound(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.match(/Regular Season\s*-\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

/**
 * Fetch Ekstraklasa fixtures from API-Football and upsert them into Supabase.
 * Tries the current calendar year as the season, falls back to previous year
 * (Ekstraklasa seasons span two years and are labelled by the start year).
 * Returns the number of fixtures upserted.
 */
export async function syncFixtures(): Promise<number> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) throw new Error("API_FOOTBALL_KEY is not set");

  const headers = { "x-apisports-key": apiKey };

  // Free tier allows seasons 2022..2024. Try the most recent first and work
  // backwards — Ekstraklasa seasons span two calendar years and are labelled
  // by the start year, so 2024 = the 2024/25 season.
  const thisYear = new Date().getUTCFullYear();
  const maxAllowed = Math.min(thisYear, 2024);
  const seasonsToTry = [maxAllowed, maxAllowed - 1, maxAllowed - 2].filter(
    (s) => s >= 2022,
  );

  let data: APIResponse | null = null;
  let usedSeason: string | null = null;

  for (const season of seasonsToTry) {
    const url = `https://v3.football.api-sports.io/fixtures?league=${EKSTRAKLASA_LEAGUE_ID}&season=${season}`;
    const res = await fetch(url, { headers, next: { revalidate: 0 } });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API-Football responded ${res.status}: ${body}`);
    }
    const parsed = (await res.json()) as APIResponse;
    if (parsed.errors && Object.keys(parsed.errors as object).length > 0) {
      throw new Error(`API-Football error: ${JSON.stringify(parsed.errors)}`);
    }
    if ((parsed.response ?? []).length > 0) {
      data = parsed;
      usedSeason = String(season);
      break;
    }
  }

  if (!data || (data.response ?? []).length === 0) {
    return 0;
  }

  const competitionName = "Ekstraklasa";
  const seasonLabel = usedSeason
    ? `${usedSeason}/${Number(usedSeason) + 1}`
    : null;

  const rows: Omit<Fixture, "created_at" | "updated_at">[] = (data.response ?? []).map((m) => ({
    id: m.fixture.id,
    matchday: matchdayFromRound(m.league.round),
    matchday_name: roundName(m.league.round),
    season: seasonLabel,
    competition: competitionName,
    home_team: m.teams.home.name,
    away_team: m.teams.away.name,
    home_team_crest: m.teams.home.logo ?? null,
    away_team_crest: m.teams.away.logo ?? null,
    utc_date: m.fixture.date,
    status: mapStatus(m.fixture.status.short),
    home_score: m.goals.home,
    away_score: m.goals.away,
  }));

  if (rows.length === 0) return 0;

  const supabase = createServiceClient();
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