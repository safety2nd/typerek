<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Commands

- Lint: `npm run lint`
- Typecheck: `npx tsc --noEmit`
- Build: `npm run build`
- Dev: `npm run dev`

Use Node 20+ (`nvm use 20`).

## Architecture

- Next.js 16 app router. Proxy (formerly middleware) at `src/proxy.ts` guards all routes except `/login` and cron/health APIs.
- Supabase for auth + Postgres. Server client: `src/lib/supabase/server.ts` (`createClient` = RLS-scoped, `createServiceClient` = bypasses RLS, admin only).
- Scoring lives in a Postgres function `score_fixture` triggered when a fixture is marked FINISHED. See `supabase/schema.sql`.
- Fixtures entered manually by admin from a hardcoded list of 18 Ekstraklasa teams (`src/lib/teams.ts`).
