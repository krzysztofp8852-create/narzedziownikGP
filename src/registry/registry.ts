import { RegistryError } from "./errors";
import { type AuthAdmin, type Clock, type Db, EmailTakenError, type PhotoStore, type Sql } from "./ports";
import { generateTemporaryPassword } from "./temporary-password";
import * as tools from "./tools";
import type { AddToolInput, Category, EditToolInput, ToolCard, ToolOnBoard } from "./tools";

export type Role = "wlasciciel" | "magazynier" | "kierownik";

export type { AddToolInput, Category, EditToolInput, HistoryEntry, ToolCard, ToolOnBoard } from "./tools";
export { canManageTools, canSeeValues, MAX_PHOTO_BYTES, PHOTO_CONTENT_TYPES } from "./tools";

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
    session(): Promise<Session | null>;
    changePassword(newPassword: string): Promise<void>;
    whereIsWhat(): Promise<WhereIsWhat>;
    categories(): Promise<Category[]>;
    addCategory(input: { name: string; prefix: string }): Promise<Category>;
    /** Kolejny wolny kod w kategorii, np. S-05. */
    suggestCode(categoryId: string): Promise<string>;
    addTool(input: AddToolInput): Promise<{ toolId: string; code: string }>;
    editTool(toolId: string, input: EditToolInput): Promise<void>;
    /** Karta narzędzia albo null, gdy użytkownik go nie widzi (nie ma go albo jest w innej firmie). */
    toolCard(toolId: string): Promise<ToolCard | null>;
  };
}

export interface WhereIsWhat {
  base: { id: string; name: string; tools: ToolOnBoard[] };
}

export const MIN_PASSWORD_LENGTH = 8;

interface Deps {
  db: Db;
  clock: Clock;
  authAdmin: AuthAdmin;
  photos: PhotoStore;
}

export function createRegistry(deps: Deps): Registry {
  return {
    system: () => ({
      createCompany: (input) => createCompany(deps, input),
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
            const base = await tools.baseLocation(sql, session);
            return { base: { ...base, tools: await tools.toolsAt(sql, base.id, deps.clock.now()) } };
          }),
        categories: () => asMember((sql) => tools.listCategories(sql)),
        addCategory: (input) =>
          asMember((sql, session) => {
            tools.requireToolManager(session);
            return tools.addCategory(sql, session, input, deps.clock.now());
          }),
        suggestCode: (categoryId) => asMember((sql) => tools.suggestCode(sql, categoryId)),
        addTool: async (input) => {
          const attempt = () =>
            withPhotoCleanup(deps.photos, (putPhoto) =>
              asMember((sql, session) => {
                tools.requireToolManager(session);
                return tools.addTool(sql, session, input, deps.clock.now(), putPhoto);
              }),
            );
          try {
            return await attempt();
          } catch (error) {
            // Równoległa ponowka już zapisała tę operację; drugie podejście odczyta jej wynik.
            if (error instanceof tools.ReplayedOperationError) return attempt();
            throw error;
          }
        },
        editTool: async (toolId, input) => {
          const { replacedPhotoPath } = await withPhotoCleanup(deps.photos, (putPhoto) =>
            asMember((sql, session) => {
              tools.requireToolManager(session);
              return tools.editTool(sql, session, toolId, input, putPhoto);
            }),
          );
          // Stare zdjęcie usuwamy dopiero po zatwierdzeniu zmian; nieudane usunięcie niczego nie psuje.
          if (replacedPhotoPath) await deps.photos.remove(replacedPhotoPath).catch((error) => console.error(error));
        },
        toolCard: (toolId) =>
          asMember((sql, session) => tools.toolCard(sql, session, toolId, deps.clock.now(), deps.photos)),
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

/** Zdjęcia zapisane w trakcie nieudanej transakcji usuwamy, żeby w magazynie nie zostały sieroty. */
async function withPhotoCleanup<T>(photos: PhotoStore, fn: (putPhoto: tools.PutPhoto) => Promise<T>): Promise<T> {
  const uploaded: string[] = [];
  try {
    return await fn(async (path, photo) => {
      await photos.put(path, photo);
      uploaded.push(path);
    });
  } catch (error) {
    await Promise.all(uploaded.map((path) => photos.remove(path).catch((cleanupError) => console.error(cleanupError))));
    throw error;
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function createCompany(deps: Deps, raw: CreateCompanyInput): Promise<CreatedCompany> {
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
    const companyId = await deps.db.transaction(async (sql) => {
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
