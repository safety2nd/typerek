#!/usr/bin/env node
/**
 * Detect (and optionally apply) kickoff changes for fixtures already in the
 * `fixtures` table.
 *
 * `add-fixtures.mjs` only inserts — it skips anything already present — so a
 * match that moves after it was imported keeps its stale kickoff forever, and
 * nothing in the app surfaces that. This script closes that gap: it re-reads
 * the terminarz pages for the rounds in the table and compares each fixture's
 * kickoff against the site.
 *
 * Reports by default and writes nothing. `--apply` performs the safe subset.
 *
 * Usage:
 *   node scripts/sync-fixture-dates.mjs [--matchday N] [--season YYYY-YYYY] [--apply]
 * Examples:
 *   node scripts/sync-fixture-dates.mjs                 # audit every round
 *   node scripts/sync-fixture-dates.mjs --matchday 4    # one round
 *   node scripts/sync-fixture-dates.mjs --apply         # audit and fix
 *
 * Exit codes: 0 = nothing to do, 2 = drift found (report mode), 1 = error.
 * The non-zero code on drift is so this can be wired into a scheduled check.
 *
 * Auto-loads .env / .env.local from the project root.
 */
import { supabaseRest } from "./lib/env.mjs";
import { fetchRoundFixtures, roundUrl } from "./lib/ekstraklasa.mjs";

const api = supabaseRest();

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
function argValue(flag) {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
}
const onlyMatchday = argValue("--matchday") ? Number(argValue("--matchday")) : null;
const seasonArg = argValue("--season");

// A fixture that has already been played is never rewritten: its kickoff is
// history, and score_fixture has already run against it.
const IMMUTABLE_STATUSES = new Set(["FINISHED", "IN_PLAY"]);

function warsaw(iso) {
  return new Date(iso).toLocaleString("pl-PL", {
    timeZone: "Europe/Warsaw",
    dateStyle: "short",
    timeStyle: "short",
  });
}

async function main() {
  const filter = onlyMatchday != null ? `&matchday=eq.${onlyMatchday}` : "";
  const { ok, body: rows } = await api(
    `/rest/v1/fixtures?select=id,home_team,away_team,matchday,season,status,utc_date${filter}&order=matchday.asc`,
  );
  if (!ok) {
    console.error("Failed to read fixtures:", rows);
    process.exit(1);
  }
  if (!rows?.length) {
    console.log("No fixtures in the table for that filter.");
    return;
  }

  const season = seasonArg ?? rows.find((r) => r.season)?.season;
  if (!season) {
    console.error("Could not determine season. Pass --season YYYY-YYYY.");
    process.exit(1);
  }

  const rounds = [...new Set(rows.map((r) => r.matchday).filter((m) => m != null))].sort(
    (a, b) => a - b,
  );
  console.log(`Season ${season}: checking ${rows.length} fixtures across ${rounds.length} round(s).\n`);

  // Index the site's view of every fixture by team pair + round. Each round
  // page also carries the "Przełożone" accordion, so one page can resolve
  // fixtures belonging to other rounds too — harmless, the key disambiguates.
  const site = new Map();
  for (const round of rounds) {
    const url = roundUrl(season, round);
    try {
      for (const f of await fetchRoundFixtures(url)) {
        site.set(`${f.home_team}|${f.away_team}|${f.week}`, f);
      }
      // Overwrite in place on a terminal; one line per round when piped.
      if (process.stdout.isTTY) process.stdout.write(`  fetched kolejka ${round}\r`);
      else console.log(`  fetched kolejka ${round}`);
    } catch (e) {
      console.error(`\nFailed to fetch kolejka ${round}: ${e.message}`);
      process.exit(1);
    }
  }
  if (process.stdout.isTTY) process.stdout.write(" ".repeat(40) + "\r");
  console.log();

  const drift = [];
  const pending = [];
  const frozen = [];
  const missing = [];

  for (const row of rows) {
    const f = site.get(`${row.home_team}|${row.away_team}|${row.matchday}`);
    if (!f) {
      missing.push(row);
      continue;
    }
    if (new Date(f.kickoff).getTime() === new Date(row.utc_date).getTime()) continue;

    const entry = { row, site: f };
    if (IMMUTABLE_STATUSES.has(row.status)) frozen.push(entry);
    else if (!f.kickoff_time_known) pending.push(entry);
    else drift.push(entry);
  }

  const label = (e) => `kol.${e.row.matchday} ${e.row.home_team} v ${e.row.away_team}`;

  if (drift.length) {
    console.log(`Kickoff moved (${drift.length}):`);
    for (const e of drift) {
      const toScheduled = e.row.status === "POSTPONED" ? "  [POSTPONED -> SCHEDULED]" : "";
      console.log(`  ${label(e)}`);
      console.log(`      ${warsaw(e.row.utc_date)}  ->  ${warsaw(e.site.kickoff)}${toScheduled}`);
    }
    console.log();
  }

  if (pending.length) {
    console.log(`Date announced but no kickoff time yet (${pending.length}) — left alone:`);
    for (const e of pending) {
      console.log(`  ${label(e)}  ->  ${e.site.kickoff.slice(0, 10)} (time TBD), still ${e.row.status}`);
    }
    console.log();
  }

  if (frozen.length) {
    console.log(`Differs but already played (${frozen.length}) — not touched:`);
    for (const e of frozen) {
      console.log(`  ${label(e)}  db ${warsaw(e.row.utc_date)} vs site ${warsaw(e.site.kickoff)}`);
    }
    console.log();
  }

  if (missing.length) {
    console.log(`Not found on the site (${missing.length}) — check team naming:`);
    for (const row of missing) {
      console.log(`  kol.${row.matchday} ${row.home_team} v ${row.away_team}`);
    }
    console.log();
  }

  if (!drift.length && !pending.length && !frozen.length && !missing.length) {
    console.log("All fixture kickoffs match the site.");
    return;
  }

  if (!drift.length) {
    console.log("Nothing to apply.");
    return;
  }

  if (!apply) {
    console.log(`Re-run with --apply to update ${drift.length} fixture(s).`);
    process.exit(2);
  }

  let updated = 0;
  for (const e of drift) {
    const patch = { utc_date: new Date(e.site.kickoff).toISOString() };
    // A real date and time means the match is on again, so re-open it for
    // predictions. Any other status is left as the admin set it.
    if (e.row.status === "POSTPONED") patch.status = "SCHEDULED";
    const { ok: patched, body } = await api(`/rest/v1/fixtures?id=eq.${e.row.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    if (!patched) {
      console.error(`UPDATE FAILED ${label(e)}:`, body?.message ?? body);
      continue;
    }
    console.log(`UPDATED ${label(e)} -> ${warsaw(e.site.kickoff)}${patch.status ? ` [${patch.status}]` : ""}`);
    updated++;
  }
  console.log(`\nDone: ${updated} of ${drift.length} updated.`);
  if (updated) {
    console.log("Arm T-45 routines for the moved fixtures: node scripts/plan-predict-routines.mjs --matchday <N> --json");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
