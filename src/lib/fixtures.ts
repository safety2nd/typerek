import { createServiceClient } from "./supabase/server";
import type { Fixture, FixtureStatus } from "./types";

const EKSTRAKLASA_COMPETITION_CODE = "PL"; // football-data.org code for Polish Ekstraklasa

interface FDFixture {
  id: number;
  utcDate: string;
  status: "SCHEDULED" | "TIMED" | "IN_PLAY" | "FINISHED";
  matchday: number | null;
  stage: string;
  score: {
    fullTime: { home: number | null; away: number | null };
  };
  homeTeam: { name: string; crest: string | null };
  awayTeam: { name: string; crest: string | null };
  competition?: { name: string; code: string };
  season?: { startDate: string; endDate: string; currentMatchday: number };
}

interface FDResponse {
  matches: FDFixture[];
  competition?: { name: string; code: string; currentSeason?: { startDate: string; endDate: string; currentMatchday: number } };
}

/**
 * Fetch Ekstraklasa fixtures from football-data.org and upsert them into Supabase.
 * Returns the number of fixtures upserted.
 */
export async function syncFixtures(): Promise<number> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) throw new Error("FOOTBALL_DATA_API_KEY is not set");

  const url = `https://api.football-data.org/v4/competitions/${EKSTRAKLASA_COMPETITION_CODE}/matches`;
  const res = await fetch(url, {
    headers: { "X-Auth-Token": apiKey },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`football-data.org responded ${res.status}: ${body}`);
  }
  const data = (await res.json()) as FDResponse;

  const competitionName = data.competition?.name ?? "Ekstraklasa";
  const season =
    data.competition?.currentSeason?.startDate && data.competition?.currentSeason?.endDate
      ? `${data.competition.currentSeason.startDate.slice(0, 4)}/${data.competition.currentSeason.endDate.slice(0, 4)}`
      : null;

  const rows: Omit<Fixture, "created_at" | "updated_at">[] = (data.matches ?? []).map((m) => ({
    id: m.id,
    matchday: m.matchday,
    matchday_name: m.stage === "REGULAR_SEASON" && m.matchday ? `Matchday ${m.matchday}` : m.stage,
    season,
    competition: competitionName,
    home_team: m.homeTeam.name,
    away_team: m.awayTeam.name,
    home_team_crest: m.homeTeam.crest ?? null,
    away_team_crest: m.awayTeam.crest ?? null,
    utc_date: m.utcDate,
    status: (m.status === "TIMED" ? "SCHEDULED" : m.status) as FixtureStatus,
    home_score: m.score.fullTime.home,
    away_score: m.score.fullTime.away,
  }));

  if (rows.length === 0) return 0;

  const supabase = createServiceClient();
  const { error } = await supabase.from("fixtures").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`Supabase upsert failed: ${error.message}`);

  // Trigger re-scoring for any fixtures that became FINISHED with scores.
  // The DB trigger handles this automatically on update, but call the function
  // explicitly as a safety net for matches whose status/score changed.
  const finished = rows.filter((r) => r.status === "FINISHED" && r.home_score != null && r.away_score != null);
  for (const f of finished) {
    await supabase.rpc("score_fixture", { f_fixture_id: f.id });
  }

  return rows.length;
}