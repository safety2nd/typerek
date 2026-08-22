# T-45 routine prompt template

The prompt body sent to a one-off cloud routine that predicts a single fixture
~45 minutes before kickoff. Substitute the `{{...}}` placeholders from
`scripts/plan-predict-routines.mjs --json` output, then pass the result as the
routine's user message (see `.claude/skills/add-fixtures/SKILL.md`, Step 4).

Placeholders: `{{home_team}}`, `{{away_team}}`, `{{kickoff_local}}`,
`{{kickoff_utc}}`, `{{kickoff_date_pl}}`, `{{matchday_name}}`.

The routine writes nothing anywhere: the AI prediction log was retired on
2026-08-20, so a run's only outputs are its message in the Claude app and the
Gmail draft. Never add a step that carries a credential — a routine's prompt is
stored in plaintext on claude.ai and cannot be deleted through the API.

---

Przewidź dokładny wynik JEDNEGO meczu Ekstraklasy, który rozpoczyna się za ~45 minut.

Mecz: {{home_team}} (gospodarz) vs {{away_team}} (gość)
Kickoff: {{kickoff_local}} Europe/Warsaw ({{kickoff_utc}})
Kolejka: {{matchday_name}}

KROKI:

1. Wczytaj z repo plik `.claude/skills/ekstraklasa-predict/SKILL.md` i zastosuj go OD KROKU 3 (Research) DO KROKU 7 (Footer). POMIŃ Krok 1 (zapytanie do Supabase) i Krok 2 (walidacja drużyn) — dane meczu masz powyżej, a w tym środowisku NIE MASZ dostępu do bazy danych ani do pliku .env.local. Nie próbuj odpytywać Supabase.

2. Research przez WebSearch/WebFetch, w tej kolejności ważności (to jest uruchomienie T-45, więc liczy się świeżość):
   - składy wyjściowe / kadra meczowa z ostatnich 24h (oficjalne składy publikowane są ~60 min przed meczem) — szukaj "{{home_team}} {{away_team}} składy {{kickoff_date_pl}}", profile klubów na X/Twitterze, meczyki.pl, weszlo.com, laczynaspilka.pl
   - kontuzje i zawieszenia z ostatnich 72h
   - transfery z ostatnich 72h (może zniknąć napastnik/stoper)
   - forma, H2H, bilans dom/wyjazd, zapowiedź meczu
   Jeśli czegoś nie znajdziesz — napisz "brak aktualnych danych", NIE zmyślaj nazwisk, kontuzji ani statystyk.

3. Wyjście (po polsku, zgodnie ze skillem): sekcja rozumowania dla tego jednego meczu (Forma / H2H / Nieobecności / Dom-wyjazd i kontekst / Odczyt / Przewidywany wynik), następnie tabela podsumowująca z jednym wierszem (Gospodarz | Gość | Kickoff | Typ | Pewność | Czynnik decydujący), następnie stopka.

4. Na koniec utwórz wersję roboczą maila w Gmailu (create_draft) do aszypulski@safety2nd.com:
   - temat: "Typerek T-45: {{home_team}} vs {{away_team}} — <TYP>" (gdzie <TYP> to przewidywany wynik, np. 1-1)
   - body: pełna treść przewidywania (rozumowanie + tabela + stopka)

OGRANICZENIA: nie modyfikuj plików repozytorium, nie commituj, nie pushuj. Nie zapisuj niczego do bazy danych — w szczególności nie do `predictions`, `profiles` ani `fixtures`. Ten przebieg jest w całości tylko-do-odczytu; jedynym wyjściem jest Twoja odpowiedź i wersja robocza maila.
