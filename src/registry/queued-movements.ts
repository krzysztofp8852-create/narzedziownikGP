import { deliver } from "./bell";
import { RegistryError, type RegistryErrorCode } from "./errors";
import {
  type MovementConflict,
  MovementConflictError,
  REGISTER_SOURCES,
  REGISTERED_KINDS,
  type RegisteredKind,
  type RegisterMovementInput,
} from "./movements";
import type { Sql } from "./ports";
import type { PushCopy } from "./push";
import type { Session } from "./registry";
import { UUID_PATTERN } from "./validation";

/** Ruch z kolejki offline, którego serwer nie przyjął: czeka na liście „Do wyjaśnienia” autora. */
export interface RejectedMovement {
  id: string;
  operationId: string;
  kind: RegisteredKind;
  from: { id: string; name: string } | null;
  to: { id: string; name: string } | null;
  tools: { id: string; code: string; name: string }[];
  /** Kiedy ruch zapisano w telefonie. */
  occurredAt: Date;
  rejectedAt: Date;
  /** Dlaczego serwer go odrzucił (kod błędu Rejestru). */
  reason: RegistryErrorCode;
  /** Przy konflikcie: gdzie są teraz narzędzia i kto je przeniósł. */
  conflicts: MovementConflict[];
}

/**
 * Błędy, przez które ruch z kolejki nie przejdzie nigdy: stan narzędzi, uprawnienia albo budowa zmieniły się,
 * zanim ruch dotarł na serwer. Pozostałe (np. trzeba zmienić hasło tymczasowe, awaria bazy) zostawiają ruch
 * w kolejce do ponowienia.
 */
export function isFinalRejection(error: unknown, input: RegisterMovementInput): error is RegistryError {
  // Bez poprawnej operacji, rodzaju i źródła nie ma czego zapisać jako odrzucenia; klient dostaje błąd.
  const recordable =
    UUID_PATTERN.test(input.operationId) && REGISTERED_KINDS.includes(input.kind) && REGISTER_SOURCES.includes(input.source);
  return error instanceof RegistryError && recordable && !RETRYABLE.has(error.code);
}

const RETRYABLE = new Set<RegistryErrorCode>(["no_access", "password_change_required", "stale_session"]);

/** Odrzucenie zapisane już pod tym identyfikatorem operacji autora. */
export async function rejectionByOperation(sql: Sql, session: Session, operationId: string): Promise<RejectedMovement | null> {
  if (!UUID_PATTERN.test(operationId)) return null;
  const [rejection] = await rejections(sql, session, { operationId });
  return rejection ?? null;
}

/**
 * Zapisuje odrzucenie i wkłada autorowi do dzwonka powiadomienie z odnośnikiem do listy „Do wyjaśnienia”.
 * Równoległe odrzucenie tej samej operacji zapisze się raz i da jedno powiadomienie (i jedną kopię push).
 */
export async function recordRejection(
  sql: Sql,
  session: Session,
  input: RegisterMovementInput,
  error: RegistryError,
  now: Date,
): Promise<{ rejection: RejectedMovement; copies: PushCopy[] }> {
  const uuidOrNull = (id: string) => (UUID_PATTERN.test(id) ? id : null);
  await sql(
    `insert into app.rejected_movements (company_id, author_id, client_operation_id, kind, source, from_location_id,
                                         to_location_id, tool_ids, occurred_at, rejected_at, reason, conflicts)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (company_id, client_operation_id) do nothing`,
    [
      session.company.id,
      session.userId,
      input.operationId,
      input.kind,
      input.source,
      uuidOrNull(input.fromLocationId),
      uuidOrNull(input.toLocationId),
      [...new Set(input.toolIds.filter((id) => UUID_PATTERN.test(id)))],
      validDate(input.occurredAt) ?? now,
      now,
      error.code,
      JSON.stringify(error instanceof MovementConflictError ? error.conflicts : []),
    ],
  );
  const rejection = (await rejectionByOperation(sql, session, input.operationId))!;
  const copies = await deliver(
    sql,
    [
      {
        kind: "ruch_odrzucony",
        recipient: { userId: session.userId, fullName: session.fullName },
        rejectionId: rejection.id,
        movementKind: rejection.kind,
        tools: rejection.tools,
        to: rejection.to,
        reason: rejection.reason,
        occurredAt: rejection.occurredAt,
      },
    ],
    now,
  );
  return { rejection, copies };
}

/** Lista „Do wyjaśnienia” autora: niewyjaśnione odrzucenia, od najnowszego. */
export function movementsToClarify(sql: Sql, session: Session): Promise<RejectedMovement[]> {
  return rejections(sql, session, { unresolvedOnly: true });
}

/** Autor oznacza odrzucony ruch jako wyjaśniony; znika z jego listy. */
export async function resolveRejectedMovement(sql: Sql, session: Session, id: string, now: Date): Promise<void> {
  if (!UUID_PATTERN.test(id)) return;
  await sql("update app.rejected_movements set resolved_at = $3 where id = $1 and author_id = $2 and resolved_at is null", [
    id,
    session.userId,
    now,
  ]);
}

async function rejections(
  sql: Sql,
  session: Session,
  filter: { operationId?: string; unresolvedOnly?: boolean },
): Promise<RejectedMovement[]> {
  const rows = await sql<{
    id: string;
    client_operation_id: string;
    kind: RegisteredKind;
    from_id: string | null;
    from_name: string | null;
    to_id: string | null;
    to_name: string | null;
    tools: { id: string; code: string; name: string }[] | null;
    occurred_at: Date;
    rejected_at: Date;
    reason: RegistryErrorCode;
    conflicts: (Omit<MovementConflict, "movedAt"> & { movedAt: string })[];
  }>(
    `select r.id, r.client_operation_id, r.kind, lf.id as from_id, lf.name as from_name, lt.id as to_id, lt.name as to_name,
            (select json_agg(json_build_object('id', t.id, 'code', t.code, 'name', t.name) order by t.code)
             from app.tools t where t.id = any(r.tool_ids)) as tools,
            r.occurred_at, r.rejected_at, r.reason, r.conflicts
     from app.rejected_movements r
     left join app.locations lf on lf.id = r.from_location_id
     left join app.locations lt on lt.id = r.to_location_id
     where r.author_id = $1 and ($2::uuid is null or r.client_operation_id = $2) and (not $3 or r.resolved_at is null)
     order by r.sequence_number desc`,
    [session.userId, filter.operationId ?? null, filter.unresolvedOnly ?? false],
  );
  return rows.map((row) => ({
    id: row.id,
    operationId: row.client_operation_id,
    kind: row.kind,
    from: row.from_id ? { id: row.from_id, name: row.from_name! } : null,
    to: row.to_id ? { id: row.to_id, name: row.to_name! } : null,
    tools: row.tools ?? [],
    occurredAt: new Date(row.occurred_at),
    rejectedAt: new Date(row.rejected_at),
    reason: row.reason,
    conflicts: row.conflicts.map((conflict) => ({ ...conflict, movedAt: new Date(conflict.movedAt) })),
  }));
}

function validDate(date: Date | undefined) {
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
}
