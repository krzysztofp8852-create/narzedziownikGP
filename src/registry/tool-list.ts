import type { Sql } from "./ports";
import type { Session } from "./registry";
import { canSeeValues, daysSince, type LocationKind, type ToolRegistration, type ToolState } from "./tools";

/** Narzędzie na liście całego sprzętu firmy (strona Narzędzia), w każdym stanie. */
export interface ListedTool {
  id: string;
  code: string;
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  state: ToolState;
  registration: ToolRegistration;
  /** Gdzie jest; przy zaginionym, wycofanym i zwróconym: gdzie było ostatnio. */
  location: { id: string; name: string; kind: LocationKind };
  /** Od ilu dni jest w tej lokalizacji, a poza obiegiem: od ilu dni jest w tym stanie. */
  daysInPlace: number;
  /**
   * Kto odpowiada: w obiegu kierownik budowy albo pojazdu, na którym narzędzie jest, przy zaginionym kierownik budowy,
   * na której zaginęło; poza tym nikt.
   */
  responsible: string | null;
  damaged: boolean;
  /** Sprzęt wynajęty z wypożyczalni. */
  rented: boolean;
  /** Wartość w zł; klucz istnieje tylko dla właściciela. */
  value?: number | null;
}

/** Cały sprzęt firmy, także zaginiony, wycofany i zwrócony do wypożyczalni, po kodzie (H-2 przed H-10). */
export async function toolList(sql: Sql, session: Session, now: Date): Promise<ListedTool[]> {
  const withValues = canSeeValues(session);
  const rows = await sql<{
    id: string;
    code: string;
    name: string;
    category: string;
    brand: string | null;
    model: string | null;
    state: ToolState;
    registration: ToolRegistration;
    location: ListedTool["location"];
    located_since: Date;
    responsible: string | null;
    damaged: boolean;
    rented: boolean;
    value: string | null;
  }>(
    `select t.id, t.code, t.name, c.name as category, t.brand, t.model, t.state, t.registration, t.located_since,
            json_build_object('id', l.id, 'name', l.name, 'kind', l.kind) as location,
            case
              when t.state = 'w_obiegu' and l.kind in ('budowa', 'pojazd') then mu.full_name
              when t.state = 'zaginione' then
                (select u.full_name from app.movement_tools mt
                 join app.movements m on m.id = mt.movement_id
                 join app.users u on u.user_id = m.responsible_user_id
                 where mt.tool_id = t.id and m.to_state = 'zaginione'
                 order by m.sequence_number desc limit 1)
            end as responsible,
            t.damaged_since is not null as damaged,
            t.rented_from is not null as rented,
            ${withValues ? "v.value::text" : "null"} as value
     from app.tools t
     join app.categories c on c.id = t.category_id
     join app.locations l on l.id = t.location_id
     left join app.users mu on mu.user_id = l.manager_id
     ${withValues ? "left join app.tool_values v on v.tool_id = t.id" : ""}`,
  );
  return rows
    .map(({ located_since, value, ...tool }) => ({
      ...tool,
      daysInPlace: daysSince(located_since, now),
      ...(withValues && { value: value === null ? null : Number(value) }),
    }))
    .sort((a, b) => a.code.localeCompare(b.code, "pl", { numeric: true }));
}
