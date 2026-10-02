import { RegistryError } from "./errors";
import type { Sql } from "./ports";
import { ownPunchesInMonth, type Punch, type PunchPlace, type PunchPlaceKind } from "./punches";
import type { Session } from "./registry";
import { isMonth, shiftMonth, warsawMonthEnd, warsawMonthStart, warsawTime } from "./validation";

/** Czas wszystkich osób albo jednej osoby na miejscu w miesiącu. */
export interface PlaceTime {
  place: PunchPlace;
  timeMs: number;
}

/**
 * Zestawienie czasu na budowie w miesiącu: osoba × miejsce (budowa albo baza). Liczy się czas od wejścia do wyjścia
 * każdego odbicia, ta jego część, która przypada na miesiąc w Polsce. Odbicia „bez wyjścia” i osoby odbite teraz się
 * nie liczą; przejście daje osobne wpisy na obu budowach, a przerwa między wyjściem a następnym wejściem (dojazd) nie
 * liczy się nigdzie.
 */
export interface TimeOnSiteSummary {
  month: string;
  /** Miejsca z odbiciami w miesiącu, po nazwie, z sumą czasu wszystkich osób. */
  places: PlaceTime[];
  /**
   * Osoby z odbiciami w miesiącu, po imieniu i nazwisku: czas na każdym miejscu (w kolejności `places`, 0 gdy jej tam
   * nie było), suma i liczba odbić „bez wyjścia”, które się nie liczą.
   */
  people: { person: { id: string; fullName: string }; timeMs: number; byPlace: number[]; withoutExit: number }[];
  timeMs: number;
}

/** Własny czas na budowie osoby w jednym miesiącu: sumy jak w zestawieniu i odbicia z miesiąca. */
export interface OwnTimeOnSite {
  month: string;
  timeMs: number;
  /** Miejsca z odbiciami w miesiącu, po nazwie. */
  places: PlaceTime[];
  /** Odbicia „bez wyjścia”, które się nie liczą. */
  withoutExit: number;
  /** Odbicia z wejściem albo wyjściem w miesiącu (także odbicie teraz), od najnowszego. */
  punches: Punch[];
}

/** Zestawienie miesięczne mają właściciel (cała firma) i kierownik (jego budowy). */
export function canSeeTimeOnSiteSummary(session: Session) {
  return session.role === "wlasciciel" || session.role === "kierownik";
}

function requireMonth(month: string) {
  if (!isMonth(String(month))) throw new RegistryError("invalid_input");
}

interface CellRow {
  person_id: string;
  person_name: string;
  location_id: string;
  location_kind: PunchPlaceKind;
  location_name: string;
  time_ms: number;
  without_exit: number;
}

/**
 * Czas osób na miejscach w miesiącu z odbić spełniających warunek `where` (na `p`, `pe`, `l`; parametry od $2).
 * Odbicie trwające przez granicę miesiąca liczy się tylko w części z tego miesiąca.
 */
async function summarize(sql: Sql, month: string, where: string, params: unknown[]): Promise<TimeOnSiteSummary> {
  const rows = await sql<CellRow>(
    `with bounds as (select ${warsawMonthStart("$1")} as from_at, ${warsawMonthEnd("$1")} as to_at)
     select p.person_id, pe.full_name as person_name, p.location_id, l.kind as location_kind, l.name as location_name,
            coalesce(round(sum(extract(epoch from least(p.left_at, b.to_at) - greatest(p.entered_at, b.from_at)) * 1000)
                             filter (where p.exit_via <> 'bez_wyjscia')), 0)::float8 as time_ms,
            (count(*) filter (where p.exit_via = 'bez_wyjscia'))::int as without_exit
     from app.punches p
     join app.people pe on pe.id = p.person_id
     join app.locations l on l.id = p.location_id
     cross join bounds b
     where p.left_at is not null and p.entered_at < b.to_at and p.left_at > b.from_at and (${where})
     group by p.person_id, pe.full_name, p.location_id, l.kind, l.name
     order by p.person_id`,
    [`${month}-01`, ...params],
  );

  const places = new Map<string, PlaceTime>();
  for (const row of rows) {
    const entry = places.get(row.location_id) ?? { place: { id: row.location_id, kind: row.location_kind, name: row.location_name }, timeMs: 0 };
    entry.timeMs += row.time_ms;
    places.set(row.location_id, entry);
  }
  const placeList = [...places.values()].sort((a, b) => a.place.name.localeCompare(b.place.name, "pl"));
  const column = new Map(placeList.map((entry, index) => [entry.place.id, index]));

  const people: TimeOnSiteSummary["people"] = [];
  for (const row of rows) {
    let person = people.at(-1);
    if (person?.person.id !== row.person_id) {
      person = { person: { id: row.person_id, fullName: row.person_name }, timeMs: 0, byPlace: placeList.map(() => 0), withoutExit: 0 };
      people.push(person);
    }
    person.byPlace[column.get(row.location_id)!] += row.time_ms;
    person.timeMs += row.time_ms;
    person.withoutExit += row.without_exit;
  }
  people.sort((a, b) => a.person.fullName.localeCompare(b.person.fullName, "pl"));
  return { month, places: placeList, people, timeMs: people.reduce((sum, person) => sum + person.timeMs, 0) };
}

/**
 * Zestawienie miesięczne czasu na budowie: właściciel wszystkie budowy i bazę, kierownik budowy, których jest
 * kierownikiem (także własny czas na nich). Pracownik i magazynier: `forbidden`.
 */
export function timeOnSiteSummary(sql: Sql, session: Session, month: string): Promise<TimeOnSiteSummary> {
  if (!canSeeTimeOnSiteSummary(session)) throw new RegistryError("forbidden");
  requireMonth(month);
  return summarize(sql, month, "$2 or (l.kind = 'budowa' and l.manager_id = $3)", [session.role === "wlasciciel", session.userId]);
}

/**
 * Własny czas na budowie aktora w bieżącym i poprzednim miesiącu w Polsce (od bieżącego): sumy na każdym miejscu
 * i odbicia, żeby sprawdzić, czy wszystko się zgadza. Każdy z kontem.
 */
export async function ownTimeOnSite(sql: Sql, session: Session, now: Date): Promise<OwnTimeOnSite[]> {
  const current = warsawTime(now).day.slice(0, 7);
  const result: OwnTimeOnSite[] = [];
  for (const month of [current, shiftMonth(current, -1)]) {
    const summary = await summarize(sql, month, "pe.user_id = $2", [session.userId]);
    const punches = await ownPunchesInMonth(sql, session, month);
    const [own] = summary.people;
    result.push({ month, timeMs: summary.timeMs, places: summary.places, withoutExit: own?.withoutExit ?? 0, punches });
  }
  return result;
}
