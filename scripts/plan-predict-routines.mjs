#!/usr/bin/env node
/**
 * Plan T-45 prediction routines for upcoming SCHEDULED fixtures.
 *
 * This script does NOT create the routines — routine creation goes through the
 * claude.ai remote-trigger API, whose OAuth token is only available in-process
 * to Claude Code (see .claude/skills/add-fixtures/SKILL.md, Step 4). The script
 * does the database read and the time arithmetic; Claude makes the API calls
 * from the JSON printed here.
 *
 * Usage:
 *   node scripts/plan-predict-routines.mjs [--matchday N] [--lead-minutes 46] [--json]
 * Example:
 *   node scripts/plan-predict-routines.mjs --matchday 3 --json
 *
 * Auto-loads .env / .env.local from the project root.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

for (const file of [".env", ".env.local"]) {
  const p = join(projectRoot, file);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const [, k, v] = m;
    if (process.env[k] === undefined) process.env[k] = v.replace(/^["']|["']$/g, "");
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const base = url.replace(/\/$/, "");
const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
};

// --- args -----------------------------------------------------------------
const args = process.argv.slice(2);
let matchday = null;
// 46, not 45: kickoffs land on :00/:15/:30/:45, and a 45-minute lead would put
// every run on a :00 or :30 mark — the two minutes every scheduler on the
// planet piles onto. One minute earlier costs nothing and spreads the load.
let leadMinutes = 46;
let asJson = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--json") asJson = true;
  else if (a === "--matchday") matchday = Number(args[++i]);
  else if (a === "--lead-minutes") leadMinutes = Number(args[++i]);
  else {
    console.error(`Unknown argument: ${a}`);
    console.error("Usage: node scripts/plan-predict-routines.mjs [--matchday N] [--lead-minutes 46] [--json]");
    process.exit(1);
  }
}

if (!Number.isFinite(leadMinutes) || leadMinutes <= 0) {
  console.error("--lead-minutes must be a positive number");
  process.exit(1);
}
if (matchday !== null && !Number.isFinite(matchday)) {
  console.error("--matchday must be a number");
  process.exit(1);
}

// --- fetch ----------------------------------------------------------------
const nowIso = new Date().toISOString();
const matchdayFilter = matchday !== null ? `&matchday=eq.${matchday}` : "";
const query =
  `/rest/v1/fixtures?select=id,utc_date,home_team,away_team,matchday,matchday_name,status` +
  `&status=eq.SCHEDULED&utc_date=gt.${nowIso}${matchdayFilter}&order=utc_date.asc`;

const res = await fetch(`${base}${query}`, { headers });
if (!res.ok) {
  console.error(`Supabase query failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const rows = await res.json();

// --- plan -----------------------------------------------------------------
const now = Date.now();
const plan = [];
const skipped = [];

for (const row of rows) {
  const kickoff = new Date(row.utc_date);
  const fireAt = new Date(kickoff.getTime() - leadMinutes * 60_000);
  const kickoffLocal = kickoff.toLocaleString("sv-SE", {
    timeZone: "Europe/Warsaw",
    dateStyle: "short",
    timeStyle: "short",
  });

  // The API rejects a run_once_at in the past, and a routine that fires after
  // kickoff is worse than useless — the lineups it researches are stale.
  if (fireAt.getTime() <= now) {
    skipped.push({
      reason: kickoff.getTime() <= now ? "kickoff passed" : `T-${leadMinutes} already passed`,
      home_team: row.home_team,
      away_team: row.away_team,
      kickoff_local: kickoffLocal,
    });
    continue;
  }

  plan.push({
    fixture_id: row.id,
    home_team: row.home_team,
    away_team: row.away_team,
    matchday: row.matchday,
    matchday_name: row.matchday_name,
    kickoff_utc: kickoff.toISOString().replace(/\.\d{3}Z$/, "Z"),
    kickoff_local: kickoffLocal,
    kickoff_date_pl: kickoff.toLocaleDateString("pl-PL", {
      timeZone: "Europe/Warsaw",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    run_once_at: fireAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
    routine_name: `Typerek T-45: ${row.home_team} vs ${row.away_team}`,
  });
}

if (asJson) {
  console.log(JSON.stringify({ lead_minutes: leadMinutes, plan, skipped }, null, 2));
} else {
  if (plan.length === 0) {
    console.log("No fixtures to arm.");
  }
  for (const p of plan) {
    console.log(`ARM: ${p.routine_name}`);
    console.log(`     kickoff ${p.kickoff_local} (Warsaw) — fire at ${p.run_once_at} (UTC)`);
  }
  for (const s of skipped) {
    console.log(`SKIP (${s.reason}): ${s.home_team} vs ${s.away_team} @ ${s.kickoff_local}`);
  }
  console.log(`\nDone: ${plan.length} to arm, ${skipped.length} skipped.`);
}
