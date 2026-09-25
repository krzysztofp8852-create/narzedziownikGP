import { RegistryError } from "./errors";
import { type AuthAdmin, type Clock, type Db, EmailTakenError, type Sql } from "./ports";
import { generateTemporaryPassword } from "./temporary-password";

export type Role = "wlasciciel" | "magazynier" | "kierownik";

export interface Session {
  userId: string;
  fullName: string;
  role: Role;
  mustChangePassword: boolean;
  company: { id: string; name: string };
}

export interface CreateCompanyInput {
  name: string;
  baseName: string;
  owner: { email: string; fullName: string };
}

export interface CreatedCompany {
  companyId: string;
  ownerUserId: string;
  temporaryPassword: string;
}

export interface Registry {
  /** Aktor systemowy: skrypty i zadania harmonogramu, poza RLS. */
  system(): { createCompany(input: CreateCompanyInput): Promise<CreatedCompany> };
  /** Zalogowany użytkownik; firmę i rolę Rejestr ustala sam, a RLS ich pilnuje. */
  as(userId: string): {
    /** Tylko super-admin. */
    createCompany(input: CreateCompanyInput): Promise<CreatedCompany>;
    session(): Promise<Session | null>;
    changePassword(newPassword: string): Promise<void>;
    whereIsWhat(): Promise<WhereIsWhat>;
  };
}

/** Narzędzie widoczne na tablicy. Pola dojdą razem z kartą narzędzia. */
export type ToolOnBoard = never;

export interface WhereIsWhat {
  base: { id: string; name: string; tools: ToolOnBoard[] };
}

export const MIN_PASSWORD_LENGTH = 8;

interface Deps {
  db: Db;
  clock: Clock;
  authAdmin: AuthAdmin;
}

export function createRegistry(deps: Deps): Registry {
  return {
    system: () => ({
      createCompany: (input) => createCompany(deps, input, (fn) => deps.db.transaction(fn)),
    }),
    as: (userId) => {
      /** Transakcja członka firmy. Bez `allowPendingPasswordChange` wymaga zmienionego hasła tymczasowego. */
      const asMember = <T>(fn: (sql: Sql, session: Session) => Promise<T>, opts: { allowPendingPasswordChange?: boolean } = {}) =>
        withActor(deps.db, userId, async (sql) => {
          const session = await loadSession(sql, userId);
          if (!session) throw new RegistryError("no_access");
          if (session.mustChangePassword && !opts.allowPendingPasswordChange) {
            throw new RegistryError("password_change_required");
          }
          return fn(sql, session);
        });

      return {
        createCompany: async (input) => {
          const [{ is_super_admin }] = await withActor(deps.db, userId, (sql) =>
            sql<{ is_super_admin: boolean }>("select app.is_super_admin() as is_super_admin"),
          );
          if (!is_super_admin) throw new RegistryError("forbidden");
          return createCompany(deps, input, (fn) => withActor(deps.db, userId, fn));
        },
        session: () => withActor(deps.db, userId, (sql) => loadSession(sql, userId)),
        /** Zamienia hasło tymczasowe na własne. Poza tym stanem odmawia, bo nie zna obecnego hasła. */
        changePassword: async (newPassword) => {
          if (newPassword.length < MIN_PASSWORD_LENGTH) throw new RegistryError("password_too_short");
          await asMember(
            async (sql, session) => {
              if (!session.mustChangePassword) throw new RegistryError("forbidden");
              await sql("update app.users set must_change_password = false where user_id = $1", [userId]);
              // Hasło zmieniamy przed zatwierdzeniem transakcji: gdy Auth odmówi, flaga zostaje.
              await deps.authAdmin.setPassword(userId, newPassword);
            },
            { allowPendingPasswordChange: true },
          );
        },
        whereIsWhat: () =>
          asMember(async (sql, session) => {
            const [base] = await sql<{ id: string; name: string }>(
              "select id, name from app.locations where company_id = $1 and kind = 'baza'",
              [session.company.id],
            );
            return { base: { id: base.id, name: base.name, tools: [] } };
          }),
      };
    },
  };
}

/**
 * Transakcja wykonywana tak, jak wykonałby ją PostgREST dla tego użytkownika:
 * rola `authenticated` i jego JWT w `request.jwt.claims`, więc działa RLS.
 */
export function withActor<T>(db: Db, userId: string, fn: (sql: Sql) => Promise<T>): Promise<T> {
  return db.transaction(async (sql) => {
    await sql("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await sql("set local role authenticated");
    return fn(sql);
  });
}

type Transaction = <T>(fn: (sql: Sql) => Promise<T>) => Promise<T>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function createCompany(deps: Deps, raw: CreateCompanyInput, transaction: Transaction): Promise<CreatedCompany> {
  const input = {
    name: raw.name.trim(),
    baseName: raw.baseName.trim(),
    owner: { email: raw.owner.email.trim().toLowerCase(), fullName: raw.owner.fullName.trim() },
  };
  if (!input.name || !input.baseName || !input.owner.fullName || !EMAIL_PATTERN.test(input.owner.email)) {
    throw new RegistryError("invalid_input");
  }

  const temporaryPassword = generateTemporaryPassword();
  const { userId } = await deps.authAdmin
    .createUser({ email: input.owner.email, password: temporaryPassword })
    .catch((error) => {
      throw error instanceof EmailTakenError ? new RegistryError("email_taken") : error;
    });
  const now = deps.clock.now();
  try {
    const companyId = await transaction(async (sql) => {
      const [company] = await sql<{ id: string }>(
        "insert into app.companies (name, created_at) values ($1, $2) returning id",
        [input.name, now],
      );
      await sql("insert into app.locations (company_id, kind, name, created_at) values ($1, 'baza', $2, $3)", [
        company.id,
        input.baseName,
        now,
      ]);
      await sql(
        `insert into app.users (user_id, company_id, role, full_name, email, must_change_password, created_at)
         values ($1, $2, 'wlasciciel', $3, $4, true, $5)`,
        [userId, company.id, input.owner.fullName, input.owner.email, now],
      );
      return company.id;
    });
    return { companyId, ownerUserId: userId, temporaryPassword };
  } catch (error) {
    // Konto logowania bez firmy byłoby martwe, więc je usuwamy. Zgłaszamy pierwotny błąd.
    await deps.authAdmin.deleteUser(userId).catch((cleanupError) => console.error(cleanupError));
    throw error;
  }
}

async function loadSession(sql: Sql, userId: string): Promise<Session | null> {
  const [row] = await sql<{
    full_name: string;
    role: Role;
    must_change_password: boolean;
    company_id: string;
    company_name: string;
  }>(
    `select u.full_name, u.role, u.must_change_password, c.id as company_id, c.name as company_name
     from app.users u join app.companies c on c.id = u.company_id
     where u.user_id = $1 and u.active`,
    [userId],
  );
  if (!row) return null;
  return {
    userId,
    fullName: row.full_name,
    role: row.role,
    mustChangePassword: row.must_change_password,
    company: { id: row.company_id, name: row.company_name },
  };
}
