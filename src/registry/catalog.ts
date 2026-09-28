import type { Sql } from "./ports";
import { daysSince, type LocationKind } from "./tools";

/**
 * Narzędzie w obiegu z kategorią, marką i bieżącą lokalizacją, bez wartości: to, co wie o nim interpretacja tekstu
 * i odpowiedź na pytanie „gdzie jest …”.
 */
export interface CatalogTool {
  id: string;
  code: string;
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  location: { id: string; name: string; kind: LocationKind };
  /** Od ilu dni narzędzie jest w tej lokalizacji. */
  daysInPlace: number;
  /** Kto za nie teraz odpowiada: kierownik budowy albo pojazdu; na bazie i w serwisie nikt. */
  responsible: string | null;
}

/** Narzędzia firmy w obiegu, po kodzie. Nie czyta tabeli wartości dla żadnej roli. */
export async function toolCatalog(sql: Sql, now: Date): Promise<CatalogTool[]> {
  const rows = await sql<Omit<CatalogTool, "daysInPlace"> & { located_since: Date }>(
    `select t.id, t.code, t.name, c.name as category, t.brand, t.model, t.located_since,
            json_build_object('id', l.id, 'name', l.name, 'kind', l.kind) as location,
            case when l.kind in ('budowa', 'pojazd') then mu.full_name end as responsible
     from app.tools t
     join app.categories c on c.id = t.category_id
     join app.locations l on l.id = t.location_id
     left join app.users mu on mu.user_id = l.manager_id
     where t.state = 'w_obiegu'
     order by t.code`,
  );
  return rows.map(({ located_since, ...tool }) => ({ ...tool, daysInPlace: daysSince(located_since, now) }));
}
