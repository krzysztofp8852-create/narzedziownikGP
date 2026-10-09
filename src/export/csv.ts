/**
 * Plik CSV (RFC 4180) w UTF-8 bez BOM: nagłówek z nazwami kolumn, przecinki, CRLF po każdym wierszu. Brak wartości
 * (`null`) to puste pole, a pusty tekst to `""`, więc da się je odróżnić.
 */
export function csv(columns: string[], rows: (string | null)[][]): Uint8Array {
  const lines = [columns, ...rows].map((row) => row.map(field).join(",") + "\r\n");
  return new TextEncoder().encode(lines.join(""));
}

function field(value: string | null) {
  if (value === null) return "";
  return value === "" || /[",\r\n]|^\s|\s$/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
