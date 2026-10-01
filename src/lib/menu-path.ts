/** Pozycja menu prowadzi na bieżącą podstronę (albo jej podstronę). Odnośnik do sekcji strony nigdy nie jest bieżący. */
export function isCurrentMenuItem(href: string, pathname: string): boolean {
  if (href.includes("#")) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
