/**
 * Outcome of a match: 'H' home win, 'D' draw, 'A' away win, or null if not decided.
 */
export function outcome(home: number, away: number): "H" | "D" | "A" {
  if (home > away) return "H";
  if (home < away) return "A";
  return "D";
}

/**
 * Points for a prediction against a finished fixture.
 *   exact score -> 3
 *   correct outcome -> 1
 *   otherwise -> 0
 */
export function scorePrediction(
  pred: { home_score: number; away_score: number },
  fixture: { home_score: number | null; away_score: number | null; status: string },
): number | null {
  if (fixture.status !== "FINISHED" || fixture.home_score == null || fixture.away_score == null) {
    return null;
  }
  const exact = pred.home_score === fixture.home_score && pred.away_score === fixture.away_score;
  if (exact) return 3;
  return outcome(pred.home_score, pred.away_score) ===
    outcome(fixture.home_score, fixture.away_score)
    ? 1
    : 0;
}

type Predictable = { utc_date: string; status: string };

export function isKickoffPast(fixture: Predictable): boolean {
  return new Date(fixture.utc_date).getTime() <= Date.now();
}

export function canPredict(fixture: Predictable): boolean {
  if (fixture.status === "CANCELLED") return false;
  return !isKickoffPast(fixture) && fixture.status === "SCHEDULED";
}