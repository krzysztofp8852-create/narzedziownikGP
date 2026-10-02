import { formatDateTime, formatDay, formatTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import type { Punch, PunchCheck, PunchCorrection } from "@/registry/registry";

const kilometers = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** „420 m” albo, od kilometra, „8,0 km”. */
export function distanceText(meters: number) {
  return meters < 1000 ? t("punches.meters", { meters }) : t("punches.kilometers", { kilometers: kilometers.format(meters / 1000) });
}

/** Wynik sprawdzenia położenia: „na budowie, 120 m”, „poza budową, 8,0 km”, „brak położenia”, „bez sprawdzenia”. */
export function punchCheckText(check: PunchCheck) {
  const result = t(`punches.results.${check.result}`);
  return check.distanceM === null ? result : `${result}, ${distanceText(check.distanceM)}`;
}

/** „2.03.2026, 7:02 – 15:30”, wyjście innego dnia z datą, odbita teraz „teraz”, a zamknięte o północy „bez wyjścia”. */
export function punchTimeText(punch: Pick<Punch, "enteredAt" | "leftAt" | "exitVia">) {
  const left =
    punch.exitVia === "bez_wyjscia"
      ? t("punches.noExit")
      : punch.leftAt
        ? formatDay(punch.leftAt) === formatDay(punch.enteredAt)
          ? formatTime(punch.leftAt)
          : formatDateTime(punch.leftAt)
        : t("punches.now");
  return `${formatDateTime(punch.enteredAt)} – ${left}`;
}

/** „Czas na budowie: 8 godz. 30 min”; przy odbiciu „bez wyjścia”, że się nie liczy; odbita teraz: null. */
export function timeOnSiteText(punch: Pick<Punch, "timeOnSiteMs" | "exitVia">) {
  if (punch.exitVia === "bez_wyjscia") return t("punches.timeOnSiteMissing");
  if (punch.timeOnSiteMs === null) return null;
  const totalMinutes = Math.round(punch.timeOnSiteMs / 60_000);
  const [hours, minutes] = [Math.floor(totalMinutes / 60), totalMinutes % 60];
  return t("punches.timeOnSite", { time: hours === 0 ? t("punches.minutes", { minutes }) : t("punches.hoursMinutes", { hours, minutes }) });
}

/**
 * Poprawka w historii odbicia: „Poprawka wejścia: 9:00 → 7:00. Powód: … (Adam Nowak, 3.03.2026, 8:00)”, a przy
 * wyjściu, którego nie było, „Uzupełnione wyjście: 15:30. …”.
 */
export function punchCorrectionText(correction: PunchCorrection) {
  const details = { to: formatDateTime(correction.to), reason: correction.reason, name: correction.byName, when: formatDateTime(correction.at) };
  if (correction.from === null) return t("punches.correctionExitAdded", details);
  const key = correction.field === "wejscie" ? "punches.correctionEntry" : "punches.correctionExit";
  return t(key, { ...details, from: formatDateTime(correction.from) });
}

/**
 * Kto odbijał za osobę: „odbił: Adam Nowak”, a gdy wejście i wyjście odbili różni ludzie (albo jedno z nich osoba sama),
 * „wejście odbił: … · wyjście odbił: …”. null, gdy osoba odbijała się sama.
 */
export function punchedByText(punch: Pick<Punch, "leftAt" | "entryPunchedByName" | "exitPunchedByName">) {
  const { entryPunchedByName: entry, exitPunchedByName: exit } = punch;
  if (entry !== null && (punch.leftAt === null || exit === entry)) return t("punches.punchedBy", { name: entry });
  const parts = [entry && t("punches.entryPunchedBy", { name: entry }), exit && t("punches.exitPunchedBy", { name: exit })];
  return parts.filter(Boolean).join(" · ") || null;
}

/**
 * Wejście i wyjście z wynikami i oznaczeniem odbić z kolejki offline: „Wejście: na budowie, 120 m (zapisane offline) ·
 * Wyjście: przejście na inną budowę”.
 */
export function punchChecksText(punch: Pick<Punch, "entry" | "exit" | "exitVia" | "entryOffline" | "exitOffline">) {
  const offline = (text: string, queued: boolean) => (queued ? `${text} (${t("punches.offlineMark")})` : text);
  const entry = offline(t("punches.entry", { check: punchCheckText(punch.entry) }), punch.entryOffline);
  const exit =
    punch.exitVia === "przejscie"
      ? t("punches.exitTransfer")
      : punch.exitVia === "bez_wyjscia"
        ? t("punches.exitMissing")
        : punch.exitVia === "uzupelnione"
          ? t("punches.exitAdded")
          : punch.exit
            ? t("punches.exit", { check: punchCheckText(punch.exit) })
            : null;
  return exit ? `${entry} · ${offline(exit, punch.exitOffline)}` : entry;
}
