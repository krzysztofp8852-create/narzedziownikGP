import { RegistryError, type RegistryErrorCode } from "./errors";
import type { MovementKind, MovementSource } from "./movements";
import type { Sql } from "./ports";
import type { Session } from "./registry";
import { UUID_PATTERN } from "./validation";

export type ToolState = "w_obiegu" | "zaginione" | "wycofane";
export type ToolRegistration = "zgloszone" | "zaakceptowane";
export type LocationKind = "baza" | "budowa" | "serwis";

export interface Category {
  id: string;
  name: string;
  prefix: string;
}

/** Dane karty narzędzia. Puste teksty i brak wartości zapisują się jako brak danych. */
export interface ToolFields {
  /** Pusty albo brak przy dodawaniu: kolejny wolny kod w kategorii. */
  code?: string;
  name: string;
  categoryId: string;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  /** Wartość w zł. Tylko właściciel. */
  value?: number | null;
}

export interface AddToolInput extends ToolFields {
  /** Identyfikator operacji klienta: ponowne wysłanie zwraca pierwotny wynik. */
  operationId: string;
}

/** Zmiany karty: pominięte pola zostają bez zmian, null czyści pole. */
export type EditToolInput = Partial<ToolFields>;

/** Narzędzie widoczne na tablicy. */
export interface ToolOnBoard {
  id: string;
  code: string;
  name: string;
  registration: ToolRegistration;
  daysInPlace: number;
}

export interface ToolCard {
  id: string;
  code: string;
  name: string;
  category: Category;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  /** Wartość w zł; klucz istnieje tylko dla właściciela. */
  value?: number | null;
  state: ToolState;
  registration: ToolRegistration;
  location: { id: string; name: string; kind: LocationKind };
  daysInPlace: number;
  history: HistoryEntry[];
}

export interface HistoryEntry {
  kind: MovementKind;
  source: MovementSource;
  occurredAt: Date;
  author: string;
  from: string | null;
  to: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PREFIX_PATTERN = /^[A-Z]{1,4}$/;

export function canManageTools(session: Session) {
  return session.role === "wlasciciel" || session.role === "magazynier";
}

export function canSeeValues(session: Session) {
  return session.role === "wlasciciel";
}

export async function listCategories(sql: Sql): Promise<Category[]> {
  return sql<Category>("select id, name, prefix from app.categories order by name");
}

export async function addCategory(sql: Sql, session: Session, raw: { name: string; prefix: string }, now: Date): Promise<Category> {
  const name = raw.name.trim();
  const prefix = raw.prefix.trim().toUpperCase();
  if (!name || !PREFIX_PATTERN.test(prefix)) throw new RegistryError("invalid_input");
  const [category] = await uniqueOr(sql<Category>(
    "insert into app.categories (company_id, name, prefix, created_at) values ($1, $2, $3, $4) returning id, name, prefix",
    [session.company.id, name, prefix, now],
  ));
  return category;
}

/** Kolejny wolny kod w kategorii: prefiks i numer o jeden większy od najwyższego w firmie. */
export async function suggestCode(sql: Sql, categoryId: string): Promise<string> {
  const [category] = UUID_PATTERN.test(categoryId)
    ? await sql<{ prefix: string }>("select prefix from app.categories where id = $1", [categoryId])
    : [];
  if (!category) throw new RegistryError("not_found");
  const codes = await sql<{ code: string }>("select code from app.tools where starts_with(code, $1)", [`${category.prefix}-`]);
  const pattern = new RegExp(`^${category.prefix}-(\\d+)$`);
  const highest = Math.max(0, ...codes.map(({ code }) => Number(pattern.exec(code)?.[1] ?? 0)));
  return `${category.prefix}-${String(highest + 1).padStart(2, "0")}`;
}

export async function addTool(
  sql: Sql,
  session: Session,
  input: AddToolInput,
  now: Date,
): Promise<{ toolId: string; code: string }> {
  if (!UUID_PATTERN.test(input.operationId)) throw new RegistryError("invalid_input");
  const [done] = await sql<{ toolId: string; code: string }>(
    `select t.id as "toolId", t.code from app.movements m
     join app.movement_tools mt on mt.movement_id = m.id
     join app.tools t on t.id = mt.tool_id
     where m.client_operation_id = $1 and m.kind = 'przyjecie'`,
    [input.operationId],
  );
  if (done) return done;

  requireOwnerForValue(session, input);
  const fields = normalizeFields(input);
  await requireCategory(sql, fields.categoryId);
  const code = fields.code ?? (await suggestCode(sql, fields.categoryId));
  const base = await baseLocation(sql, session);
  // Ruch zapisujemy przed narzędziem: równoległa ponowka tej samej operacji czeka wtedy
  // na unikalnym identyfikatorze operacji, zanim cokolwiek zapisze.
  const [movement] = await sql<{ id: string }>(
    `insert into app.movements (company_id, kind, source, to_location_id, author_id, occurred_at, recorded_at, client_operation_id)
     values ($1, 'przyjecie', 'panel', $2, $3, $4, $4, $5) returning id`,
    [session.company.id, base.id, session.userId, now, input.operationId],
  ).catch((error) => {
    throw isUniqueViolation(error, "movements_operation_per_company") ? new ReplayedOperationError() : error;
  });
  const [tool] = await uniqueOr(
    sql<{ id: string }>(
      `insert into app.tools (company_id, code, name, category_id, brand, model, serial_number, location_id, located_since, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) returning id`,
      [
        session.company.id,
        code,
        fields.name,
        fields.categoryId,
        fields.brand ?? null,
        fields.model ?? null,
        fields.serialNumber ?? null,
        base.id,
        now,
      ],
    ),
  );
  if (fields.value != null) {
    await sql("insert into app.tool_values (tool_id, company_id, value) values ($1, $2, $3)", [
      tool.id,
      session.company.id,
      fields.value,
    ]);
  }
  await sql("insert into app.movement_tools (movement_id, tool_id, company_id) values ($1, $2, $3)", [
    movement.id,
    tool.id,
    session.company.id,
  ]);
  return { toolId: tool.id, code };
}

/** Ta sama operacja klienta właśnie zapisała się w równoległej transakcji; ponowienie zwróci jej wynik. */
export class ReplayedOperationError extends Error {}

export async function baseLocation(sql: Sql, session: Session): Promise<{ id: string; name: string }> {
  const [base] = await sql<{ id: string; name: string }>(
    "select id, name from app.locations where company_id = $1 and kind = 'baza'",
    [session.company.id],
  );
  return base;
}

/** Wartość ustawia tylko właściciel; samo podanie tego pola przez inną rolę jest odmową. */
function requireOwnerForValue(session: Session, fields: Partial<ToolFields>) {
  if (!canSeeValues(session) && fields.value !== undefined) {
    throw new RegistryError("forbidden");
  }
}

const EDITABLE_COLUMNS = {
  code: "code",
  name: "name",
  categoryId: "category_id",
  brand: "brand",
  model: "model",
  serialNumber: "serial_number",
} as const;

export async function editTool(sql: Sql, session: Session, toolId: string, input: EditToolInput): Promise<void> {
  requireOwnerForValue(session, input);
  const fields = normalizeFields(input);
  if (input.code !== undefined && !fields.code) throw new RegistryError("invalid_input");
  const [tool] = UUID_PATTERN.test(toolId) ? await sql("select 1 from app.tools where id = $1", [toolId]) : [];
  if (!tool) throw new RegistryError("not_found");
  if (fields.categoryId !== undefined) await requireCategory(sql, fields.categoryId);

  const changes: [column: string, value: unknown][] = [];
  for (const [key, column] of Object.entries(EDITABLE_COLUMNS) as [keyof typeof EDITABLE_COLUMNS, string][]) {
    if (fields[key] !== undefined) changes.push([column, fields[key]]);
  }
  if (changes.length > 0) {
    await uniqueOr(
      sql(
        `update app.tools set ${changes.map(([column], i) => `${column} = $${i + 2}`).join(", ")} where id = $1`,
        [toolId, ...changes.map(([, value]) => value)],
      ),
    );
  }

  if (fields.value === null) {
    await sql("delete from app.tool_values where tool_id = $1", [toolId]);
  } else if (fields.value !== undefined) {
    await sql(
      `insert into app.tool_values (tool_id, company_id, value) values ($1, $2, $3)
       on conflict (tool_id) do update set value = excluded.value`,
      [toolId, session.company.id, fields.value],
    );
  }
}

async function requireCategory(sql: Sql, categoryId: string) {
  const [category] = UUID_PATTERN.test(categoryId)
    ? await sql("select 1 from app.categories where id = $1", [categoryId])
    : [];
  if (!category) throw new RegistryError("invalid_input");
}

const CODE_PATTERN = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;
const MAX_VALUE = 9_999_999_999.99;

/** Sprawdza i porządkuje podane pola karty; pól nieobecnych (undefined) nie dotyka. */
function normalizeFields<T extends Partial<ToolFields>>(raw: T): T {
  const fields: Partial<ToolFields> = { ...raw };
  const invalid = () => new RegistryError("invalid_input");
  if (raw.code !== undefined) {
    const code = raw.code.trim().toUpperCase();
    if (code && (!CODE_PATTERN.test(code) || code.length > 20)) throw invalid();
    fields.code = code || undefined;
  }
  if (raw.name !== undefined) {
    fields.name = raw.name.trim();
    if (!fields.name) throw invalid();
  }
  for (const key of ["brand", "model", "serialNumber"] as const) {
    if (raw[key] !== undefined) fields[key] = raw[key]?.trim() || null;
  }
  if (raw.value != null && !(Number.isFinite(raw.value) && raw.value >= 0 && raw.value <= MAX_VALUE)) throw invalid();
  return fields as T;
}

/** Narzędzia w obiegu według lokalizacji, po kodzie. */
export async function toolsByLocation(sql: Sql, now: Date): Promise<Map<string, ToolOnBoard[]>> {
  const rows = await sql<{
    id: string;
    code: string;
    name: string;
    registration: ToolRegistration;
    location_id: string;
    located_since: Date;
  }>(
    `select id, code, name, registration, location_id, located_since from app.tools
     where state = 'w_obiegu' order by code`,
  );
  const byLocation = new Map<string, ToolOnBoard[]>();
  for (const row of rows) {
    const tools = byLocation.get(row.location_id) ?? [];
    tools.push({
      id: row.id,
      code: row.code,
      name: row.name,
      registration: row.registration,
      daysInPlace: daysSince(row.located_since, now),
    });
    byLocation.set(row.location_id, tools);
  }
  return byLocation;
}

export async function toolCard(
  sql: Sql,
  session: Session,
  toolId: string,
  now: Date,
): Promise<ToolCard | null> {
  if (!UUID_PATTERN.test(toolId)) return null;
  const [row] = await sql<{
    id: string;
    code: string;
    name: string;
    category_id: string;
    category_name: string;
    category_prefix: string;
    brand: string | null;
    model: string | null;
    serial_number: string | null;
    value: string | null;
    state: ToolState;
    registration: ToolRegistration;
    location_id: string;
    location_name: string;
    location_kind: LocationKind;
    located_since: Date;
  }>(
    `select t.id, t.code, t.name, c.id as category_id, c.name as category_name, c.prefix as category_prefix,
            t.brand, t.model, t.serial_number, v.value::text as value, t.state, t.registration, l.id as location_id, l.name as location_name, l.kind as location_kind,
            t.located_since
     from app.tools t
     join app.categories c on c.id = t.category_id
     join app.locations l on l.id = t.location_id
     left join app.tool_values v on v.tool_id = t.id
     where t.id = $1`,
    [toolId],
  );
  if (!row) return null;

  const history = await sql<{ kind: MovementKind; source: MovementSource; occurred_at: Date; author: string; from_name: string | null; to_name: string | null }>(
    `select m.kind, m.source, m.occurred_at, u.full_name as author, lf.name as from_name, lt.name as to_name
     from app.movement_tools mt
     join app.movements m on m.id = mt.movement_id
     join app.users u on u.user_id = m.author_id
     left join app.locations lf on lf.id = m.from_location_id
     left join app.locations lt on lt.id = m.to_location_id
     where mt.tool_id = $1
     order by m.occurred_at desc, m.recorded_at desc, m.sequence_number desc`,
    [toolId],
  );

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: { id: row.category_id, name: row.category_name, prefix: row.category_prefix },
    brand: row.brand,
    model: row.model,
    serialNumber: row.serial_number,
    ...(canSeeValues(session) && { value: row.value === null ? null : Number(row.value) }),
    state: row.state,
    registration: row.registration,
    location: { id: row.location_id, name: row.location_name, kind: row.location_kind },
    daysInPlace: daysSince(row.located_since, now),
    history: history.map((entry) => ({
      kind: entry.kind,
      source: entry.source,
      occurredAt: entry.occurred_at,
      author: entry.author,
      from: entry.from_name,
      to: entry.to_name,
    })),
  };
}

const UNIQUE_CONSTRAINT_ERRORS: Record<string, RegistryErrorCode> = {
  tools_code_per_company: "code_taken",
  categories_name_per_company: "category_taken",
  categories_prefix_per_company: "prefix_taken",
};

/** Zamienia naruszenie unikalności (także przy wyścigu dwóch zapisów) na błąd Rejestru. */
async function uniqueOr<T>(query: Promise<T>): Promise<T> {
  try {
    return await query;
  } catch (error) {
    const constraint = Object.keys(UNIQUE_CONSTRAINT_ERRORS).find((name) => isUniqueViolation(error, name));
    throw constraint ? new RegistryError(UNIQUE_CONSTRAINT_ERRORS[constraint]) : error;
  }
}

export function isUniqueViolation(error: unknown, constraint: string) {
  const { code, constraint: violated } = error as { code?: string; constraint?: string };
  return code === "23505" && violated === constraint;
}

function daysSince(since: Date, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / DAY_MS));
}

export function requireToolManager(session: Session) {
  if (!canManageTools(session)) throw new RegistryError("forbidden");
}
