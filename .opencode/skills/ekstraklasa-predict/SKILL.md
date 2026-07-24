---
name: ekstraklasa-predict
description: Use when the user asks to "predict this round", "predict ekstraklasa", "this week's ekstraklasa picks", "typerek", "typy na kolejkę", "predykcje ekstraklasy", or otherwise wants score predictions for upcoming Ekstraklasa fixtures. Predicts exact scores for the next round of Polish Ekstraklasa matches using live web research and outputs a per-match reasoning section followed by one summary markdown table, all in Polish. Do NOT use for finished matches, other leagues, or general football chat.
---

# Ekstraklasa score prediction

You predict exact scores for upcoming Polish Ekstraklasa fixtures using live
web research, then emit per-match reasoning and one summary table.

**All output to the user is in Polish.** Section headings, labels, table
header, the reasoning prose, the decisive-factor column, and the footer line —
all in Polish. Keep player/team names in their original form (e.g. "Lech
Poznań", not "Lech Poznan"). Cite Polish sources by site name when relevant
(e.g. "90minut.pl", "transfermarkt", "przegladsportowy").

## Step 1 — Load upcoming fixtures

Query the project's Supabase DB for SCHEDULED fixtures via the REST API.
Credentials live in `.env.local` at the project root:

- `NEXT_PUBLIC_SUPABASE_URL` — project URL, e.g. `https://xxx.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (bypasses RLS; admin only)

Run a single bash command that reads `.env.local`, exports the two values, and
POSTs the upcoming-fixtures SQL (from `prompts/upcoming-fixtures.sql`) to the
`/rest/v1/rpc/` … NO — Supabase has no arbitrary SQL RPC. Instead use the
PostgREST read endpoint on the `fixtures` table:

```bash
set -a; source .env.local; set +a
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/fixtures?select=id,utc_date,home_team,away_team,matchday_name&status=eq.SCHEDULED&utc_date=gt.$(date -u +%FT%TZ)&order=utc_date.asc" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Parse the JSON. Each row gives `home_team`, `away_team`, `utc_date`, and
`matchday_name`. Convert `utc_date` to Europe/Warsaw for display
(`TZ=Europe/Warsaw date -d "$utc_date" "+%Y-%m-%d %H:%M"`).

If the query returns zero rows, tell the user there are no SCHEDULED fixtures
ahead and stop. (Polish: "Brak zaplanowanych meczów w bazie.")

## Step 2 — Validate teams

All fixtures must use team names from this closed set (matches
`src/lib/teams.ts`):

Cracovia, GKS Katowice, Górnik Zabrze, Jagiellonia Białystok, Korona Kielce,
Lech Poznań, Legia Warszawa, Motor Lublin, Piast Gliwice, Pogoń Szczecin,
Radomiak Radom, Raków Częstochowa, Śląsk Wrocław, Wieczysta Kraków, Widzew
Łódź, Wisła Kraków, Wisła Płock, Zagłębie Lubin.

If a fixture uses a name not on this list, flag it and skip that fixture.
(Polish: "Nieznana drużyna — pomijam mecz.")

## Step 3 — Research each fixture (use websearch)

For EACH fixture, use the `websearch` tool to find current evidence across
Polish sports news sites, official club pages, and football statistics sites.
Polish-language queries usually return richer results.

**Prerequisite:** `websearch` requires `OPENCODE_ENABLE_EXA=1` to be set when
launching opencode. If unavailable, fall back to `webfetch` on known URLs
(Wikipedia PL, Transfermarkt PL).

Research checklist per fixture (run these searches — adapt queries as needed):

- **Current league standing & recent form** — query:
  `"<team> Ekstraklasa tabela forma ostatnie mecze"`
- **Head-to-head** — query:
  `"<home> <away> h2h bezpośrednie mecze historia"`
- **Key absences** — query:
  `"<team> kontuzje zawieszenia skład"` or `"<team> injury news"`
- **Match preview** — query:
  `"<home> <away> zapowiedźEkstraklasa"` (Polish sports sites like
  przegladsportowy.pl, sport.tvp.pl, 90minut.pl often have previews)
- **Home/away splits** — query:
  `"<team> dom wyjazd bilans Ekstraklasa"`
- **Context** — query:
  `"<home> <away> derby zapowiedź"` or `"<team> trener transfer"`

You may run several `websearch` calls in parallel across fixtures. After
finding relevant URLs via `websearch`, use `webfetch` to read the full content
of the most promising results (e.g. a match preview article).

If all searches return nothing useful, say so explicitly ("brak danych w
wyszukiwarce") and fall back to a reasoned prior — never invent specifics
(scores, injury names, dates).

## Step 4 — Reasoning section (write BEFORE the table)

For each fixture emit a subsection in Polish, using this structure:

```
### <gospodarz> vs <gość> — <kickoff czas warszawski>
- **Forma:** <gospodarz> ... | <gość> ...
- **H2H:** ...
- **Nieobecności:** ...
- **Dom/wyjazd i kontekst:** ...
- **Odczyt:** 1–3 zdania syntezy prowadzące do wyniku.
- **Przewidywany wynik:** A-B (exactly the same score that appears in the summary table's "Typ" column).
```

## Step 5 — Predicted score (rules of thumb)

Scoring the user plays with (context, don't optimize for outcome-only):
exact score = 3 pts, correct outcome (home win / draw / away win) = 1 pt, else 0.
(Polish: dokładny wynik = 3 pkt, trafiony rezultat = 1 pkt, brak = 0 pkt.)

- Predict each side in the 0–4 range unless evidence strongly supports more.
  Ekstraklasa averages ~2.5 goals/match.
- If two teams are close, prefer the home side by a goal; predict an away win
  only with Medium+ confidence and a stated reason.
- 0-0 is rare — only when both teams are defensively strong AND offensively
  weak; cite both.
- Confidence = High only when form, H2H, and absences all point the same way.
  Otherwise Medium or Low with a one-line reason.
  (Polish confidence labels: Wysoka / Średnia / Niska.)

## Step 6 — Output table (exactly this schema, last thing in the reply)

Table header in Polish:

```
| Gospodarz | Gość | Kickoff | Typ | Pewność | Czynnik decydujący |
|-----------|------|---------|-----|---------|--------------------|
| ... | ... | ... | A-B | Wysoka/Średnia/Niska | ... |
```

## Step 7 — Footer

End with one line in Polish:

```
Model: <nazwa modelu>, uruchomienie: <timestamp UTC>, liczba meczów: <n>.
```

## Style rules

- No prose preamble or closing summary — just the per-fixture reasoning, the
  table, and the footer.
- Facts, not filler. If you found a stat, cite the number; if you didn't, say
  "brak aktualnych danych".
- Do not repeat the fixture list verbatim; use it only as input.
- Keep reasoning tight.
- All user-facing output in Polish.