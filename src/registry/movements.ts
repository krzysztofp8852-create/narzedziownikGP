import { RegistryError } from "./errors";
import type { Sql } from "./ports";
import type { Session } from "./registry";
import { isUniqueViolation, type LocationKind, ReplayedOperationError, type ToolState } from "./tools";
import { UUID_PATTERN } from "./validation";

export type MovementKind = "przyjecie" | "wydanie" | "zwrot";
export type MovementSource = "panel" | "checklista";
/** Ruchy, które rejestruje polecenie „zarejestruj ruch”. */
export type RegisteredKind = "wydanie" | "zwrot";
export const REGISTERED_KINDS: readonly RegisteredKind[] = ["wydanie", "zwrot"];

export interface RegisterMovementInput {
  /** Identyfikator operacji klienta: ponowne wysłanie zwraca pierwotny wynik. */
  operationId: string;
  kind: RegisteredKind;
  /** Gdzie według klienta są teraz wszystkie narzędzia: baza przy wydaniu, budowa przy zwrocie. */
  fromLocationId: string;
  /** Budowa przy wydaniu, baza przy zwrocie. */
  toLocationId: string;
  toolIds: string[];
  /** Kiedy to się stało na budowie; domyślnie teraz. Ruch z kolejki offline przychodzi później. */
  occurredAt?: Date;
  source: "checklista";
}

/** Ruch z historii firmy. */
export interface Movement {
  id: string;
  kind: MovementKind;
  source: MovementSource;
  occurredAt: Date;
  recordedAt: Date;
  author: string;
  from: { id: string; name: string } | null;
  to: { id: string; name: string } | null;
  tools: { id: string; code: string; name: string }[];
}

/** Narzędzie, którego nie ma tam, skąd ruch miał je zabrać. */
export interface MovementConflict {
  toolId: string;
  code: string;
  /** Gdzie narzędzie jest według ewidencji. */
  location: { id: string; name: string };
  state: ToolState;
  /** Ostatni ruch narzędzia: kto i kiedy je tam przeniósł. */
  movedBy: string;
  movedAt: Date;
}

/** Ruch odrzucony w całości, bo stan narzędzi różni się od tego, który widział klient. */
export class MovementConflictError extends RegistryError {
  constructor(readonly conflicts: MovementConflict[]) {
    super("movement_conflict");
  }
}

/** Równoległy ruch przeniósł narzędzie po naszym sprawdzeniu; ponowienie pokaże, kto i dokąd. */
export class ConcurrentMoveError extends Error {}

/** Kierownik rusza tylko sprzęt swoich budów; magazynier i właściciel wszystkich. */
export function canMoveTools(session: Session, site: { manager: { id: string } }) {
  return session.role !== "kierownik" || site.manager.id === session.userId;
}

/** Czas zdarzenia może wyprzedzać zegar serwera najwyżej o tyle (rozjechany zegar telefonu). */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_TOOLS = 500;

interface LocationRow {
  id: string;
  name: string;
  kind: LocationKind;
  status: "aktywna" | "zakonczona" | null;
  manager_id: string | null;
}

export async function registerMovement(sql: Sql, session: Session, input: RegisterMovementInput, now: Date): Promise<Movement> {
  if (!UUID_PATTERN.test(input.operationId)) throw new RegistryError("invalid_input");
  const done = await movementByOperation(sql, session, input.operationId);
  if (done) return done;

  const occurredAt = input.occurredAt ?? now;
  const toolIds = [...new Set(input.toolIds)];
  if (
    !REGISTERED_KINDS.includes(input.kind) ||
    input.source !== "checklista" ||
    toolIds.length === 0 ||
    toolIds.length > MAX_TOOLS ||
    !toolIds.every((id) => UUID_PATTERN.test(id)) ||
    !(occurredAt instanceof Date) ||
    Number.isNaN(occurredAt.getTime()) ||
    occurredAt.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS
  ) {
    throw new RegistryError("invalid_input");
  }

  const from = await location(sql, input.fromLocationId);
  const to = await location(sql, input.toLocationId);
  if (!from || !to) throw new RegistryError("invalid_input");
  const site = input.kind === "wydanie" ? to : from;
  const base = input.kind === "wydanie" ? from : to;
  if (site.kind !== "budowa" || base.kind !== "baza") throw new RegistryError("invalid_input");
  if (input.kind === "wydanie" && site.status !== "aktywna") throw new RegistryError("site_finished");
  if (!canMoveTools(session, { manager: { id: site.manager_id! } })) throw new RegistryError("forbidden");

  const tools = await currentTools(sql, toolIds);
  if (tools.length !== toolIds.length) throw new RegistryError("not_found");
  const conflicts = tools.filter(
    (tool) => tool.location.id !== from.id || tool.state !== "w_obiegu" || tool.movedAt.getTime() > occurredAt.getTime(),
  );
  if (conflicts.length > 0) throw new MovementConflictError(conflicts);

  const [movement] = await sql<{ id: string }>(
    `insert into app.movements (company_id, kind, source, from_location_id, to_location_id, author_id,
                                occurred_at, recorded_at, client_operation_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [session.company.id, input.kind, input.source, from.id, to.id, session.userId, occurredAt, now, input.operationId],
  ).catch((error) => {
    throw isUniqueViolation(error, "movements_operation_per_company") ? new ReplayedOperationError() : error;
  });
  await sql(
    `insert into app.movement_tools (movement_id, tool_id, company_id)
     select $1, tool_id, $2 from unnest($3::uuid[]) as tool_id`,
    [movement.id, session.company.id, toolIds],
  ).catch((error) => {
    throw (error as { code?: string }).code === "GP409" ? new ConcurrentMoveError() : error;
  });
  return (await movementById(sql, movement.id))!;
}

/** Ostatnie ruchy firmy, od najnowszego zdarzenia. */
export async function recentMovements(sql: Sql, limit: number): Promise<Movement[]> {
  const rows = await sql<{ id: string }>(
    "select id from app.movements order by occurred_at desc, recorded_at desc, sequence_number desc limit $1",
    [Math.max(1, Math.min(limit, 200))],
  );
  return movementsByIds(sql, rows.map((row) => row.id));
}

/** Ruch zapisany już pod tym identyfikatorem operacji. Tylko autor może go ponowić. */
async function movementByOperation(sql: Sql, session: Session, operationId: string) {
  const [row] = await sql<{ id: string; author_id: string }>(
    "select id, author_id from app.movements where client_operation_id = $1",
    [operationId],
  );
  if (!row) return null;
  if (row.author_id !== session.userId) throw new RegistryError("invalid_input");
  return movementById(sql, row.id);
}

async function movementById(sql: Sql, id: string): Promise<Movement | null> {
  const [movement] = await movementsByIds(sql, [id]);
  return movement ?? null;
}

async function movementsByIds(sql: Sql, ids: string[]): Promise<Movement[]> {
  if (ids.length === 0) return [];
  const rows = await sql<{
    id: string;
    kind: MovementKind;
    source: MovementSource;
    occurred_at: Date;
    recorded_at: Date;
    author: string;
    from_id: string | null;
    from_name: string | null;
    to_id: string | null;
    to_name: string | null;
    tools: { id: string; code: string; name: string }[];
  }>(
    `select m.id, m.kind, m.source, m.occurred_at, m.recorded_at, u.full_name as author,
            lf.id as from_id, lf.name as from_name, lt.id as to_id, lt.name as to_name,
            (select json_agg(json_build_object('id', t.id, 'code', t.code, 'name', t.name) order by t.code)
             from app.movement_tools mt join app.tools t on t.id = mt.tool_id
             where mt.movement_id = m.id) as tools
     from app.movements m
     join app.users u on u.user_id = m.author_id
     left join app.locations lf on lf.id = m.from_location_id
     left join app.locations lt on lt.id = m.to_location_id
     where m.id = any($1::uuid[])
     order by m.occurred_at desc, m.recorded_at desc, m.sequence_number desc`,
    [ids],
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    source: row.source,
    occurredAt: new Date(row.occurred_at),
    recordedAt: new Date(row.recorded_at),
    author: row.author,
    from: row.from_id ? { id: row.from_id, name: row.from_name! } : null,
    to: row.to_id ? { id: row.to_id, name: row.to_name! } : null,
    tools: row.tools ?? [],
  }));
}

async function location(sql: Sql, id: string): Promise<LocationRow | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const [row] = await sql<LocationRow>("select id, name, kind, status, manager_id from app.locations where id = $1", [id]);
  return row ?? null;
}

/** Bieżąca lokalizacja i stan narzędzi z ostatnim ruchem każdego z nich. */
async function currentTools(sql: Sql, toolIds: string[]): Promise<MovementConflict[]> {
  const rows = await sql<{
    id: string;
    code: string;
    state: ToolState;
    location_id: string;
    location_name: string;
    moved_by: string;
    located_since: Date;
  }>(
    `select t.id, t.code, t.state, l.id as location_id, l.name as location_name, t.located_since,
            (select u.full_name from app.movement_tools mt
             join app.movements m on m.id = mt.movement_id
             join app.users u on u.user_id = m.author_id
             where mt.tool_id = t.id
             order by m.occurred_at desc, m.recorded_at desc, m.sequence_number desc limit 1) as moved_by
     from app.tools t join app.locations l on l.id = t.location_id
     where t.id = any($1::uuid[])
     order by t.code`,
    [toolIds],
  );
  return rows.map((row) => ({
    toolId: row.id,
    code: row.code,
    location: { id: row.location_id, name: row.location_name },
    state: row.state,
    movedBy: row.moved_by,
    movedAt: new Date(row.located_since),
  }));
}
