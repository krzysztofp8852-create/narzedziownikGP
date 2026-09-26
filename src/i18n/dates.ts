const TIME_ZONE = "Europe/Warsaw";
const dateTime = new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE });
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

/** „25.09.2026, 14:03” czasu polskiego, niezależnie od strefy serwera. */
export function formatDateTime(date: Date): string {
  return dateTime.format(date);
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
