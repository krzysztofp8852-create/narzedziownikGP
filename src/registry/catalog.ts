import type { Sql } from "./ports";
import type { LocationKind } from "./tools";

/** Narzędzie w obiegu z kategorią i bieżącą lokalizacją, bez wartości: to, co wie o nim interpretacja tekstu. */
export interface CatalogTool {
  id: string;
  code: string;
  name: string;
  category: string;
  location: { id: string; name: string; kind: LocationKind };
}

/** Narzędzia firmy w obiegu, po kodzie. Nie czyta tabeli wartości dla żadnej roli. */
export function toolCatalog(sql: Sql): Promise<CatalogTool[]> {
  return sql<CatalogTool>(
    `select t.id, t.code, t.name, c.name as category,
            json_build_object('id', l.id, 'name', l.name, 'kind', l.kind) as location
     from app.tools t
     join app.categories c on c.id = t.category_id
     join app.locations l on l.id = t.location_id
     where t.state = 'w_obiegu'
     order by t.code`,
  );
}
