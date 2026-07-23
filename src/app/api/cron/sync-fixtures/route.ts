import { NextResponse } from "next/server";
import { syncFixtures } from "@/lib/fixtures";

// Vercel Cron hits this endpoint with ?secret=... (CRON_SECRET env).
// Also callable locally or via any scheduler with the matching header.
export async function POST(request: Request) {
  const secret =
    request.headers.get("x-cron-secret") ??
    new URL(request.url).searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Nieautoryzowany" }, { status: 401 });
  }
  try {
    const count = await syncFixtures();
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}