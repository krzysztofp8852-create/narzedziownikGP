/**
 * Strony modułów (ADR 0046): po jednej publicznej podstronie na każdą grupę funkcji ze strony o programie, z opisem,
 * jak działają funkcje modułu. Klucze to grupy funkcji ze strony o programie (`FEATURE_GROUPS`), a wartości to adresy
 * stron pod `/funkcje` i nazwy plików z treścią w `messages/funkcje/<adres>.pl.md`.
 */
export const MODULE_PAGES = {
  tools: "ewidencja-narzedzi",
  costs: "koszty-sprzetu",
  time: "odbijanie-i-czas-na-budowie",
  people: "uprawnienia-pracownikow",
  fleet: "terminy-pojazdow",
  company: "raporty-i-zgloszenia",
} as const;

export type ModulePageId = keyof typeof MODULE_PAGES;

export const MODULE_PAGE_IDS = Object.keys(MODULE_PAGES) as ModulePageId[];

export function modulePagePath(id: ModulePageId): string {
  return `/funkcje/${MODULE_PAGES[id]}`;
}

export const MODULE_PAGE_PATHS: string[] = MODULE_PAGE_IDS.map(modulePagePath);

/** Moduł strony pod `/funkcje/<adres>` albo `undefined` dla nieznanego adresu. */
export function modulePageOf(slug: string): ModulePageId | undefined {
  return MODULE_PAGE_IDS.find((id) => MODULE_PAGES[id] === slug);
}
