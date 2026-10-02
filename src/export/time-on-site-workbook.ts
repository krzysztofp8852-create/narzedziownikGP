import writeXlsxFile, { type Cell, type Row } from "write-excel-file/node";
import { formatMonth } from "@/i18n/dates";
import { t } from "@/i18n/t";
import type { TimeOnSiteSummary } from "@/registry/registry";

const bold = (cell: Exclude<Cell, null>): Exclude<Cell, null> => ({ ...cell, fontWeight: "bold" });

/**
 * Plik XLSX z czasem na budowie w miesiącu, np. dla księgowej: wiersz na każdą osobę z godzinami (z dwoma miejscami po
 * przecinku) na każdej budowie i bazie, sumą i liczbą odbić bez wyjścia, które się nie liczą, a na dole sumy miejsc.
 */
export async function timeOnSiteWorkbook(summary: TimeOnSiteSummary): Promise<Buffer> {
  const rows: Row[] = [
    [{ value: t("timeOnSite.sheetTitle", { month: formatMonth(summary.month) }), fontWeight: "bold" }],
    [t("timeOnSite.sheetRule")],
    [t("timeOnSite.person"), ...summary.places.map((entry) => entry.place.name), t("timeOnSite.totalHours"), t("timeOnSite.withoutExit")].map(
      (value) => bold({ value }),
    ),
    ...summary.people.map((row): Row => [
      row.person.fullName,
      ...row.byPlace.map((timeMs) => (timeMs > 0 ? hours(timeMs) : null)),
      hours(row.timeMs),
      row.withoutExit > 0 ? row.withoutExit : null,
    ]),
    [
      bold({ value: t("timeOnSite.total") }),
      ...summary.places.map((entry) => bold(hours(entry.timeMs))),
      bold(hours(summary.timeMs)),
      null,
    ],
  ];
  return writeXlsxFile([
    {
      sheet: t("timeOnSite.sheet"),
      data: rows,
      columns: [{ width: 28 }, ...summary.places.map(() => ({ width: 14 })), { width: 14 }, { width: 12 }],
    },
  ]).toBuffer();
}

/** Nazwa pliku z miesiącem, np. czas-na-budowie-2026-03.xlsx. */
export function timeOnSiteFileName(summary: TimeOnSiteSummary) {
  return t("timeOnSite.fileName", { month: summary.month });
}

function hours(timeMs: number): Exclude<Cell, null> {
  return { value: Math.round(timeMs / 36_000) / 100, format: "0.00" };
}
