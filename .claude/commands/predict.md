---
description: Predict scores for the upcoming Ekstraklasa round (Polish output)
allowed-tools: Bash, Read, Glob, Grep, WebSearch, WebFetch, Skill
---

Run the Ekstraklasa round prediction workflow.

Invoke the `ekstraklasa-predict` skill and follow it end to end: load upcoming
SCHEDULED fixtures from Supabase, validate team names against
`src/lib/teams.ts`, research each fixture with `WebSearch` / `WebFetch`, then
emit the per-match Polish reasoning section, the summary markdown table, and
the footer line — all in Polish.

All user-facing output is in Polish. No prose preamble or closing summary
beyond what the skill specifies. Do not edit project files or mutate the
database.

Extra instructions from the user (may be empty): $ARGUMENTS
