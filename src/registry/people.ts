import { randomUUID } from "node:crypto";
import * as changeLog from "./change-log";
import { RegistryError } from "./errors";
import type { Sql } from "./ports";
import type { Role, Session } from "./registry";
import { UUID_PATTERN } from "./validation";

export const MAX_PERSON_NAME_LENGTH = 100;
export const MAX_PERSON_NOTE_LENGTH = 500;

/** Konto osoby z kartoteki. */
export interface PersonAccount {
  userId: string;
  /** Null u pracownika, który nie podał e-maila. */
  email: string | null;
  /** Tylko pracownik. */
  username: string | null;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
}

/** Osoba z kartoteki Ludzie: z kontem w programie albo bez niego. */
export interface Person {
  personId: string;
  fullName: string;
  note: string | null;
  active: boolean;
  /** Null, gdy osoba nie ma konta. */
  account: PersonAccount | null;
}

export interface NewPersonInput {
  fullName: string;
  note: string | null;
}

/** Imię i nazwisko i notatka po sprawdzeniu; pusta notatka to jej brak. */
export function normalizePerson(raw: NewPersonInput): NewPersonInput {
  const fullName = String(raw.fullName ?? "").trim();
  const note = String(raw.note ?? "").trim() || null;
  if (!fullName || fullName.length > MAX_PERSON_NAME_LENGTH || (note !== null && note.length > MAX_PERSON_NOTE_LENGTH)) {
    throw new RegistryError("invalid_input");
  }
  return { fullName, note };
}

/** Kartoteka firmy: najpierw aktywni, potem według imienia i nazwiska. */
export async function listPeople(sql: Sql): Promise<Person[]> {
  return sql<Person>(
    `select p.id as "personId", p.full_name as "fullName", p.note, p.active,
            case when u.user_id is null then null else json_build_object(
              'userId', u.user_id, 'email', u.email, 'username', u.username, 'role', u.role, 'active', u.active,
              'mustChangePassword', u.must_change_password
            ) end as account
     from app.people p left join app.users u on u.user_id = p.user_id
     order by p.active desc, p.full_name, p.created_at`,
  );
}

/**
 * Nowa osoba w firmie `companyId`, z kontem `userId` albo bez. Identyfikator nadajemy sami: super-admin zakładający
 * firmę dopisuje osobę właściciela, ale kartoteki nie czyta, więc nie dostałby go z powrotem z bazy.
 */
export async function insertPerson(sql: Sql, companyId: string, person: NewPersonInput, now: Date, userId: string | null = null) {
  const personId = randomUUID();
  await sql("insert into app.people (id, company_id, full_name, note, user_id, created_at) values ($1, $2, $3, $4, $5, $6)", [
    personId,
    companyId,
    person.fullName,
    person.note,
    userId,
    now,
  ]);
  return personId;
}

/** Osoba z firmy aktora, z kontem, jeśli je ma; brak (albo zły identyfikator) to `not_found`. */
export async function requirePerson(sql: Sql, personId: string) {
  const [person] = UUID_PATTERN.test(personId)
    ? await sql<{ fullName: string; active: boolean; userId: string | null }>(
        `select full_name as "fullName", active, user_id as "userId" from app.people where id = $1 for update`,
        [personId],
      )
    : [];
  if (!person) throw new RegistryError("not_found");
  return person;
}

/** Aktywna osoba bez konta, której można je założyć; inna to `forbidden`. */
export async function requireAccountlessPerson(sql: Sql, personId: string) {
  const person = await requirePerson(sql, personId);
  if (!person.active || person.userId !== null) throw new RegistryError("forbidden");
  return person;
}

export async function updatePerson(sql: Sql, personId: string, person: NewPersonInput) {
  await sql("update app.people set full_name = $2, note = $3 where id = $1", [personId, person.fullName, person.note]);
}

/** Podpina nowe konto do osoby bez konta; gdy ktoś zdążył ją zmienić, `forbidden`. */
export async function linkAccount(sql: Sql, personId: string, userId: string) {
  const linked = await sql("update app.people set user_id = $2 where id = $1 and user_id is null and active returning id", [personId, userId]);
  if (linked.length === 0) throw new RegistryError("forbidden");
}

/** Osoba bez konta odchodzi z firmy; trafia to do dziennika zmian. */
export async function deactivatePerson(sql: Sql, session: Session, personId: string, now: Date) {
  const [person] = await sql<{ full_name: string }>("update app.people set active = false where id = $1 returning full_name", [personId]);
  await changeLog.recordChange(sql, session.company.id, { kind: "osoba_dezaktywowana", personName: person.full_name }, now);
}

/** Osoba konta przestaje być aktywna razem z nim. */
export async function deactivatePersonOfAccount(sql: Sql, userId: string) {
  await sql("update app.people set active = false where user_id = $1", [userId]);
}
