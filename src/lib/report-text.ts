import { formatCalendarDay } from "@/i18n/dates";
import { formatDays } from "@/i18n/days";
import { formatMoney, formatMoneyChange } from "@/i18n/money";
import { t } from "@/i18n/t";
import { type FridayReport, type Report, type ReportKind, UPCOMING_DAYS, UPCOMING_QUALIFICATION_DAYS, type WeeklyReport } from "@/registry/registry";
import { upcomingDeadlineText } from "./deadline-text";
import { upcomingQualificationText } from "./qualification-text";

/** Nagłówek i jedno zdanie raportu: w dzwonku i w pushu. */
export function reportText(report: Report): { title: string; body: string } {
  return report.kind === "tygodniowy" ? weeklyText(report) : fridayText(report);
}

function weeklyText(report: WeeklyReport): { title: string; body: string } {
  const value = formatMoney(report.offBaseValue);
  return {
    title:
      report.offBaseChange === null
        ? t("reports.bell.weekly", { value })
        : t("reports.bell.weeklyChange", { value, change: formatMoneyChange(report.offBaseChange) }),
    body:
      t("reports.bell.weeklyBody", {
        over: report.overThreshold.length,
        lost: report.lost.length,
        reports: report.toolReports.length,
      }) +
      (report.deadlines?.length ? t("reports.bell.weeklyDeadlines", { count: report.deadlines.length }) : "") +
      (report.qualifications?.length ? t("reports.bell.weeklyQualifications", { count: report.qualifications.length }) : ""),
  };
}

function fridayText(report: FridayReport): { title: string; body: string } {
  return {
    title: t("reports.bell.friday", { count: fridayToolCount(report) }),
    body: report.locations.map((location) => t("reports.bell.fridayLocation", { place: location.name, count: location.tools.length })).join(" · "),
  };
}

/** Ile sztuk sprzętu jest poza bazą w raporcie piątkowym. */
export function fridayToolCount(report: FridayReport): number {
  return report.locations.reduce((sum, location) => sum + location.tools.length, 0);
}

/** Strona raportu, np. /raporty/tygodniowy/2026-04-06. */
export function reportLink(report: Report): string {
  return `/raporty/${report.kind}/${report.day}`;
}

/** „Raport tygodniowy”, „Raport piątkowy”. */
export function reportTitle(kind: ReportKind): string {
  return t(kind === "tygodniowy" ? "reports.weeklyTitle" : "reports.fridayTitle");
}

/** Tytuł raportu, dzień i (w piątek) przypomnienie, np. „Raport tygodniowy”, „Stan na 6.04.2026”. */
export function reportHeading(report: Report): { title: string; day: string; intro: string | null } {
  return {
    title: reportTitle(report.kind),
    day: t("reports.dayOf", { day: formatCalendarDay(report.day) }),
    intro: report.kind === "piatkowy" && report.locations.length > 0 ? t("reports.fridayIntro") : null,
  };
}

/** Wiersz sekcji raportu (narzędzie albo osoba), z jednym wierszem szczegółów. */
export interface ReportItem {
  /** Karta narzędzia albo osoby w aplikacji. */
  href: string;
  /** Kod narzędzia; osoba go nie ma. */
  code: string | null;
  name: string;
  detail: string;
}

/** Wiersz z narzędziem: prowadzi na jego kartę. */
function toolItem(tool: { id: string; code: string; name: string }, detail: string): ReportItem {
  return { href: `/narzedzia/${tool.id}`, code: tool.code, name: tool.name, detail };
}

/** Sekcja raportu, tak samo na stronie i w e-mailu. */
export interface ReportSection {
  title: string;
  /** Wiersze pod tytułem, np. kwota i zmiana; pierwszy wyróżniony. */
  lead?: string[];
  items: ReportItem[];
  /** Tekst zamiast pustej listy; bez niego pusta lista nic nie pokazuje. */
  empty?: string;
  /** Dokąd prowadzi sekcja w aplikacji. */
  link?: { href: string; label: string };
}

/** Sekcje raportu od najważniejszej. */
export function reportSections(report: Report): ReportSection[] {
  return report.kind === "tygodniowy" ? weeklySections(report) : fridaySections(report);
}

function weeklySections(report: WeeklyReport): ReportSection[] {
  const previous = report.previousOffBaseValue;
  return [
    {
      title: t("reports.offBase"),
      lead: [
        formatMoney(report.offBaseValue),
        previous === null || report.offBaseChange === null
          ? t("reports.noPrevious")
          : `${t("reports.previousWeek", { value: formatMoney(previous) })} · ${t("reports.change", {
              change: report.offBaseChange === 0 ? t("reports.noChange") : formatMoneyChange(report.offBaseChange),
            })}`,
      ],
      items: [],
    },
    {
      title: t("reports.overThreshold", { days: report.thresholdDays }),
      items: report.overThreshold.map((tool) =>
        toolItem(tool, t("reports.overThresholdItem", { place: tool.location.name, days: formatDays(tool.days), manager: tool.manager })),
      ),
      empty: t("reports.overThresholdEmpty"),
    },
    {
      title: t("reports.lost"),
      items: report.lost.map((tool) =>
        toolItem(
          tool,
          t("reports.lostItem", { days: formatDays(tool.days), place: tool.lastLocation.name }) +
            (tool.responsible ? t("reports.lostResponsible", { name: tool.responsible }) : ""),
        ),
      ),
      empty: t("reports.lostEmpty"),
    },
    // Raporty sprzed terminów nie mają tej sekcji.
    ...(report.deadlines
      ? [
          {
            title: t("reports.deadlines", { days: UPCOMING_DAYS }),
            items: report.deadlines.map((deadline) => toolItem(deadline.tool, upcomingDeadlineText(deadline))),
            empty: t("reports.deadlinesEmpty", { days: UPCOMING_DAYS }),
            ...(report.deadlines.length > 0 && { link: { href: "/terminy", label: t("reports.deadlinesLink") } }),
          },
        ]
      : []),
    // Raporty sprzed uprawnień ludzi nie mają tej sekcji.
    ...(report.qualifications
      ? [
          {
            title: t("reports.qualifications", { days: UPCOMING_QUALIFICATION_DAYS }),
            items: report.qualifications.map((qualification) => ({
              href: `/ludzie/${qualification.person.id}`,
              code: null,
              name: qualification.person.fullName,
              detail: upcomingQualificationText(qualification),
            })),
            empty: t("reports.qualificationsEmpty", { days: UPCOMING_QUALIFICATION_DAYS }),
            ...(report.qualifications.length > 0 && { link: { href: "/ludzie", label: t("reports.qualificationsLink") } }),
          },
        ]
      : []),
    {
      title: t("reports.toolReports"),
      items: report.toolReports.map((tool) =>
        toolItem(tool, t("reports.toolReportsItem", { place: tool.location.name, name: tool.reportedBy, days: formatDays(tool.daysWaiting) })),
      ),
      empty: t("reports.toolReportsEmpty"),
      ...(report.toolReports.length > 0 && { link: { href: "/zgloszenia#zgloszone-narzedzia", label: t("reports.toolReportsLink") } }),
    },
    {
      title: t("reports.longestUnused"),
      items: report.longestUnused.map((tool) => toolItem(tool, t("reports.longestUnusedItem", { days: formatDays(tool.days) }))),
      empty: t("reports.longestUnusedEmpty"),
    },
  ];
}

function fridaySections(report: FridayReport): ReportSection[] {
  if (report.locations.length === 0) return [{ title: t("reports.offBase"), items: [], empty: t("reports.fridayEmpty") }];
  return report.locations.map((location) => ({
    title: t("reports.fridayLocation", { place: location.name, manager: location.manager.fullName }),
    items: location.tools.map((tool) => toolItem(tool, t("reports.toolDays", { days: formatDays(tool.days) }))),
  }));
}
