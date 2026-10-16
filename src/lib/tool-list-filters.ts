import { type ListedTool, UUID_PATTERN } from "@/registry/registry";
import { matchesTool } from "./tool-search";

/** Wartość filtra, która niczego nie zawęża. */
export const ALL = "";
/** Same zaginione. */
export const LOST = "zaginione";
/** Sam sprzęt w serwisie. */
export const IN_SERVICE = "w-serwisie";
/** Sam sprzęt z alarmem: w lokalizacji z progiem dłużej niż próg dni. */
export const ALARM = "z-alarmem";
const SHOWS = [LOST, IN_SERVICE, ALARM] as const;
type Show = (typeof SHOWS)[number];

/** Co pokazać: same zaginione, sam sprzęt w serwisie, sam z alarmem albo wszystko (ALL). */
export type ToolListShow = typeof ALL | Show;

/** Filtry strony Narzędzia; `place` to identyfikator lokalizacji albo ALL. */
export interface ToolListFilters {
  query: string;
  category: string;
  place: string;
  show: ToolListShow;
  /** Pokaż też wycofane i zwrócone do wypożyczalni. */
  withRetiredAndReturned: boolean;
}

const inCirculation = (tool: ListedTool) => tool.state === "w_obiegu";
const retiredOrReturned = (tool: ListedTool) => tool.state === "wycofane" || tool.state === "zwrocone";

const SHOWN: Record<Show, (tool: ListedTool) => boolean> = {
  [LOST]: (tool) => tool.state === "zaginione",
  [IN_SERVICE]: (tool) => inCirculation(tool) && tool.location.kind === "serwis",
  [ALARM]: (tool) => tool.alarm,
};

/**
 * Narzędzia pasujące do filtrów. Miejsce to lokalizacja, w której sprzęt jest teraz, więc zawęża do sprzętu w obiegu.
 * Wycofane i zwrócone są tylko na życzenie. Pole szuka tak jak lupa (`matchesTool`).
 */
export function filterTools(tools: ListedTool[], filters: ToolListFilters): ListedTool[] {
  return tools.filter(
    (tool) =>
      (filters.withRetiredAndReturned || !retiredOrReturned(tool)) &&
      (filters.category === ALL || tool.category === filters.category) &&
      (filters.place === ALL || (inCirculation(tool) && tool.location.id === filters.place)) &&
      (filters.show === ALL || SHOWN[filters.show](tool)) &&
      matchesTool(tool, filters.query),
  );
}

/** Filtry po zmianie. Zaginione nie są w żadnym miejscu, więc wybór jednego zdejmuje drugie. */
export function changeFilters(current: ToolListFilters, changes: Partial<ToolListFilters>): ToolListFilters {
  const next = { ...current, ...changes };
  if (changes.show === LOST) next.place = ALL;
  if (changes.place && next.show === LOST) next.show = ALL;
  return next;
}

const KIND_ORDER = { baza: 0, budowa: 1, pojazd: 2, serwis: 3 } as const;

/**
 * Czym można zawęzić listę: kategorie sprzętu, miejsca, w których coś teraz jest (baza, budowy, pojazdy, serwisy),
 * i ile jest zaginionych, w serwisie i z alarmem.
 */
export function toolListOptions(tools: ListedTool[]) {
  const places = new Map(tools.filter(inCirculation).map((tool) => [tool.location.id, tool.location]));
  return {
    categories: [...new Set(tools.map((tool) => tool.category))].sort((a, b) => a.localeCompare(b, "pl")),
    places: [...places.values()].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name, "pl")),
    counts: Object.fromEntries(SHOWS.map((show) => [show, tools.filter(SHOWN[show]).length])) as Record<Show, number>,
    hasRetiredOrReturned: tools.some(retiredOrReturned),
  };
}

/** Parametry adresu dla filtrów listy narzędzi, np. /narzedzia?pokaz=z-alarmem&kategoria=Szlifierki. */
const TOOL_LIST_PARAMS = {
  query: "szukaj",
  category: "kategoria",
  place: "lokalizacja",
  show: "pokaz",
  withRetiredAndReturned: "wycofane",
} as const satisfies Record<keyof ToolListFilters, string>;
const YES = "tak";

type SearchParams = URLSearchParams | Record<string, string | string[] | undefined>;

/**
 * Filtry z adresu. Puste, nieznane i lokalizacje, które nie są identyfikatorem, pomija; przy zaginionych lokalizację
 * zdejmuje, tak jak `changeFilters`.
 */
export function parseToolListFilters(params: SearchParams): ToolListFilters {
  const get = (name: string) => {
    const value = params instanceof URLSearchParams ? params.get(name) : params[name];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  };
  const place = get(TOOL_LIST_PARAMS.place);
  const show = SHOWS.find((known) => known === get(TOOL_LIST_PARAMS.show)) ?? ALL;
  return {
    query: get(TOOL_LIST_PARAMS.query),
    category: get(TOOL_LIST_PARAMS.category),
    place: show !== LOST && UUID_PATTERN.test(place) ? place : ALL,
    show,
    withRetiredAndReturned: get(TOOL_LIST_PARAMS.withRetiredAndReturned) === YES,
  };
}

/** Część adresu z filtrami („?pokaz=zaginione”), albo pusty tekst bez filtrów. */
export function toolListSearch(filters: ToolListFilters): string {
  const search = new URLSearchParams();
  for (const key of ["query", "category", "place", "show"] as const) {
    if (filters[key]) search.set(TOOL_LIST_PARAMS[key], filters[key]);
  }
  if (filters.withRetiredAndReturned) search.set(TOOL_LIST_PARAMS.withRetiredAndReturned, YES);
  const text = search.toString();
  return text ? `?${text}` : "";
}
