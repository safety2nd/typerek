import { createClient, createServiceClient } from "./supabase/server";
import type { Fixture, FixtureWithPrediction, LeaderboardRow, Prediction, PredictionWithProfile } from "./types";

export async function getUpcomingFixtures(userId: string): Promise<FixtureWithPrediction[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fixtures")
    .select("*")
    .order("utc_date", { ascending: true })
    .gte("utc_date", new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString())
    .neq("status", "CANCELLED")
    .limit(50);
  const fixtures = (data ?? []) as Fixture[];

  if (fixtures.length === 0) return [];

  const { data: preds } = await supabase
    .from("predictions")
    .select("*")
    .eq("user_id", userId)
    .in(
      "fixture_id",
      fixtures.map((f) => f.id),
    );
  const byFixture = new Map<number, Prediction>((preds ?? []).map((p: Prediction) => [p.fixture_id, p]));

  return fixtures.map((f) => ({
    ...f,
    my_prediction: byFixture.get(f.id) ?? null,
  }));
}

export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leaderboard")
    .select("*")
    .order("total_points", { ascending: false })
    .order("exact_hits", { ascending: false });
  return (data ?? []) as LeaderboardRow[];
}

export async function getAllPredictions(): Promise<
  (PredictionWithProfile & { home_team: string; away_team: string; utc_date: string; status: string; fixture_home_score: number | null; fixture_away_score: number | null })[]
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("predictions")
    .select(
      "id, user_id, fixture_id, home_score, away_score, points, created_at, updated_at, profiles!inner(username), fixtures!inner(home_team, away_team, utc_date, status, home_score, away_score)",
    )
    .order("updated_at", { ascending: false })
    .limit(500);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    user_id: row.user_id as string,
    fixture_id: row.fixture_id as number,
    home_score: row.home_score as number,
    away_score: row.away_score as number,
    points: row.points as number | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    username: (row.profiles as { username: string }).username,
    home_team: (row.fixtures as { home_team: string }).home_team,
    away_team: (row.fixtures as { away_team: string }).away_team,
    utc_date: (row.fixtures as { utc_date: string }).utc_date,
    status: (row.fixtures as { status: string }).status,
    fixture_home_score: (row.fixtures as { home_score: number | null }).home_score,
    fixture_away_score: (row.fixtures as { away_score: number | null }).away_score,
  }));
}

export async function getFixturesForAdmin(): Promise<Fixture[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fixtures")
    .select("*")
    .order("utc_date", { ascending: false })
    .limit(100);
  return (data ?? []) as Fixture[];
}

export async function getUsers() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, is_admin, created_at")
    .order("username", { ascending: true });
  return data ?? [];
}

/** Resolve a username to the underlying auth email (service client, bypasses RLS). */
export async function getEmailForUsername(username: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .maybeSingle();
  if (!data) return null;
  const { data: user, error } = await supabase.auth.admin.getUserById(data.id);
  if (error || !user?.user?.email) return null;
  return user.user.email;
}

export interface FixtureWithPredictions extends Fixture {
  predictions: {
    username: string;
    home_score: number;
    away_score: number;
    points: number | null;
  }[];
}

/** All fixtures with everyone's predictions, grouped by fixture (most recent first). */
export async function getFixturesWithAllPredictions(): Promise<FixtureWithPredictions[]> {
  const supabase = await createClient();
  const { data: fixtures } = await supabase
    .from("fixtures")
    .select("*")
    .order("utc_date", { ascending: false })
    .limit(100);
  const fixtureRows = (fixtures ?? []) as Fixture[];
  if (fixtureRows.length === 0) return [];

  const { data: preds } = await supabase
    .from("predictions")
    .select("fixture_id, home_score, away_score, points, profiles!inner(username)")
    .in("fixture_id", fixtureRows.map((f) => f.id));

  const byFixture = new Map<number, FixtureWithPredictions["predictions"]>();
  for (const p of preds ?? []) {
    const row = p as unknown as {
      fixture_id: number;
      home_score: number;
      away_score: number;
      points: number | null;
      profiles: { username: string };
    };
    const arr = byFixture.get(row.fixture_id) ?? [];
    arr.push({
      username: row.profiles.username,
      home_score: row.home_score,
      away_score: row.away_score,
      points: row.points,
    });
    byFixture.set(row.fixture_id, arr);
  }

  return fixtureRows.map((f) => ({
    ...f,
    predictions: (byFixture.get(f.id) ?? []).sort((a, b) =>
      a.username.localeCompare(b.username),
    ),
  }));
}