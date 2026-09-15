/**
 * Parsing for ekstraklasa.org terminarz pages.
 *
 * Lives here rather than inside a single script because both
 * `add-fixtures.mjs` (import a round) and `sync-fixture-dates.mjs` (detect
 * reschedules) depend on the page shape. Two copies of the regex below would
 * mean a page change silently breaks only one of them.
 */

/** Terminarz URL for one round, e.g. (2026-2027, 9). */
export function roundUrl(season, matchday) {
  return `https://ekstraklasa.org/terminarz/${season}/kolejka-${matchday}/`;
}

/** Season segment out of a terminarz URL, or null. */
export function seasonFromUrl(url) {
  const m = url.match(/\/terminarz\/(\d{4}-\d{4})\//);
  return m ? m[1] : null;
}

// Each fixture object in the embedded Next.js JSON payload. Fields can appear
// in any order within the object, so we anchor on matchId and pull what we
// need out of the span before the next matchId.
//
// `matchDatetime` always holds the ORIGINAL kickoff and is never rewritten when
// a match moves — the new kickoff goes into `postponedDatetime`. Reading
// matchDatetime alone therefore yields a stale date for any rescheduled match.
// The two agree again once the rescheduled match has been played.
const FIXTURE_RE =
  /"matchId":"[^"]*","seasonId":"[^"]*","seasonName":[^,]*,"stage":"[^"]*","status":"([^"]*)","homeTeam":\{"id":"[^"]*","name":"([^"]+)".*?"awayTeam":\{"id":"[^"]*","name":"([^"]+)"[\s\S]*?"matchDatetime":"([^"]*)"[\s\S]*?"postponed":(true|false),"postponedDatetime":("[^"]*"|null)[\s\S]*?"week":(\d+)/g;

/**
 * The site emits Warsaw-local ISO strings with an offset, so the wall-clock
 * time is readable straight out of the string. A rescheduled match whose time
 * is not yet fixed is published at midnight as a date-only placeholder —
 * Ekstraklasa never actually kicks off at 00:00, so this is unambiguous.
 */
function hasKickoffTime(iso) {
  return iso.slice(11, 19) !== "00:00:00";
}

/**
 * Fetch and parse one round page.
 *
 * Returns every fixture the page carries, which is the round itself plus the
 * "Przełożone" accordion — postponed matches from OTHER rounds that fall in
 * this date window. Callers filter by `week`; the accordion is why that
 * matters.
 *
 * Each entry: { week, status, home_team, away_team, kickoff, postponed,
 * original_kickoff (null unless the match moved), kickoff_time_known }.
 */
export async function fetchRoundFixtures(terminarzUrl) {
  const res = await fetch(terminarzUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; typerek-bot)" },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${terminarzUrl}: ${res.status}`);
  const html = await res.text();

  // The JSON is escaped inside the __next_f payloads (quotes appear as \"),
  // so unescape backslash-quotes first.
  const json = html.split('\\"').join('"');

  const fixtures = [];
  const seen = new Set();
  let m;
  FIXTURE_RE.lastIndex = 0;
  while ((m = FIXTURE_RE.exec(json)) !== null) {
    const [, status, home, away, matchDatetime, postponed, postponedRaw, week] = m;
    const key = `${home}|${away}|${week}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const isPostponed = postponed === "true";
    const postponedDatetime = postponedRaw === "null" ? null : postponedRaw.slice(1, -1);
    const kickoff = (isPostponed && postponedDatetime) || matchDatetime;
    fixtures.push({
      week: Number(week),
      status,
      home_team: home,
      away_team: away,
      kickoff,
      postponed: isPostponed,
      original_kickoff: isPostponed && kickoff !== matchDatetime ? matchDatetime : null,
      kickoff_time_known: hasKickoffTime(kickoff),
    });
  }
  return fixtures;
}
