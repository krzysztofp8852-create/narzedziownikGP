// Raport zestawu ewaluacyjnego do konsoli.
import type { CaseResult, CheckField } from "./eval";

const FIELD_LABELS: Record<CheckField, string> = {
  question: "ruch czy pytanie",
  kind: "rodzaj",
  site: "budowa",
  service: "serwis",
  from: "skąd",
  tools: "narzędzia",
  ambiguities: "pytania",
  unrecognized: "nierozpoznane",
};

/** Raport do konsoli: każdy przypadek z rozbieżnościami, potem trafność całości, pól i obszarów. */
export function formatReport(results: CaseResult[]): string {
  const lines: string[] = [];
  const ratio = (passed: number, total: number) => `${passed}/${total}`;
  for (const result of results) {
    lines.push(`${result.passed ? "✓" : "✗"} ${result.id}  ${result.said}`);
    if (result.recording) lines.push(`    rozpoznano: ${result.text || "—"}`);
    if (result.error) lines.push(`    błąd: ${result.error}`);
    for (const check of result.checks.filter((entry) => !entry.passed)) {
      lines.push(`    ${FIELD_LABELS[check.field]}: oczekiwano ${check.expected}, jest ${check.actual}`);
    }
  }

  const passed = results.filter((result) => result.passed).length;
  lines.push("", `Trafność: ${ratio(passed, results.length)} (${Math.round((100 * passed) / Math.max(1, results.length))}%)`);
  const fields = (Object.keys(FIELD_LABELS) as CheckField[]).flatMap((field) => {
    const checks = results.flatMap((result) => result.checks.filter((check) => check.field === field));
    return checks.length === 0 ? [] : [`${FIELD_LABELS[field]} ${ratio(checks.filter((check) => check.passed).length, checks.length)}`];
  });
  lines.push(`Pola: ${fields.join(" · ")}`);
  const tags = [...new Set(results.flatMap((result) => result.tags))];
  const byTag = tags.map((tag) => {
    const tagged = results.filter((result) => result.tags.includes(tag));
    return `${tag} ${ratio(tagged.filter((result) => result.passed).length, tagged.length)}`;
  });
  lines.push(`Obszary: ${byTag.join(" · ")}`);
  const errors = results.filter((result) => result.error).length;
  if (errors > 0) lines.push(`Błędy portów lub przypadków: ${errors}`);
  return lines.join("\n");
}

/** „1 przypadek”, „3 przypadki”, „67 przypadków”. */
export function casesCount(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (count === 1) return "1 przypadek";
  return `${count} ${last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? "przypadki" : "przypadków"}`;
}
