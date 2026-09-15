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
- parses the embedded Next.js JSON payload (`self.__next_f` stream), which
  contains the complete fixture set for the round including postponed matches
  that the rendered HTML hides in a collapsed "Przełożone" accordion,
- reads each fixture's `homeTeam.name`, `awayTeam.name`, `matchDatetime`
  (ISO with timezone offset), `postponed` flag, and `week` (round number),
- **filters by `week`**: keeps only fixtures whose `week` matches the target
  matchday. The "Przełożone" accordion lists postponed matches from OTHER
  rounds that happen to fall in this date window — those are skipped so they
  aren't imported as part of the current round. A current-round fixture that
  is itself postponed stays and is inserted with `status = "POSTPONED"`,
- deduplicates against existing `fixtures` rows on
  `(home_team, away_team, matchday)` — skips any already present,
- inserts new rows with:
  - `status = "POSTPONED"` if the JSON marks the match `postponed: true`,
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

## Step 4 — Arm T-45 prediction routines

After a successful import, arm one cloud routine per newly imported fixture so
the predict agent runs ~45 minutes before each kickoff. Do this automatically —
the user does not need to ask.

Get the plan (DB read + time arithmetic) from:

```bash
node scripts/plan-predict-routines.mjs --matchday <N> --json
```

It returns `{ lead_minutes, plan[], skipped[] }`. Each `plan` entry carries
`routine_name`, `run_once_at` (kickoff minus 46 min, UTC), `home_team`,
`away_team`, `kickoff_local`, `kickoff_utc`, `kickoff_date_pl` and
`matchday_name`. `POSTPONED` fixtures and any match whose T-45 has already
passed are excluded automatically.

Then, for each entry:

1. Load the API tool once: `ToolSearch` with `select:RemoteTrigger`.
2. Check for duplicates: `RemoteTrigger {action: "list"}` and skip any entry
   whose `routine_name` already exists (re-running the import must not create
   a second routine for the same match).
3. Create it: `RemoteTrigger {action: "create", body: {...}}`. The body shape
   below is exact — note that `events` lives **inside** `job_config.ccr` (not at
   the top level) and each `sources` entry is a `{git_repository: {url}}`
   wrapper, not a bare URL string. A bare URL is rejected with
   `translate job_config v1→v2: … proto: syntax error`.

   ```json
   {
     "name": "<routine_name>",
     "run_once_at": "<run_once_at>",
     "mcp_connections": [{
       "connector_uuid": "6c922e18-a5a8-45ee-97cf-7a9a4df6148b",
       "name": "Gmail",
       "url": "https://gmailmcp.googleapis.com/mcp/v1"
     }],
     "job_config": {"ccr": {
       "environment_id": "env_017EKD6PRc5z4ekWBH6M1eWD",
       "session_context": {
         "model": "claude-opus-5",
         "allowed_tools": ["Bash","Read","Glob","Grep","WebSearch","WebFetch","Skill","mcp__Gmail__create_draft"],
         "sources": [{"git_repository": {"url": "https://github.com/safety2nd/typerek"}}]
       },
       "events": [{"data": {
         "type": "user",
         "session_id": "",
         "parent_tool_use_id": null,
         "uuid": "<fresh lowercase v4 UUID>",
         "message": {"role": "user", "content": "<prompt>"}
       }}]
     }}
   }
   ```

   `<prompt>` is `prompts/t45-predict.md` with its `{{...}}` placeholders
   substituted from the entry. Every placeholder is fixture data from the plan
   output — **never put a credential in a routine prompt.** A routine's prompt
   is stored in plaintext on claude.ai and cannot be deleted through the API, so
   a secret pasted in there is exposed for good and can only be revoked by
   rotating it at its source.

Report each armed routine to the user as `<home> vs <away> — <fire time>
Warsaw` plus its `https://claude.ai/code/routines/<id>` link.

**Why routine creation is not scripted:** the remote-trigger API's OAuth token
is injected in-process by the `RemoteTrigger` tool and is never exposed to the
shell, so a `.mjs` script cannot call it. The script does the parts it can
(query, timezone math, dedupe input); the tool calls stay here.

**Constraints worth remembering:**

- Cloud routines cannot reach Supabase — no `.env.local`, and the `fixtures`
  RLS policy in `supabase/schema.sql` requires an authenticated role, so the
  anon key returns `[]`. That is why the fixture is baked into the prompt.
- A T-45 run writes nothing. The AI prediction log was retired on 2026-08-20
  (endpoint, local script and both prompt steps removed), so a run's only
  outputs are its message in the Claude app and a Gmail draft.
- Recurring cron routines have a 1-hour minimum interval, so a T-45 poller is
  impossible; only `run_once_at` hits an exact time.
- Routines can be disabled or updated via the API but **not deleted** — that
  only works at https://claude.ai/code/routines.
- **Reasoning effort is not configurable.** `session_context` persists only
  `model`, `sources` and `allowed_tools`; every other key is silently dropped
  from the stored config with no error (verified 2026-08-02 against `effort`,
  `reasoning_effort`, `output_config.effort`, `thinking` and
  `max_thinking_tokens`). The routine runs the Claude Code harness, whose
  default effort on Opus 5 is `xhigh`, so runs get that level by inheritance —
  there is just no field to pin it. Do not try to encode it in the model string
  (e.g. `claude-opus-5[xhigh]`): unknown strings are stored unvalidated, so a
  bad guess fails at fire time, after the kickoff window has passed.

## Postponed-match workflow

- Postponed fixtures are inserted with `status = "POSTPONED"`. Predictions on
  `POSTPONED` fixtures are blocked by `canPredict()` in `src/lib/scoring.ts`,
  and `POSTPONED` fixtures are excluded from the upcoming-fixtures list in
  `src/lib/queries.ts`.
- When the new kickoff date is confirmed, edit the fixture manually via the
  admin UI (Admin → Mecze). Each row has a `datetime-local` field holding the
  kickoff as **Europe/Warsaw wall clock** — the time the league announces, no
  offset arithmetic needed. Set the new date and change status back to
  `Zaplanowany` (`SCHEDULED`), then press `Zapisz`. This re-opens it for
  predictions. Re-running `scripts/add-fixtures.mjs` will NOT pick the new date
  up: ekstraklasa.org keeps listing rescheduled matches under "Przełożone" with
  their original date, and the parser filters them out by `week` anyway.
- After rescheduling, arm a T-45 routine for the fixture (Step 4) —
  `scripts/plan-predict-routines.mjs --matchday <N>` will now include it.
- The admin dropdown now has `Przełożony` (POSTPONED) instead of the old
  `Anulowany` (CANCELLED) option.

## Edge cases

- **Page structure changed** — if the script finds zero fixtures (the JSON
  payload shape changed), it prints `No fixtures parsed from page. Check the
  URL or page structure.` and exits non-zero. Report this to the user and stop;
  do NOT hand-edit the DB.
- **Unknown team name** — the page always uses the canonical Ekstraklasa club
  names that match `src/lib/teams.ts`. If a parsed name doesn't match, the
  insert will still succeed (no FK constraint on team name), but the fixture
  will be invisible to the team-filtered UI. Flag any name mismatch to the
  user.
- **Season inference** — the season (`2026-2027`) is parsed from the URL, not
  guessed. The kickoff datetime comes straight from the JSON `matchDatetime`
  field (already ISO 8601 with timezone offset), so no Warsaw-offset
  approximation is needed.
- **Deduplication** — keyed on `(home_team, away_team, matchday)`. If a
  fixture was added with a different `matchday` than the script uses, it will
  be inserted again. Use the same `matchday` value across runs of the same
  round.
- **Matchday omitted** — if the user runs the script without a matchday arg,
  the script infers it from `kolejka-<N>` in the URL.
- **Rescheduled (postponed) matches from other rounds** — the "Przełożone"
  accordion at the bottom of the terminarz page lists postponed matches from
  *other* rounds that fall in this date window. These have a `week` value
  different from the current round and are skipped by the parser. Only
  current-round fixtures (including a current-round fixture that is itself
  postponed) are imported.