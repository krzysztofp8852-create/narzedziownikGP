import { type HistoryFilters, isCalendarDay, UUID_PATTERN } from "@/registry/registry";

/** Parametry adresu dla filtrów historii, np. /historia?lokalizacja=…&od=2026-03-01. */
export const HISTORY_PARAMS = {
  locationId: "lokalizacja",
  personId: "osoba",
  toolId: "narzedzie",
  from: "od",
  to: "do",
} as const satisfies Record<keyof HistoryFilters, string>;

type SearchParams = URLSearchParams | Record<string, string | string[] | undefined>;

/** Filtry z adresu. Puste, niebędące identyfikatorem i nieistniejące dni pomija. */
export function parseHistoryFilters(params: SearchParams): HistoryFilters {
  const get = (name: string) => {
    const value = params instanceof URLSearchParams ? params.get(name) : params[name];
    return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
  };
  const filters: HistoryFilters = {};
  for (const key of ["locationId", "personId", "toolId"] as const) {
    const value = get(HISTORY_PARAMS[key]);
    if (value && UUID_PATTERN.test(value)) filters[key] = value;
  }
  for (const key of ["from", "to"] as const) {
    const value = get(HISTORY_PARAMS[key]);
    if (value && isCalendarDay(value)) filters[key] = value;
  }
  return filters;
}

/** Część adresu z filtrami („?osoba=…”), albo pusty tekst bez filtrów. */
export function historySearch(filters: HistoryFilters): string {
  const search = new URLSearchParams();
  for (const key of Object.keys(HISTORY_PARAMS) as (keyof HistoryFilters)[]) {
    if (filters[key]) search.set(HISTORY_PARAMS[key], filters[key]);
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}
