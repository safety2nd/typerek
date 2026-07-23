import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canPredict } from "@/lib/scoring";
import type { Fixture } from "@/lib/types";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nieautoryzowany" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const fixtureId = Number(body?.fixture_id);
  const home = Number(body?.home_score);
  const away = Number(body?.away_score);
  if (!Number.isInteger(fixtureId) || !Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const { data: fixture } = await supabase
    .from("fixtures")
    .select("utc_date, status")
    .eq("id", fixtureId)
    .single();
  if (!fixture) return NextResponse.json({ error: "Mecz nie znaleziony" }, { status: 404 });
  if (!canPredict(fixture as Pick<Fixture, "utc_date" | "status">)) {
    return NextResponse.json({ error: "Mecz się już rozpoczął" }, { status: 409 });
  }

  const { error } = await supabase
    .from("predictions")
    .upsert(
      { user_id: user.id, fixture_id: fixtureId, home_score: home, away_score: away },
      { onConflict: "user_id,fixture_id" },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}