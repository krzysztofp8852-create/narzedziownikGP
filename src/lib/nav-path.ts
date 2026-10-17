/** Skanuj na razie otwiera dzisiejszy skaner na tablicy: ruchów, a pracownikowi odbicia. */
export const SCAN_HREF = "/?skanuj=1";
export const ACCOUNT_HREF = "/konto";
export const HELP_HREF = "/pomoc";
/** Budowy nie mają jeszcze własnej strony, więc prowadzą do swojej sekcji tablicy. */
export const SITES_HREF = "/#budowy";

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
