import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { EKSTRAKLASA_TEAMS } from "@/lib/teams";

const TEAM_SET = new Set<string>(EKSTRAKLASA_TEAMS);

export async function POST(request: Request) {
  await requireAdmin();
  const body = await request.json().catch(() => null);
  const homeTeam = String(body?.home_team ?? "").trim();
  const awayTeam = String(body?.away_team ?? "").trim();
  const utcDate = String(body?.utc_date ?? "");
  const matchday = Number(body?.matchday) || null;

  if (!homeTeam || !awayTeam || !utcDate) {
    return NextResponse.json({ error: "Brakuje danych" }, { status: 400 });
  }
  if (homeTeam === awayTeam) {
    return NextResponse.json({ error: "Gospodarz i gość muszą być różni" }, { status: 400 });
  }
  if (!TEAM_SET.has(homeTeam) || !TEAM_SET.has(awayTeam)) {
    return NextResponse.json({ error: "Nieznana drużyna" }, { status: 400 });
  }
  const parsed = new Date(utcDate);
  if (isNaN(parsed.getTime())) {
    return NextResponse.json({ error: "Nieprawidłowa data" }, { status: 400 });
  }

  const supabase = createServiceClient();
  // Generate a unique negative id to avoid collisions with TheSportsDB event ids.
  const id = -Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 1000);

  const { error } = await supabase.from("fixtures").insert({
    id,
    home_team: homeTeam,
    away_team: awayTeam,
    utc_date: utcDate,
    matchday,
    matchday_name: matchday ? `Kolejka ${matchday}` : null,
    season: new Date().getUTCFullYear() + "-" + (new Date().getUTCFullYear() + 1),
    competition: "Ekstraklasa",
    status: "SCHEDULED",
    home_score: null,
    away_score: null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id });
}