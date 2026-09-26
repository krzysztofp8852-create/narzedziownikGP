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
