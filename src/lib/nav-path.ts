/** Skanuj otwiera na tablicy skaner, który sam rozpoznaje kod: plakat budowy to odbicie, naklejka to narzędzie. */
export const SCAN_HREF = "/?skanuj=1";
export const ACCOUNT_HREF = "/konto";
export const HELP_HREF = "/pomoc";
/** Ustawienia właściciela: lista czterech podstron (`settings-pages`). */
export const SETTINGS_HREF = "/ustawienia";
/** Strona Budowy (u kierownika „Moje budowy”). Dawna kotwica tablicy `/#budowy` przekierowuje tutaj. */
export const SITES_HREF = "/budowy";

/** Pozycja nawigacji prowadzi na bieżącą podstronę (albo jej podstronę). Odnośnik do sekcji strony nigdy nie jest bieżący. */
export function isCurrentNavItem(href: string, pathname: string): boolean {
  if (href.includes("#")) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Pomoc z ekranu `pathname`: czat otwarty z Pomocy dostaje ten ekran jako kontekst wiadomości, jak dawniej z nagłówka. */
export function helpLink(pathname: string): string {
  return isCurrentNavItem(HELP_HREF, pathname) ? HELP_HREF : `${HELP_HREF}?ekran=${encodeURIComponent(pathname)}`;
}
