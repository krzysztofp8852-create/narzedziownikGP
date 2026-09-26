import { RegistryError } from "./errors";
import * as locations from "./locations";
import type { Service, Site } from "./locations";
import { type Movement, movementsByIds } from "./movements";
import type { Sql } from "./ports";
import type { Session } from "./registry";
import { baseLocation } from "./tools";
import { isCalendarDay, UUID_PATTERN } from "./validation";

/** Filtry historii ruchów; pominięty filtr niczego nie zawęża. */
export interface HistoryFilters {
  /** Ruchy do tej lokalizacji albo z niej (budowa, baza, serwis). */
  locationId?: string;
  /** Ruchy zapisane przez tę osobę. */
  personId?: string;
  /** Ruchy, w których było to narzędzie. */
  toolId?: string;
  /** Pierwszy dzień zakresu (RRRR-MM-DD, czasu polskiego), włącznie. */
  from?: string;
  /** Ostatni dzień zakresu (RRRR-MM-DD, czasu polskiego), włącznie. */
  to?: string;
}

export interface MovementHistory {
  /** Ruchy od najnowszego zdarzenia. */
  movements: Movement[];
  /** Pasujących ruchów jest więcej niż limit. */
  hasMore: boolean;
}

/** Czym można filtrować historię: wszystko, co mogło pojawić się w ruchach firmy. */
export interface HistoryFilterOptions {
  base: { id: string; name: string };
  /** Budowy, także zakończone. */
  sites: Site[];
  services: Service[];
  /** Osoby w firmie, także dezaktywowane, według imienia i nazwiska. */
  people: { id: string; fullName: string; active: boolean }[];
  /** Narzędzia w każdym stanie, także wycofane, według kodu. */
  tools: { id: string; code: string; name: string }[];
}

/** Doby historii liczymy czasem polskim, niezależnie od strefy serwera i bazy. */
const TIME_ZONE = "Europe/Warsaw";

export async function movementHistory(
  sql: Sql,
  filters: HistoryFilters,
  options: { limit?: number },
): Promise<MovementHistory> {
  const limit = options.limit === undefined ? undefined : Math.max(1, options.limit);
  for (const id of [filters.locationId, filters.personId, filters.toolId]) {
    if (id !== undefined && !UUID_PATTERN.test(id)) throw new RegistryError("invalid_input");
  }
  for (const day of [filters.from, filters.to]) {
    if (day !== undefined && !isCalendarDay(day)) throw new RegistryError("invalid_input");
  }
  const rows = await sql<{ id: string }>(
    `select m.id from app.movements m
     where ($1::uuid is null or m.from_location_id = $1 or m.to_location_id = $1)
       and ($2::uuid is null or m.author_id = $2)
       and ($3::uuid is null or exists (select 1 from app.movement_tools mt where mt.movement_id = m.id and mt.tool_id = $3))
       and ($4::date is null or m.occurred_at >= $4::date::timestamp at time zone '${TIME_ZONE}')
       and ($5::date is null or m.occurred_at < ($5::date + 1)::timestamp at time zone '${TIME_ZONE}')
     order by m.occurred_at desc, m.recorded_at desc, m.sequence_number desc
     limit $6`,
    [
      filters.locationId ?? null,
      filters.personId ?? null,
      filters.toolId ?? null,
      filters.from ?? null,
      filters.to ?? null,
      // Jeden ruch ponad limit mówi, że jest ich więcej.
      limit === undefined ? null : limit + 1,
    ],
  );
  const hasMore = limit !== undefined && rows.length > limit;
  return { movements: await movementsByIds(sql, rows.slice(0, limit).map((row) => row.id)), hasMore };
}

export async function historyFilterOptions(sql: Sql, session: Session): Promise<HistoryFilterOptions> {
  return {
    base: await baseLocation(sql, session),
    sites: await locations.sites(sql, { activeOnly: false }),
    services: await locations.services(sql),
    people: await sql(`select user_id as id, full_name as "fullName", active from app.users order by full_name, user_id`),
    tools: await sql("select id, code, name from app.tools order by code"),
  };
}
