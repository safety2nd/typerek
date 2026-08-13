import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Private write endpoint for the AI prediction log.
 *
 * Exists because cloud routines (the T-45 pre-kickoff runs) have no
 * `.env.local` and therefore no service-role key — the anon key is blocked by
 * RLS, so they cannot write to `ai_predictions` directly. They call this
 * instead with a shared secret.
 *
 * Deliberately narrow: the ONLY table this route may touch is
 * `public.ai_predictions`. It must never write to `predictions` or `profiles`
 * — the AI is invisible to app users and does not compete in the standings.
 */

type Entry = {
  fixture_id?: unknown;
  home?: unknown;
  away?: unknown;
  home_score?: unknown;
  away_score?: unknown;
  confidence?: unknown;
  rationale?: unknown;
  model?: unknown;
};

const CONFIDENCE = new Set(["Wysoka", "Średnia", "Niska"]);
const MAX_ENTRIES = 20;

function authorized(request: Request) {
  const secret = process.env.AI_PREDICTIONS_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  // timingSafeEqual throws on length mismatch, so compare lengths first
  return a.length === b.length && timingSafeEqual(a, b);
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > max) return null;
  return s;
}

function goals(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 20 ? n : null;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Nieautoryzowany" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const entries: Entry[] = Array.isArray(body) ? body : body ? [body] : [];
  if (entries.length === 0 || entries.length > MAX_ENTRIES) {
    return NextResponse.json(
      { error: `Oczekiwano 1-${MAX_ENTRIES} predykcji` },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  const results: { fixture_id: number | null; ok: boolean; error?: string }[] = [];

  for (const entry of entries) {
    const home_score = goals(entry.home_score);
    const away_score = goals(entry.away_score);
    const model = str(entry.model, 80);

    if (home_score === null || away_score === null || !model) {
      results.push({
        fixture_id: null,
        ok: false,
        error: "Wymagane: home_score, away_score, model",
      });
      continue;
    }

    // Resolve the fixture either by id or by team names. Routines have the
    // teams baked into their prompt but not always the fixture id.
    let fixtureId: number | null = null;
    if (entry.fixture_id !== undefined) {
      const n = Number(entry.fixture_id);
      fixtureId = Number.isInteger(n) ? n : null;
    } else {
      const home = str(entry.home, 60);
      const away = str(entry.away, 60);
      if (home && away) {
        const { data } = await supabase
          .from("fixtures")
          .select("id")
          .eq("home_team", home)
          .eq("away_team", away)
          .neq("status", "FINISHED")
          .order("utc_date", { ascending: true })
          .limit(1);
        fixtureId = data?.[0]?.id ?? null;
      }
    }

    if (fixtureId === null) {
      results.push({ fixture_id: null, ok: false, error: "Nie znaleziono meczu" });
      continue;
    }

    const { data: fixture } = await supabase
      .from("fixtures")
      .select("status")
      .eq("id", fixtureId)
      .single();
    if (!fixture) {
      results.push({ fixture_id: fixtureId, ok: false, error: "Mecz nie istnieje" });
      continue;
    }
    if (fixture.status === "FINISHED") {
      results.push({
        fixture_id: fixtureId,
        ok: false,
        error: "Mecz zakończony — predykcja odrzucona",
      });
      continue;
    }

    const confidence = str(entry.confidence, 20);
    const { error } = await supabase.from("ai_predictions").upsert(
      {
        fixture_id: fixtureId,
        home_score,
        away_score,
        confidence: confidence && CONFIDENCE.has(confidence) ? confidence : null,
        rationale: str(entry.rationale, 500),
        model,
      },
      { onConflict: "fixture_id,model" },
    );

    results.push(
      error
        ? { fixture_id: fixtureId, ok: false, error: error.message }
        : { fixture_id: fixtureId, ok: true },
    );
  }

  const saved = results.filter((r) => r.ok).length;
  return NextResponse.json(
    { ok: saved === results.length, saved, results },
    { status: saved === results.length ? 200 : 207 },
  );
}
