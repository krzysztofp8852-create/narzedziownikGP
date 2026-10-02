import { formatCalendarDay } from "@/i18n/dates";
import { formatDays } from "@/i18n/days";
import { t } from "@/i18n/t";
import type { DeadlineKind, UpcomingDeadline } from "@/registry/registry";
import { placeAt } from "./place-text";

/** „Przegląd”, „Kalibracja”, „Badanie UDT”, „Gwarancja”, „OC”. */
export function deadlineKindName(kind: DeadlineKind): string {
  return t(`deadlines.kinds.${kind}`);
}

/** „przegląd”, „kalibracja”, „badanie UDT”, „gwarancja”, „OC”: w środku zdania. */
export function deadlineKindWord(kind: DeadlineKind): string {
  return t(`deadlines.lowerKinds.${kind}`);
}

/** Jak nazwa rodzaju („Przegląd techniczny”), a przy własnym terminie pojazdu jego nazwa („Wymiana opon”). */
export function deadlineName(deadline: { kind: DeadlineKind; name?: string }): string {
  return deadline.kind === "wlasny" && deadline.name ? deadline.name : deadlineKindName(deadline.kind);
}

/** Jak słowo rodzaju w środku zdania („przegląd techniczny”), a przy własnym terminie pojazdu jego nazwa. */
export function deadlineWord(deadline: { kind: DeadlineKind; name?: string }): string {
  return deadline.kind === "wlasny" && deadline.name ? deadline.name : deadlineKindWord(deadline.kind);
}

/** „termin 13.03.2026”, „po terminie (20.02.2026)”, a przy gwarancji „koniec 20.03.2026”. */
export function deadlineWhen(deadline: { kind: DeadlineKind; dueOn: string; overdue: boolean }): string {
  const day = formatCalendarDay(deadline.dueOn);
  if (deadline.kind === "gwarancja") return t("deadlines.warrantyEnds", { day });
  return deadline.overdue ? t("deadlines.overdue", { day }) : t("deadlines.due", { day });
}

/** „dziś”, „jutro”, „za 7 dni”, „3 dni temu”. */
export function daysLeftText(daysLeft: number): string {
  if (daysLeft === 0) return t("deadlines.today");
  if (daysLeft === 1) return t("deadlines.tomorrow");
  return daysLeft > 0 ? t("deadlines.inDays", { days: formatDays(daysLeft) }) : t("deadlines.daysAgo", { days: formatDays(-daysLeft) });
}

/**
 * Najbliższy termin w jednej linii: „Kalibracja: 13.03.2026, za 11 dni”, „Przegląd po terminie od 20.02.2026”
 * albo „Gwarancja do 1.04.2027”.
 */
export function nextDeadlineText(deadline: { kind: DeadlineKind; dueOn: string; daysLeft: number; overdue: boolean }): string {
  const day = formatCalendarDay(deadline.dueOn);
  if (deadline.overdue) return t("deadlines.nextOverdue", { kind: deadlineKindName(deadline.kind), day });
  if (deadline.kind === "gwarancja") return t("deadlines.nextWarranty", { day });
  return t("deadlines.next", { kind: deadlineKindName(deadline.kind), day, left: daysLeftText(deadline.daysLeft) });
}

/**
 * Termin z listy terminów w jednej linii: „Kalibracja: termin 13.03.2026 · na budowie Rataje · kierownik: Adam Nowak”,
 * a termin pojazdu bez miejsca (wiersz to sam pojazd): „OC: termin 25.03.2026 · kierownik: Adam Nowak”.
 */
export function upcomingDeadlineText(deadline: UpcomingDeadline): string {
  const when = `${deadlineName(deadline)}: ${deadlineWhen(deadline)}`;
  return (
    (deadline.tool ? t("deadlines.itemAt", { when, place: placeAt(deadline.location) }) : when) +
    (deadline.responsible ? t("deadlines.itemResponsible", { name: deadline.responsible }) : "")
  );
}

/** Dokąd prowadzi termin z listy, raportu albo dzwonka: karta narzędzia albo zakładka terminów pojazdu. */
export function deadlineLink(deadline: Pick<UpcomingDeadline, "tool" | "location">): string {
  return deadline.tool ? `/narzedzia/${deadline.tool.id}#terminy` : `/pojazdy/${deadline.location.id}/terminy`;
}
