#!/usr/bin/env node
/**
 * Backup all Garage League tables to JSON files.
 *
 * Usage:
 *   node scripts/backup.mjs [output-dir]
 *
 * Auto-loads .env / .env.local. Uses the service role key to dump everything.
 * Output: ./backups/backup-YYYY-MM-DD-HHMMSS/ by default.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

// Load .env files
for (const file of [".env", ".env.local"]) {
  const p = join(projectRoot, file);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const [, k, v] = m;
    if (process.env[k] === undefined) {
      process.env[k] = v.replace(/^["']|["']$/g, "");
    }
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const TABLES = ["profiles", "fixtures", "predictions", "audit_log", "auth_log"];

const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = process.argv[2] ?? join(projectRoot, "backups", `backup-${ts}`);
mkdirSync(outDir, { recursive: true });

const headers = { apikey: key, Authorization: `Bearer ${key}` };

for (const table of TABLES) {
  const res = await fetch(`${url}/rest/v1/${table}?order=id.asc`, { headers });
  if (!res.ok) {
    console.error(`  ${table}: FAILED (${res.status})`);
    continue;
  }
  const data = await res.json();
  const file = join(outDir, `${table}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`  ${table}: ${Array.isArray(data) ? data.length : 0} rows -> ${file}`);
}

console.log(`\nBackup complete: ${outDir}`);