import type { Service, Site } from "./locations";
import * as locations from "./locations";
import type { Sql } from "./ports";
import type { Session } from "./registry";
import { baseLocation, canSeeValues, daysSince, type LocationKind, type ToolRegistration } from "./tools";

/** Narzędzie widoczne na tablicy. */
export interface ToolOnBoard {
  id: string;
  code: string;
  name: string;
  registration: ToolRegistration;
  daysInPlace: number;
  /** Stoi na budowie dłużej niż próg dni firmy. */
  alarm: boolean;
  /** Wartość w zł; klucz istnieje tylko dla właściciela. */
  value?: number | null;
}

/** Lokalizacja na tablicy z narzędziami w obiegu, które w niej są. */
type BoardLocation<L> = L & {
  /** Suma wartości narzędzi w zł; klucz istnieje tylko dla właściciela. */
  totalValue?: number;
  tools: ToolOnBoard[];
};

export interface WhereIsWhat {
  /** Łączna wartość sprzętu poza bazą w zł; klucz istnieje tylko dla właściciela. */
  offBaseValue?: number;
  /** Ile narzędzi ma alarm. */
  alarmCount: number;
  base: BoardLocation<{ id: string; name: string }>;
  /** Aktywne budowy. */
  sites: BoardLocation<Site>[];
  /** Wszystkie serwisy firmy ze sprzętem w naprawie; nie są poza bazą. */
  services: BoardLocation<Service>[];
  /** Zaginione narzędzia, od najdawniej zaginionego. */
  lost: LostOnBoard[];
  /** Łączna wartość zaginionego sprzętu w zł; klucz istnieje tylko dla właściciela. */
  lostValue?: number;
}

/** Zaginione narzędzie na tablicy. */
export interface LostOnBoard {
  id: string;
  code: string;
  name: string;
  /** Od ilu dni jest zaginione. */
  daysLost: number;
  /** Gdzie było, gdy zaginęło. */
  lastLocation: { id: string; name: string };
  /** Kierownik budowy, na której było; na bazie i w serwisie nikt. */
  responsible: string | null;
  /** Wartość w zł; klucz istnieje tylko dla właściciela. */
  value?: number | null;
}

export async function whereIsWhat(sql: Sql, session: Session, now: Date): Promise<WhereIsWhat> {
  const withValues = canSeeValues(session);
  const base = await baseLocation(sql, session);
  const toolsAt = await toolsByLocation(sql, now, withValues);
  const sites = await locations.sites(sql, { activeOnly: true });
  const services = await locations.services(sql);
  const lost = await lostTools(sql, now, withValues);

  const withTools = <L extends { id: string }>(location: L): BoardLocation<L> => {
    const tools = toolsAt.get(location.id) ?? [];
    return { ...location, ...(withValues && { totalValue: sumValues(tools) }), tools };
  };
  const boardSites = sites.map(withTools);
  return {
    ...(withValues && { offBaseValue: sumAmounts(boardSites.map((site) => site.totalValue!)) }),
    alarmCount: [...toolsAt.values()].flat().filter((tool) => tool.alarm).length,
    base: withTools(base),
    sites: boardSites,
    services: services.map(withTools),
    lost,
    ...(withValues && { lostValue: sumValues(lost) }),
  };
}

/** Narzędzia w obiegu według lokalizacji, po kodzie. Wartości tylko na życzenie właściciela. */
async function toolsByLocation(sql: Sql, now: Date, withValues: boolean): Promise<Map<string, ToolOnBoard[]>> {
  const rows = await sql<{
    id: string;
    code: string;
    name: string;
    registration: ToolRegistration;
    location_id: string;
    location_kind: LocationKind;
    located_since: Date;
    threshold_days: number;
    value: string | null;
  }>(
    `select t.id, t.code, t.name, t.registration, t.location_id, l.kind as location_kind, t.located_since,
            co.alarm_threshold_days as threshold_days,
            ${valueColumn(withValues)}
     from app.tools t
     join app.locations l on l.id = t.location_id
     join app.companies co on co.id = t.company_id
     ${valueJoin(withValues)}
     where t.state = 'w_obiegu' order by t.code`,
  );
  const byLocation = new Map<string, ToolOnBoard[]>();
  for (const row of rows) {
    const tools = byLocation.get(row.location_id) ?? [];
    const daysInPlace = daysSince(row.located_since, now);
    tools.push({
      id: row.id,
      code: row.code,
      name: row.name,
      registration: row.registration,
      daysInPlace,
      alarm: row.location_kind === "budowa" && daysInPlace > row.threshold_days,
      ...(withValues && { value: parseValue(row.value) }),
    });
    byLocation.set(row.location_id, tools);
  }
  return byLocation;
}

async function lostTools(sql: Sql, now: Date, withValues: boolean): Promise<LostOnBoard[]> {
  const rows = await sql<{
    id: string;
    code: string;
    name: string;
    located_since: Date;
    location_id: string;
    location_name: string;
    responsible: string | null;
    value: string | null;
  }>(
    `select t.id, t.code, t.name, t.located_since, l.id as location_id, l.name as location_name,
            (select u.full_name from app.movement_tools mt
             join app.movements m on m.id = mt.movement_id
             join app.users u on u.user_id = m.responsible_user_id
             where mt.tool_id = t.id and m.to_state = 'zaginione'
             order by m.sequence_number desc limit 1) as responsible,
            ${valueColumn(withValues)}
     from app.tools t
     join app.locations l on l.id = t.location_id
     ${valueJoin(withValues)}
     where t.state = 'zaginione' order by t.located_since, t.code`,
  );
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    daysLost: daysSince(row.located_since, now),
    lastLocation: { id: row.location_id, name: row.location_name },
    responsible: row.responsible,
    ...(withValues && { value: parseValue(row.value) }),
  }));
}

/**
 * Kolumna `value` z wartością narzędzia (tekst, bez utraty groszy) albo null. Wartości czyta tylko
 * właściciel; dla innych ról zapytanie nie dotyka tabeli wartości.
 */
function valueColumn(withValues: boolean) {
  return withValues ? "v.value::text as value" : "null as value";
}

/** Dołącza wartości narzędzi `t` jako `v`, gdy aktor je widzi. */
function valueJoin(withValues: boolean) {
  return withValues ? "left join app.tool_values v on v.tool_id = t.id" : "";
}

function parseValue(value: string | null) {
  return value === null ? null : Number(value);
}

/** Suma wartości narzędzi w zł; narzędzie bez wartości liczy się jako 0. */
function sumValues(tools: { value?: number | null }[]) {
  return sumAmounts(tools.map((tool) => tool.value ?? 0));
}

/** Suma kwot w zł liczona w groszach, żeby nie zbierać błędów zaokrągleń. */
function sumAmounts(amounts: number[]) {
  return amounts.reduce((cents, amount) => cents + Math.round(amount * 100), 0) / 100;
}
