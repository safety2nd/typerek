/**
 * Shared env loading + Supabase REST helper for the scripts in this directory.
 *
 * `scripts/add-prediction.mjs` and `scripts/seed-admin.mjs` still carry their
 * own inline copies of this block; they can be moved over when next touched.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Load .env / .env.local into process.env. Existing vars win. */
export function loadEnv() {
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
}

/**
 * Returns an `api(path, init)` function bound to the service-role key, which
 * bypasses RLS. Exits the process if the credentials are missing.
 */
export function supabaseRest() {
  loadEnv();
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
  return async function api(path, init = {}) {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers ?? {}) },
    });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  };
}
