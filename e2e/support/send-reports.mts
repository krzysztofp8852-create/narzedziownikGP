/**
 * Raporty z harmonogramu (to, co robi zadanie raportów) tylko dla jednej firmy testowej (identyfikator w argumencie):
 * piątkowy z najbliższego piątku po 16:00 i tygodniowy z najbliższego poniedziałku po 7:00 czasu polskiego. Zegar jest
 * przestawiony na te chwile, a e-mail i push idą tylko do logu. Inne firmy nic nie dostają.
 * Wypisuje dni raportów i liczby wysłanych jako JSON.
 */
import { logNotifier } from "@/lib/email-notifier";
import { registryDeps } from "@/lib/registry-instance";
import { logPush } from "@/lib/web-push-notifier";
import { createRegistry } from "@/registry/registry";

const [companyId] = process.argv.slice(2);
if (!companyId) throw new Error("Podaj identyfikator firmy");

/** Najbliższy dzień tygodnia (0 = niedziela) po dzisiejszym dniu w Polsce, jako RRRR-MM-DD. */
function nextWeekday(weekday: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  do date.setUTCDate(date.getUTCDate() + 1);
  while (date.getUTCDay() !== weekday);
  return date.toISOString().slice(0, 10);
}

/** Chwila `utcHour`:30 UTC danego dnia. */
const at = (day: string, utcHour: number) => new Date(`${day}T${String(utcHour).padStart(2, "0")}:30:00Z`);

const friday = nextWeekday(5);
const monday = nextWeekday(1);
const deps = registryDeps();
const send = (now: Date) =>
  createRegistry({ ...deps, clock: { now: () => now }, notifier: { ...logNotifier, push: logPush } })
    .system()
    .sendCompanyDueReports(companyId);

// Piątek 15:30 UTC to 16:30 zimą i 17:30 latem; poniedziałek 6:30 UTC to 7:30 zimą i 8:30 latem.
const fridaySent = await send(at(friday, 15));
const mondaySent = await send(at(monday, 6));
console.log(JSON.stringify({ friday, monday, sent: { friday: fridaySent.friday, weekly: mondaySent.weekly } }));
process.exit(0);
