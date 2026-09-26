import type { ToolImportRow } from "@/registry/registry";
import type { Sheet } from "./sheet";

export type ImportField = keyof ToolImportRow;

/** Pola karty narzędzia, które da się wczytać z pliku, w kolejności formularza. */
export const IMPORT_FIELDS: readonly ImportField[] = ["code", "name", "category", "brand", "model", "serialNumber", "value", "location"];

/** Który numer kolumny pliku (od 0) trafia do danego pola; null: pole puste w każdym wierszu. */
export type ColumnMapping = Record<ImportField, number | null>;

/** Nagłówki, po których rozpoznajemy kolumnę, po normalizacji (małe litery, bez polskich znaków i odstępów). */
const HEADER_NAMES: Record<ImportField, string[]> = {
  code: ["kod", "kodnarzedzia", "kodqr", "oznaczenie", "nrewidencyjny", "numerewidencyjny", "code"],
  name: ["nazwa", "nazwanarzedzia", "narzedzie", "name"],
  category: ["kategoria", "rodzaj", "grupa", "category"],
  brand: ["marka", "producent", "brand"],
  model: ["model"],
  serialNumber: ["numerseryjny", "nrseryjny", "sn", "serial", "serialnumber", "numerfabryczny", "nrfabryczny"],
  value: ["wartosc", "wartosczl", "wartoscpln", "cena", "cenazakupu", "value"],
  location: ["lokalizacja", "budowa", "miejsce", "gdzie", "location"],
};

export function normalizeHeader(header: string): string {
  return header
    .toLocaleLowerCase("pl")
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[^a-z0-9]/g, "");
}

/** Podpowiedź mapowania z nagłówków pliku; każda kolumna trafia najwyżej do jednego pola. */
export function guessMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map(normalizeHeader);
  const used = new Set<number>();
  const mapping = {} as ColumnMapping;
  for (const field of IMPORT_FIELDS) {
    const index = normalized.findIndex((header, i) => !used.has(i) && HEADER_NAMES[field].includes(header));
    mapping[field] = index === -1 ? null : index;
    if (index !== -1) used.add(index);
  }
  return mapping;
}

/** Wiersze pliku jako pola karty narzędzia, w kolejności pliku. */
export function mapRows(sheet: Sheet, mapping: ColumnMapping): ToolImportRow[] {
  return sheet.rows.map(({ cells }) => {
    const row: ToolImportRow = {};
    for (const field of IMPORT_FIELDS) {
      const index = mapping[field];
      if (index !== null) row[field] = cells[index] ?? "";
    }
    return row;
  });
}
