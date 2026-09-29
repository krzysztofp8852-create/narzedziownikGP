import { LEGAL_PATHS } from "@/legal/documents";

/** Strona o programie, którą niezalogowany widzi pod adresem głównym. */
export const LANDING_PATH = "/o-programie";

// Do demo wchodzi się bez logowania. Zadania harmonogramu same sprawdzają sekret, bez logowania użytkownika. „Brak sieci” service worker
// pobiera przy instalacji, także przed zalogowaniem. Stronę o programie, robots.txt i mapę strony czytają wyszukiwarki.
// Regulamin, politykę prywatności i umowę powierzenia czyta się przed założeniem konta.
const PUBLIC_PATHS = [
  LANDING_PATH,
  "/demo",
  "/logowanie",
  "/reset-hasla",
  "/auth/confirm",
  "/zadania/progi",
  "/zadania/terminy",
  "/zadania/raporty",
  "/zadania/abonamenty",
  "/zadania/demo",
  "/offline",
  "/robots.txt",
  "/sitemap.xml",
  ...LEGAL_PATHS,
];

/**
 * `page`: otwarta strona, `landing`: strona o programie pod tym samym adresem, `login`: logowanie z `next`,
 * ścieżką, na którą wracamy po zalogowaniu.
 */
export type VisitorRoute = { kind: "page" } | { kind: "landing" } | { kind: "login"; next: string | null };

/** Co pokazać na otwartym adresie. */
export function visitorRoute(request: { pathname: string; search: string; method: string }, signedIn: boolean): VisitorRoute {
  const { pathname, search, method } = request;
  if (signedIn || PUBLIC_PATHS.includes(pathname)) return { kind: "page" };
  const read = method === "GET" || method === "HEAD";
  if (pathname === "/" && read) return { kind: "landing" };
  // Po zalogowaniu wracamy na otwartą stronę, np. kartę narzędzia zeskanowaną z naklejki QR.
  return { kind: "login", next: read ? `${pathname}${search}` : null };
}
