const ORIGIN = "http://aplikacja.invalid";

/**
 * Ścieżka, na którą wracamy po zalogowaniu (np. karta narzędzia z naklejki QR). Tylko ścieżka
 * tej aplikacji; wszystko inne, także adres innej domeny podany jako „//domena”, prowadzi na tablicę.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next?.startsWith("/")) return "/";
  const url = new URL(next, ORIGIN);
  return url.origin === ORIGIN ? `${url.pathname}${url.search}${url.hash}` : "/";
}

/** Strony, które widzi każda rola, więc po przełączeniu roli w demo można na nich zostać. */
const EVERY_ROLE_PAGES = [/^\/$/, /^\/historia$/, /^\/zgloszenia$/, /^\/dzwonek$/, /^\/szukaj$/, /^\/narzedzia\/[0-9a-f-]{36}$/];

/**
 * Ścieżka, na której oglądający demo zostaje po zmianie roli: bieżąca strona, jeśli widzi ją każda rola,
 * a w innym przypadku tablica. Tylko ścieżka tej aplikacji, bez parametrów.
 */
export function demoReturnPath(path: string | null | undefined): string {
  const safe = safeNextPath(path).split(/[?#]/)[0];
  return EVERY_ROLE_PAGES.some((page) => page.test(safe)) ? safe : "/";
}
