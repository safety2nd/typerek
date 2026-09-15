const TZ = "Europe/Warsaw";

export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString("pl-PL", { timeZone: TZ });
}

export function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("pl-PL", { timeZone: TZ });
}

// "YYYY-MM-DDTHH:mm:ss" — the wall clock in TZ at a given instant.
function wallClockInTz(value: number | Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(value)
    .replace(" ", "T");
}

// How far TZ runs ahead of UTC at a given instant, in ms.
function tzOffsetMs(instant: number): number {
  return Date.parse(`${wallClockInTz(instant)}Z`) - instant;
}

// Value for an <input type="datetime-local">: the kickoff as Warsaw wall clock,
// so the field matches the date shown next to it regardless of browser timezone.
export function toWarsawInputValue(value: string | Date): string {
  return wallClockInTz(new Date(value)).slice(0, 16);
}

// Inverse of toWarsawInputValue. Returns null if the string isn't a full
// datetime-local value (e.g. the admin cleared the field).
export function warsawInputValueToUtc(wallClock: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(wallClock)) return null;
  const naive = Date.parse(`${wallClock}:00Z`);
  if (Number.isNaN(naive)) return null;
  // Offset at the approximate instant, then refined so DST switches land right.
  const approx = naive - tzOffsetMs(naive);
  return new Date(naive - tzOffsetMs(approx)).toISOString();
}
