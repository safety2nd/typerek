# Garage League

Ekstraklasa score-prediction pool for you and your buddies. Built with Next.js 16 + Supabase + Vercel (all free tiers).

## Features

- Individual user accounts (admin creates them — no public sign-up).
- Predict exact scores for upcoming Ekstraklasa fixtures.
- Scoring: **2 pts** for exact score, **1 pt** for correct outcome (home win / draw / away win), **0** otherwise.
- Global predictions list + live standings leaderboard.
- Admin can edit fixture results (fix mistakes), add/remove users, and toggle admins.
- Fixtures auto-sync daily from [TheSportsDB](https://www.thesportsdb.com/) (free, no key, Ekstraklasa league 4422).
- Scoring runs automatically in Postgres when a fixture is marked FINISHED.

## Stack

- **Frontend**: Next.js 16 (app router, proxy auth), Tailwind CSS v4.
- **Backend/DB**: Supabase (Postgres + Auth + RLS).
- **Hosting**: Vercel (free) + Vercel Cron for daily fixture sync.
- **Fixtures API**: TheSportsDB (free tier, no key needed, Ekstraklasa league ID 4422).

## Setup

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run [`supabase/schema.sql`](supabase/schema.sql).
3. From *Project Settings → API*, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### 2. TheSportsDB

No signup needed — the app uses TheSportsDB's free public API (key `3`), which covers the current Ekstraklasa season (league 4422).

### 3. Local env

```bash
cp .env.example .env.local
# fill in the values, plus:
#   CRON_SECRET=$(openssl rand -hex 16)
#   NEXT_PUBLIC_APP_URL=http://localhost:3000
nvm use 20
npm install
npm run dev
```

### 4. Create the admin user

```bash
node scripts/seed-admin.mjs admin "super-secret-pw"
```

Then log in at `/login` with the username `admin`.

### 5. Add buddies

In the app → **Admin → Użytkownicy → Dodaj użytkownika**. Each buddy gets their own username + password. Log in with the username (no email needed).

## Deploy to Vercel

1. Push the repo to GitHub.
2. Import the project in Vercel.
3. Add all env vars from `.env.example` (set `NEXT_PUBLIC_APP_URL` to your Vercel URL).
4. Deploy. Vercel Cron (configured in `vercel.json`) hits `/api/cron/sync-fixtures?secret=$CRON_SECRET` daily at 06:00 UTC.

> **No cron?** Run the sync manually from **Admin → Fixtures → Sync now**, or hit the endpoint with any scheduler:
> ```bash
> curl -X POST "https://your-app.vercel.app/api/cron/sync-fixtures?secret=$CRON_SECRET"
> ```

## Scoring

Scoring is implemented as a Postgres function `score_fixture(fixture_id)` (see `supabase/schema.sql`). A trigger fires whenever a fixture's status becomes `FINISHED` with both scores set, recomputing points for all predictions on that fixture. The admin results editor also calls the function explicitly as a safety net.

## Project structure

```
src/
  app/
    page.tsx              # Predict upcoming fixtures
    login/                # Login page
    standings/            # Leaderboard
    predictions/          # Global predictions list
    admin/
      page.tsx            # Admin hub (admin only)
      users/              # Add / remove users
      fixtures/           # Edit results, sync fixtures
    api/
      predictions/        # POST a prediction
      admin/users/        # Admin user management
      admin/fixtures/[id] # Edit fixture result
      admin/sync/         # Authenticated sync trigger
      cron/sync-fixtures/ # Cron-triggered sync (secret-protected)
      health/             # Health check
  components/             # UI components
  lib/
    supabase/             # Supabase clients (server + browser)
    auth.ts               # Session helpers
    fixtures.ts           # TheSportsDB sync (Ekstraklasa league 4422)
    scoring.ts            # Client-side scoring helpers
    queries.ts            # Data access
    types.ts
  proxy.ts                # Auth guard (all routes except /login + cron/health)
supabase/schema.sql       # Run this once in Supabase
scripts/seed-admin.mjs    # Create the first admin user
vercel.json               # Cron schedule
```