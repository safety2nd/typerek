---
name: add-fixtures
description: Use when the user asks to "add fixtures", "dodaj mecze", "dodaj kolejkę", "import fixtures from ekstraklasa.org", or otherwise wants to import upcoming Ekstraklasa round fixtures from a terminarz URL on ekstraklasa.org into the Supabase fixtures table. Fetches the round page, parses each match (home/away teams, kickoff, postponed flag), and inserts new rows via scripts/add-fixtures.mjs, skipping fixtures already in the DB. Do NOT use for manually adding a single fixture (use the admin UI), for finished matches, or for predictions.
---

# Add Ekstraklasa round fixtures

Fetches fixtures for one Ekstraklasa round from an `ekstraklasa.org` terminarz
URL and inserts them into the `fixtures` table. Backed by
`scripts/add-fixtures.mjs` (service role, bypasses RLS).

## When to use

- User provides a terminarz URL of the form
  `https://ekstraklasa.org/terminarz/<season>/kolejka-<N>/`, e.g.
  `https://ekstraklasa.org/terminarz/2026-2027/kolejka-2/`.
- Optionally the user names the matchday number (`kolejka 2`, round 2). If
  omitted, the script infers it from the `kolejka-<N>` segment of the URL.

## Step 1 — Parse the request

Extract from the user's message:

1. `terminarz-url` — must match
   `https://ekstraklasa.org/terminarz/<YYYY-YYYY>/kolejka-<N>/`. If the user
   gives only the round number (e.g. "dodaj kolejkę 2") or the season is
  ambiguous, ask them for the full terminarz URL — do NOT guess the season.
2. `matchday` (optional) — integer round number. Defaults to the `kolejka-<N>`
   from the URL.

## Step 2 — Run the script

From the project root, run:

```bash
node scripts/add-fixtures.mjs "<terminarz-url>" [<matchday>]
```

Example:

```bash
node scripts/add-fixtures.mjs "https://ekstraklasa.org/terminarz/2026-2027/kolejka-2/" 2
```

The script:
- loads `.env` / `.env.local` for `NEXT_PUBLIC_SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY`,
- fetches the terminarz HTML page,
- parses each match block (time, date, home team, away team, "Przełożony"
  marker),
- converts kickoff to UTC (Europe/Warsaw offset approximated: UTC+2 for
  Apr–Oct, UTC+1 for Nov–Mar),
- deduplicates against existing `fixtures` rows on
  `(home_team, away_team, matchday)` — skips any already present,
- inserts new rows with:
  - `status = "POSTPONED"` if the page marks the match "Przełożony",
  - `status = "SCHEDULED"` otherwise,
  - `season` from the URL, `competition = "Ekstraklasa"`,
  - `matchday_name = "Kolejka <N>"`,
  - a negative random `id` (matches the existing admin-add convention and
    avoids collisions with TheSportsDB ids).

## Step 3 — Report back

The script prints one line per fixture:

- `INSERTED: <home> vs <away> (<SCHEDULED|POSTPONED>) id=<id>` for new rows.
- `SKIP (exists): <home> vs <away>` for rows already in the DB.

And a final summary line:

```
Done: <inserted> inserted, <skipped> skipped (already present).
```

Echo a concise confirmation to the user in the language they used — list how
many were inserted vs skipped, and call out any postponed fixtures. Do not
dump the script source or re-explain the schema. If the script errors, surface
the exact stderr line and stop — do not attempt to fix the data manually.

## Postponed-match workflow

- Postponed fixtures are inserted with `status = "POSTPONED"`. Predictions on
  `POSTPONED` fixtures are blocked by `canPredict()` in `src/lib/scoring.ts`,
  and `POSTPONED` fixtures are excluded from the upcoming-fixtures list in
  `src/lib/queries.ts`.
- When the new kickoff date is confirmed, edit the fixture manually via the
  admin UI (Admin → Mecze): set the new `utc_date` and change status back to
  `Zaplanowany` (`SCHEDULED`). This re-opens it for predictions.
- The admin dropdown now has `Przełożony` (POSTPONED) instead of the old
  `Anulowany` (CANCELLED) option.

## Edge cases

- **Page structure changed** — if the script finds zero fixtures, it prints
  `No fixtures parsed from page. Check the URL or page structure.` and exits
  non-zero. Report this to the user and stop; do NOT hand-edit the DB.
- **Unknown team name** — the page always uses the canonical Ekstraklasa club
  names that match `src/lib/teams.ts`. If a parsed name doesn't match, the
  insert will still succeed (no FK constraint on team name), but the fixture
  will be invisible to the team-filtered UI. Flag any name mismatch to the
  user.
- **Season inference** — the season (`2026-2027`) is parsed from the URL, not
  guessed. For months Jul–Dec the first year is used; for Jan–Jun the second
  year is used.
- **Deduplication** — keyed on `(home_team, away_team, matchday)`. If a
  fixture was added with a different `matchday` than the script uses, it will
  be inserted again. Use the same `matchday` value across runs of the same
  round.
- **Matchday omitted** — if the user runs the script without a matchday arg,
  the script infers it from `kolejka-<N>` in the URL.