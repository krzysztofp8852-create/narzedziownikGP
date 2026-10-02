// Własny stan odbicia w telefonie: gdzie według ostatnich odbić osoba jest odbita, żeby skan bez sieci wiedział, czy
// zapytać „Kończysz?”. Telefon właściciela i kierownika pamięta też listę „Odbij też…” z ostatniego skanu z siecią
// i stan osób, które odbija. Bez zależności od przeglądarki; zapis w localStorage jest niżej.

import { formatDay } from "@/i18n/dates";
import type { PersonToPunch, PunchAction, PunchPlace, PunchPreview } from "@/registry/registry";

/**
 * Gdzie osoba jest odbita i od którego dnia w Polsce (RRRR-MM-DD); `code` null, gdy telefon nie zna kodu plakatu
 * tamtego miejsca. null: nigdzie.
 */
type PunchedAt = { code: string | null; day: string } | null;

export interface OwnPunchState {
  current: PunchedAt;
  /** Nazwy miejsc z kodów plakatów zeskanowanych z siecią, do podpisu skanu bez sieci. */
  places: Record<string, string>;
  /**
   * Osoby z listy „Odbij też…” (telefon właściciela albo kierownika): imię i nazwisko i gdzie są odbite według
   * telefonu, z nazwą miejsca, gdy telefon nie zna jego kodu. Brak: telefon jeszcze nie dostał listy.
   */
  people?: Record<string, { name: string; current: PunchedAt; placeName: string | null }>;
}

/** Osoba do odbicia bez sieci: co zrobi skan według telefonu i skąd przejście, jeśli telefon wie. */
export interface OfflinePersonToPunch {
  person: { id: string; fullName: string };
  action: PunchAction;
  from: string | null;
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
  return actionAt(state.current, code, at);
}

function actionAt(current: PunchedAt, code: string, at: Date): PunchAction {
  if (!current || current.day !== formatDay(at)) return "wejscie";
  return current.code === code ? "wyjscie" : "przejscie";
}

/**
 * Lista „Odbij też…” bez sieci: osoby z ostatniej listy z sieci z tym, co według telefonu zrobi dla nich skan plakatu
 * `code` (jak przy własnym skanie), najpierw odbite tutaj, potem po imieniu i nazwisku.
 */
export function offlinePeopleToPunch(state: OwnPunchState, code: string, at: Date): OfflinePersonToPunch[] {
  const people = Object.entries(state.people ?? {}).map(([id, known]) => {
    const action = actionAt(known.current, code, at);
    const placeName = known.current?.code ? (state.places[known.current.code] ?? null) : known.placeName;
    return { person: { id, fullName: known.name }, action, from: action === "przejscie" ? placeName : null };
  });
  const here = (entry: OfflinePersonToPunch) => (entry.action === "wyjscie" ? 0 : 1);
  return people.sort((a, b) => here(a) - here(b) || a.person.fullName.localeCompare(b.person.fullName, "pl"));
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

/** Strona odbicia z sieci (plakat `code` miejsca `place`) podała listę „Odbij też…”: telefon zapamiętuje ją w miejsce poprzedniej. */
export function afterPeoplePreview(state: OwnPunchState, code: string, place: PunchPlace, people: PersonToPunch[], at: Date): OwnPunchState {
  const day = formatDay(at);
  const known = people.map(({ person, action, from }) => {
    const current = action === "wejscie" ? null : { code: action === "wyjscie" ? code : null, day };
    return [person.id, { name: person.fullName, current, placeName: from?.name ?? null }] as const;
  });
  return { ...state, places: withPlace(state, code, place), people: Object.fromEntries(known) };
}

/** Osoby z listy odbite na plakacie `code`, z siecią albo do kolejki. */
export function afterPeoplePunched(state: OwnPunchState, code: string, punched: { personId: string; action: PunchAction }[], at: Date): OwnPunchState {
  const people = { ...state.people };
  for (const { personId, action } of punched) {
    const known = people[personId];
    if (known) people[personId] = { name: known.name, current: action === "wyjscie" ? null : { code, day: formatDay(at) }, placeName: null };
  }
  return { ...state, people };
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
