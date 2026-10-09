import { cspViolations } from "@/lib/csp-report";

/** Raport większy niż kilka naruszeń to nie przeglądarka: taki ucięty nie jest już JSON-em i nic nie trafia do logu. */
const MAX_BODY = 64 * 1024;

/**
 * Raporty naruszeń polityki treści (ADR 0041) z `report-uri` i Reporting API. Trafiają do logu Vercel, z którego
 * widać, czy polityka coś blokuje, zanim przestanie tylko raportować. Przeglądarka wysyła je bez sesji.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.text().catch(() => "")).slice(0, MAX_BODY);
  for (const violation of cspViolations(body)) {
    console.warn(`Naruszenie CSP (${violation.disposition}): ${violation.directive} ${violation.blocked} na ${violation.page}`);
  }
  return new Response(null, { status: 204 });
}
