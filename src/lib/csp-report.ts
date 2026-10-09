/** Jedno naruszenie polityki treści, w postaci do logu. */
export interface CspViolation {
  directive: string;
  blocked: string;
  page: string;
  /** `report`: polityka tylko raportuje, `enforce`: przeglądarka zablokowała. */
  disposition: string;
}

/** Więcej z jednego żądania nie logujemy: raporty wysyła każdy, kto zna adres. */
const MAX_VIOLATIONS = 10;
/** Z tego samego powodu ucinamy każde pole; dyrektywa i adres bez zapytania mieszczą się z zapasem. */
const MAX_FIELD = 100;

/**
 * Naruszenia CSP z treści żądania, w obu postaciach: `report-uri` (`{"csp-report": {...}}`) i Reporting API (tablica
 * raportów, z nich tylko `csp-violation`). Adresy bez zapytania i kotwicy, bo mogą w nich być kody z e-maili albo
 * klucze. Słowa przeglądarki zamiast adresu (`inline`, `eval`) zostają. Nieczytelna treść to pusta lista.
 */
export function cspViolations(body: string): CspViolation[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  const reports: Record<string, unknown>[] = Array.isArray(parsed)
    ? parsed.filter((report) => report?.type === "csp-violation" && isRecord(report.body)).map((report) => report.body)
    : isRecord(parsed) && isRecord(parsed["csp-report"])
      ? [legacyReport(parsed["csp-report"])]
      : [];
  return reports.slice(0, MAX_VIOLATIONS).map((report) => ({
    directive: field(report.effectiveDirective),
    blocked: field(withoutQuery(report.blockedURL)),
    page: field(pathOf(report.documentURL)),
    disposition: field(report.disposition) || "report",
  }));
}

/** Pola `report-uri` pod nazwami z Reporting API. */
function legacyReport(report: Record<string, unknown>): Record<string, unknown> {
  return {
    effectiveDirective: report["effective-directive"] ?? report["violated-directive"],
    blockedURL: report["blocked-uri"],
    documentURL: report["document-uri"],
    disposition: report.disposition,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_FIELD) : "";
}

function withoutQuery(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value;
  }
}

function pathOf(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return new URL(value).pathname;
  } catch {
    return "";
  }
}
