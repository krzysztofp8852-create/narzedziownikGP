import { readSheet } from "read-excel-file/universal";

/** Arkusz z pliku: nagłówki z pierwszego niepustego wiersza i wiersze danych jako teksty komórek. */
export interface Sheet {
  headers: string[];
  /** `line`: numer wiersza w pliku, liczony od 1 (nagłówek też jest wierszem). */
  rows: { line: number; cells: string[] }[];
}

export type SheetErrorCode = "unsupported" | "unreadable" | "empty";

export class SheetError extends Error {
  constructor(readonly code: SheetErrorCode) {
    super(code);
    this.name = "SheetError";
  }
}

/** Czyta pierwszy arkusz pliku XLSX albo plik CSV (UTF-8 lub Windows-1250, średnik, przecinek lub tabulator). */
export async function readSheetFile(file: { name: string; data: ArrayBuffer }): Promise<Sheet> {
  const extension = file.name.toLowerCase().split(".").pop();
  let table: string[][];
  if (extension === "xlsx") {
    table = await readXlsx(file.data);
  } else if (extension === "csv" || extension === "txt") {
    table = parseCsv(decodeText(file.data));
  } else {
    throw new SheetError("unsupported");
  }
  return toSheet(table);
}

async function readXlsx(data: ArrayBuffer): Promise<string[][]> {
  try {
    // Liczby zostają tekstem z pliku („3200.5”): wartość w zł sprawdza Rejestr, a kod „0012” nie traci zer.
    const rows = await readSheet<string>(data, { parseNumber: (raw) => raw });
    return rows.map((row) => row.map(cellText));
  } catch {
    throw new SheetError("unreadable");
  }
}

function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell).trim();
}

function toSheet(table: string[][]): Sheet {
  const lines = table.map((cells, index) => ({ line: index + 1, cells: cells.map((cell) => cell.trim()) }));
  const nonEmpty = lines.filter(({ cells }) => cells.some(Boolean));
  const [header, ...rows] = nonEmpty;
  if (!header || rows.length === 0) throw new SheetError("empty");
  return { headers: header.cells, rows };
}

/** Excel w polskich ustawieniach zapisuje CSV w Windows-1250; UTF-8 poznajemy po poprawnym kodowaniu. */
export function decodeText(data: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(data);
  } catch {
    return new TextDecoder("windows-1250").decode(data);
  }
}

/** CSV według RFC 4180: pola w cudzysłowach mogą mieć separator, nowy wiersz i "" jako cudzysłów. */
export function parseCsv(text: string): string[][] {
  const separator = guessSeparator(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === "") {
      quoted = true;
    } else if (char === separator) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Separator, który najczęściej występuje w pierwszym wierszu poza cudzysłowami. */
function guessSeparator(text: string): string {
  const counts = new Map([[";", 0], [",", 0], ["\t", 0]]);
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "\n" || char === "\r")) break;
    else if (!quoted && counts.has(char)) counts.set(char, counts.get(char)! + 1);
  }
  return [...counts].reduce((best, candidate) => (candidate[1] > best[1] ? candidate : best))[0];
}
