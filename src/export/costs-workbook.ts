import writeXlsxFile, { type Cell, type Row } from "write-excel-file/node";
import { formatCalendarDay } from "@/i18n/dates";
import { t } from "@/i18n/t";
import type { CostSummary, LocationCosts } from "@/registry/registry";

type Costs = Extract<LocationCosts, { status: "koszty" }>;
type Summary = Extract<CostSummary, { status: "koszty" }>;

const header = (labels: string[]): Row => labels.map((value) => ({ value, fontWeight: "bold" }));

/**
 * Plik XLSX z kosztem sprzętu jednej budowy albo pojazdu: nagłówek z lokalizacją i okresem, wiersz na każdą stawkę
 * narzędzia (dni × stawka = kwota), wiersz dni bez stawki i suma.
 */
export async function costsWorkbook(costs: Costs): Promise<Buffer> {
  const rows: Row[] = [
    [{ value: t("costs.sheetTitle", { place: costs.location.name }), fontWeight: "bold" }],
    [costs.period ? t("costs.period", { from: formatCalendarDay(costs.period.from), to: formatCalendarDay(costs.period.to) }) : t("costs.noPeriod")],
    header([t("export.code"), t("export.name"), t("costs.days"), t("costs.rate"), t("costs.amount")]),
    ...costs.tools.flatMap((row): Row[] => [
      ...row.rates.map((rate): Row => [row.tool.code, row.tool.name, rate.days, money(rate.amount), money(rate.amount * rate.days)]),
      ...(row.daysWithoutRate > 0 ? [[row.tool.code, row.tool.name, row.daysWithoutRate, t("costs.noRate"), null]] : []),
    ]),
    [{ value: t("costs.total"), fontWeight: "bold" }, null, null, null, { ...money(costs.total), fontWeight: "bold" }],
  ];
  return writeXlsxFile([
    { sheet: t("costs.sheet"), data: rows, columns: [{ width: 10 }, { width: 30 }, { width: 8 }, { width: 18 }, { width: 14 }] },
  ]).toBuffer();
}

/** Nazwa pliku z okresem, np. koszt-sprzetu-2026-03-01-2026-03-31.xlsx (bez nazwy budowy: tylko znaki ASCII). */
export function costsFileName(costs: Costs) {
  return costs.period ? t("costs.fileName", { from: costs.period.from, to: costs.period.to }) : t("costs.fileNameEmpty");
}

/** Plik XLSX z zestawieniem kosztów: okres, wiersz na każdą budowę i pojazd (liczba narzędzi, kwota) i suma. */
export async function costSummaryWorkbook(summary: Summary): Promise<Buffer> {
  const rows: Row[] = [
    [{ value: t("costSummary.sheetTitle"), fontWeight: "bold" }],
    [t("costs.period", { from: formatCalendarDay(summary.period.from), to: formatCalendarDay(summary.period.to) })],
    header([t("costSummary.kind"), t("export.name"), t("costSummary.tools"), t("costs.amount")]),
    ...summary.locations.map((row): Row => [t(`costSummary.kinds.${row.location.kind}`), row.location.name, row.toolCount, money(row.amount)]),
    [{ value: t("costs.total"), fontWeight: "bold" }, null, null, { ...money(summary.total), fontWeight: "bold" }],
  ];
  return writeXlsxFile([{ sheet: t("costSummary.sheet"), data: rows, columns: [{ width: 10 }, { width: 30 }, { width: 10 }, { width: 14 }] }]).toBuffer();
}

/** Nazwa pliku zestawienia z okresem, np. koszty-sprzetu-2026-03-01-2026-03-31.xlsx. */
export function costSummaryFileName(summary: Summary) {
  return t("costSummary.fileName", { from: summary.period.from, to: summary.period.to });
}

function money(amount: number): Exclude<Cell, null> {
  return { value: Math.round(amount * 100) / 100, format: t("export.moneyFormat") };
}
