import { locationPagePath } from "@/lib/location-path";
import { ALARM, ALL, OFF_BASE, ON_SITES, type ToolListFilters, toolListSearch } from "@/lib/tool-list-filters";
import type { PlaceOnBoard, Role, Tutorial, WhereIsWhat } from "@/registry/registry";

/** Operacja panelu tablicy: ruch z checklisty, głos lub wpis tekstem, nowe, zgłoszone albo wynajęte narzędzie. */
export type BoardOperation = "wydanie" | "zwrot" | "przeniesienie" | "do_serwisu" | "z_serwisu" | "tekst" | "narzedzie" | "zgloszenie" | "wynajem";

/** Częste operacje na wierzchu panelu, w tej kolejności. */
const TOP: BoardOperation[] = ["wydanie", "zwrot", "tekst"];
/** Rzadsze operacje pod „Więcej operacji”, w tej kolejności. */
const MORE: BoardOperation[] = ["przeniesienie", "do_serwisu", "z_serwisu", "narzedzie", "zgloszenie", "wynajem"];

/**
 * Które z dostępnych operacji stoją na wierzchu (Wydaj, Zwróć, Powiedz lub wpisz), a które pod „Więcej operacji”.
 * Bez żadnej częstej rzadsze stają na wierzchu, żeby nie chować wszystkiego za jednym przyciskiem.
 */
export function boardOperations(available: BoardOperation[]): { top: BoardOperation[]; more: BoardOperation[] } {
  const top = TOP.filter((operation) => available.includes(operation));
  const more = MORE.filter((operation) => available.includes(operation));
  return top.length === 0 ? { top: more, more: [] } : { top, more };
}

/** Licznik tablicy: liczba narzędzi (albo kwota poza bazą w zł) i przefiltrowana lista narzędzi, do której prowadzi. */
export interface BoardCounter {
  key: "atBase" | "onSites" | "alarms" | "offBase";
  value: number;
  href: string;
}

const toolsHref = (filters: Partial<ToolListFilters>) =>
  `/narzedzia${toolListSearch({ query: ALL, category: ALL, place: ALL, show: ALL, withRetiredAndReturned: false, ...filters })}`;

/** Klikalne liczniki: Na bazie, Na budowach, Alarmy, a u właściciela (jedynego z kwotami) także Poza bazą w zł. */
export function boardCounters(board: Pick<WhereIsWhat, "counts" | "offBaseValue"> & { base: { id: string } }): BoardCounter[] {
  const { counts, offBaseValue } = board;
  return [
    { key: "atBase", value: counts.atBase, href: toolsHref({ place: board.base.id }) },
    { key: "onSites", value: counts.onSites, href: toolsHref({ show: ON_SITES }) },
    { key: "alarms", value: counts.alarms, href: toolsHref({ show: ALARM }) },
    ...(offBaseValue === undefined ? [] : [{ key: "offBase" as const, value: offBaseValue, href: toolsHref({ show: OFF_BASE }) }]),
  ];
}

/**
 * Kafle „Gdzie jest sprzęt” na siatce (`main`) i zwinięte osobno (`others`). Kierownik widzi przede wszystkim swoje
 * budowy i pojazdy (oraz bazę i serwisy), cudze są pod spodem; pozostałe role widzą wszystko na jednej siatce.
 */
export function placesOnBoard(role: Role, places: PlaceOnBoard[]): { main: PlaceOnBoard[]; others: PlaceOnBoard[] } {
  if (role !== "kierownik") return { main: places, others: [] };
  const someoneElses = (place: PlaceOnBoard) => (place.kind === "budowa" || place.kind === "pojazd") && !place.mine;
  return { main: places.filter((place) => !someoneElses(place)), others: places.filter(someoneElses) };
}

/** Dokąd prowadzi kafel: strona bazy, budowy albo pojazdu; serwis nie ma strony, więc lista narzędzi w nim. */
export function placeHref(place: Pick<PlaceOnBoard, "kind" | "id">): string {
  return place.kind === "serwis" ? toolsHref({ place: place.id }) : locationPagePath(place.kind, place.id);
}

/** „Uruchom firmę w 4 krokach” stoi na tablicy właściciela, dopóki go nie pominie, nie zamknie ani nie zrobi wszystkich kroków. */
export function firstStepsOnBoard(tutorial: Tutorial | null): tutorial is Tutorial {
  return tutorial?.role === "wlasciciel" && tutorial.closed === null && !tutorial.firstSteps.every((step) => step.done);
}
