export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Istniejący dzień kalendarza w postaci RRRR-MM-DD (nie 2026-02-30). */
export function isCalendarDay(text: string) {
  const match = DAY_PATTERN.exec(text);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Ile dni kalendarza od `from` do `to` (RRRR-MM-DD); ujemne, gdy `to` jest wcześniej. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (24 * 60 * 60 * 1000));
}

const warsawParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Warsaw",
  hourCycle: "h23",
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "numeric",
});
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Dzień (RRRR-MM-DD), dzień tygodnia (0 = niedziela) i godzina w Polsce, także przy zmianie czasu. */
export function warsawTime(at: Date): { day: string; weekday: number; hour: number } {
  const parts = Object.fromEntries(warsawParts.formatToParts(at).map((part) => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, weekday: WEEKDAYS.indexOf(parts.weekday), hour: Number(parts.hour) };
}
