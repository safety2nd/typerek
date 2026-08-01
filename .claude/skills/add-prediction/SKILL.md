---
name: add-prediction
description: Use when the user asks to "add prediction for <username>", "dodaj typ", "wpisz typ dla", "set prediction", or otherwise wants to manually insert/update a single user's score prediction for a specific Ekstraklasa fixture. Upserts a prediction row via the service-role Supabase REST API using scripts/add-prediction.mjs. Do NOT use for bulk imports, finished matches, deleting predictions, or for the AI-generated round prediction workflow (use ekstraklasa-predict instead).
---

# Add a single user prediction

Inserts or updates one prediction row for a given user on a given fixture,
bypassing RLS via the service role key. Backed by `scripts/add-prediction.mjs`.

## When to use

- User gives: a username, two team names (home and away), and a score (`H-A`
  or `H:A`).
- The fixture must exist in the `fixtures` table and must NOT be `FINISHED`.
- The user (profile) must already exist in `profiles`.

## Step 1 — Parse the request

Extract four values from the user's message:

1. `username` — must match a `profiles.username` row exactly (case-sensitive).
2. `home_team` — full team name as stored in `fixtures.home_team`.
3. `away_team` — full team name as stored in `fixtures.away_team`.
4. `score` — in the form `H-A` or `H:A` (e.g. `2-1`, `0:0`). Normalize to
   `H-A` before passing to the script.

Valid team names are the closed set in `src/lib/teams.ts` (18 Ekstraklasa
clubs). Keep Polish diacritics exact: "Lech Poznań", not "Lech Poznan".

## Step 2 — Run the script

From the project root, run:

```bash
node scripts/add-prediction.mjs <username> "<home_team>" <H>-<A> "<away_team>"
```

Example:

```bash
node scripts/add-prediction.mjs arturmiller "Lech Poznań" 2-1 "Cracovia"
```

The script:
- loads `.env` / `.env.local` for `NEXT_PUBLIC_SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY`,
- looks up the user by username in `profiles`,
- finds the most recent fixture matching both team names (any status),
- refuses if the fixture is already `FINISHED`,
- upserts the prediction row on `(user_id, fixture_id)`.

## Step 3 — Report back

On success the script prints a line like:

```
Prediction saved: Lech Poznań 2:1 Cracovia for arturmiller
```

Echo a one-line confirmation to the user in the language they used. Do not dump
the script source or re-explain the schema. If the script errors, surface the
exact stderr line and stop — do not attempt to fix the data manually.

## Edge cases

- **User not found** — tell the user the username doesn't exist and stop. Do
  not create users from this skill.
- **Fixture not found** — check team name spelling/diacritics against
  `src/lib/teams.ts`; if still not found, tell the user the fixture isn't in
  the DB and stop.
- **Fixture FINISHED** — predictions on finished matches are meaningless
  (scoring already ran). Refuse and tell the user.
- **Multiple fixtures match** — the script picks the most recent by
  `utc_date desc`. If that's wrong, ask the user for the kickoff date and
  extend the script invocation manually rather than guessing.