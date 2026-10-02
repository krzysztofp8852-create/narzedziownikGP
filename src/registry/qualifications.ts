import { randomUUID } from "node:crypto";
import { MAX_CYCLE_MONTHS } from "./deadlines";
import { isUniqueViolation, RegistryError, ReplayedOperationError } from "./errors";
import { checkDocument } from "./photos";
import type { Sql } from "./ports";
import type { Role, Session } from "./registry";
import { daysBetween, isCalendarDay, UUID_PATTERN, warsawTime } from "./validation";

export const QUALIFICATION_KINDS = [
  "badania_lekarskie",
  "szkolenie_bhp",
  "badania_wysokosc",
  "sep",
  "udt",
  "prawo_jazdy",
  "pierwsza_pomoc",
  "wlasny",
] as const;
/**
 * Rodzaj uprawnienia: badania lekarskie okresowe, szkolenie BHP okresowe, badania do pracy na wysokości, SEP E/D, UDT
 * (z opisem urządzenia), prawo jazdy (z kategorią), kurs pierwszej pomocy albo własny rodzaj firmy.
 */
export type QualificationKind = (typeof QUALIFICATION_KINDS)[number];

/** Badania lekarskie: dane o zdrowiu, więc tylko data ważności, a dokumenty (orzeczenia) widzi tylko właściciel. */
const MEDICAL_KINDS: readonly QualificationKind[] = ["badania_lekarskie", "badania_wysokosc"];
/** Rodzaje, które wymagają opisu: urządzenia UDT i kategorii prawa jazdy. */
const DETAIL_REQUIRED: readonly QualificationKind[] = ["udt", "prawo_jazdy"];
/** Rodzaje z opcjonalnym opisem: grupa SEP. */
const DETAIL_OPTIONAL: readonly QualificationKind[] = ["sep"];

export function isMedicalKind(kind: QualificationKind) {
  return MEDICAL_KINDS.includes(kind);
}

/** Czy rodzaj ma opis: `wymagany` (UDT, prawo jazdy), `opcjonalny` (SEP) albo żadnego. */
export function detailOf(kind: QualificationKind): "wymagany" | "opcjonalny" | null {
  if (DETAIL_REQUIRED.includes(kind)) return "wymagany";
  return DETAIL_OPTIONAL.includes(kind) ? "opcjonalny" : null;
}

/** Notatki nie mają badania lekarskie: zapisujemy z nich tylko datę. */
export function hasNote(kind: QualificationKind) {
  return !isMedicalKind(kind);
}

export const MAX_QUALIFICATION_DETAIL_LENGTH = 100;
export const MAX_QUALIFICATION_NOTE_LENGTH = 200;
export const MAX_QUALIFICATION_KIND_NAME_LENGTH = 100;
const MAX_DOCUMENT_NAME_LENGTH = 200;

/** Uprawnienie jest „wkrótce”, gdy do końca ważności zostało najwyżej tyle dni; tyle obejmuje też raport tygodniowy. */
export const UPCOMING_QUALIFICATION_DAYS = 30;

/** Stan uprawnienia w danym dniu: po terminie, w najbliższych 30 dniach albo później. */
export type QualificationStatus = "po_terminie" | "wkrotce" | "pozniej";

/** Własny rodzaj uprawnienia firmy, np. „Operator koparki”. */
export interface CustomQualificationKind {
  id: string;
  name: string;
}

export interface NewQualificationInput {
  personId: string;
  kind: QualificationKind;
  /** Własny rodzaj firmy; tylko przy rodzaju `wlasny`. */
  customKindId?: string | null;
  /** UDT: urządzenie, prawo jazdy: kategoria (oba wymagane), SEP: grupa (opcjonalnie). */
  detail?: string | null;
  /** Ważne do (RRRR-MM-DD). */
  dueOn: string;
  /** Co ile miesięcy (1–120). */
  cycleMonths?: number | null;
  /** Bez notatki przy badaniach lekarskich. */
  note?: string | null;
}

/** Zmiany uprawnienia: pominięte pola zostają, null (i pusty tekst) czyści pole. Rodzaju ani osoby się nie zmienia. */
export interface QualificationChanges {
  dueOn?: string;
  cycleMonths?: number | null;
  note?: string | null;
  detail?: string | null;
}

/** Plik dokumentu uprawnienia z nazwą, pod którą go pokazujemy. */
export interface NewQualificationDocument {
  /** PDF albo zdjęcie JPG, PNG, WEBP do 4 MB. */
  file: Blob;
  fileName: string;
}

export interface AddQualificationDocumentInput extends NewQualificationDocument {
  /** Identyfikator operacji klienta: ponowne wysłanie zwraca pierwotny dokument. */
  operationId: string;
  qualificationId: string;
}

/** Odnowione uprawnienie: szkolenie, badanie albo egzamin się odbyły. */
export interface CompleteQualificationInput {
  /** Identyfikator operacji klienta: ponowne wysłanie niczego nie zmienia. */
  operationId: string;
  qualificationId: string;
  /** Dzień wykonania (RRRR-MM-DD), najpóźniej dziś w Polsce. */
  doneOn: string;
  /** Nowa data ważności, późniejsza niż wykonanie; bez niej liczy się z cyklu, a bez cyklu jest wymagana. */
  nextDueOn?: string | null;
  /** Np. zaświadczenie ze szkolenia; przy badaniach lekarskich tylko właściciel. */
  document?: NewQualificationDocument | null;
}

/** Dokument przy uprawnieniu: zdjęcie albo PDF. Dokumenty badań lekarskich widzi tylko właściciel. */
export interface QualificationDocument {
  id: string;
  fileName: string;
  contentType: string;
  uploadedAt: Date;
  /** Kto dołączył. */
  uploadedBy: string;
}

/** Uprawnienie przy osobie. */
export interface Qualification {
  id: string;
  kind: QualificationKind;
  customKind: CustomQualificationKind | null;
  detail: string | null;
  /** Ważne do (RRRR-MM-DD). */
  dueOn: string;
  /** Ile dni do końca ważności w Polsce (0 = dziś, ujemne po terminie). */
  daysLeft: number;
  status: QualificationStatus;
  cycleMonths: number | null;
  note: string | null;
  /** Kiedy ostatnio odnowiono (RRRR-MM-DD). */
  lastDoneOn: string | null;
  documents: QualificationDocument[];
}

/** Osoba z kartoteki z jej uprawnieniami. */
export interface PersonQualifications {
  person: { id: string; fullName: string; active: boolean; /** Rola konta; null bez konta. */ role: Role | null };
  /** Od najwcześniej kończącego się. */
  qualifications: Qualification[];
}

/** Uprawnienie z osobą: w przypomnieniu w dzwonku (30 dni przed albo po terminie). */
export interface NotifiedQualification {
  id: string;
  kind: QualificationKind;
  customKind: CustomQualificationKind | null;
  detail: string | null;
  /** RRRR-MM-DD. */
  dueOn: string;
  overdue: boolean;
  person: { id: string; fullName: string };
}

/** Uprawnienie z najbliższych 30 dni albo po terminie: na liście Ludzie i w raporcie tygodniowym. */
export interface UpcomingQualification extends NotifiedQualification {
  /** Ile dni do końca ważności w Polsce (ujemne po terminie). */
  daysLeft: number;
}

/** Uprawnienie aktywnej osoby z kontem tej osoby (adresat przypomnienia o własnym uprawnieniu). */
export interface ScheduledQualification extends Omit<NotifiedQualification, "overdue"> {
  account: { userId: string; fullName: string; role: Role; active: boolean } | null;
}

/** Plik do zapisania w kubełku dokumentów przed zatwierdzeniem transakcji. */
export interface QualificationDocumentFile {
  key: string;
  blob: Blob;
}

/** Uprawnienia wpisują, zmieniają i odnawiają właściciel i kierownik (sam wysyła ludzi na szkolenia). */
export function canManageQualifications(session: Session) {
  return session.role === "wlasciciel" || session.role === "kierownik";
}

/** Własne rodzaje uprawnień firmy dodaje właściciel. */
export function canAddQualificationKinds(session: Session) {
  return session.role === "wlasciciel";
}

/** Uprawnienia i ich dokumenty usuwa właściciel. */
export function canDeleteQualifications(session: Session) {
  return session.role === "wlasciciel";
}

/** Dokument dołącza właściciel, a kierownik poza badaniami lekarskimi (orzeczenia widzi tylko właściciel). */
export function canAttachQualificationDocument(session: Session, kind: QualificationKind) {
  return session.role === "wlasciciel" || (session.role === "kierownik" && !isMedicalKind(kind));
}

function requireManager(session: Session) {
  if (!canManageQualifications(session)) throw new RegistryError("forbidden");
}

function requireOwner(session: Session) {
  if (!canDeleteQualifications(session)) throw new RegistryError("forbidden");
}

/** Stan uprawnienia ważnego do `dueOn` w dniu `today` (oba RRRR-MM-DD) i ile dni zostało. */
export function qualificationStatus(dueOn: string, today: string): { status: QualificationStatus; daysLeft: number } {
  const daysLeft = daysBetween(today, dueOn);
  if (daysLeft < 0) return { status: "po_terminie", daysLeft };
  return { status: daysLeft <= UPCOMING_QUALIFICATION_DAYS ? "wkrotce" : "pozniej", daysLeft };
}

/** Własne rodzaje uprawnień firmy aktora, po nazwie. */
export async function qualificationKinds(sql: Sql): Promise<CustomQualificationKind[]> {
  return sql<CustomQualificationKind>("select id, name from app.qualification_kinds order by lower(name), id");
}

/** Nowy własny rodzaj uprawnienia firmy. Tylko właściciel; ta sama nazwa (bez względu na wielkość liter) drugi raz nie. */
export async function addQualificationKind(sql: Sql, session: Session, input: { name: string }, now: Date): Promise<{ kindId: string }> {
  if (!canAddQualificationKinds(session)) throw new RegistryError("forbidden");
  const name = String(input.name ?? "").trim();
  if (!name || name.length > MAX_QUALIFICATION_KIND_NAME_LENGTH) throw new RegistryError("invalid_input");
  const [row] = await sql<{ id: string }>("insert into app.qualification_kinds (company_id, name, created_at) values ($1, $2, $3) returning id", [
    session.company.id,
    name,
    now,
  ]).catch((error) => {
    throw isUniqueViolation(error, "qualification_kinds_name_per_company") ? new RegistryError("qualification_kind_taken") : error;
  });
  return { kindId: row.id };
}

/** Osoba z jej uprawnieniami, jeśli aktor ją widzi (właściciel i kierownik każdą, inni tylko siebie); inaczej null. */
export async function personQualifications(sql: Sql, personId: string, now: Date): Promise<PersonQualifications | null> {
  if (!UUID_PATTERN.test(personId)) return null;
  const [entry] = await withQualifications(sql, await peopleRows(sql, { personId }), now);
  return entry ?? null;
}

/** Aktywne osoby, które aktor widzi, z uprawnieniami, po imieniu i nazwisku. */
export async function peopleQualifications(sql: Sql, now: Date): Promise<PersonQualifications[]> {
  return withQualifications(sql, await peopleRows(sql, { personId: null }), now);
}

async function peopleRows(sql: Sql, { personId }: { personId: string | null }) {
  return sql<{ id: string; full_name: string; active: boolean; role: Role | null }>(
    `select p.id, p.full_name, p.active, u.role
     from app.people p left join app.users u on u.user_id = p.user_id
     where ($1::uuid is null and p.active) or p.id = $1
     order by p.full_name, p.created_at`,
    [personId],
  );
}

async function withQualifications(
  sql: Sql,
  people: { id: string; full_name: string; active: boolean; role: Role | null }[],
  now: Date,
): Promise<PersonQualifications[]> {
  if (people.length === 0) return [];
  const personIds = people.map((person) => person.id);
  const rows = await sql<{
    id: string;
    person_id: string;
    kind: QualificationKind;
    custom_kind_id: string | null;
    custom_kind_name: string | null;
    detail: string | null;
    due_on: string;
    cycle_months: number | null;
    note: string | null;
    last_done_on: string | null;
  }>(
    `select q.id, q.person_id, q.kind, k.id as custom_kind_id, k.name as custom_kind_name, q.detail,
            to_char(q.due_on, 'YYYY-MM-DD') as due_on, q.cycle_months, q.note, to_char(q.last_done_on, 'YYYY-MM-DD') as last_done_on
     from app.qualifications q left join app.qualification_kinds k on k.id = q.custom_kind_id
     where q.person_id = any($1::uuid[])
     order by q.due_on, array_position($2::text[], q.kind), q.created_at`,
    [personIds, QUALIFICATION_KINDS],
  );
  const documents = await sql<{ id: string; qualification_id: string; file_name: string; content_type: string; uploaded_at: Date; uploaded_by: string }>(
    `select d.id, d.qualification_id, d.file_name, d.content_type, d.uploaded_at, u.full_name as uploaded_by
     from app.qualification_documents d
     join app.qualifications q on q.id = d.qualification_id
     join app.users u on u.user_id = d.uploaded_by
     where q.person_id = any($1::uuid[])
     order by d.sequence_number`,
    [personIds],
  );
  const today = warsawTime(now).day;
  const documentsOf = Map.groupBy(documents, (document) => document.qualification_id);
  const qualificationsOf = Map.groupBy(
    rows.map((row) => ({
      personId: row.person_id,
      qualification: {
        id: row.id,
        kind: row.kind,
        customKind: customKind(row),
        detail: row.detail,
        dueOn: row.due_on,
        ...qualificationStatus(row.due_on, today),
        cycleMonths: row.cycle_months,
        note: row.note,
        lastDoneOn: row.last_done_on,
        documents: (documentsOf.get(row.id) ?? []).map((document) => ({
          id: document.id,
          fileName: document.file_name,
          contentType: document.content_type,
          uploadedAt: new Date(document.uploaded_at),
          uploadedBy: document.uploaded_by,
        })),
      } satisfies Qualification,
    })),
    (entry) => entry.personId,
  );
  return people.map((person) => ({
    person: { id: person.id, fullName: person.full_name, active: person.active, role: person.role },
    qualifications: (qualificationsOf.get(person.id) ?? []).map((entry) => entry.qualification),
  }));
}

function customKind(row: { custom_kind_id: string | null; custom_kind_name: string | null }): CustomQualificationKind | null {
  return row.custom_kind_id && row.custom_kind_name ? { id: row.custom_kind_id, name: row.custom_kind_name } : null;
}

/** Nowe uprawnienie aktywnej osoby. Właściciel i kierownik; drugie tego samego rodzaju (i opisu): `qualification_taken`. */
export async function addQualification(sql: Sql, session: Session, input: NewQualificationInput, now: Date): Promise<{ qualificationId: string }> {
  requireManager(session);
  if (!QUALIFICATION_KINDS.includes(input.kind)) throw new RegistryError("invalid_input");
  const customKindId = input.customKindId ?? null;
  if ((input.kind === "wlasny") !== (customKindId !== null) || typeof input.dueOn !== "string") throw new RegistryError("invalid_input");
  const fields = checkChanges(input.kind, {
    dueOn: input.dueOn,
    cycleMonths: input.cycleMonths ?? null,
    note: input.note ?? null,
    detail: input.detail ?? null,
  });
  const [person] = UUID_PATTERN.test(input.personId) ? await sql<{ active: boolean }>("select active from app.people where id = $1", [input.personId]) : [];
  if (!person) throw new RegistryError("not_found");
  if (!person.active) throw new RegistryError("forbidden");
  if (customKindId !== null) {
    const [kind] = UUID_PATTERN.test(customKindId) ? await sql("select 1 from app.qualification_kinds where id = $1", [customKindId]) : [];
    if (!kind) throw new RegistryError("not_found");
  }
  const [row] = await sql<{ id: string }>(
    `insert into app.qualifications (company_id, person_id, kind, custom_kind_id, detail, due_on, cycle_months, note, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [session.company.id, input.personId, input.kind, customKindId, fields.detail, fields.dueOn, fields.cycleMonths, fields.note, now],
  ).catch((error) => {
    throw isUniqueViolation(error, "qualifications_kind_per_person") ? new RegistryError("qualification_taken") : error;
  });
  return { qualificationId: row.id };
}

/** Zmienia datę, cykl, notatkę albo opis uprawnienia. Właściciel i kierownik. */
export async function updateQualification(sql: Sql, session: Session, qualificationId: string, changes: QualificationChanges): Promise<void> {
  requireManager(session);
  const qualification = await findQualification(sql, qualificationId);
  const fields = checkChanges(qualification.kind, changes);
  const columns = (["dueOn", "cycleMonths", "note", "detail"] as const)
    .filter((field) => fields[field] !== undefined)
    .map((field) => [{ dueOn: "due_on", cycleMonths: "cycle_months", note: "note", detail: "detail" }[field], fields[field]] as const);
  if (columns.length === 0) return;
  await sql(
    `update app.qualifications set ${columns.map(([column], i) => `${column} = $${i + 2}`).join(", ")} where id = $1`,
    [qualificationId, ...columns.map(([, value]) => value)],
  ).catch((error) => {
    throw isUniqueViolation(error, "qualifications_kind_per_person") ? new RegistryError("qualification_taken") : error;
  });
}

/** Usuwa uprawnienie z dokumentami. Tylko właściciel. Zwraca klucze plików do usunięcia z kubełka. */
export async function deleteQualification(sql: Sql, session: Session, qualificationId: string): Promise<{ fileKeys: string[] }> {
  requireOwner(session);
  await findQualification(sql, qualificationId);
  const files = await sql<{ file_path: string }>("select file_path from app.qualification_documents where qualification_id = $1", [qualificationId]);
  const deleted = await sql("delete from app.qualifications where id = $1 returning id", [qualificationId]);
  if (deleted.length === 0) throw new RegistryError("not_found");
  return { fileKeys: files.map((file) => file.file_path) };
}

/**
 * Wpisuje odnowienie: nowa data ważności to podana albo dzień wykonania plus cykl (bez cyklu trzeba ją podać).
 * Właściciel i kierownik, a dokument badań lekarskich tylko właściciel. Ponowne wysłanie tej samej operacji zwraca
 * bieżącą datę. Zwraca nową datę i plik dołączonego dokumentu do zapisania w kubełku.
 */
export async function completeQualification(
  sql: Sql,
  session: Session,
  input: CompleteQualificationInput,
  now: Date,
): Promise<{ dueOn: string; file: QualificationDocumentFile | null }> {
  requireManager(session);
  if (!UUID_PATTERN.test(input.operationId)) throw new RegistryError("invalid_input");
  const day = (value: unknown) => typeof value === "string" && isCalendarDay(value);
  if (!day(input.doneOn) || input.doneOn > warsawTime(now).day) throw new RegistryError("invalid_input");
  const nextDueOn = input.nextDueOn ?? null;
  if (nextDueOn !== null && (!day(nextDueOn) || nextDueOn <= input.doneOn)) throw new RegistryError("invalid_input");
  const qualification = await findQualification(sql, input.qualificationId);
  if (input.document) checkDocumentFields(session, qualification.kind, input.document);
  // Ponowne wysłanie tego samego wykonania zwraca bieżącą datę: nie cofa zmian, które zaszły od tamtej pory.
  if (qualification.lastDoneOperationId === input.operationId) return { dueOn: qualification.dueOn, file: null };
  if (nextDueOn === null && qualification.cycleMonths === null) throw new RegistryError("invalid_input");
  const [row] = await sql<{ due_on: string }>(
    `update app.qualifications
     set last_done_on = $2, last_done_by = $3, last_done_operation_id = $4,
         due_on = coalesce($5::date, ($2::date + make_interval(months => cycle_months))::date)
     where id = $1
     returning to_char(due_on, 'YYYY-MM-DD') as due_on`,
    [input.qualificationId, input.doneOn, session.userId, input.operationId, nextDueOn],
  );
  // Uprawnienie usunięte w równoległej transakcji już po sprawdzeniu.
  if (!row) throw new RegistryError("not_found");
  const added = input.document
    ? await addQualificationDocument(sql, session, { ...input.document, operationId: input.operationId, qualificationId: input.qualificationId }, now)
    : null;
  return { dueOn: row.due_on, file: added?.file ?? null };
}

/**
 * Dołącza dokument do uprawnienia. Właściciel, a kierownik bez badań lekarskich. Zwraca plik do zapisania w kubełku
 * (null przy ponowieniu tej samej operacji).
 */
export async function addQualificationDocument(
  sql: Sql,
  session: Session,
  input: AddQualificationDocumentInput,
  now: Date,
): Promise<{ documentId: string; file: QualificationDocumentFile | null }> {
  requireManager(session);
  if (!UUID_PATTERN.test(input.operationId)) throw new RegistryError("invalid_input");
  const qualification = await findQualification(sql, input.qualificationId);
  const fileName = checkDocumentFields(session, qualification.kind, input);
  const [done] = await sql<{ id: string }>("select id from app.qualification_documents where client_operation_id = $1", [input.operationId]);
  if (done) return { documentId: done.id, file: null };

  const checked = await checkDocument(input.file);
  const documentId = randomUUID();
  const key = `${session.company.id}/uprawnienia/${documentId}.${checked.extension}`;
  await sql(
    `insert into app.qualification_documents
       (id, company_id, qualification_id, file_path, file_name, content_type, uploaded_by, uploaded_at, client_operation_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [documentId, session.company.id, input.qualificationId, key, fileName, checked.blob.type, session.userId, now, input.operationId],
  ).catch((error) => {
    throw isUniqueViolation(error, "qualification_documents_operation_per_company") ? new ReplayedOperationError() : error;
  });
  return { documentId, file: { key, blob: checked.blob } };
}

/** Usuwa dokument uprawnienia. Tylko właściciel. Zwraca klucz pliku do usunięcia z kubełka. */
export async function deleteQualificationDocument(sql: Sql, session: Session, documentId: string): Promise<{ fileKeys: string[] }> {
  requireOwner(session);
  const [row] = UUID_PATTERN.test(documentId)
    ? await sql<{ file_path: string }>("delete from app.qualification_documents where id = $1 returning file_path", [documentId])
    : [];
  if (!row) throw new RegistryError("not_found");
  return { fileKeys: [row.file_path] };
}

/** Plik dokumentu, który aktor widzi (orzeczenia tylko właściciel), z nazwą; null, gdy go nie widzi. */
export async function visibleQualificationDocument(sql: Sql, documentId: string): Promise<{ key: string; fileName: string } | null> {
  if (!UUID_PATTERN.test(documentId)) return null;
  const [row] = await sql<{ file_path: string; file_name: string }>("select file_path, file_name from app.qualification_documents where id = $1", [
    documentId,
  ]);
  return row ? { key: row.file_path, fileName: row.file_name } : null;
}

/**
 * Uprawnienia aktywnych osób z datą najpóźniej `withinDays` dni po `today` (RRRR-MM-DD), także po terminie, od
 * najwcześniejszego: te, które aktor widzi (RLS), albo, w transakcji systemowej, we wskazanej firmie.
 */
export async function scheduledQualifications(
  sql: Sql,
  { today, withinDays, companyId = null }: { today: string; withinDays: number; companyId?: string | null },
): Promise<ScheduledQualification[]> {
  const rows = await sql<{
    id: string;
    kind: QualificationKind;
    custom_kind_id: string | null;
    custom_kind_name: string | null;
    detail: string | null;
    due_on: string;
    person_id: string;
    person_name: string;
    user_id: string | null;
    role: Role | null;
    account_active: boolean | null;
  }>(
    `select q.id, q.kind, k.id as custom_kind_id, k.name as custom_kind_name, q.detail, to_char(q.due_on, 'YYYY-MM-DD') as due_on,
            p.id as person_id, p.full_name as person_name, u.user_id, u.role, u.active as account_active
     from app.qualifications q
     join app.people p on p.id = q.person_id
     left join app.qualification_kinds k on k.id = q.custom_kind_id
     left join app.users u on u.user_id = p.user_id
     where p.active and q.due_on <= $1::date + $2::int and ($3::uuid is null or q.company_id = $3)`,
    [today, withinDays, companyId],
  );
  return rows
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      customKind: customKind(row),
      detail: row.detail,
      dueOn: row.due_on,
      person: { id: row.person_id, fullName: row.person_name },
      account: row.user_id && row.role ? { userId: row.user_id, fullName: row.person_name, role: row.role, active: row.account_active === true } : null,
    }))
    .sort(
      (a, b) =>
        a.dueOn.localeCompare(b.dueOn) ||
        a.person.fullName.localeCompare(b.person.fullName, "pl") ||
        QUALIFICATION_KINDS.indexOf(a.kind) - QUALIFICATION_KINDS.indexOf(b.kind),
    );
}

/** Uprawnienia aktywnych osób z najbliższych 30 dni (w Polsce) i po terminie, które aktor widzi, od najwcześniejszego. */
export async function upcomingQualifications(sql: Sql, now: Date): Promise<UpcomingQualification[]> {
  const today = warsawTime(now).day;
  return (await scheduledQualifications(sql, { today, withinDays: UPCOMING_QUALIFICATION_DAYS })).map(({ id, kind, customKind, detail, dueOn, person }) => {
    const { status, daysLeft } = qualificationStatus(dueOn, today);
    return { id, kind, customKind, detail, dueOn, person, daysLeft, overdue: status === "po_terminie" };
  });
}

/** Uprawnienie, które aktor widzi; inaczej `not_found`. */
async function findQualification(sql: Sql, qualificationId: string) {
  const [row] = UUID_PATTERN.test(qualificationId)
    ? await sql<{ kind: QualificationKind; due_on: string; cycle_months: number | null; last_done_operation_id: string | null }>(
        "select kind, to_char(due_on, 'YYYY-MM-DD') as due_on, cycle_months, last_done_operation_id from app.qualifications where id = $1",
        [qualificationId],
      )
    : [];
  if (!row) throw new RegistryError("not_found");
  return { kind: row.kind, dueOn: row.due_on, cycleMonths: row.cycle_months, lastDoneOperationId: row.last_done_operation_id };
}

/** Sprawdza uprawnienie i nazwę dokumentu (bez pliku); zwraca nazwę bez spacji na brzegach. */
function checkDocumentFields(session: Session, kind: QualificationKind, document: Pick<NewQualificationDocument, "fileName">): string {
  if (!canAttachQualificationDocument(session, kind)) throw new RegistryError("forbidden");
  const fileName = typeof document.fileName === "string" ? document.fileName.trim() : "";
  if (!fileName || fileName.length > MAX_DOCUMENT_NAME_LENGTH) throw new RegistryError("invalid_input");
  return fileName;
}

/**
 * Sprawdza i porządkuje podane pola uprawnienia danego rodzaju: data RRRR-MM-DD, cykl 1–120 miesięcy, notatka do 200
 * znaków (przy badaniach żadna), opis do 100 znaków tylko tam, gdzie rodzaj go ma (UDT i prawo jazdy go wymagają).
 * Pusty tekst to brak. Pól nieobecnych nie dotyka.
 */
function checkChanges(kind: QualificationKind, changes: QualificationChanges): QualificationChanges {
  const invalid = () => new RegistryError("invalid_input");
  const fields: QualificationChanges = {};
  if (changes.dueOn !== undefined) {
    if (typeof changes.dueOn !== "string" || !isCalendarDay(changes.dueOn)) throw invalid();
    fields.dueOn = changes.dueOn;
  }
  if (changes.cycleMonths !== undefined) {
    const cycle = changes.cycleMonths;
    if (cycle !== null && !(Number.isInteger(cycle) && cycle >= 1 && cycle <= MAX_CYCLE_MONTHS)) throw invalid();
    fields.cycleMonths = cycle;
  }
  if (changes.note !== undefined) {
    const note = changes.note?.trim() || null;
    if (note && (note.length > MAX_QUALIFICATION_NOTE_LENGTH || !hasNote(kind))) throw invalid();
    fields.note = note;
  }
  if (changes.detail !== undefined) {
    const detail = changes.detail?.trim() || null;
    const rule = detailOf(kind);
    if (detail && (detail.length > MAX_QUALIFICATION_DETAIL_LENGTH || rule === null)) throw invalid();
    if (!detail && rule === "wymagany") throw invalid();
    fields.detail = detail;
  }
  return fields;
}
