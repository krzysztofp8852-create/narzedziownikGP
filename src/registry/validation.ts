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

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Miesiąc w postaci RRRR-MM (nie 2026-13). */
export function isMonth(text: string) {
  return MONTH_PATTERN.test(text);
}

/** Miesiąc RRRR-MM przesunięty o `delta` miesięcy. */
export function shiftMonth(month: string, delta: number): string {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** SQL: północ w Polsce na początku miesiąca z parametru `param` (RRRR-MM-01). */
export const warsawMonthStart = (param: string) => `(${param}::date::timestamp at time zone 'Europe/Warsaw')`;
/** SQL: północ w Polsce na początku miesiąca po miesiącu z parametru `param` (RRRR-MM-01). */
export const warsawMonthEnd = (param: string) => `((${param}::date + interval '1 month')::timestamp at time zone 'Europe/Warsaw')`;

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
