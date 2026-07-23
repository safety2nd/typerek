import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import type { FixtureStatus } from "@/lib/types";

const VALID_STATUSES: FixtureStatus[] = ["SCHEDULED", "IN_PLAY", "FINISHED", "CANCELLED"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await params;
  const fixtureId = Number(id);
  const body = await request.json().catch(() => ({}));

  const patch: { home_score?: number | null; away_score?: number | null; status?: FixtureStatus } = {};
  if (body.home_score === null || (Number.isInteger(body.home_score) && body.home_score >= 0 && body.home_score <= 50)) {
    patch.home_score = body.home_score;
  }
  if (body.away_score === null || (Number.isInteger(body.away_score) && body.away_score >= 0 && body.away_score <= 50)) {
    patch.away_score = body.away_score;
  }
  if (typeof body.status === "string" && VALID_STATUSES.includes(body.status as FixtureStatus)) {
    patch.status = body.status as FixtureStatus;
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("fixtures").update(patch).eq("id", fixtureId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Force re-score if finished with scores (DB trigger also fires, but be safe).
  if (patch.status === "FINISHED" && patch.home_score != null && patch.away_score != null) {
    await supabase.rpc("score_fixture", { f_fixture_id: fixtureId });
  }
  return NextResponse.json({ ok: true });
}