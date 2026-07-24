const TZ = "Europe/Warsaw";

export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString("pl-PL", { timeZone: TZ });
}

export function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("pl-PL", { timeZone: TZ });
}