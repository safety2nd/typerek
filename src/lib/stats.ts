import { createClient } from "./supabase/server";
import type { Fixture } from "./types";

export interface PlayerStat {
  username: string;
  total_points: number;
  exact_hits: number;
  outcome_hits: number;
  zero_hits: number;
  scored: number;
  total: number;
  accuracy: number;
  avg_predicted_goals: number;
  home_win_bias: number;
}

export interface FixtureStat {
  fixture_id: number;
  home_team: string;
  away_team: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  matchday: number | null;
  total_predictions: number;
  consensus_home: number | null;
  consensus_away: number | null;
  consensus_correct: boolean | null;
  avg_predicted_home: number;
  avg_predicted_away: number;
  upset: boolean;
}

export interface MatchdayPoints {
  username: string;
  matchday: number;
  points: number;
}

export interface ScoreDistribution {
  score: string;
  predicted: number;
  actual: number;
}

export async function getPlayerStats(): Promise<PlayerStat[]> {
  const supabase = await createClient();
  const { data: preds } = await supabase
    .from("predictions")
    .select("home_score, away_score, points, profiles!inner(username), fixtures!inner(status)")
    .eq("fixtures.status", "FINISHED");
  const rows = (preds ?? []) as unknown as {
    home_score: number;
    away_score: number;
    points: number | null;
    profiles: { username: string };
    fixtures: { status: string };
  }[];

  const byPlayer = new Map<string, PlayerStat>();
  for (const r of rows) {
    const name = r.profiles.username;
    if (!byPlayer.has(name)) {
      byPlayer.set(name, {
        username: name,
        total_points: 0,
        exact_hits: 0,
        outcome_hits: 0,
        zero_hits: 0,
        scored: 0,
        total: 0,
        accuracy: 0,
        avg_predicted_goals: 0,
        home_win_bias: 0,
      });
    }
    const s = byPlayer.get(name)!;
    s.total++;
    if (r.points != null) {
      s.scored++;
      s.total_points += r.points;
      if (r.points === 3) s.exact_hits++;
      else if (r.points === 1) s.outcome_hits++;
      else s.zero_hits++;
    }
    s.avg_predicted_goals += r.home_score + r.away_score;
    if (r.home_score > r.away_score) s.home_win_bias++;
  }

  const result = [...byPlayer.values()].map((s) => ({
    ...s,
    accuracy: s.scored > 0 ? Math.round((s.exact_hits + s.outcome_hits) / s.scored * 100) : 0,
    avg_predicted_goals: s.total > 0 ? +(s.avg_predicted_goals / s.total).toFixed(2) : 0,
    home_win_bias: s.total > 0 ? Math.round(s.home_win_bias / s.total * 100) : 0,
  }));

  return result.sort((a, b) => b.total_points - a.total_points);
}

export async function getFixtureStats(): Promise<FixtureStat[]> {
  const supabase = await createClient();
  const { data: fixtures } = await supabase
    .from("fixtures")
    .select("*")
    .order("utc_date", { ascending: true });
  const fixtureRows = (fixtures ?? []) as Fixture[];
  if (fixtureRows.length === 0) return [];

  const { data: preds } = await supabase
    .from("predictions")
    .select("home_score, away_score, points, fixture_id")
    .in("fixture_id", fixtureRows.map((f) => f.id));

  const byFixture = new Map<number, { home: number[]; away: number[]; points: (number | null)[] }>();
  for (const p of (preds ?? []) as unknown as { fixture_id: number; home_score: number; away_score: number; points: number | null }[]) {
    const entry = byFixture.get(p.fixture_id) ?? { home: [], away: [], points: [] };
    entry.home.push(p.home_score);
    entry.away.push(p.away_score);
    entry.points.push(p.points);
    byFixture.set(p.fixture_id, entry);
  }

  return fixtureRows
    .filter((f) => (byFixture.get(f.id)?.home.length ?? 0) > 0)
    .map((f) => {
      const entry = byFixture.get(f.id)!;
      const total = entry.home.length;
      const avgHome = +(entry.home.reduce((a, b) => a + b, 0) / total).toFixed(2);
      const avgAway = +(entry.away.reduce((a, b) => a + b, 0) / total).toFixed(2);

      // Consensus = most common predicted score
      const scoreCounts = new Map<string, number>();
      for (let i = 0; i < total; i++) {
        const key = `${entry.home[i]}-${entry.away[i]}`;
        scoreCounts.set(key, (scoreCounts.get(key) ?? 0) + 1);
      }
      let consensusKey = "";
      let consensusCount = 0;
      for (const [k, v] of scoreCounts) {
        if (v > consensusCount) {
          consensusKey = k;
          consensusCount = v;
        }
      }
      const [consensusHome, consensusAway] = consensusKey.split("-").map(Number);
      const finished = f.status === "FINISHED" && f.home_score != null && f.away_score != null;
      const consensusCorrect = finished
        ? consensusHome === f.home_score && consensusAway === f.away_score
        : null;
      const upset = finished
        ? (consensusHome > consensusAway ? "H" : consensusHome < consensusAway ? "A" : "D") !==
          (f.home_score! > f.away_score! ? "H" : f.home_score! < f.away_score! ? "A" : "D")
        : false;

      return {
        fixture_id: f.id,
        home_team: f.home_team,
        away_team: f.away_team,
        status: f.status,
        home_score: f.home_score,
        away_score: f.away_score,
        matchday: f.matchday,
        total_predictions: total,
        consensus_home: consensusHome,
        consensus_away: consensusAway,
        consensus_correct: consensusCorrect,
        avg_predicted_home: avgHome,
        avg_predicted_away: avgAway,
        upset,
      };
    });
}

export async function getMatchdayPoints(): Promise<MatchdayPoints[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("predictions")
    .select("points, profiles!inner(username), fixtures!inner(matchday, status)")
    .eq("fixtures.status", "FINISHED");
  const rows = (data ?? []) as unknown as {
    points: number | null;
    profiles: { username: string };
    fixtures: { matchday: number | null };
  }[];

  const byPlayerMatchday = new Map<string, Map<number, number>>();
  for (const r of rows) {
    if (r.points == null || r.fixtures.matchday == null) continue;
    const md = r.fixtures.matchday;
    if (!byPlayerMatchday.has(r.profiles.username)) {
      byPlayerMatchday.set(r.profiles.username, new Map());
    }
    const mdMap = byPlayerMatchday.get(r.profiles.username)!;
    mdMap.set(md, (mdMap.get(md) ?? 0) + r.points);
  }

  const result: MatchdayPoints[] = [];
  for (const [username, mdMap] of byPlayerMatchday) {
    for (const [matchday, points] of mdMap) {
      result.push({ username, matchday, points });
    }
  }
  return result.sort((a, b) => a.matchday - b.matchday || b.points - a.points);
}

export async function getScoreDistribution(): Promise<ScoreDistribution[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("predictions")
    .select("home_score, away_score, fixtures!inner(status, home_score, away_score)")
    .eq("fixtures.status", "FINISHED");
  const rows = (data ?? []) as unknown as {
    home_score: number;
    away_score: number;
    fixtures: { status: string; home_score: number | null; away_score: number | null };
  }[];

  const predicted = new Map<string, number>();
  const actual = new Map<string, number>();
  for (const r of rows) {
    const predKey = `${r.home_score}-${r.away_score}`;
    predicted.set(predKey, (predicted.get(predKey) ?? 0) + 1);
    if (r.fixtures.home_score != null && r.fixtures.away_score != null) {
      const actKey = `${r.fixtures.home_score}-${r.fixtures.away_score}`;
      actual.set(actKey, (actual.get(actKey) ?? 0) + 1);
    }
  }

  const keys = new Set([...predicted.keys(), ...actual.keys()]);
  return [...keys]
    .map((score) => ({
      score,
      predicted: predicted.get(score) ?? 0,
      actual: actual.get(score) ?? 0,
    }))
    .sort((a, b) => b.predicted + b.actual - (a.predicted + a.actual));
}