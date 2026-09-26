import { RegistryError } from "./errors";
import { attachTools, insertMovement, location, type Movement, movementById, movementByOperation } from "./movements";
import type { Sql } from "./ports";
import type { Session } from "./registry";
import type { ToolState } from "./tools";
import { UUID_PATTERN } from "./validation";

export interface CorrectToolInput {
  /** Identyfikator operacji klienta: ponowne wysłanie zwraca pierwotną korektę. */
  operationId: string;
  toolId: string;
  /** Gdzie narzędzie naprawdę jest; domyślnie tam, gdzie według ewidencji. */
  locationId?: string;
  /** Faktyczny stan; domyślnie bez zmian. Odnalezienie zaginionego narzędzia to korekta do stanu w obiegu. */
  state?: ToolState;
  reason: string;
}

export interface MarkToolLostInput {
  operationId: string;
  toolId: string;
  reason: string;
}

export interface RetireToolInput {
  operationId: string;
  toolId: string;
  /** Opcjonalny, np. „sprzedana”. */
  reason?: string;
}

export const TOOL_STATES: readonly ToolState[] = ["w_obiegu", "zaginione", "wycofane"];

/** Korekty, zaginięcia i wycofania robi tylko właściciel. */
export function canCorrectTools(session: Session) {
  return session.role === "wlasciciel";
}

/**
 * Ustawia faktyczną lokalizację i stan narzędzia bez względu na to, gdzie ono teraz jest.
 * Poprzednie ruchy zostają w historii; korekta zapamiętuje stan sprzed niej i powód.
 */
export async function correctTool(sql: Sql, session: Session, input: CorrectToolInput, now: Date): Promise<Movement> {
  if (!canCorrectTools(session)) throw new RegistryError("forbidden");
  if (!UUID_PATTERN.test(input.operationId)) throw new RegistryError("invalid_input");
  const done = await movementByOperation(sql, session, input.operationId);
  if (done) return done;

  const reason = requireReason(input.reason);
  const tool = await currentTool(sql, input.toolId);
  const state = input.state ?? tool.state;
  if (!TOOL_STATES.includes(state)) throw new RegistryError("invalid_input");
  const target = input.locationId === undefined ? await location(sql, tool.locationId) : await location(sql, input.locationId);
  if (!target) throw new RegistryError("invalid_input");
  if (target.id === tool.locationId && state === tool.state) throw new RegistryError("invalid_input");
  if (target.id !== tool.locationId && target.kind === "budowa" && target.status !== "aktywna") {
    throw new RegistryError("site_finished");
  }

  const movementId = await insertMovement(sql, session, {
    kind: "korekta",
    source: "panel",
    fromLocationId: tool.locationId,
    toLocationId: target.id,
    occurredAt: now,
    recordedAt: now,
    operationId: input.operationId,
    reason,
    fromState: tool.state,
    toState: state,
    responsibleUserId: state === "zaginione" ? target.manager_id : null,
  });
  await attachTools(sql, session, movementId, [tool.id]);
  return (await movementById(sql, movementId))!;
}

/**
 * Oznacza narzędzie w obiegu jako zaginione. Zapamiętuje datę, ostatnią lokalizację i kierownika
 * budowy, na której było. Odnalezienie to korekta.
 */
export function markToolLost(sql: Sql, session: Session, input: MarkToolLostInput, now: Date): Promise<Movement> {
  return leaveCirculation(sql, session, { ...input, kind: "zaginiecie" }, now);
}

/** Wycofuje narzędzie z obiegu (zepsute, sprzedane): znika z list, a jego karta i historia zostają. */
export function retireTool(sql: Sql, session: Session, input: RetireToolInput, now: Date): Promise<Movement> {
  return leaveCirculation(sql, session, { ...input, kind: "wycofanie" }, now);
}

/** Narzędzie zostaje tam, gdzie jest według ewidencji, ale wypada z obiegu. */
async function leaveCirculation(
  sql: Sql,
  session: Session,
  input: { operationId: string; toolId: string; kind: "zaginiecie" | "wycofanie"; reason?: string },
  now: Date,
): Promise<Movement> {
  if (!canCorrectTools(session)) throw new RegistryError("forbidden");
  if (!UUID_PATTERN.test(input.operationId)) throw new RegistryError("invalid_input");
  const done = await movementByOperation(sql, session, input.operationId);
  if (done) return done;

  const lost = input.kind === "zaginiecie";
  // Powód jest obowiązkowy przy zaginięciu, przy wycofaniu opcjonalny.
  const reason = lost ? requireReason(input.reason) : input.reason?.trim() || null;
  const tool = await currentTool(sql, input.toolId);
  if (lost ? tool.state !== "w_obiegu" : tool.state === "wycofane") throw new RegistryError("invalid_tool_state");
  const lastLocation = (await location(sql, tool.locationId))!;

  const movementId = await insertMovement(sql, session, {
    kind: input.kind,
    source: "panel",
    fromLocationId: tool.locationId,
    toLocationId: null,
    occurredAt: now,
    recordedAt: now,
    operationId: input.operationId,
    reason,
    fromState: tool.state,
    toState: lost ? "zaginione" : "wycofane",
    responsibleUserId: lost ? lastLocation.manager_id : null,
  });
  await attachTools(sql, session, movementId, [tool.id]);
  return (await movementById(sql, movementId))!;
}

function requireReason(raw: string | undefined) {
  const reason = raw?.trim();
  if (!reason) throw new RegistryError("reason_required");
  return reason;
}

async function currentTool(sql: Sql, toolId: string) {
  const [row] = UUID_PATTERN.test(toolId)
    ? await sql<{ id: string; location_id: string; state: ToolState }>(
        "select id, location_id, state from app.tools where id = $1",
        [toolId],
      )
    : [];
  if (!row) throw new RegistryError("not_found");
  return { id: row.id, locationId: row.location_id, state: row.state };
}
