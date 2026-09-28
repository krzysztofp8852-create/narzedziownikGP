import { randomUUID } from "node:crypto";
import { RegistryError } from "./errors";
import type { Sql } from "./ports";
import type { CheckedPhoto } from "./photos";
import type { PushCopy } from "./push";
import type { Session } from "./registry";
import { isUniqueViolation, ReplayedOperationError, type ToolState } from "./tools";
import { UUID_PATTERN } from "./validation";

export const ISSUE_KINDS = ["uszkodzenie", "brak", "inne"] as const;
/** Uszkodzenie sprzętu, brak lub zaginięcie, albo inna sprawa. */
export type IssueKind = (typeof ISSUE_KINDS)[number];
export type IssueStatus = "otwarte" | "zamkniete";

export interface FileIssueInput {
  /** Identyfikator operacji klienta: ponowne wysłanie zwraca pierwotne zgłoszenie. */
  operationId: string;
  kind: IssueKind;
  description: string;
  /** Przy uszkodzeniu obowiązkowe (narzędzie w obiegu), przy pozostałych rodzajach opcjonalne. */
  toolId?: string | null;
  /** Lokalizacja, której dotyczy zgłoszenie bez narzędzia; przy narzędziu liczy się to, gdzie ono jest. */
  locationId?: string | null;
  /** JPG, PNG albo WEBP do 4 MB. */
  photo?: Blob | null;
}

export interface CommentOnIssueInput {
  /** Identyfikator operacji klienta: ponowne wysłanie nie dubluje komentarza. */
  operationId: string;
  issueId: string;
  text: string;
}

export interface CloseIssueInput {
  /** Identyfikator operacji klienta: ponowne wysłanie nie zamyka drugi raz. */
  operationId: string;
  issueId: string;
  /** Komentarz zamykający, obowiązkowy. */
  comment: string;
  /** Właściciel przy zgłoszeniu uszkodzenia: narzędzie jest sprawne, flaga „uszkodzone” znika. */
  toolWorking?: boolean;
}

/** Zgłoszenie na liście okna 📋. */
export interface IssueSummary {
  id: string;
  kind: IssueKind;
  status: IssueStatus;
  description: string;
  tool: { id: string; code: string; name: string } | null;
  /** Lokalizacja, której dotyczy (przy narzędziu: gdzie było w chwili zgłoszenia). */
  location: { id: string; name: string } | null;
  author: string;
  createdAt: Date;
  closedAt: Date | null;
  /** Czy do zgłoszenia jest zdjęcie. */
  photo: boolean;
  /** Ile komentarzy ma wątek (z zamykającym). */
  comments: number;
  /** Ile wpisów o tym zgłoszeniu aktor jeszcze nie przeczytał. */
  unread: number;
}

export interface IssueComment {
  id: string;
  author: string;
  text: string;
  createdAt: Date;
  /** Komentarz, którym zgłoszenie zamknięto. */
  closes: boolean;
}

/** Zgłoszenie z wątkiem i tym, co aktor może z nim zrobić. */
export interface Issue extends IssueSummary {
  /** Od najstarszego. */
  thread: IssueComment[];
  closedBy: string | null;
  /** Właściciel zamknął zgłoszenie uszkodzenia, uznając narzędzie za sprawne. */
  toolWorking: boolean | null;
  canComment: boolean;
  canClose: boolean;
  /** Zamykając, aktor może uznać narzędzie za sprawne (właściciel, uszkodzenie, flaga jeszcze jest). */
  canMarkToolWorking: boolean;
}

/** Czego dotyczy zgłoszenie: rodzaj, narzędzie, lokalizacja. */
export interface IssueSubject {
  kind: IssueKind;
  tool: { code: string; name: string } | null;
  place: string | null;
}

/** Wpis w oknie 📋: nowe zgłoszenie, komentarz, zamknięcie albo zgłoszenie narzędzia z budowy. */
export type IssueEntry =
  | { kind: "zgloszenie" | "komentarz" | "zamkniecie"; issueId: string; issue: IssueSubject; author: string; text: string }
  | { kind: "zgloszenie_narzedzia"; toolId: string; code: string; name: string; place: string; author: string };

export const MAX_ISSUE_TEXT_LENGTH = 2000;
/** Najwięcej zgłoszeń na liście okna 📋 (otwarte są zawsze pierwsze). */
const MAX_LISTED = 200;

/**
 * Składa zgłoszenie w transakcji aktora. Zgłoszenie uszkodzenia oznacza narzędzie jako uszkodzone (robi to
 * baza). Zwraca klucz, pod którym trzeba zapisać zdjęcie (null przy ponowieniu i bez zdjęcia), i kopie push
 * nowych wpisów okna 📋.
 */
export async function fileIssue(
  sql: Sql,
  session: Session,
  input: FileIssueInput,
  photo: CheckedPhoto | null,
  now: Date,
): Promise<{ issueId: string; photoKey: string | null; copies: PushCopy[] }> {
  if (!UUID_PATTERN.test(input.operationId)) throw new RegistryError("invalid_input");
  const [done] = await sql<{ id: string }>("select id from app.issues where client_operation_id = $1", [input.operationId]);
  if (done) return { issueId: done.id, photoKey: null, copies: [] };

  if (!ISSUE_KINDS.includes(input.kind)) throw new RegistryError("invalid_input");
  const description = requiredText(input.description, "description_required");
  if (input.kind === "uszkodzenie" && !input.toolId) throw new RegistryError("tool_required");

  let tool: { id: string; code: string; name: string } | null = null;
  let place: { id: string; name: string } | null = null;
  if (input.toolId) {
    const [row] = UUID_PATTERN.test(input.toolId)
      ? await sql<{ id: string; code: string; name: string; state: ToolState; location_id: string; location_name: string }>(
          `select t.id, t.code, t.name, t.state, l.id as location_id, l.name as location_name
           from app.tools t join app.locations l on l.id = t.location_id where t.id = $1`,
          [input.toolId],
        )
      : [];
    if (!row) throw new RegistryError("not_found");
    if (row.state === "wycofane" || (input.kind === "uszkodzenie" && row.state !== "w_obiegu")) throw new RegistryError("invalid_tool_state");
    tool = { id: row.id, code: row.code, name: row.name };
    place = { id: row.location_id, name: row.location_name };
  } else if (input.locationId) {
    const [row] = UUID_PATTERN.test(input.locationId)
      ? await sql<{ id: string; name: string }>("select id, name from app.locations where id = $1", [input.locationId])
      : [];
    if (!row) throw new RegistryError("not_found");
    place = row;
  }

  const issueId = randomUUID();
  const photoKey = photo && `${session.company.id}/${issueId}.${photo.extension}`;
  await sql(
    `insert into app.issues (id, company_id, kind, description, tool_id, location_id, photo_path, author_id, created_at, client_operation_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [issueId, session.company.id, input.kind, description, tool?.id ?? null, place?.id ?? null, photoKey, session.userId, now, input.operationId],
  ).catch((error) => {
    throw isUniqueViolation(error, "issues_operation_per_company") ? new ReplayedOperationError() : error;
  });
  const subject: IssueSubject = { kind: input.kind, tool: tool && { code: tool.code, name: tool.name }, place: place?.name ?? null };
  const copies = await deliver(sql, { kind: "zgloszenie", issueId, commentId: null }, now, (entryId) => ({
    window: "zgloszenia",
    entryId,
    entry: { kind: "zgloszenie", issueId, issue: subject, author: session.fullName, text: description },
  }));
  return { issueId, photoKey, copies };
}

/** Komentarz pod otwartym zgłoszeniem, które aktor widzi. Zwraca kopie push nowych wpisów okna 📋. */
export async function commentOnIssue(sql: Sql, session: Session, input: CommentOnIssueInput, now: Date): Promise<PushCopy[]> {
  if (!UUID_PATTERN.test(input.operationId)) throw new RegistryError("invalid_input");
  if (await commentByOperation(sql, input.operationId)) return [];
  const issue = await visibleIssue(sql, input.issueId);
  const text = requiredText(input.text, "comment_required");
  if (issue.status === "zamkniete") throw new RegistryError("issue_closed");
  return addComment(sql, session, issue, { operationId: input.operationId, text, closes: false }, now);
}

/**
 * Zamyka zgłoszenie komentarzem. Zamyka właściciel, a magazynier, gdy widzi zgłoszenia i ma zgodę właściciela.
 * Za sprawne (zdjęcie flagi „uszkodzone”) uznaje narzędzie tylko właściciel. Zwraca kopie push nowych wpisów.
 */
export async function closeIssue(sql: Sql, session: Session, input: CloseIssueInput, now: Date): Promise<PushCopy[]> {
  if (!UUID_PATTERN.test(input.operationId)) throw new RegistryError("invalid_input");
  if (await commentByOperation(sql, input.operationId)) return [];
  const issue = await visibleIssue(sql, input.issueId);
  if (issue.status === "zamkniete") throw new RegistryError("issue_closed");
  if (!(await closesIssues(sql))) throw new RegistryError("forbidden");
  // Blokada do końca transakcji: z dwóch równoległych zamknięć drugie zobaczy zamknięte zgłoszenie.
  const [stillOpen] = await sql("select 1 from app.issues where id = $1 and status = 'otwarte' for update", [issue.id]);
  if (!stillOpen) throw new RegistryError("issue_closed");
  const text = requiredText(input.comment, "comment_required");
  const toolWorking = input.toolWorking === true;
  if (toolWorking && issue.kind !== "uszkodzenie") throw new RegistryError("invalid_input");
  if (toolWorking && session.role !== "wlasciciel") throw new RegistryError("forbidden");

  const copies = await addComment(sql, session, issue, { operationId: input.operationId, text, closes: true }, now);
  await sql("update app.issues set status = 'zamkniete', closed_at = $2, closed_by = $3, tool_working = $4 where id = $1", [
    issue.id,
    now,
    session.userId,
    toolWorking || null,
  ]);
  return copies;
}

/** Zgłoszenia, które aktor widzi: otwarte od najnowszego, potem zamknięte od ostatnio zamkniętego. */
export async function listIssues(sql: Sql, session: Session): Promise<IssueSummary[]> {
  const rows = await sql<IssueRow>(
    `${issueSelect("true")} order by (i.status = 'zamkniete'), coalesce(i.closed_at, i.created_at) desc, i.sequence_number desc limit $2`,
    [session.userId, MAX_LISTED],
  );
  return rows.map(toSummary);
}

/** Zgłoszenie z wątkiem albo null, gdy aktor go nie widzi. */
export async function issueDetails(sql: Sql, session: Session, issueId: string): Promise<Issue | null> {
  if (!UUID_PATTERN.test(issueId)) return null;
  const [row] = await sql<IssueRow>(issueSelect("i.id = $2"), [session.userId, issueId]);
  if (!row) return null;
  const thread = await sql<{ id: string; author: string; body: string; created_at: Date; closes: boolean }>(
    `select c.id, u.full_name as author, c.body, c.created_at, c.closes
     from app.issue_comments c join app.users u on u.user_id = c.author_id
     where c.issue_id = $1 order by c.created_at, c.sequence_number`,
    [issueId],
  );
  const open = row.status === "otwarte";
  const canClose = open && (await closesIssues(sql));
  return {
    ...toSummary(row),
    thread: thread.map((comment) => ({
      id: comment.id,
      author: comment.author,
      text: comment.body,
      createdAt: new Date(comment.created_at),
      closes: comment.closes,
    })),
    closedBy: row.closed_by,
    toolWorking: row.tool_working,
    canComment: open,
    canClose,
    canMarkToolWorking: canClose && session.role === "wlasciciel" && row.kind === "uszkodzenie" && row.tool_damaged,
  };
}

/** Klucz zdjęcia zgłoszenia, które aktor widzi; null, gdy go nie widzi albo zgłoszenie nie ma zdjęcia. */
export async function visiblePhotoKey(sql: Sql, issueId: string): Promise<string | null> {
  if (!UUID_PATTERN.test(issueId)) return null;
  const [row] = await sql<{ photo_path: string | null }>("select photo_path from app.issues where id = $1", [issueId]);
  return row?.photo_path ?? null;
}

/**
 * Nieprzeczytane wpisy okna 📋 aktora. Nie liczą się wpisy o zgłoszeniach, których już nie widzi, ani
 * o zgłoszeniach narzędzi, o których ktoś już zdecydował.
 */
export async function unreadCount(sql: Sql, session: Session): Promise<number> {
  const [{ unread }] = await sql<{ unread: number }>(
    `select count(*)::int as unread from app.issue_entries e
     left join app.issues i on i.id = e.issue_id
     left join app.tools t on t.id = e.tool_id
     where e.recipient_id = $1 and e.read_at is null
       and (i.id is not null or (t.registration = 'zgloszone' and t.state <> 'wycofane'))`,
    [session.userId],
  );
  return unread;
}

/** Otwarcie zgłoszenia: wszystkie wpisy o nim są przeczytane. */
export async function markIssueRead(sql: Sql, session: Session, issueId: string, now: Date): Promise<void> {
  if (!UUID_PATTERN.test(issueId)) return;
  await sql("update app.issue_entries set read_at = $3 where recipient_id = $1 and issue_id = $2 and read_at is null", [
    session.userId,
    issueId,
    now,
  ]);
}

export async function markAllRead(sql: Sql, session: Session, now: Date): Promise<void> {
  await sql("update app.issue_entries set read_at = $2 where recipient_id = $1 and read_at is null", [session.userId, now]);
}

/**
 * Zgłoszone przez aktora narzędzie trafia do okna 📋 aktywnych właścicieli. Ponowienie zgłoszenia niczego
 * nie dubluje. Zwraca kopie push nowych wpisów.
 */
export async function deliverToolReport(sql: Sql, session: Session, toolId: string, now: Date): Promise<PushCopy[]> {
  const [tool] = await sql<{ code: string; name: string; place: string }>(
    "select t.code, t.name, l.name as place from app.tools t join app.locations l on l.id = t.location_id where t.id = $1",
    [toolId],
  );
  return deliver(sql, { kind: "zgloszenie_narzedzia", toolId }, now, (entryId) => ({
    window: "zgloszenia",
    entryId,
    entry: { kind: "zgloszenie_narzedzia", toolId, code: tool.code, name: tool.name, place: tool.place, author: session.fullName },
  }));
}

type EntryEvent =
  | { kind: "zgloszenie"; issueId: string; commentId: null }
  | { kind: "komentarz" | "zamkniecie"; issueId: string; commentId: string }
  | { kind: "zgloszenie_narzedzia"; toolId: string };

/** Wpisy zdarzenia w oknach 📋 adresatów, których ustala baza; kopia push dla każdego nowego wpisu. */
async function deliver(sql: Sql, event: EntryEvent, now: Date, message: (entryId: string) => PushCopy["message"]): Promise<PushCopy[]> {
  const rows = await sql<{ entry_id: string; recipient: string }>(
    "select entry_id, recipient from app.deliver_issue_entries($1, $2, $3, $4, $5)",
    [
      event.kind,
      "issueId" in event ? event.issueId : null,
      "commentId" in event ? event.commentId : null,
      "toolId" in event ? event.toolId : null,
      now,
    ],
  );
  return rows.map((row) => ({ recipientId: row.recipient, message: message(row.entry_id) }));
}

interface VisibleIssue {
  id: string;
  kind: IssueKind;
  status: IssueStatus;
  subject: IssueSubject;
}

/** Zgłoszenie, które aktor widzi (RLS), albo `not_found`. */
async function visibleIssue(sql: Sql, issueId: string): Promise<VisibleIssue> {
  const [row] = UUID_PATTERN.test(issueId)
    ? await sql<{ id: string; kind: IssueKind; status: IssueStatus; tool_code: string | null; tool_name: string | null; place: string | null }>(
        `select i.id, i.kind, i.status, t.code as tool_code, t.name as tool_name, l.name as place
         from app.issues i left join app.tools t on t.id = i.tool_id left join app.locations l on l.id = i.location_id
         where i.id = $1`,
        [issueId],
      )
    : [];
  if (!row) throw new RegistryError("not_found");
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    subject: { kind: row.kind, tool: row.tool_code ? { code: row.tool_code, name: row.tool_name! } : null, place: row.place },
  };
}

async function addComment(
  sql: Sql,
  session: Session,
  issue: VisibleIssue,
  comment: { operationId: string; text: string; closes: boolean },
  now: Date,
): Promise<PushCopy[]> {
  const commentId = randomUUID();
  await sql(
    `insert into app.issue_comments (id, company_id, issue_id, author_id, body, closes, created_at, client_operation_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [commentId, session.company.id, issue.id, session.userId, comment.text, comment.closes, now, comment.operationId],
  ).catch((error) => {
    throw isUniqueViolation(error, "issue_comments_operation_per_company") ? new ReplayedOperationError() : error;
  });
  const kind = comment.closes ? "zamkniecie" : "komentarz";
  return deliver(sql, { kind, issueId: issue.id, commentId }, now, (entryId) => ({
    window: "zgloszenia",
    entryId,
    entry: { kind, issueId: issue.id, issue: issue.subject, author: session.fullName, text: comment.text },
  }));
}

async function commentByOperation(sql: Sql, operationId: string) {
  const [row] = await sql("select 1 from app.issue_comments where client_operation_id = $1", [operationId]);
  return Boolean(row);
}

/** Właściciel zamyka zawsze, magazynier, gdy widzi zgłoszenia i może je zamykać; tę samą regułę stosuje RLS. */
async function closesIssues(sql: Sql) {
  const [row] = await sql<{ closes: boolean }>("select app.closes_issues() as closes");
  return row.closes;
}

function requiredText(raw: string, code: "description_required" | "comment_required") {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) throw new RegistryError(code);
  if (text.length > MAX_ISSUE_TEXT_LENGTH) throw new RegistryError("invalid_input");
  return text;
}

interface IssueRow {
  id: string;
  kind: IssueKind;
  status: IssueStatus;
  description: string;
  created_at: Date;
  closed_at: Date | null;
  photo: boolean;
  tool_id: string | null;
  tool_code: string | null;
  tool_name: string | null;
  location_id: string | null;
  location_name: string | null;
  author: string;
  comments: number;
  unread: number;
  closed_by: string | null;
  tool_working: boolean | null;
  tool_damaged: boolean;
}

/** Zgłoszenia widoczne dla aktora ($1) spełniające `where`, z liczbą komentarzy i jego nieprzeczytanych wpisów. */
const issueSelect = (where: string) => `
  select i.id, i.kind, i.status, i.description, i.created_at, i.closed_at, i.photo_path is not null as photo,
         t.id as tool_id, t.code as tool_code, t.name as tool_name, l.id as location_id, l.name as location_name,
         u.full_name as author, cu.full_name as closed_by, i.tool_working, t.damaged_since is not null as tool_damaged,
         (select count(*) from app.issue_comments c where c.issue_id = i.id)::int as comments,
         (select count(*) from app.issue_entries e where e.issue_id = i.id and e.recipient_id = $1 and e.read_at is null)::int as unread
  from app.issues i
  join app.users u on u.user_id = i.author_id
  left join app.users cu on cu.user_id = i.closed_by
  left join app.tools t on t.id = i.tool_id
  left join app.locations l on l.id = i.location_id
  where ${where}`;

function toSummary(row: IssueRow): IssueSummary {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    description: row.description,
    tool: row.tool_id ? { id: row.tool_id, code: row.tool_code!, name: row.tool_name! } : null,
    location: row.location_id ? { id: row.location_id, name: row.location_name! } : null,
    author: row.author,
    createdAt: new Date(row.created_at),
    closedAt: row.closed_at && new Date(row.closed_at),
    photo: row.photo,
    comments: row.comments,
    unread: row.unread,
  };
}
