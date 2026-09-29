import { randomUUID } from "node:crypto";
import { isUniqueViolation, RegistryError, ReplayedOperationError } from "./errors";
import { checkDocument } from "./photos";
import type { Sql } from "./ports";
import type { Session } from "./registry";
import type { LocationKind } from "./tools";
import { daysBetween, isCalendarDay, UUID_PATTERN, warsawTime } from "./validation";

export const DEADLINE_KINDS = ["przeglad", "kalibracja", "udt", "gwarancja"] as const;
/** Przegląd, kalibracja, badanie UDT albo koniec gwarancji. */
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];

export const DOCUMENT_KINDS = ["swiadectwo", "protokol", "karta_gwarancyjna", "faktura", "inne"] as const;
/** Świadectwo kalibracji, protokół przeglądu albo badania, karta gwarancyjna, faktura albo inny dokument. */
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const MAX_DOCUMENT_NAME_LENGTH = 200;

/**
 * Stan terminu w danym dniu: po terminie (gwarancja nie bywa po terminie, tylko wygasa), w najbliższych 30 dniach,
 * później, bez terminu (wykonany, bez cyklu) albo wygasła gwarancja.
 */
export type DeadlineStatus = "po_terminie" | "wkrotce" | "pozniej" | "bez_terminu" | "wygasla";

/** Termin jest „wkrótce”, gdy do niego zostało najwyżej tyle dni; tyle obejmuje też raport tygodniowy. */
export const UPCOMING_DAYS = 30;
export const MAX_CYCLE_MONTHS = 120;
export const MAX_DEADLINE_NOTE_LENGTH = 200;

export interface NewDeadlineInput {
  toolId: string;
  kind: DeadlineKind;
  /** RRRR-MM-DD. Przy gwarancji ostatni dzień gwarancji. */
  dueOn: string;
  /** Co ile miesięcy (1–120); przy gwarancji brak. */
  cycleMonths?: number | null;
  note?: string | null;
}

/** Zmiany terminu: pominięte pola zostają bez zmian, null (i pusty opis) czyści pole. Rodzaju się nie zmienia. */
export interface DeadlineChanges {
  dueOn?: string;
  cycleMonths?: number | null;
  note?: string | null;
}

/** Wykonany przegląd, kalibracja albo badanie UDT. */
export interface CompleteDeadlineInput {
  /** Identyfikator operacji klienta: ponowne wysłanie nie dubluje dokumentu. */
  operationId: string;
  deadlineId: string;
  /** Dzień wykonania (RRRR-MM-DD), najpóźniej dziś w Polsce. */
  doneOn: string;
  /** Następny termin (RRRR-MM-DD), późniejszy niż wykonanie, np. z protokołu; bez niego liczy się z cyklu. */
  nextDueOn?: string | null;
  /** Np. protokół przeglądu albo nowe świadectwo kalibracji. */
  document?: NewDocument | null;
}

/** Plik dokumentu z nazwą, pod którą go pokazujemy. */
export interface NewDocument {
  kind: DocumentKind;
  /** PDF albo zdjęcie JPG, PNG, WEBP do 4 MB. */
  file: Blob;
  fileName: string;
}

export interface AddDocumentInput extends NewDocument {
  /** Identyfikator operacji klienta: ponowne wysłanie zwraca pierwotny dokument. */
  operationId: string;
  deadlineId: string;
}

/** Plik do zapisania w kubełku dokumentów przed zatwierdzeniem transakcji. */
export interface DocumentFile {
  key: string;
  blob: Blob;
}

/** Termin na karcie narzędzia. */
export interface ToolDeadline {
  id: string;
  kind: DeadlineKind;
  /** Następny termin (RRRR-MM-DD); null po wykonaniu terminu bez cyklu. */
  dueOn: string | null;
  /** Ile dni do terminu w Polsce (0 = dziś, ujemne po terminie); null bez terminu. */
  daysLeft: number | null;
  status: DeadlineStatus;
  cycleMonths: number | null;
  note: string | null;
  /** Kiedy ostatnio wykonano (RRRR-MM-DD). */
  lastDoneOn: string | null;
  documents: DeadlineDocument[];
}

/** Dokument przy terminie: zdjęcie albo PDF. Faktury widzi tylko właściciel. */
export interface DeadlineDocument {
  id: string;
  kind: DocumentKind;
  fileName: string;
  contentType: string;
  uploadedAt: Date;
  /** Kto dołączył. */
  uploadedBy: string;
}

/** Terminy dodaje, zmienia i usuwa właściciel. */
export function canManageDeadlines(session: Session) {
  return session.role === "wlasciciel";
}

function requireDeadlineManager(session: Session) {
  if (!canManageDeadlines(session)) throw new RegistryError("forbidden");
}

/** Wykonanie przeglądu, kalibracji i badania UDT wpisuje właściciel i magazynier (odbiera sprzęt z serwisu). */
export function canCompleteDeadlines(session: Session) {
  return session.role === "wlasciciel" || session.role === "magazynier";
}

/** Najbliższy termin narzędzia: przegląd, kalibracja, badanie UDT albo trwająca gwarancja. */
export interface NextDeadline {
  kind: DeadlineKind;
  dueOn: string;
  /** Ile dni do terminu w Polsce (0 = dziś, ujemne po terminie). */
  daysLeft: number;
  /** Termin minął (gwarancja nigdy: po końcu po prostu jej nie ma). */
  overdue: boolean;
}

/** Terminy narzędzia w skrócie: dla tablicy, wyszukiwania i ruchów z serwisu i do serwisu. */
export interface DeadlineSummary {
  /** Najwcześniejszy termin, także po terminie; null, gdy narzędzie nie ma żadnego. */
  nextDeadline: NextDeadline | null;
  /** Najwcześniejszy przegląd, kalibracja albo badanie UDT (bez gwarancji): to wpisuje się po powrocie z serwisu. */
  nextInspection: NextDeadline | null;
  /** Ostatni dzień trwającej gwarancji (RRRR-MM-DD); null bez gwarancji albo po jej końcu. */
  warrantyUntil: string | null;
}

/** Najbliższy termin, najbliższy przegląd i trwająca gwarancja z terminów narzędzia, w dniu `today`. */
export function summarizeDeadlines(deadlines: { kind: DeadlineKind; dueOn: string | null }[], today: string): DeadlineSummary {
  const earlier = (a: NextDeadline | null, b: NextDeadline) => (a && a.dueOn <= b.dueOn ? a : b);
  const summary: DeadlineSummary = { nextDeadline: null, nextInspection: null, warrantyUntil: null };
  for (const { kind, dueOn } of deadlines) {
    const { status, daysLeft } = deadlineStatus(kind, dueOn, today);
    if (dueOn === null || daysLeft === null || status === "wygasla" || status === "bez_terminu") continue;
    const deadline = { kind, dueOn, daysLeft, overdue: status === "po_terminie" };
    summary.nextDeadline = earlier(summary.nextDeadline, deadline);
    if (kind === "gwarancja") summary.warrantyUntil = dueOn;
    else summary.nextInspection = earlier(summary.nextInspection, deadline);
  }
  return summary;
}

/** Terminy w skrócie dla każdego narzędzia firmy, które ma jakiś termin. */
export async function deadlineSummaries(sql: Sql, now: Date): Promise<Map<string, DeadlineSummary>> {
  const rows = await sql<{ tool_id: string; kind: DeadlineKind; due_on: string }>(
    "select tool_id, kind, to_char(due_on, 'YYYY-MM-DD') as due_on from app.tool_deadlines where due_on is not null",
  );
  const today = warsawTime(now).day;
  const byTool = Map.groupBy(rows, (row) => row.tool_id);
  return new Map([...byTool].map(([toolId, list]) => [toolId, summarizeDeadlines(list.map((row) => ({ kind: row.kind, dueOn: row.due_on })), today)]));
}

/** Termin sprzętu z tym, gdzie sprzęt jest: w przypomnieniu w dzwonku i na liście terminów. */
export interface DeadlineAt {
  id: string;
  kind: DeadlineKind;
  /** RRRR-MM-DD. */
  dueOn: string;
  /** Po terminie (gwarancja nigdy). */
  overdue: boolean;
  tool: { id: string; code: string; name: string };
  location: { id: string; name: string; kind: LocationKind };
}

/** Termin z najbliższych 30 dni albo po terminie, z tym, kto odpowiada za sprzęt. */
export interface UpcomingDeadline extends DeadlineAt {
  /** Ile dni do terminu w Polsce (ujemne po terminie). */
  daysLeft: number;
  /** Kierownik budowy albo pojazdu, na którym jest sprzęt; na bazie i w serwisie nikt. */
  responsible: string | null;
}

/** Termin sprzętu w obiegu z kierownikiem lokalizacji, w której sprzęt jest (budowa albo pojazd). */
export interface ScheduledDeadline extends Omit<DeadlineAt, "overdue"> {
  manager: { userId: string; fullName: string; active: boolean } | null;
}

/**
 * Terminy sprzętu w obiegu z datą najpóźniej `withinDays` dni po `today` (RRRR-MM-DD), także po terminie, od
 * najwcześniejszego: w firmie aktora (RLS) albo, w transakcji systemowej, we wskazanej.
 */
export async function scheduledDeadlines(
  sql: Sql,
  { today, withinDays, companyId = null }: { today: string; withinDays: number; companyId?: string | null },
): Promise<ScheduledDeadline[]> {
  const rows = await sql<{
    id: string;
    kind: DeadlineKind;
    due_on: string;
    tool_id: string;
    code: string;
    name: string;
    location_id: string;
    location_name: string;
    location_kind: LocationKind;
    manager_id: string | null;
    manager_name: string | null;
    manager_active: boolean | null;
  }>(
    `select d.id, d.kind, to_char(d.due_on, 'YYYY-MM-DD') as due_on, t.id as tool_id, t.code, t.name,
            l.id as location_id, l.name as location_name, l.kind as location_kind,
            mu.user_id as manager_id, mu.full_name as manager_name, mu.active as manager_active
     from app.tool_deadlines d
     join app.tools t on t.id = d.tool_id
     join app.locations l on l.id = t.location_id
     left join app.users mu on mu.user_id = l.manager_id and l.kind in ('budowa', 'pojazd')
     where d.due_on is not null and d.due_on <= $1::date + $2::int and t.state = 'w_obiegu'
       and ($3::uuid is null or d.company_id = $3)`,
    [today, withinDays, companyId],
  );
  return rows
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      dueOn: row.due_on,
      tool: { id: row.tool_id, code: row.code, name: row.name },
      location: { id: row.location_id, name: row.location_name, kind: row.location_kind },
      manager: row.manager_id && row.manager_name ? { userId: row.manager_id, fullName: row.manager_name, active: row.manager_active === true } : null,
    }))
    .sort(
      (a, b) =>
        a.dueOn.localeCompare(b.dueOn) ||
        a.tool.code.localeCompare(b.tool.code, "pl", { numeric: true }) ||
        DEADLINE_KINDS.indexOf(a.kind) - DEADLINE_KINDS.indexOf(b.kind),
    );
}

/**
 * Terminy sprzętu w obiegu w najbliższych 30 dniach (w Polsce) i te po terminie, od najwcześniejszego. Wygasłe
 * gwarancje się nie liczą: po końcu gwarancji nie ma czego pilnować.
 */
export async function upcomingDeadlines(sql: Sql, now: Date): Promise<UpcomingDeadline[]> {
  const today = warsawTime(now).day;
  return (await scheduledDeadlines(sql, { today, withinDays: UPCOMING_DAYS })).flatMap(({ manager, ...deadline }) => {
    const { status, daysLeft } = deadlineStatus(deadline.kind, deadline.dueOn, today);
    if (status === "wygasla" || daysLeft === null) return [];
    return [{ ...deadline, daysLeft, overdue: status === "po_terminie", responsible: manager?.fullName ?? null }];
  });
}

/** Terminy w skrócie narzędzia bez terminów. */
export const NO_DEADLINES: DeadlineSummary = { nextDeadline: null, nextInspection: null, warrantyUntil: null };

/** Dokumenty dołącza właściciel i magazynier, ale fakturę (ma cenę) tylko właściciel. */
export function canAttachDocument(session: Session, kind: DocumentKind) {
  return session.role === "wlasciciel" || (session.role === "magazynier" && kind !== "faktura");
}

/** Stan terminu `dueOn` w dniu `today` (oba RRRR-MM-DD) i ile dni do niego zostało. */
export function deadlineStatus(kind: DeadlineKind, dueOn: string | null, today: string): { status: DeadlineStatus; daysLeft: number | null } {
  if (dueOn === null) return { status: "bez_terminu", daysLeft: null };
  const daysLeft = daysBetween(today, dueOn);
  if (daysLeft < 0) return { status: kind === "gwarancja" ? "wygasla" : "po_terminie", daysLeft };
  return { status: daysLeft <= UPCOMING_DAYS ? "wkrotce" : "pozniej", daysLeft };
}

/** Nowy termin narzędzia. Tylko właściciel. */
export async function addDeadline(sql: Sql, session: Session, input: NewDeadlineInput, now: Date): Promise<{ deadlineId: string }> {
  requireDeadlineManager(session);
  if (!DEADLINE_KINDS.includes(input.kind)) throw new RegistryError("invalid_input");
  const fields = checkChanges(input.kind, { dueOn: input.dueOn, cycleMonths: input.cycleMonths ?? null, note: input.note ?? null });
  const [tool] = UUID_PATTERN.test(input.toolId) ? await sql("select 1 from app.tools where id = $1", [input.toolId]) : [];
  if (!tool) throw new RegistryError("not_found");
  const [row] = await sql<{ id: string }>(
    `insert into app.tool_deadlines (company_id, tool_id, kind, due_on, cycle_months, note, created_at)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [session.company.id, input.toolId, input.kind, fields.dueOn, fields.cycleMonths, fields.note, now],
  ).catch((error) => {
    throw isUniqueViolation(error, "tool_deadlines_kind_per_tool") ? new RegistryError("deadline_taken") : error;
  });
  return { deadlineId: row.id };
}

/** Zmienia datę, cykl albo opis terminu. Tylko właściciel. */
export async function updateDeadline(sql: Sql, session: Session, deadlineId: string, changes: DeadlineChanges): Promise<void> {
  requireDeadlineManager(session);
  const [deadline] = UUID_PATTERN.test(deadlineId)
    ? await sql<{ kind: DeadlineKind }>("select kind from app.tool_deadlines where id = $1", [deadlineId])
    : [];
  if (!deadline) throw new RegistryError("not_found");
  const fields = checkChanges(deadline.kind, changes);
  const columns: [column: string, value: unknown][] = [];
  if (fields.dueOn !== undefined) columns.push(["due_on", fields.dueOn]);
  if (fields.cycleMonths !== undefined) columns.push(["cycle_months", fields.cycleMonths]);
  if (fields.note !== undefined) columns.push(["note", fields.note]);
  const rows =
    columns.length === 0
      ? await sql("select id from app.tool_deadlines where id = $1", [deadlineId])
      : await sql(
          `update app.tool_deadlines set ${columns.map(([column], i) => `${column} = $${i + 2}`).join(", ")} where id = $1 returning id`,
          [deadlineId, ...columns.map(([, value]) => value)],
        );
  if (rows.length === 0) throw new RegistryError("not_found");
}

/**
 * Wpisuje wykonanie terminu: następny termin to podany albo dzień wykonania plus cykl, a bez cyklu terminu nie ma,
 * dopóki właściciel nie wpisze nowego. Gwarancji się nie wykonuje. Właściciel i magazynier. Ponowne wysłanie tej samej
 * operacji zwraca bieżący termin. Zwraca następny termin i plik dołączonego dokumentu do zapisania w kubełku.
 */
export async function completeDeadline(
  sql: Sql,
  session: Session,
  input: CompleteDeadlineInput,
  now: Date,
): Promise<{ dueOn: string | null; file: DocumentFile | null }> {
  if (!canCompleteDeadlines(session)) throw new RegistryError("forbidden");
  if (input.document) checkDocumentFields(session, input.document);
  if (!UUID_PATTERN.test(input.operationId)) throw new RegistryError("invalid_input");
  const day = (value: unknown) => typeof value === "string" && isCalendarDay(value);
  if (!day(input.doneOn) || input.doneOn > warsawTime(now).day) throw new RegistryError("invalid_input");
  const nextDueOn = input.nextDueOn ?? null;
  if (nextDueOn !== null && (!day(nextDueOn) || nextDueOn <= input.doneOn)) throw new RegistryError("invalid_input");
  const [deadline] = UUID_PATTERN.test(input.deadlineId)
    ? await sql<{ kind: DeadlineKind; due_on: string | null; last_done_operation_id: string | null }>(
        "select kind, to_char(due_on, 'YYYY-MM-DD') as due_on, last_done_operation_id from app.tool_deadlines where id = $1",
        [input.deadlineId],
      )
    : [];
  if (!deadline) throw new RegistryError("not_found");
  if (deadline.kind === "gwarancja") throw new RegistryError("invalid_input");
  // Ponowne wysłanie tego samego wykonania zwraca bieżący termin: nie cofa zmian, które zaszły od tamtej pory.
  if (deadline.last_done_operation_id === input.operationId) return { dueOn: deadline.due_on, file: null };
  const [row] = await sql<{ due_on: string | null }>(
    "select to_char(due_on, 'YYYY-MM-DD') as due_on from app.complete_tool_deadline($1, $2, $3, $4)",
    [input.deadlineId, input.doneOn, nextDueOn, input.operationId],
  );
  // Termin usunięty w równoległej transakcji już po sprawdzeniu.
  if (!row) throw new RegistryError("not_found");
  const added = input.document ? await addDocument(sql, session, { ...input.document, operationId: input.operationId, deadlineId: input.deadlineId }, now) : null;
  return { dueOn: row.due_on, file: added?.file ?? null };
}

/**
 * Dołącza dokument do terminu. Zwraca plik do zapisania w kubełku (null przy ponowieniu tej samej operacji).
 * Właściciel, a magazynier bez faktur.
 */
export async function addDocument(
  sql: Sql,
  session: Session,
  input: AddDocumentInput,
  now: Date,
): Promise<{ documentId: string; file: DocumentFile | null }> {
  const fileName = checkDocumentFields(session, input);
  if (!UUID_PATTERN.test(input.operationId)) throw new RegistryError("invalid_input");
  const [done] = await sql<{ id: string }>("select id from app.tool_deadline_documents where client_operation_id = $1", [input.operationId]);
  if (done) return { documentId: done.id, file: null };

  const checked = await checkDocument(input.file);
  const [deadline] = UUID_PATTERN.test(input.deadlineId) ? await sql("select 1 from app.tool_deadlines where id = $1", [input.deadlineId]) : [];
  if (!deadline) throw new RegistryError("not_found");
  const documentId = randomUUID();
  const key = `${session.company.id}/${documentId}.${checked.extension}`;
  await sql(
    `insert into app.tool_deadline_documents
       (id, company_id, deadline_id, kind, file_path, file_name, content_type, uploaded_by, uploaded_at, client_operation_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [documentId, session.company.id, input.deadlineId, input.kind, key, fileName, checked.blob.type, session.userId, now, input.operationId],
  ).catch((error) => {
    throw isUniqueViolation(error, "tool_deadline_documents_operation_per_company") ? new ReplayedOperationError() : error;
  });
  return { documentId, file: { key, blob: checked.blob } };
}

/** Usuwa dokument. Tylko właściciel. Zwraca klucz pliku do usunięcia z kubełka. */
export async function deleteDocument(sql: Sql, session: Session, documentId: string): Promise<{ fileKeys: string[] }> {
  requireDeadlineManager(session);
  const [row] = UUID_PATTERN.test(documentId)
    ? await sql<{ file_path: string }>("delete from app.tool_deadline_documents where id = $1 returning file_path", [documentId])
    : [];
  if (!row) throw new RegistryError("not_found");
  return { fileKeys: [row.file_path] };
}

/** Plik dokumentu, który aktor widzi (faktury tylko właściciel), z nazwą; null, gdy go nie widzi. */
export async function visibleDocument(sql: Sql, documentId: string): Promise<{ key: string; fileName: string } | null> {
  if (!UUID_PATTERN.test(documentId)) return null;
  const [row] = await sql<{ file_path: string; file_name: string }>(
    "select file_path, file_name from app.tool_deadline_documents where id = $1",
    [documentId],
  );
  return row ? { key: row.file_path, fileName: row.file_name } : null;
}

/** Sprawdza uprawnienie, rodzaj i nazwę dokumentu (bez pliku); zwraca nazwę bez spacji na brzegach. */
function checkDocumentFields(session: Session, document: Pick<NewDocument, "kind" | "fileName">): string {
  if (!DOCUMENT_KINDS.includes(document.kind)) throw new RegistryError("invalid_input");
  if (!canAttachDocument(session, document.kind)) throw new RegistryError("forbidden");
  const fileName = typeof document.fileName === "string" ? document.fileName.trim() : "";
  if (!fileName || fileName.length > MAX_DOCUMENT_NAME_LENGTH) throw new RegistryError("invalid_input");
  return fileName;
}

/** Usuwa termin z dokumentami. Tylko właściciel. Zwraca klucze plików dokumentów do usunięcia z kubełka. */
export async function deleteDeadline(sql: Sql, session: Session, deadlineId: string): Promise<{ fileKeys: string[] }> {
  requireDeadlineManager(session);
  const files = UUID_PATTERN.test(deadlineId)
    ? await sql<{ file_path: string }>("select file_path from app.tool_deadline_documents where deadline_id = $1", [deadlineId])
    : [];
  const deleted = UUID_PATTERN.test(deadlineId) ? await sql("delete from app.tool_deadlines where id = $1 returning id", [deadlineId]) : [];
  if (deleted.length === 0) throw new RegistryError("not_found");
  return { fileKeys: files.map((file) => file.file_path) };
}

/**
 * Sprawdza i porządkuje podane pola terminu danego rodzaju: data RRRR-MM-DD, cykl w pełnych miesiącach (1–120, przy
 * gwarancji żaden), opis do 200 znaków (pusty to brak). Pól nieobecnych nie dotyka.
 */
function checkChanges(kind: DeadlineKind, changes: DeadlineChanges): DeadlineChanges {
  const invalid = () => new RegistryError("invalid_input");
  const fields: DeadlineChanges = {};
  if (changes.dueOn !== undefined) {
    if (typeof changes.dueOn !== "string" || !isCalendarDay(changes.dueOn)) throw invalid();
    fields.dueOn = changes.dueOn;
  }
  if (changes.cycleMonths !== undefined) {
    const cycle = changes.cycleMonths;
    if (cycle !== null && !(Number.isInteger(cycle) && cycle >= 1 && cycle <= MAX_CYCLE_MONTHS)) throw invalid();
    if (cycle !== null && kind === "gwarancja") throw invalid();
    fields.cycleMonths = cycle;
  }
  if (changes.note !== undefined) {
    const note = changes.note?.trim() || null;
    if (note && note.length > MAX_DEADLINE_NOTE_LENGTH) throw invalid();
    fields.note = note;
  }
  return fields;
}

/** Terminy narzędzia od najbliższego; bez terminu na końcu. */
export async function toolDeadlines(sql: Sql, toolId: string, now: Date): Promise<ToolDeadline[]> {
  const today = warsawTime(now).day;
  const rows = await sql<{
    id: string;
    kind: DeadlineKind;
    due_on: string | null;
    cycle_months: number | null;
    note: string | null;
    last_done_on: string | null;
  }>(
    `select id, kind, to_char(due_on, 'YYYY-MM-DD') as due_on, cycle_months, note, to_char(last_done_on, 'YYYY-MM-DD') as last_done_on
     from app.tool_deadlines where tool_id = $1
     order by due_on nulls last, kind`,
    [toolId],
  );
  const documents = await sql<{
    id: string;
    deadline_id: string;
    kind: DocumentKind;
    file_name: string;
    content_type: string;
    uploaded_at: Date;
    uploaded_by: string;
  }>(
    `select d.id, d.deadline_id, d.kind, d.file_name, d.content_type, d.uploaded_at, u.full_name as uploaded_by
     from app.tool_deadline_documents d
     join app.tool_deadlines td on td.id = d.deadline_id
     join app.users u on u.user_id = d.uploaded_by
     where td.tool_id = $1
     order by d.sequence_number`,
    [toolId],
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    dueOn: row.due_on,
    ...deadlineStatus(row.kind, row.due_on, today),
    cycleMonths: row.cycle_months,
    note: row.note,
    lastDoneOn: row.last_done_on,
    documents: documents
      .filter((document) => document.deadline_id === row.id)
      .map((document) => ({
        id: document.id,
        kind: document.kind,
        fileName: document.file_name,
        contentType: document.content_type,
        uploadedAt: new Date(document.uploaded_at),
        uploadedBy: document.uploaded_by,
      })),
  }));
}
