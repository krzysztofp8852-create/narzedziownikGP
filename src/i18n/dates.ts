const TIME_ZONE = "Europe/Warsaw";
const dateTime = new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE });
const time = new Intl.DateTimeFormat("pl-PL", { timeStyle: "short", timeZone: TIME_ZONE });
const wallClockParts = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

/** „25.09.2026, 14:03” (dzień bez zera z przodu: „1.10.2026”) czasu polskiego, niezależnie od strefy serwera. */
export function formatDateTime(date: Date): string {
  return dateTime.format(date);
}

/** „7:02” czasu polskiego. */
export function formatTime(date: Date): string {
  return time.format(date);
}

/**
 * Czas polski zapisany jako UTC: data, której pola UTC to data i godzina w Polsce. Excel nie zna
 * stref, więc tak zapisana komórka pokaże polską godzinę.
 */
export function warsawWallClock(date: Date): Date {
  const parts = Object.fromEntries(wallClockParts.formatToParts(date).map((part) => [part.type, Number(part.value)]));
  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, date.getUTCMilliseconds()),
  );
}

/** Dzień w Polsce jako RRRR-MM-DD, np. do nazwy pliku. */
export function formatDay(date: Date): string {
  return warsawWallClock(date).toISOString().slice(0, 10);
}

const calendarDay = new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeZone: "UTC" });

/** Dzień zapisany jako RRRR-MM-DD, np. „6.04.2026”. */
export function formatCalendarDay(day: string): string {
  return calendarDay.format(new Date(`${day}T00:00:00Z`));
}

const monthName = new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric", timeZone: "UTC" });

/** Miesiąc zapisany jako RRRR-MM, np. „marzec 2026”. */
export function formatMonth(month: string): string {
  return monthName.format(new Date(`${month}-01T00:00:00Z`));
}

/** Wartość pola `datetime-local` (RRRR-MM-DDTHH:MM) z godziną w Polsce. */
export function dateTimeInputValue(date: Date): string {
  return warsawWallClock(date).toISOString().slice(0, 16);
}

const DATE_TIME_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Chwila z pola `datetime-local` czytanego jako godzina w Polsce; null przy pustym albo złym zapisie. Godzinę, której
 * w dniu zmiany czasu nie ma albo jest dwa razy, czyta z przesunięciem sprzed zmiany.
 */
export function parseDateTimeInput(raw: string): Date | null {
  const match = DATE_TIME_INPUT.exec(raw);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(wall);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59) return null;
  // Przesunięcie Polski względem UTC sprzed tej godziny, a potem to, które naprawdę obowiązuje w tak policzonej chwili.
  const offset = (at: number) => warsawWallClock(new Date(at)).getTime() - at;
  const guess = wall - offset(wall - 3 * 60 * 60 * 1000);
  return new Date(wall - offset(guess));
}
