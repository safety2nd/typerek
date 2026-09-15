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
 * This only ever INSERTS. A fixture already in the table is skipped, so a
 * kickoff that moves after import is not corrected here — use
 * `scripts/sync-fixture-dates.mjs` for that.
 *
 * Auto-loads .env / .env.local from the project root.
 */
import { supabaseRest } from "./lib/env.mjs";
import { fetchRoundFixtures, seasonFromUrl } from "./lib/ekstraklasa.mjs";

const api = supabaseRest();

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("Usage: node scripts/add-fixtures.mjs <terminarz-url> [matchday]");
  process.exit(1);
}
const terminarzUrl = args[0];
const matchday = args.length > 1 ? Number(args[1]) || null : null;

async function main() {
  const season = seasonFromUrl(terminarzUrl);
  if (!season) {
    console.error("Could not parse season from URL. Expected format: .../2026-2027/kolejka-N/");
    process.exit(1);
  }

  let effectiveMatchday = matchday;
  if (effectiveMatchday == null) {
    const mdMatch = terminarzUrl.match(/kolejka-(\d+)/);
    effectiveMatchday = mdMatch ? Number(mdMatch[1]) : null;
  }

  let parsed;
  try {
    parsed = await fetchRoundFixtures(terminarzUrl);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  // Keep only fixtures belonging to the target round. The "Przełożone"
  // accordion lists postponed matches from OTHER rounds that fall in this date
  // window; importing those as part of this round would be wrong. A
  // current-round fixture that is itself postponed stays.
  const fixtures = [];
  for (const f of parsed) {
    if (effectiveMatchday != null && f.week !== effectiveMatchday) {
      console.log(`SKIP (week ${f.week} ≠ ${effectiveMatchday}): ${f.home_team} vs ${f.away_team}`);
      continue;
    }
    fixtures.push(f);
  }

  if (fixtures.length === 0) {
    console.error("No fixtures parsed from page. Check the URL or page structure.");
    process.exit(1);
  }

  console.log(`Parsed ${fixtures.length} fixtures from ${terminarzUrl}:`);
  for (const f of fixtures) {
    const note = f.original_kickoff
      ? ` [POSTPONED, przełożony z ${f.original_kickoff}]`
      : f.postponed
        ? " [POSTPONED]"
        : "";
    console.log(`  ${f.home_team} vs ${f.away_team} @ ${f.kickoff}${note}`);
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
        utc_date: f.kickoff,
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
