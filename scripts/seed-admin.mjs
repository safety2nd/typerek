#!/usr/bin/env node
/**
 * Seed an initial admin user into Supabase Auth + profiles.
 * Also doubles as a user-listing tool (run with no args).
 *
 * Usage:
 *   node scripts/seed-admin.mjs                     # list users
 *   node scripts/seed-admin.mjs <email> <password> <username>
 *
 * Auto-loads .env / .env.local from the project root.
 * Uses the Supabase REST API directly (no supabase-js, so it runs on any Node).
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

// Load .env files manually (no dotenv dependency needed)
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
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (check .env.local)",
  );
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

async function listUsers() {
  const { ok, body } = await api("/auth/v1/admin/users");
  if (!ok) {
    console.error("Failed to list users:", body?.message ?? body);
    process.exit(1);
  }
  const users = body?.users ?? [];
  if (users.length === 0) {
    console.log("No users found. Run:");
    console.log("  node scripts/seed-admin.mjs <username> <password>");
    return;
  }
  console.log(`Found ${users.length} user(s):`);
  for (const u of users) {
    const { body: profile } = await api(
      `/rest/v1/profiles?id=eq.${u.id}&select=username,is_admin`,
    );
    const p = profile?.[0];
    const name = p?.username ?? "(no profile)";
    const adminTag = p?.is_admin ? " [admin]" : "";
    const unconfirmed = u.email_confirmed_at ? "" : " (unconfirmed)";
    console.log(`  ${name}${adminTag}${unconfirmed}  <${u.email}>`);
  }
}

async function ensureProfile(userId, username) {
  // Upsert via REST using Prefer header
  const { ok, body } = await api(`/rest/v1/profiles`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: userId, username, is_admin: true }),
  });
  if (!ok) {
    // Fallback: PATCH (profile row may already exist from the auth trigger)
    const patch = await api(`/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ username, is_admin: true }),
    });
    if (!patch.ok) {
      console.error("Profile upsert failed:", body?.message ?? patch.body ?? body);
      process.exit(1);
    }
  }
}

async function findUserByEmail(email) {
  const list = await api(`/auth/v1/admin/users?page=1&per_page=1000`);
  return (list.body?.users ?? []).find((x) => x.email === email);
}

async function createUser(email, password, username) {
  const { ok, status, body } = await api("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { username },
    }),
  });

  // User already exists -> locate, reset password, fix up profile
  if (!ok && status === 422 && (body?.message ?? "").toLowerCase().includes("already")) {
    console.log(`User ${email} already exists in Auth. Resetting password + ensuring profile...`);
    const u = await findUserByEmail(email);
    if (!u) {
      console.error("Could not locate existing user by email.");
      process.exit(1);
    }
    const reset = await api(`/auth/v1/admin/users/${u.id}`, {
      method: "PUT",
      body: JSON.stringify({ password }),
    });
    if (!reset.ok) {
      console.error("Password reset failed:", reset.body?.message ?? reset.body);
      process.exit(1);
    }
    await ensureProfile(u.id, username);
    console.log(`Password reset + admin flag set: ${username} -> ${u.id}`);
    return;
  }

  if (!ok) {
    console.error("Failed to create user:", body?.message ?? body);
    process.exit(1);
  }

  const userId = body.id;
  await ensureProfile(userId, username);
  console.log(`Admin user created: ${username} -> ${userId}`);
}

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "").slice(0, 40);
}

// Accept either: <username> <password>  (email auto-generated)
//        or:    <email> <password> <username>  (legacy explicit email)
const args = process.argv.slice(2);

if (args.length === 0) {
  await listUsers();
} else if (args.length === 2) {
  const [username, password] = args;
  if (password.length < 8) {
    console.error("Password must be at least 8 characters");
    process.exit(1);
  }
  const email = `${slugify(username)}@garage-league.local`;
  await createUser(email, password, username);
} else if (args.length === 3) {
  const [email, password, username] = args;
  await createUser(email, password, username);
} else {
  console.error("Usage:");
  console.error("  node scripts/seed-admin.mjs <username> <password>");
  console.error("  node scripts/seed-admin.mjs <email> <password> <username>");
  process.exit(1);
}