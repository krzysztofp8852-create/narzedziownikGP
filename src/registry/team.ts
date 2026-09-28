import { randomUUID } from "node:crypto";
import { RegistryError } from "./errors";
import type { Sql } from "./ports";
import type { Role, Session } from "./registry";
import { isUniqueViolation } from "./tools";
import { EMAIL_PATTERN, UUID_PATTERN } from "./validation";

/** Role, które właściciel nadaje osobom w zespole. */
export type MemberRole = Exclude<Role, "wlasciciel">;

export const MEMBER_ROLES: MemberRole[] = ["kierownik", "magazynier", "pracownik"];

/**
 * Nazwa użytkownika pracownika: małe litery bez polskich znaków, cyfry, kropka, podkreślnik i łącznik,
 * od litery lub cyfry, 2–32 znaki (np. `jan.kowalski`). Bez „@”, więc przy logowaniu nie myli się z e-mailem.
 */
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,31}$/;

/**
 * Domena technicznych adresów kont logowania pracowników bez e-maila. Adres widzi tylko Supabase Auth;
 * nic na niego nie wysyłamy.
 */
const TECHNICAL_EMAIL_DOMAIN = "pracownicy.narzedziownik.gp-engineering.pl";

export interface NewMemberInput {
  firstName: string;
  lastName: string;
  /** Wymagany poza pracownikiem; pracownik może go nie mieć (pusty). */
  email: string;
  /** Tylko i zawsze pracownik: nazwa użytkownika do logowania, unikalna w firmie. */
  username?: string;
  role: MemberRole;
}

export interface TeamMember {
  userId: string;
  fullName: string;
  /** Null u pracownika, który nie podał e-maila. */
  email: string | null;
  /** Tylko pracownik. */
  username: string | null;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
}

/** Dodana osoba z hasłem tymczasowym do przekazania osobiście (pokazywanym tylko raz). */
export interface AddedMember {
  userId: string;
  fullName: string;
  email: string | null;
  username: string | null;
  temporaryPassword: string;
}

/** Nowa osoba po sprawdzeniu danych. */
export interface NewMember {
  fullName: string;
  email: string | null;
  username: string | null;
  role: MemberRole;
}

export function canManageTeam(session: Session) {
  return session.role === "wlasciciel";
}

export function requireTeamManager(session: Session) {
  if (!canManageTeam(session)) throw new RegistryError("forbidden");
}

export function normalizeNewMember(raw: NewMemberInput): NewMember {
  const firstName = raw.firstName.trim();
  const lastName = raw.lastName.trim();
  const email = raw.email.trim().toLowerCase() || null;
  const username = raw.username?.trim().toLowerCase() || null;
  const worker = raw.role === "pracownik";
  if (
    !firstName ||
    !lastName ||
    !MEMBER_ROLES.includes(raw.role) ||
    (email === null ? !worker : !EMAIL_PATTERN.test(email)) ||
    (username === null ? worker : !worker || !USERNAME_PATTERN.test(username))
  ) {
    throw new RegistryError("invalid_input");
  }
  return { fullName: `${firstName} ${lastName}`, email, username, role: raw.role };
}

/** Nazwa użytkownika, której firma aktora jeszcze nie nadała; zajęta to `username_taken`. */
export async function requireFreeUsername(sql: Sql, username: string | null) {
  if (username === null) return;
  const [taken] = await sql("select 1 from app.users where username = $1", [username]);
  if (taken) throw new RegistryError("username_taken");
}

/** Adres konta logowania: e-mail osoby, a pracownika bez e-maila techniczny, nie do zgadnięcia. */
export function accountEmail(member: NewMember) {
  return member.email ?? `${randomUUID()}@${TECHNICAL_EMAIL_DOMAIN}`;
}

/**
 * Adresy kont logowania, na które można się zalogować tym loginem: e-mail to on sam, a nazwa użytkownika
 * prowadzi do kont pracowników, którym ją nadano (w każdej firmie, także dezaktywowanych, żeby logowanie
 * mogło powiedzieć o blokadzie). Transakcja systemowa: logujący się nie ma jeszcze sesji.
 */
export async function signInEmails(sql: Sql, login: string): Promise<string[]> {
  const normalized = login.trim().toLowerCase();
  if (EMAIL_PATTERN.test(normalized)) return [normalized];
  if (!USERNAME_PATTERN.test(normalized)) return [];
  const rows = await sql<{ email: string }>(
    `select a.email from app.users u join auth.users a on a.id = u.user_id
     where u.username = $1 order by u.active desc, u.created_at`,
    [normalized],
  );
  return rows.map((row) => row.email);
}

export async function insertMember(
  sql: Sql,
  session: Session,
  userId: string,
  member: NewMember,
  now: Date,
) {
  try {
    await sql(
      `insert into app.users (user_id, company_id, role, full_name, email, username, must_change_password,
                              temporary_password_issued_at, created_at)
       values ($1, $2, $3, $4, $5, $6, true, $7, $7)`,
      [userId, session.company.id, member.role, member.fullName, member.email, member.username, now],
    );
  } catch (error) {
    // Równolegle dodana osoba zajęła tę nazwę po naszym sprawdzeniu.
    throw isUniqueViolation(error, "users_username_per_company") ? new RegistryError("username_taken") : error;
  }
}

/** Zespół firmy: najpierw aktywni, potem według roli i imienia i nazwiska. */
export async function listTeam(sql: Sql): Promise<TeamMember[]> {
  return sql<TeamMember>(
    `select user_id as "userId", full_name as "fullName", email, username, role, active,
            must_change_password as "mustChangePassword"
     from app.users order by active desc, role, full_name`,
  );
}

/** Aktywny kierownik, magazynier lub pracownik z firmy aktora; konto właściciela i dezaktywowane są poza zasięgiem. */
export async function requireManagedMember(sql: Sql, memberId: string) {
  const [member] = UUID_PATTERN.test(memberId)
    ? await sql<{ role: Role; active: boolean }>("select role, active from app.users where user_id = $1", [memberId])
    : [];
  if (!member) throw new RegistryError("not_found");
  if (member.role === "wlasciciel" || !member.active) throw new RegistryError("forbidden");
}

/** Nowe hasło tymczasowe: osoba znowu musi ustawić własne, i to w sesji zalogowanej od teraz. */
export async function markPasswordTemporary(sql: Sql, memberId: string, now: Date) {
  await sql("update app.users set must_change_password = true, temporary_password_issued_at = $2 where user_id = $1", [
    memberId,
    now,
  ]);
}

export async function deactivate(sql: Sql, memberId: string) {
  await sql("update app.users set active = false where user_id = $1", [memberId]);
}
