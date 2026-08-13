#!/usr/bin/env node
/**
 * Log AI score predictions into public.ai_predictions (service-role only).
 *
 * This table is private: it is NOT part of the app data model, has no profile
 * row, and RLS denies all access to anon/authenticated. It exists to measure
 * prediction quality against real results. See supabase/ai-predictions.sql.
 *
 * Usage (single):
 *   node scripts/add-ai-prediction.mjs "Legia Warszawa" 2-0 "Radomiak Radom" \
 *     --confidence=Wysoka --rationale="Wypoczęta Legia bez pucharów" --model=claude-opus-5
 *
 * Usage (bulk, one round at a time — preferred):
 *   node scripts/add-ai-prediction.mjs --json < round.json
 *   where round.json is:
 *   [{"home":"Legia Warszawa","away":"Radomiak Radom","score":"2-0",
 *     "confidence":"Wysoka","rationale":"...","model":"claude-opus-5"}, ...]
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

const DEFAULT_MODEL = "claude-opus-5";

function parseScore(score) {
  const m = String(score).match(/^(\d+)-(\d+)$/);
  if (!m) throw new Error(`Score must be like 2-1, got '${score}'`);
  return { homeScore: Number(m[1]), awayScore: Number(m[2]) };
}

/** Resolve the soonest fixture for this pairing that has not finished yet. */
async function findFixture(homeTeam, awayTeam) {
  const { ok, body } = await api(
    `/rest/v1/fixtures?home_team=eq.${encodeURIComponent(homeTeam)}` +
      `&away_team=eq.${encodeURIComponent(awayTeam)}` +
      `&status=neq.FINISHED&order=utc_date.asc&limit=1` +
      `&select=id,home_team,away_team,utc_date,status`,
  );
  if (!ok || !body?.length) {
    throw new Error(`No unfinished fixture '${homeTeam}' vs '${awayTeam}'`);
  }
  return body[0];
}

async function upsert(entry) {
  const { home, away, score, confidence, rationale } = entry;
  const model = entry.model ?? DEFAULT_MODEL;
  const { homeScore, awayScore } = parseScore(score);
  const fixture = await findFixture(home, away);

  // on_conflict must be a query param — as a header PostgREST ignores it and
  // falls back to the primary key (a fresh uuid), so re-runs would 409 instead
  // of merging.
  const { ok, body } = await api(`/rest/v1/ai_predictions?on_conflict=fixture_id,model`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      fixture_id: fixture.id,
      home_score: homeScore,
      away_score: awayScore,
      confidence: confidence ?? null,
      rationale: rationale ?? null,
      model,
    }),
  });
  if (!ok) throw new Error(`upsert failed: ${body?.message ?? JSON.stringify(body)}`);

  console.log(
    `  ${home} ${homeScore}:${awayScore} ${away}` +
      `  [${confidence ?? "—"}] (${model}) -> fixture ${fixture.id}`,
  );
}

function parseFlags(args) {
  const flags = {};
  const rest = [];
  for (const a of args) {
    const m = a.match(/^--([a-z]+)=(.*)$/);
    if (m) flags[m[1]] = m[2];
    else if (a === "--json") flags.json = true;
    else rest.push(a);
  }
  return { flags, rest };
}

const { flags, rest } = parseFlags(process.argv.slice(2));

let entries;
if (flags.json) {
  const raw = readFileSync(0, "utf8");
  entries = JSON.parse(raw);
  if (!Array.isArray(entries)) {
    console.error("--json expects a JSON array on stdin");
    process.exit(1);
  }
} else if (rest.length === 3) {
  const [home, score, away] = rest;
  entries = [
    {
      home,
      away,
      score,
      confidence: flags.confidence,
      rationale: flags.rationale,
      model: flags.model,
    },
  ];
} else {
  console.error('Usage: node scripts/add-ai-prediction.mjs "<home>" <h>-<a> "<away>" [--confidence=] [--rationale=] [--model=]');
  console.error("   or: node scripts/add-ai-prediction.mjs --json < round.json");
  process.exit(1);
}

console.log(`Logging ${entries.length} AI prediction(s):`);
let failed = 0;
for (const entry of entries) {
  try {
    await upsert(entry);
  } catch (err) {
    failed++;
    console.error(`  SKIP ${entry.home} vs ${entry.away}: ${err.message}`);
  }
}
if (failed) {
  console.error(`\n${failed} of ${entries.length} failed.`);
  process.exit(1);
}
console.log(`\nDone: ${entries.length} logged.`);
