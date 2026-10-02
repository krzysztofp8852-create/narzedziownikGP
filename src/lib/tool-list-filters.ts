import type { ListedTool } from "@/registry/registry";
import { matchesTool } from "./tool-search";

/** Wartość filtra, która niczego nie zawęża. */
export const ALL = "";
/** Pozycja „Zaginione” w wyborze miejsca; identyfikatory lokalizacji to UUID, więc się z nią nie zderzą. */
export const LOST = "zaginione";

/** Filtry strony Narzędzia; `place` to identyfikator lokalizacji, LOST albo ALL. */
export interface ToolListFilters {
  query: string;
  category: string;
  place: string;
  /** Pokaż też wycofane i zwrócone do wypożyczalni. */
  withRetiredAndReturned: boolean;
}

const inCirculation = (tool: ListedTool) => tool.state === "w_obiegu";
const retiredOrReturned = (tool: ListedTool) => tool.state === "wycofane" || tool.state === "zwrocone";

/**
 * Narzędzia pasujące do filtrów. Miejsce to lokalizacja, w której sprzęt jest teraz, więc zawęża do sprzętu w obiegu;
 * zaginione mają osobną pozycję. Wycofane i zwrócone są tylko na życzenie. Pole szuka tak jak lupa (`matchesTool`).
 */
export function filterTools(tools: ListedTool[], filters: ToolListFilters): ListedTool[] {
  return tools.filter(
    (tool) =>
      (filters.withRetiredAndReturned || !retiredOrReturned(tool)) &&
      (filters.category === ALL || tool.category === filters.category) &&
      (filters.place === ALL ||
        (filters.place === LOST ? tool.state === "zaginione" : inCirculation(tool) && tool.location.id === filters.place)) &&
      matchesTool(tool, filters.query),
  );
}

const KIND_ORDER = { baza: 0, budowa: 1, pojazd: 2, serwis: 3 } as const;

/** Czym można zawęzić listę: kategorie sprzętu i miejsca, w których coś teraz jest (baza, budowy, pojazdy, serwisy). */
export function toolListOptions(tools: ListedTool[]) {
  const places = new Map(tools.filter(inCirculation).map((tool) => [tool.location.id, tool.location]));
  return {
    categories: [...new Set(tools.map((tool) => tool.category))].sort((a, b) => a.localeCompare(b, "pl")),
    places: [...places.values()].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name, "pl")),
    hasLost: tools.some((tool) => tool.state === "zaginione"),
    hasRetiredOrReturned: tools.some(retiredOrReturned),
  };
}
