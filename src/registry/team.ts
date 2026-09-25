import { RegistryError } from "./errors";
import type { Sql } from "./ports";
import type { Role, Session } from "./registry";
import { EMAIL_PATTERN, UUID_PATTERN } from "./validation";

/** Role, które właściciel nadaje osobom w zespole. */
export type MemberRole = Exclude<Role, "wlasciciel">;

export const MEMBER_ROLES: MemberRole[] = ["kierownik", "magazynier"];

export interface NewMemberInput {
  firstName: string;
  lastName: string;
  email: string;
  role: MemberRole;
}

export interface TeamMember {
  userId: string;
  fullName: string;
  email: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
}

/** Nowa osoba po sprawdzeniu danych. */
export interface NewMember {
  fullName: string;
  email: string;
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
  const email = raw.email.trim().toLowerCase();
  if (!firstName || !lastName || !EMAIL_PATTERN.test(email) || !MEMBER_ROLES.includes(raw.role)) {
    throw new RegistryError("invalid_input");
  }
  return { fullName: `${firstName} ${lastName}`, email, role: raw.role };
}

export async function insertMember(
  sql: Sql,
  session: Session,
  userId: string,
  member: NewMember,
  now: Date,
) {
  await sql(
    `insert into app.users (user_id, company_id, role, full_name, email, must_change_password,
                            temporary_password_issued_at, created_at)
     values ($1, $2, $3, $4, $5, true, $6, $6)`,
    [userId, session.company.id, member.role, member.fullName, member.email, now],
  );
}

/** Zespół firmy: najpierw aktywni, potem według roli i imienia i nazwiska. */
export async function listTeam(sql: Sql): Promise<TeamMember[]> {
  return sql<TeamMember>(
    `select user_id as "userId", full_name as "fullName", email, role, active,
            must_change_password as "mustChangePassword"
     from app.users order by active desc, role, full_name`,
  );
}

/** Aktywny kierownik lub magazynier z firmy aktora; konto właściciela i dezaktywowane są poza zasięgiem. */
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
