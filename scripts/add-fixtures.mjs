#!/usr/bin/env node
/**
 * Fetch fixtures for one Ekstraklasa round from ekstraklasa.org and insert
 * them into the Supabase `fixtures` table (service role, bypasses RLS).
 *
 * Usage:
 *   node scripts/add-fixtures.mjs <terminarz-url> [matchday]
 * Example:
 *   node scripts/add-fixtures.mjs https://ekstraklasa.org/terminarz/2026-2027/kolejka-2/ 2
 *
 * - Deduplicates against existing rows by (home_team, away_team, matchday).
 * - Marks postponed fixtures with status "POSTPONED".
 * - Schedules fixtures get status "SCHEDULED".
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
if (args.length < 1) {
  console.error("Usage: node scripts/add-fixtures.mjs <terminarz-url> [matchday]");
  process.exit(1);
}
const terminarzUrl = args[0];
const matchday = args.length > 1 ? Number(args[1]) || null : null;

async function main() {
  // Fetch the terminarz page
  const res = await fetch(terminarzUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; typerek-bot)" },
  });
  if (!res.ok) {
    console.error(`Failed to fetch ${terminarzUrl}: ${res.status}`);
    process.exit(1);
  }
  const html = await res.text();

  // Extract season from URL: /terminarz/2026-2027/kolejka-2/
  const seasonMatch = terminarzUrl.match(/\/terminarz\/(\d{4}-\d{4})\//);
  const season = seasonMatch ? seasonMatch[1] : null;
  if (!season) {
    console.error("Could not parse season from URL. Expected format: .../2026-2027/kolejka-N/");
    process.exit(1);
  }

  // Extract matchday from URL if not provided
  let effectiveMatchday = matchday;
  if (effectiveMatchday == null) {
    const mdMatch = terminarzUrl.match(/kolejka-(\d+)/);
    effectiveMatchday = mdMatch ? Number(mdMatch[1]) : null;
  }

  // Parse fixtures from the embedded Next.js JSON (self.__next_f stream).
  // The page's JSON contains every fixture shown on the terminarz page:
  //   - the current round's matches (in the main list)
  //   - postponed matches from OTHER rounds that land in this date window
  //     (shown in a collapsed "Przełożone" accordion at the bottom)
  // Each fixture object has a `week` field identifying which round it belongs
  // to. We keep only fixtures whose `week` matches the target matchday, so
  // postponed fixtures from other rounds are NOT imported as part of this
  // round. A fixture in the current round that is itself postponed stays
  // (postponed=true) and is inserted with status POSTPONED.
  //
  // The JSON is escaped inside the __next_f payloads (quotes appear as \"),
  // so we unescape backslash-quotes first.
  const json = html.split('\\"').join('"');
  // Match each fixture object: homeTeam.name, awayTeam.name, matchDatetime,
  // week, postponed. The fields can appear in any order within the object, so
  // we capture the whole object (matchId ... } before the next matchId) and
  // pull fields out of it.
  const fixtureRe = /"matchId":"[^"]*","seasonId":"[^"]*","seasonName":[^,]*,"stage":"[^"]*","status":"[^"]*","homeTeam":\{"id":"[^"]*","name":"([^"]+)".*?"awayTeam":\{"id":"[^"]*","name":"([^"]+)"[\s\S]*?"matchDatetime":"([^"]*)"[\s\S]*?"postponed":(true|false)[\s\S]*?"week":(\d+)/g;

  const fixtures = [];
  const seenInRun = new Set();
  let m;
  while ((m = fixtureRe.exec(json)) !== null) {
    const [, home, away, matchDatetime, postponed, week] = m;
    // Only keep fixtures that belong to the target round. Postponed matches
    // from other rounds (shown in the "Przełożone" accordion) are skipped.
    if (effectiveMatchday != null && Number(week) !== effectiveMatchday) {
      console.log(`SKIP (week ${week} ≠ ${effectiveMatchday}): ${home} vs ${away}`);
      continue;
    }
    const key = `${home}|${away}`;
    if (seenInRun.has(key)) continue; // dedupe within a single run
    seenInRun.add(key);
    fixtures.push({
      home_team: home,
      away_team: away,
      utc_date: matchDatetime,
      postponed: postponed === "true",
    });
  }

  if (fixtures.length === 0) {
    console.error("No fixtures parsed from page. Check the URL or page structure.");
    process.exit(1);
  }

  console.log(`Parsed ${fixtures.length} fixtures from ${terminarzUrl}:`);
  for (const f of fixtures) {
    console.log(`  ${f.home_team} vs ${f.away_team} @ ${f.utc_date}${f.postponed ? " [POSTPONED]" : ""}`);
  }

  // Fetch existing fixtures with the same matchday to deduplicate
  const matchdayFilter = effectiveMatchday != null ? `&matchday=eq.${effectiveMatchday}` : "";
  const existing = await api(
    `/rest/v1/fixtures?select=id,home_team,away_team,matchday,status${matchdayFilter}`,
  );
  const existingKey = new Set();
  for (const row of existing.body ?? []) {
    existingKey.add(`${row.home_team}|${row.away_team}|${row.matchday ?? ""}`);
  }

  let inserted = 0;
  let skipped = 0;
  for (const f of fixtures) {
    const key = `${f.home_team}|${f.away_team}|${effectiveMatchday ?? ""}`;
    if (existingKey.has(key)) {
      console.log(`SKIP (exists): ${f.home_team} vs ${f.away_team}`);
      skipped++;
      continue;
    }
    const id = -Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 1000000);
    const { ok, body } = await api("/rest/v1/fixtures", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        id,
        home_team: f.home_team,
        away_team: f.away_team,
        utc_date: f.utc_date,
        matchday: effectiveMatchday,
        matchday_name: effectiveMatchday ? `Kolejka ${effectiveMatchday}` : null,
        season,
        competition: "Ekstraklasa",
        status: f.postponed ? "POSTPONED" : "SCHEDULED",
        home_score: null,
        away_score: null,
      }),
    });
    if (!ok) {
      console.error(`INSERT FAILED: ${f.home_team} vs ${f.away_team}:`, body?.message ?? body);
      continue;
    }
    console.log(`INSERTED: ${f.home_team} vs ${f.away_team} (${f.postponed ? "POSTPONED" : "SCHEDULED"}) id=${id}`);
    inserted++;
    existingKey.add(key);
  }

  console.log(`\nDone: ${inserted} inserted, ${skipped} skipped (already present).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});