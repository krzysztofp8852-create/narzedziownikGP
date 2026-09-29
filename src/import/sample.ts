import writeXlsxFile, { type Row } from "write-excel-file/node";
import { formatCalendarDay } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { normalizeHeader } from "./columns";

/** Przykładowe narzędzia i słowa, po których dobieramy im kategorię firmy. */
/** Przegląd i koniec gwarancji: za tyle miesięcy od dziś; bez nich narzędzie nie ma terminu. */
const EXAMPLES = [
  { hints: ["mlot", "wiert"], name: "Młotowiertarka", brand: "Hilti", model: "TE 30-A36", serialNumber: "HI482113", value: 3900, inspection: 6, warranty: 24 },
  { hints: ["szlif"], name: "Szlifierka kątowa 125 mm", brand: "Makita", model: "GA5030", serialNumber: "", value: 450, inspection: null, warranty: null },
  { hints: ["niwel", "pomiar", "laser"], name: "Niwelator laserowy", brand: "Leica", model: "Rugby 640", serialNumber: "LE506032", value: 6900, inspection: 3, warranty: 12 },
];

/** Dzień (RRRR-MM-DD) o `months` miesięcy później, w zapisie z Excela, np. „2.09.2026”. */
function monthsLater(day: string, months: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return formatCalendarDay(date.toISOString().slice(0, 10));
}

/**
 * Przykładowy plik importu (XLSX) z nagłówkami, które mapowanie kolumn rozpoznaje samo, i trzema wierszami
 * z kategoriami i lokalizacjami tej firmy. Kody są puste, bo Rejestr nada kolejne wolne, a trzeci wiersz nie ma
 * lokalizacji, więc trafi na bazę. Terminy przeglądu i końca gwarancji liczą się od `today` (RRRR-MM-DD).
 */
export async function sampleImportFile({
  categories,
  base,
  sites,
  today,
}: {
  categories: { name: string }[];
  base: string;
  sites: string[];
  today: string;
}): Promise<Buffer> {
  const categoryFor = (hints: string[], index: number) =>
    categories.find((category) => hints.some((hint) => normalizeHeader(category.name).includes(hint)))?.name ??
    categories[index % Math.max(categories.length, 1)]?.name ??
    "";
  const places = [sites[0] ?? base, base, ""];
  const header: Row = [
    t("import.sample.code"),
    t("import.sample.name"),
    t("import.sample.category"),
    t("import.sample.brand"),
    t("import.sample.model"),
    t("import.sample.serialNumber"),
    t("import.sample.value"),
    t("import.sample.location"),
    t("import.sample.inspectionDue"),
    t("import.sample.warrantyUntil"),
  ].map((value) => ({ value, fontWeight: "bold" }));
  const rows: Row[] = EXAMPLES.map((example, index) => [
    null,
    example.name,
    categoryFor(example.hints, index),
    example.brand,
    example.model,
    example.serialNumber || null,
    example.value,
    places[index] || null,
    example.inspection === null ? null : monthsLater(today, example.inspection),
    example.warranty === null ? null : monthsLater(today, example.warranty),
  ]);
  return writeXlsxFile([
    {
      sheet: t("import.sample.sheet"),
      data: [header, ...rows],
      stickyRowsCount: 1,
      columns: [
        { width: 10 },
        { width: 28 },
        { width: 24 },
        { width: 14 },
        { width: 14 },
        { width: 16 },
        { width: 10 },
        { width: 28 },
        { width: 18 },
        { width: 16 },
      ],
    },
  ]).toBuffer();
}
