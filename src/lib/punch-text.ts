import { formatDateTime, formatDay, formatTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import type { Punch, PunchCheck } from "@/registry/registry";

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

/** „2.03.2026, 7:02 – 15:30”, wyjście innego dnia z datą, a bez wyjścia „teraz”. */
export function punchTimeText(punch: Pick<Punch, "enteredAt" | "leftAt">) {
  const left = punch.leftAt
    ? formatDay(punch.leftAt) === formatDay(punch.enteredAt)
      ? formatTime(punch.leftAt)
      : formatDateTime(punch.leftAt)
    : t("punches.now");
  return `${formatDateTime(punch.enteredAt)} – ${left}`;
}

/**
 * Wejście i wyjście z wynikami i oznaczeniem odbić z kolejki offline: „Wejście: na budowie, 120 m (zapisane offline) ·
 * Wyjście: przejście na inną budowę”.
 */
export function punchChecksText(punch: Pick<Punch, "entry" | "exit" | "exitVia" | "entryOffline" | "exitOffline">) {
  const offline = (text: string, queued: boolean) => (queued ? `${text} (${t("punches.offlineMark")})` : text);
  const entry = offline(t("punches.entry", { check: punchCheckText(punch.entry) }), punch.entryOffline);
  const exit =
    punch.exitVia === "przejscie" ? t("punches.exitTransfer") : punch.exit ? t("punches.exit", { check: punchCheckText(punch.exit) }) : null;
  return exit ? `${entry} · ${offline(exit, punch.exitOffline)}` : entry;
}
