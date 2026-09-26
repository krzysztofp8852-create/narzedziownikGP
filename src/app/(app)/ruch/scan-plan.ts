import type { RegisteredKind } from "@/registry/registry";
import type { ChecklistData, ChecklistPlace, ChecklistTool } from "./checklist";

/** Kod bez spacji i kresek, wielkimi literami: „h 03” i „H03” to H-03. */
function bareCode(text: string) {
  return text.replace(/[\s-]/g, "").toUpperCase();
}

/** Narzędzie z tablicy o wpisanym kodzie, gdy naklejka jest zniszczona. Kod musi pasować w całości. */
export function findToolByCode(places: ChecklistPlace[], typed: string): ChecklistTool | null {
  const wanted = bareCode(typed);
  if (!wanted) return null;
  for (const place of places) {
    const tool = place.tools.find((candidate) => bareCode(candidate.code) === wanted);
    if (tool) return tool;
  }
  return null;
}

/** Rodzaj ruchu, którym aktor może ruszyć grupę, i dokąd (najpierw jego budowy). */
export interface ScanOption {
  kind: RegisteredKind;
  to: ChecklistPlace[];
}

/** Zeskanowane narzędzia z jednej lokalizacji: jeden ruch do zatwierdzenia. */
export interface ScanGroup {
  from: ChecklistPlace;
  tools: ChecklistTool[];
  /** Podpowiedziany rodzaj ruchu pierwszy. Pusta lista: aktor nie może ruszyć tego sprzętu. */
  options: ScanOption[];
}

/**
 * Kolejność podpowiedzi według miejsca, w którym narzędzie jest teraz. Z bazy się wydaje, z serwisu
 * przyjmuje na bazę. Z własnej budowy kierownik zwraca, a z cudzej zabiera do siebie; magazynier
 * i właściciel pracują na bazie, więc sprzęt z każdej budowy do nich wraca.
 */
function preference(from: ChecklistPlace, everywhere: boolean): RegisteredKind[] {
  switch (from.kind) {
    case "baza":
      return ["wydanie", "do_serwisu"];
    case "serwis":
      return ["z_serwisu"];
    case "budowa":
      return from.mine || everywhere ? ["zwrot", "przeniesienie", "do_serwisu"] : ["przeniesienie", "zwrot", "do_serwisu"];
  }
}

/**
 * Dzieli zeskanowane narzędzia na ruchy według miejsca, w którym są teraz (w kolejności skanowania),
 * i do każdego podpowiada rodzaj ruchu z tych, które aktor może zarejestrować. Narzędzi, których nie
 * ma już na tablicy, nie ma w wyniku.
 */
export function planScan(scannedIds: string[], { places, routes, everywhere }: ChecklistData): ScanGroup[] {
  const byId = new Map(places.map((place) => [place.id, place]));
  const placeOf = new Map(places.flatMap((place) => place.tools.map((tool) => [tool.id, { place, tool }] as const)));

  const groups = new Map<string, ScanGroup>();
  for (const id of new Set(scannedIds)) {
    const found = placeOf.get(id);
    if (!found) continue;
    const group = groups.get(found.place.id) ?? { from: found.place, tools: [], options: options(found.place) };
    group.tools.push(found.tool);
    groups.set(found.place.id, group);
  }
  return [...groups.values()];

  function options(from: ChecklistPlace): ScanOption[] {
    return preference(from, everywhere).flatMap((kind) => {
      const route = routes[kind];
      if (!route?.from.includes(from.id)) return [];
      const to = route.to.filter((id) => id !== from.id).flatMap((id) => byId.get(id) ?? []);
      return to.length > 0 ? [{ kind, to }] : [];
    });
  }
}
