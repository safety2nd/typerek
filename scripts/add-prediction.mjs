#!/usr/bin/env node
/**
 * Insert/update a prediction for a given username on a fixture matched by
 * home/away team names. Uses the service-role key (bypasses RLS).
 *
 * Usage:
 *   node scripts/add-prediction.mjs <username> "<home team>" <home>-<away> "<away team>"
 * Example:
 *   node scripts/add-prediction.mjs arturmiller "Lech Poznań" 2-1 "Cracovia"
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
  "Content-Type": "application/json",
};

async function api(path, init = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

const args = process.argv.slice(2);
if (args.length !== 4) {
  console.error('Usage: node scripts/add-prediction.mjs <username> "<home team>" <h>-<a> "<away team>"');
  process.exit(1);
}
const [username, homeTeam, score, awayTeam] = args;
const m = score.match(/^(\d+)-(\d+)$/);
if (!m) {
  console.error("Score must be like 2-1");
  process.exit(1);
}
const homeScore = Number(m[1]);
const awayScore = Number(m[2]);

// Find profile by username
const { ok: profOk, body: profBody } = await api(
  `/rest/v1/profiles?username=eq.${encodeURIComponent(username)}&select=id,username`,
);
if (!profOk || !profBody?.length) {
  console.error(`User '${username}' not found`);
  process.exit(1);
}
const userId = profBody[0].id;
console.log(`User: ${username} -> ${userId}`);

// Find fixture by home/away team names (match the most recent upcoming one)
const { ok: fixOk, body: fixBody } = await api(
  `/rest/v1/fixtures?home_team=eq.${encodeURIComponent(homeTeam)}&away_team=eq.${encodeURIComponent(awayTeam)}&order=utc_date.desc&limit=5&select=id,home_team,away_team,utc_date,status`,
);
if (!fixOk || !fixBody?.length) {
  console.error(`Fixture '${homeTeam}' vs '${awayTeam}' not found`);
  process.exit(1);
}
const fixture = fixBody[0];
console.log(`Fixture: ${fixture.home_team} vs ${fixture.away_team} (${fixture.utc_date}) [${fixture.status}] -> id ${fixture.id}`);

if (fixture.status === "FINISHED") {
  console.error("Fixture already FINISHED — cannot add prediction");
  process.exit(1);
}

// Upsert prediction (service role bypasses RLS and the block_points_tamper trigger)
const { ok: upOk, body: upBody } = await api(`/rest/v1/predictions`, {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates,return=representation" },
  body: JSON.stringify({
    user_id: userId,
    fixture_id: fixture.id,
    home_score: homeScore,
    away_score: awayScore,
  }),
});
if (!upOk) {
  console.error("Prediction upsert failed:", upBody?.message ?? upBody);
  process.exit(1);
}
console.log(`Prediction saved: ${homeTeam} ${homeScore}:${awayScore} ${awayTeam} for ${username}`);