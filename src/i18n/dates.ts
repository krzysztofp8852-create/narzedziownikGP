const dateTime = new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Warsaw" });

/** „25.09.2026, 14:03” czasu polskiego, niezależnie od strefy serwera. */
export function formatDateTime(date: Date): string {
  return dateTime.format(date);
}
