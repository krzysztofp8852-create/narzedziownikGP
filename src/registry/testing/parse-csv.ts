/**
 * Plik CSV z eksportu (RFC 4180): kolumny z nagłówka i wiersze jako obiekty po nazwach kolumn. Puste pole to `null`,
 * a `""` to pusty tekst, jak zapisuje je eksport.
 */
export function parseCsv(bytes: Uint8Array): { columns: string[]; rows: Record<string, string | null>[] } {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const records: (string | null)[][] = [];
  let record: (string | null)[] = [];
  let i = 0;
  while (i < text.length) {
    let value: string | null;
    if (text[i] === '"') {
      let end = i + 1;
      value = "";
      for (;;) {
        const quote = text.indexOf('"', end);
        if (quote < 0) throw new Error("Niezamknięty cudzysłów");
        value += text.slice(end, quote);
        if (text[quote + 1] !== '"') {
          i = quote + 1;
          break;
        }
        value += '"';
        end = quote + 2;
      }
    } else {
      const end = text.slice(i).search(/,|\r\n/);
      const raw = text.slice(i, end < 0 ? text.length : i + end);
      value = raw === "" ? null : raw;
      i += raw.length;
    }
    record.push(value);
    if (text.startsWith("\r\n", i)) {
      records.push(record);
      record = [];
      i += 2;
    } else if (text[i] === ",") {
      i += 1;
    } else {
      throw new Error(`Nieoczekiwany znak na pozycji ${i}`);
    }
  }
  const [header, ...rows] = records;
  const columns = header.map(String);
  return { columns, rows: rows.map((row) => Object.fromEntries(columns.map((name, column) => [name, row[column]]))) };
}
