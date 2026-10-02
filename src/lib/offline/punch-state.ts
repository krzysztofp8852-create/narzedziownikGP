// Własny stan odbicia w telefonie: gdzie według ostatnich odbić osoba jest odbita, żeby skan bez sieci wiedział, czy
// zapytać „Kończysz?”. Bez zależności od przeglądarki; zapis w localStorage jest niżej.

import { formatDay } from "@/i18n/dates";
import type { PunchAction, PunchPlace, PunchPreview } from "@/registry/registry";

export interface OwnPunchState {
  /**
   * Gdzie osoba jest odbita i od którego dnia w Polsce (RRRR-MM-DD); `code` null, gdy telefon nie zna kodu plakatu
   * tamtego miejsca. null: nigdzie.
   */
  current: { code: string | null; day: string } | null;
  /** Nazwy miejsc z kodów plakatów zeskanowanych z siecią, do podpisu skanu bez sieci. */
  places: Record<string, string>;
}

export const NO_PUNCH_STATE: OwnPunchState = { current: null, places: {} };

/** Tyle nazw miejsc pamięta telefon. */
const MAX_PLACES = 30;

function withPlace(state: OwnPunchState, code: string, place: PunchPlace): OwnPunchState["places"] {
  const others = Object.entries(state.places).filter(([known]) => known !== code);
  return Object.fromEntries([...others.slice(-(MAX_PLACES - 1)), [code, place.name]]);
}

/**
 * Co zrobi skan plakatu `code` w chwili `at` bez sieci: wyjście z tego miejsca (po „Kończysz?”), przejście z innego
 * albo wejście. Odbicie z poprzedniego dnia telefon pomija: jego wyjście mogło się zapisać gdzie indziej (drugi
 * telefon, zamknięcie o północy), a rano skan to wejście.
 */
export function offlinePunchAction(state: OwnPunchState, code: string, at: Date): PunchAction {
  if (!state.current || state.current.day !== formatDay(at)) return "wejscie";
  return state.current.code === code ? "wyjscie" : "przejscie";
}

/** Nazwa miejsca z kodu plakatu, jeśli telefon ją zna. */
export function offlinePlaceName(state: OwnPunchState, code: string): string | null {
  return state.places[code] ?? null;
}

/** Strona odbicia otwarta z siecią: serwer mówi, gdzie osoba jest odbita teraz. */
export function afterPreview(state: OwnPunchState, code: string, preview: PunchPreview, at: Date): OwnPunchState {
  const current = preview.action === "wejscie" ? null : { code: preview.action === "wyjscie" ? code : null, day: formatDay(at) };
  return { current, places: withPlace(state, code, preview.place) };
}

/** Odbicie zapisane z siecią na plakacie `code`. */
export function afterOutcome(
  state: OwnPunchState,
  code: string,
  outcome: { action: PunchAction; place: PunchPlace },
  at: Date,
): OwnPunchState {
  return { current: outcome.action === "wyjscie" ? null : { code, day: formatDay(at) }, places: withPlace(state, code, outcome.place) };
}

/** Odbicie zapisane w kolejce bez sieci. */
export function afterQueuedPunch(state: OwnPunchState, code: string, action: PunchAction, at: Date): OwnPunchState {
  return { ...state, current: action === "wyjscie" ? null : { code, day: formatDay(at) } };
}

const key = (userId: string) => `narzedziownik:odbicie:${userId}`;

/** Stan odbić osoby zapisany w tym telefonie (pusty, gdy przeglądarka nie daje localStorage). */
export function loadPunchState(userId: string): OwnPunchState {
  try {
    const saved = JSON.parse(localStorage.getItem(key(userId)) ?? "null") as OwnPunchState | null;
    return saved && typeof saved === "object" && saved.places ? saved : NO_PUNCH_STATE;
  } catch {
    return NO_PUNCH_STATE;
  }
}

export function savePunchState(userId: string, state: OwnPunchState) {
  try {
    localStorage.setItem(key(userId), JSON.stringify(state));
  } catch {
    // Bez localStorage telefon po prostu nie zapyta „Kończysz?” bez sieci; serwer i tak zapisze konflikt do wyjaśnienia.
  }
}
