import { RegistryError } from "./errors";
import type { Sql } from "./ports";
import type { Session } from "./registry";
import { isUniqueViolation, type LocationKind, ReplayedOperationError, type ToolState } from "./tools";
import { UUID_PATTERN } from "./validation";

export type MovementKind = "przyjecie" | "wydanie" | "zwrot" | "cofniecie" | "korekta" | "zaginiecie" | "wycofanie";
export type MovementSource = "panel" | "checklista" | "import";
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
  /** Powód: obowiązkowy przy korekcie i zaginięciu. */
  reason: string | null;
  /** Zmiana stanu narzędzia przy korekcie, zaginięciu i wycofaniu. */
  stateChange: { from: ToolState; to: ToolState } | null;
  /** Ruch, który ten ruch cofa. */
  undoes: string | null;
  /** Ruch, który cofnął ten ruch; ruch z odnośnikiem jest „cofnięty”. */
  undoneBy: string | null;
}

/** Ruch na liście ostatnich ruchów. */
export interface RecentMovement extends Movement {
  /** Czy oglądający może go teraz cofnąć. */
  undoable: boolean;
}

export interface UndoMovementInput {
  /** Identyfikator operacji klienta: ponowne wysłanie zwraca pierwotne cofnięcie. */
  operationId: string;
  movementId: string;
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

/** Cofnąć można tylko ruch zapisany najwyżej tyle temu. */
export const UNDO_WINDOW_MS = 15 * 60 * 1000;

/** Czas zdarzenia może wyprzedzać zegar serwera najwyżej o tyle (rozjechany zegar telefonu). */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_TOOLS = 500;

export interface LocationRow {
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

  // Ruch zapisujemy przed sprawdzeniem narzędzi: równoległa ponowka tej samej operacji czeka wtedy
  // na unikalnym identyfikatorze operacji i zwraca ten ruch, zamiast zgłosić konflikt z nim samym.
  const movementId = await insertMovement(sql, session, {
    kind: input.kind,
    source: input.source,
    fromLocationId: from.id,
    toLocationId: to.id,
    occurredAt,
    recordedAt: now,
    operationId: input.operationId,
  });

  const tools = await currentTools(sql, toolIds);
  if (tools.length !== toolIds.length) throw new RegistryError("not_found");
  const conflicts = tools.filter(
    (tool) => tool.location.id !== from.id || tool.state !== "w_obiegu" || tool.movedAt.getTime() > occurredAt.getTime(),
  );
  if (conflicts.length > 0) throw new MovementConflictError(conflicts);
  await attachTools(sql, session, movementId, toolIds);
  return (await movementById(sql, movementId))!;
}

/**
 * Cofa własny ruch zapisany najwyżej 15 minut temu, jeśli od tamtej pory żadne z jego narzędzi
 * się nie ruszyło. Nowy ruch prowadzi w odwrotną stronę, a oryginał zostaje w historii jako cofnięty.
 */
export async function undoMovement(sql: Sql, session: Session, input: UndoMovementInput, now: Date): Promise<Movement> {
  if (!UUID_PATTERN.test(input.operationId) || !UUID_PATTERN.test(input.movementId)) throw new RegistryError("invalid_input");
  const done = await movementByOperation(sql, session, input.operationId);
  if (done) return done;

  const [original] = await sql<{
    kind: MovementKind;
    author_id: string;
    from_location_id: string;
    to_location_id: string;
    occurred_at: Date;
    recorded_at: Date;
    moved_since: boolean;
  }>(
    `select m.kind, m.author_id, m.from_location_id, m.to_location_id, m.occurred_at, m.recorded_at,
            ${MOVED_SINCE} as moved_since
     from app.movements m where m.id = $1`,
    [input.movementId],
  );
  if (!original) throw new RegistryError("not_found");
  if (original.author_id !== session.userId) throw new RegistryError("forbidden");
  if (!REGISTERED_KINDS.includes(original.kind as RegisteredKind)) throw new RegistryError("not_undoable");
  if (now.getTime() - new Date(original.recorded_at).getTime() > UNDO_WINDOW_MS) throw new RegistryError("undo_expired");
  if (original.moved_since) throw new RegistryError("undo_blocked");
  const back = (await location(sql, original.from_location_id))!;
  if (back.kind === "budowa" && back.status !== "aktywna") throw new RegistryError("site_finished");

  const movementId = await insertMovement(sql, session, {
    kind: "cofniecie",
    source: "panel",
    fromLocationId: original.to_location_id,
    toLocationId: original.from_location_id,
    // Ruch z telefonu z rozjechanym zegarem może mieć czas zdarzenia chwilę w przyszłości.
    occurredAt: new Date(Math.max(now.getTime(), new Date(original.occurred_at).getTime())),
    recordedAt: now,
    operationId: input.operationId,
    reversesMovementId: input.movementId,
  });
  const tools = await sql<{ tool_id: string }>("select tool_id from app.movement_tools where movement_id = $1", [input.movementId]);
  await attachTools(sql, session, movementId, tools.map((tool) => tool.tool_id));
  return (await movementById(sql, movementId))!;
}

/** Czy któreś z narzędzi ruchu `m` ma ruch zapisany później (także cofnięcie tego ruchu). */
const MOVED_SINCE = `exists (
  select 1 from app.movement_tools mt
  join app.movement_tools later on later.tool_id = mt.tool_id
  join app.movements lm on lm.id = later.movement_id
  where mt.movement_id = m.id and lm.sequence_number > m.sequence_number
)`;

export interface NewMovementRow {
  kind: MovementKind;
  source: MovementSource;
  fromLocationId: string | null;
  toLocationId: string | null;
  occurredAt: Date;
  recordedAt: Date;
  operationId: string;
  reason?: string | null;
  fromState?: ToolState;
  toState?: ToolState;
  reversesMovementId?: string;
  responsibleUserId?: string | null;
}

/** Zapisuje ruch bez narzędzi. Równoległy zapis tej samej operacji to ReplayedOperationError. */
export async function insertMovement(sql: Sql, session: Session, row: NewMovementRow): Promise<string> {
  const [movement] = await sql<{ id: string }>(
    `insert into app.movements (company_id, kind, source, from_location_id, to_location_id, author_id,
                                occurred_at, recorded_at, client_operation_id, reason, from_state, to_state,
                                reverses_movement_id, responsible_user_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) returning id`,
    [
      session.company.id,
      row.kind,
      row.source,
      row.fromLocationId,
      row.toLocationId,
      session.userId,
      row.occurredAt,
      row.recordedAt,
      row.operationId,
      row.reason ?? null,
      row.fromState ?? null,
      row.toState ?? null,
      row.reversesMovementId ?? null,
      row.responsibleUserId ?? null,
    ],
  ).catch((error) => {
    if (isUniqueViolation(error, "movements_operation_per_company")) throw new ReplayedOperationError();
    // Równoległe cofnięcie tego samego ruchu z inną operacją; ponowienie zobaczy je i zgłosi blokadę.
    if (isUniqueViolation(error, "movements_reverses_once")) throw new ConcurrentMoveError();
    throw error;
  });
  return movement.id;
}

/** Dopisuje narzędzia do ruchu; wyzwalacz przesuwa je i zmienia ich stan. */
export async function attachTools(sql: Sql, session: Session, movementId: string, toolIds: string[]) {
  await sql(
    `insert into app.movement_tools (movement_id, tool_id, company_id)
     select $1, tool_id, $2 from unnest($3::uuid[]) as tool_id`,
    [movementId, session.company.id, toolIds],
  ).catch((error) => {
    throw (error as { code?: string }).code === "GP409" ? new ConcurrentMoveError() : error;
  });
}

/** Ostatnie ruchy firmy, od najnowszego zdarzenia. */
export async function recentMovements(sql: Sql, session: Session, limit: number, now: Date): Promise<RecentMovement[]> {
  const rows = await sql<{ id: string; undoable: boolean }>(
    `select m.id,
            m.author_id = $2 and m.kind::text = any($3::text[]) and m.recorded_at >= $4 and not ${MOVED_SINCE}
            and back.status is distinct from 'zakonczona' as undoable
     from app.movements m
     left join app.locations back on back.id = m.from_location_id
     order by m.occurred_at desc, m.recorded_at desc, m.sequence_number desc limit $1`,
    [Math.max(1, Math.min(limit, 200)), session.userId, REGISTERED_KINDS, new Date(now.getTime() - UNDO_WINDOW_MS)],
  );
  const undoable = new Map(rows.map((row) => [row.id, row.undoable]));
  const movements = await movementsByIds(sql, [...undoable.keys()]);
  return movements.map((movement) => ({ ...movement, undoable: undoable.get(movement.id)! }));
}

/** Ruch zapisany już pod tym identyfikatorem operacji. Tylko autor może go ponowić. */
export async function movementByOperation(sql: Sql, session: Session, operationId: string) {
  const [row] = await sql<{ id: string; author_id: string }>(
    "select id, author_id from app.movements where client_operation_id = $1",
    [operationId],
  );
  if (!row) return null;
  if (row.author_id !== session.userId) throw new RegistryError("invalid_input");
  return movementById(sql, row.id);
}

export async function movementById(sql: Sql, id: string): Promise<Movement | null> {
  const [movement] = await movementsByIds(sql, [id]);
  return movement ?? null;
}

export async function movementsByIds(sql: Sql, ids: string[]): Promise<Movement[]> {
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
    reason: string | null;
    from_state: ToolState | null;
    to_state: ToolState | null;
    reverses_movement_id: string | null;
    undone_by: string | null;
  }>(
    `select m.id, m.kind, m.source, m.occurred_at, m.recorded_at, u.full_name as author,
            lf.id as from_id, lf.name as from_name, lt.id as to_id, lt.name as to_name,
            (select json_agg(json_build_object('id', t.id, 'code', t.code, 'name', t.name) order by t.code)
             from app.movement_tools mt join app.tools t on t.id = mt.tool_id
             where mt.movement_id = m.id) as tools,
            m.reason, m.from_state, m.to_state, m.reverses_movement_id,
            (select r.id from app.movements r where r.reverses_movement_id = m.id) as undone_by
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
    reason: row.reason,
    stateChange: row.from_state && row.to_state ? { from: row.from_state, to: row.to_state } : null,
    undoes: row.reverses_movement_id,
    undoneBy: row.undone_by,
  }));
}

export async function location(sql: Sql, id: string): Promise<LocationRow | null> {
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
