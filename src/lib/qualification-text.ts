import { formatCalendarDay } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { type CustomQualificationKind, detailOf, type NotifiedQualification, type QualificationKind } from "@/registry/registry";

/** „Badania lekarskie okresowe”, „UDT: wózki widłowe”, „Prawo jazdy kat. C+E”, „SEP E”, „Operator koparki”. */
export function qualificationName(qualification: { kind: QualificationKind; customKind: CustomQualificationKind | null; detail: string | null }): string {
  const { kind, customKind, detail } = qualification;
  if (kind === "wlasny") return customKind?.name ?? t("qualifications.kinds.wlasny");
  if (detail && detailOf(kind) !== null) return t(`qualifications.withDetail.${kind as "udt" | "prawo_jazdy" | "sep"}`, { detail });
  return t(`qualifications.kinds.${kind}`);
}

/** „ważne do 13.03.2026” albo „po terminie (20.02.2026)”. */
export function qualificationWhen(qualification: { dueOn: string; overdue: boolean }): string {
  const day = formatCalendarDay(qualification.dueOn);
  return qualification.overdue ? t("qualifications.overdue", { day }) : t("qualifications.validUntil", { day });
}

/** Uprawnienie bez osoby w jednej linii: „Szkolenie BHP okresowe: ważne do 1.04.2026”. */
export function upcomingQualificationText(qualification: NotifiedQualification): string {
  return t("qualifications.item", { name: qualificationName(qualification), when: qualificationWhen(qualification) });
}
