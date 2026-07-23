import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { syncFixtures } from "@/lib/fixtures";

// Admin-triggered sync (authenticated via session, no cron secret needed).
export async function POST() {
  await requireAdmin();
  try {
    const count = await syncFixtures();
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}