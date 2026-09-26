import { RegistryError } from "./errors";
import { attachTools, insertMovement, location, type Movement, movementById, movementByOperation } from "./movements";
import type { Sql } from "./ports";
import type { Session } from "./registry";
import { type Category, editTool, intake, type ToolState } from "./tools";
import { UUID_PATTERN } from "./validation";

export interface ReportToolInput {
  /** Identyfikator operacji klienta: ponowne wysłanie zwraca pierwotny wynik. */
  operationId: string;
  /** Budowa zgłaszającego kierownika, na której narzędzie jest. */
  siteId: string;
  name: string;
  categoryId: string;
}

/** Zgłoszenie narzędzia czekające na decyzję właściciela. */
export interface ToolReport {
  id: string;
  /** Kod nadany przy zgłoszeniu; właściciel może go zmienić przy akceptacji. */
  code: string;
  name: string;
  category: Category;
  reportedBy: string;
  reportedAt: Date;
  /** Gdzie narzędzie jest teraz; zgłoszone mogło się już ruszyć. */
  location: { id: string; name: string };
}

export interface AcceptToolReportInput {
  toolId: string;
  /** Ostateczny kod; pominięty albo pusty zostawia kod nadany przy zgłoszeniu. */
  code?: string;
  /** Inna kategoria niż wybrana przez kierownika; pominięta zostawia tamtą. */
  categoryId?: string;
  /** Wartość w zł. */
  value: number;
}

export interface RejectToolReportInput {
  /** Identyfikator operacji klienta: ponowne wysłanie zwraca pierwotne wycofanie. */
  operationId: string;
  toolId: string;
  /** Dlaczego odrzucone, np. „to jest W-01 z bazy”. */
  comment: string;
}

/** Zgłasza narzędzia kierownik; właściciel i magazynier dodają je bezpośrednio. */
export function canReportTools(session: Session) {
  return session.role === "kierownik";
}

/** O zgłoszeniach decyduje właściciel. */
export function canReviewToolReports(session: Session) {
  return session.role === "wlasciciel";
}

export function requireToolReviewer(session: Session) {
  if (!canReviewToolReports(session)) throw new RegistryError("forbidden");
}

/** Narzędzie kupione na budowę: od razu jest na niej jako zgłoszone, z przyjęciem autorstwa kierownika. */
export async function reportTool(sql: Sql, session: Session, input: ReportToolInput, now: Date) {
  if (!canReportTools(session)) throw new RegistryError("forbidden");
  const site = await location(sql, input.siteId);
  if (!site || site.kind !== "budowa") throw new RegistryError("invalid_input");
  if (site.manager_id !== session.userId) throw new RegistryError("forbidden");
  if (site.status !== "aktywna") throw new RegistryError("site_finished");
  return intake(
    sql,
    session,
    { operationId: input.operationId, name: input.name, categoryId: input.categoryId },
    { locationId: site.id, registration: "zgloszone" },
    now,
  );
}

/** Zgłoszenia czekające na decyzję (także te, które się już ruszyły), od najstarszego. */
export async function toolReports(sql: Sql): Promise<ToolReport[]> {
  const rows = await sql<{
    id: string;
    code: string;
    name: string;
    category_id: string;
    category_name: string;
    category_prefix: string;
    reported_by: string;
    reported_at: Date;
    location_id: string;
    location_name: string;
  }>(
    `select t.id, t.code, t.name, c.id as category_id, c.name as category_name, c.prefix as category_prefix,
            u.full_name as reported_by, intake.occurred_at as reported_at, l.id as location_id, l.name as location_name
     from app.tools t
     join app.categories c on c.id = t.category_id
     join app.locations l on l.id = t.location_id
     join lateral (
       select m.author_id, m.occurred_at from app.movement_tools mt join app.movements m on m.id = mt.movement_id
       where mt.tool_id = t.id and m.kind = 'przyjecie'
       order by m.sequence_number limit 1
     ) intake on true
     join app.users u on u.user_id = intake.author_id
     where t.registration = 'zgloszone' and t.state <> 'wycofane'
     order by intake.occurred_at, t.code`,
  );
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    category: { id: row.category_id, name: row.category_name, prefix: row.category_prefix },
    reportedBy: row.reported_by,
    reportedAt: new Date(row.reported_at),
    location: { id: row.location_id, name: row.location_name },
  }));
}

/** Akceptacja: ostateczny kod (i ewentualnie kategoria) oraz wartość; narzędzie staje się zaakceptowane. */
export async function acceptToolReport(sql: Sql, session: Session, input: AcceptToolReportInput): Promise<void> {
  requireToolReviewer(session);
  await pendingReport(sql, input.toolId);
  if (typeof input.value !== "number" || !Number.isFinite(input.value)) throw new RegistryError("invalid_input");
  const code = input.code?.trim();
  await editTool(sql, session, input.toolId, {
    ...(code && { code }),
    ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
    value: input.value,
  });
  await sql("update app.tools set registration = 'zaakceptowane' where id = $1", [input.toolId]);
}

/** Odrzucenie z komentarzem wycofuje narzędzie z obiegu; karta i historia zostają. */
export async function rejectToolReport(sql: Sql, session: Session, input: RejectToolReportInput, now: Date): Promise<Movement> {
  requireToolReviewer(session);
  if (!UUID_PATTERN.test(input.operationId)) throw new RegistryError("invalid_input");
  const done = await movementByOperation(sql, session, input.operationId);
  if (done) return done;

  const comment = input.comment?.trim();
  if (!comment) throw new RegistryError("reason_required");
  const tool = await pendingReport(sql, input.toolId);
  const movementId = await insertMovement(sql, session, {
    kind: "wycofanie",
    source: "panel",
    fromLocationId: tool.locationId,
    toLocationId: null,
    occurredAt: now,
    recordedAt: now,
    operationId: input.operationId,
    reason: comment,
    fromState: tool.state,
    toState: "wycofane",
  });
  await attachTools(sql, session, movementId, [tool.id]);
  return (await movementById(sql, movementId))!;
}

/**
 * Zgłoszone narzędzie, o którym właściciel jeszcze nie zdecydował, zablokowane do końca transakcji,
 * żeby równoległa akceptacja i odrzucenie nie przeszły obie.
 */
async function pendingReport(sql: Sql, toolId: string) {
  const [row] = UUID_PATTERN.test(toolId)
    ? await sql<{ id: string; location_id: string; state: ToolState; registration: string }>(
        "select id, location_id, state, registration from app.tools where id = $1 for update",
        [toolId],
      )
    : [];
  if (!row) throw new RegistryError("not_found");
  if (row.registration !== "zgloszone" || row.state === "wycofane") throw new RegistryError("not_reported");
  return { id: row.id, locationId: row.location_id, state: row.state };
}
