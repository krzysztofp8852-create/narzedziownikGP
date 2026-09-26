import * as board from "./board";
import type { WhereIsWhat } from "./board";
import { RegistryError } from "./errors";
import { type AuthAdmin, type Clock, type Db, EmailTakenError, type Sql } from "./ports";
import * as corrections from "./corrections";
import type { CorrectToolInput, MarkToolLostInput, RetireToolInput } from "./corrections";
import * as locations from "./locations";
import type { NewSiteInput, Service, Site, SiteManagerCandidate } from "./locations";
import * as movements from "./movements";
import type { Movement, RecentMovement, RegisterMovementInput, UndoMovementInput } from "./movements";
import * as settings from "./settings";
import type { CompanySettings } from "./settings";
import { generateTemporaryPassword } from "./temporary-password";
import * as team from "./team";
import type { NewMemberInput, TeamMember } from "./team";
import * as tools from "./tools";
import type { AddToolInput, Category, EditToolInput, ToolCard } from "./tools";
import { EMAIL_PATTERN, UUID_PATTERN } from "./validation";

export type Role = "wlasciciel" | "magazynier" | "kierownik";

export type { LostOnBoard, ToolOnBoard, WhereIsWhat } from "./board";
export type { AddToolInput, Category, EditToolInput, HistoryEntry, LostTool, ToolCard, ToolState } from "./tools";
export { canManageTools, canSeeValues } from "./tools";
export type { CompanySettings } from "./settings";
export { canManageSettings, MAX_ALARM_THRESHOLD_DAYS } from "./settings";
export type { CorrectToolInput, MarkToolLostInput, RetireToolInput } from "./corrections";
export { canCorrectTools, TOOL_STATES } from "./corrections";
export type { NewSiteInput, Service, Site, SiteManagerCandidate, SiteStatus } from "./locations";
export { canManageLocations } from "./locations";
export type {
  Movement,
  MovementConflict,
  MovementKind,
  MovementSource,
  RecentMovement,
  RegisteredKind,
  RegisterMovementInput,
  UndoMovementInput,
} from "./movements";
export { canMoveTools, MovementConflictError, UNDO_WINDOW_MS } from "./movements";
export type { MemberRole, NewMemberInput, TeamMember } from "./team";
export { canManageTeam, MEMBER_ROLES } from "./team";

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
    /**
     * Zamienia hasło tymczasowe na własne. `signedInAt`: kiedy aktor się zalogował (z JWT);
     * sesja sprzed nadania obecnego hasła tymczasowego go nie zmieni.
     */
    changePassword(newPassword: string, signIn: { signedInAt: Date }): Promise<void>;
    /** Nowe hasło w sesji z linku resetu hasła, otwartego (`recoveredAt`, z JWT) najwyżej godzinę temu. */
    setPasswordFromRecoveryLink(newPassword: string, recovery: { recoveredAt: Date | null }): Promise<void>;
    /**
     * Tablica „Gdzie jest co”: baza, aktywne budowy, serwisy i zaginione, z alarmami. Wartości
     * w zł (narzędzia, sumy lokalizacji, kwota poza bazą) tylko dla właściciela.
     */
    whereIsWhat(): Promise<WhereIsWhat>;
    categories(): Promise<Category[]>;
    addCategory(input: { name: string; prefix: string }): Promise<Category>;
    /** Kolejny wolny kod w kategorii, np. S-05. */
    suggestCode(categoryId: string): Promise<string>;
    addTool(input: AddToolInput): Promise<{ toolId: string; code: string }>;
    editTool(toolId: string, input: EditToolInput): Promise<void>;
    /** Karta narzędzia albo null, gdy użytkownik go nie widzi (nie ma go albo jest w innej firmie). */
    toolCard(toolId: string): Promise<ToolCard | null>;
    /** Wszystkie osoby w firmie, także dezaktywowane. Tylko właściciel. */
    team(): Promise<TeamMember[]>;
    /** Zakłada konto kierownika lub magazyniera z hasłem tymczasowym do przekazania osobiście. */
    addMember(input: NewMemberInput): Promise<{ userId: string; fullName: string; email: string; temporaryPassword: string }>;
    /** Nowe hasło tymczasowe dla kierownika lub magazyniera; przy logowaniu znowu musi ustawić własne. */
    resetMemberPassword(memberId: string): Promise<{ temporaryPassword: string }>;
    /** Blokuje logowanie i dostęp do firmy. Osoba i jej historia zostają. */
    deactivateMember(memberId: string): Promise<void>;
    /** Baza, budowy (także zakończone) i serwisy firmy. */
    locations(): Promise<{ base: { id: string; name: string }; sites: Site[]; services: Service[] }>;
    /** Aktywni kierownicy, którym można przypisać budowę. Tylko właściciel. */
    siteManagerCandidates(): Promise<SiteManagerCandidate[]>;
    /** Nowa aktywna budowa z kierownikiem. Tylko właściciel. */
    addSite(input: NewSiteInput): Promise<{ locationId: string }>;
    /** Przekazuje budowę innemu aktywnemu kierownikowi. Tylko właściciel. */
    changeSiteManager(siteId: string, managerId: string): Promise<void>;
    /** Serwis jako lokalizacja, np. „Serwis Hilti Poznań”. Tylko właściciel. */
    addService(input: { name: string }): Promise<{ locationId: string }>;
    /**
     * Wydanie z bazy albo zwrot na bazę jednego lub wielu narzędzi. Gdy któreś narzędzie nie jest
     * w lokalizacji źródłowej, odrzuca cały ruch błędem MovementConflictError.
     */
    registerMovement(input: RegisterMovementInput): Promise<Movement>;
    /**
     * Cofa własne wydanie lub zwrot zapisany najwyżej 15 minut temu, o ile od tamtej pory żadne
     * z jego narzędzi się nie ruszyło. Oryginał zostaje w historii jako cofnięty.
     */
    undoMovement(input: UndoMovementInput): Promise<Movement>;
    /**
     * Korekta: faktyczna lokalizacja i stan narzędzia, z obowiązkowym powodem. Tylko właściciel.
     * Poprzednie ruchy zostają w historii.
     */
    correctTool(input: CorrectToolInput): Promise<Movement>;
    /**
     * Zaginięcie narzędzia w obiegu, z obowiązkowym powodem. Tylko właściciel. Karta pamięta datę,
     * ostatnią lokalizację i kierownika budowy; odnalezienie to korekta.
     */
    markToolLost(input: MarkToolLostInput): Promise<Movement>;
    /** Wycofanie z obiegu (zepsute, sprzedane): narzędzie znika z list, historia zostaje. Tylko właściciel. */
    retireTool(input: RetireToolInput): Promise<Movement>;
    /** Ostatnie ruchy w firmie, od najnowszego, z informacją, które aktor może cofnąć. */
    recentMovements(options?: { limit?: number }): Promise<RecentMovement[]>;
    /** Ustawienia firmy. Tylko właściciel. */
    settings(): Promise<CompanySettings>;
    /** Zmienia ustawienia firmy, np. próg dni alarmu (1–365). Tylko właściciel. */
    updateSettings(input: CompanySettings): Promise<void>;
  };
}

export const MIN_PASSWORD_LENGTH = 8;
const RECOVERY_WINDOW_MS = 60 * 60 * 1000;

interface Deps {
  db: Db;
  clock: Clock;
  authAdmin: AuthAdmin;
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

      /**
       * Polecenie zapisujące ruch, z jednym ponowieniem: równoległa transakcja mogła zapisać tę samą
       * operację albo ruszyć te narzędzia, a drugie podejście to zobaczy.
       */
      const movementCommand =
        <I extends { operationId: string }>(command: (sql: Sql, session: Session, input: I, now: Date) => Promise<Movement>) =>
        async (input: I) => {
          const attempt = () => asMember((sql, session) => command(sql, session, input, deps.clock.now()));
          try {
            return await attempt();
          } catch (error) {
            if (error instanceof tools.ReplayedOperationError || error instanceof movements.ConcurrentMoveError) return attempt();
            // Każde zapytanie widzi to, co zatwierdzono przed nim: równoległa ponowka tej samej operacji
            // mogła zapisać ruch już po naszym sprawdzeniu identyfikatora, a przed sprawdzeniem stanu,
            // który ten ruch zmienił. Wtedy zwracamy jej ruch zamiast odmowy.
            if (error instanceof RegistryError && UUID_PATTERN.test(input.operationId)) {
              const replayed = await asMember((sql, session) => movements.movementByOperation(sql, session, input.operationId)).catch(
                () => null,
              );
              if (replayed) return replayed;
            }
            throw error;
          }
        };

      return {
        session: () => withActor(deps.db, userId, (sql) => loadSession(sql, userId)),
        /** Zamienia hasło tymczasowe na własne. Poza tym stanem odmawia, bo nie zna obecnego hasła. */
        changePassword: async (newPassword, { signedInAt }) => {
          if (newPassword.length < MIN_PASSWORD_LENGTH) throw new RegistryError("password_too_short");
          await asMember(
            async (sql, session) => {
              if (!session.mustChangePassword) throw new RegistryError("forbidden");
              const [{ issued_at }] = await sql<{ issued_at: Date | null }>(
                "select temporary_password_issued_at as issued_at from app.users where user_id = $1",
                [userId],
              );
              // Czas logowania w JWT ma dokładność do sekundy.
              if (issued_at && signedInAt.getTime() < Math.floor(new Date(issued_at).getTime() / 1000) * 1000) {
                throw new RegistryError("stale_session");
              }
              await sql("update app.users set must_change_password = false where user_id = $1", [userId]);
              // Hasło zmieniamy przed zatwierdzeniem transakcji: gdy Auth odmówi, flaga zostaje.
              await deps.authAdmin.setPassword(userId, newPassword);
            },
            { allowPendingPasswordChange: true },
          );
        },
        setPasswordFromRecoveryLink: async (newPassword, { recoveredAt }) => {
          if (newPassword.length < MIN_PASSWORD_LENGTH) throw new RegistryError("password_too_short");
          await asMember(
            async (sql) => {
              if (!recoveredAt || deps.clock.now().getTime() - recoveredAt.getTime() > RECOVERY_WINDOW_MS) {
                throw new RegistryError("recovery_expired");
              }
              // Link z e-maila potwierdza tożsamość, więc zastępuje też hasło tymczasowe.
              await sql("update app.users set must_change_password = false where user_id = $1", [userId]);
              await deps.authAdmin.setPassword(userId, newPassword);
            },
            { allowPendingPasswordChange: true },
          );
        },
        whereIsWhat: () => asMember((sql, session) => board.whereIsWhat(sql, session, deps.clock.now())),
        categories: () => asMember((sql) => tools.listCategories(sql)),
        addCategory: (input) =>
          asMember((sql, session) => {
            tools.requireToolManager(session);
            return tools.addCategory(sql, session, input, deps.clock.now());
          }),
        suggestCode: (categoryId) => asMember((sql) => tools.suggestCode(sql, categoryId)),
        addTool: async (input) => {
          const attempt = () =>
            asMember((sql, session) => {
              tools.requireToolManager(session);
              return tools.addTool(sql, session, input, deps.clock.now());
            });
          try {
            return await attempt();
          } catch (error) {
            // Równoległa ponowka już zapisała tę operację; drugie podejście odczyta jej wynik.
            if (error instanceof tools.ReplayedOperationError) return attempt();
            throw error;
          }
        },
        editTool: (toolId, input) =>
          asMember((sql, session) => {
            tools.requireToolManager(session);
            return tools.editTool(sql, session, toolId, input);
          }),
        toolCard: (toolId) => asMember((sql, session) => tools.toolCard(sql, session, toolId, deps.clock.now())),
        team: () =>
          asMember((sql, session) => {
            team.requireTeamManager(session);
            return team.listTeam(sql);
          }),
        addMember: async (input) => {
          // Uprawnienia sprawdzamy, zanim powstanie konto logowania.
          const member = await asMember(async (_sql, session) => {
            team.requireTeamManager(session);
            return team.normalizeNewMember(input);
          });
          const temporaryPassword = generateTemporaryPassword();
          const { userId } = await createAccount(deps, member.email, temporaryPassword);
          try {
            await asMember((sql, session) => {
              team.requireTeamManager(session);
              return team.insertMember(sql, session, userId, member, deps.clock.now());
            });
          } catch (error) {
            await deps.authAdmin.deleteUser(userId).catch((cleanupError) => console.error(cleanupError));
            throw error;
          }
          return { userId, fullName: member.fullName, email: member.email, temporaryPassword };
        },
        resetMemberPassword: (memberId) =>
          asMember(async (sql, session) => {
            team.requireTeamManager(session);
            await team.requireManagedMember(sql, memberId);
            await team.markPasswordTemporary(sql, memberId, deps.clock.now());
            const temporaryPassword = generateTemporaryPassword();
            // Hasło zmieniamy przed zatwierdzeniem transakcji: gdy Auth odmówi, flaga się nie zmieni.
            await deps.authAdmin.setPassword(memberId, temporaryPassword);
            return { temporaryPassword };
          }),
        deactivateMember: (memberId) =>
          asMember(async (sql, session) => {
            team.requireTeamManager(session);
            await team.requireManagedMember(sql, memberId);
            await team.deactivate(sql, memberId);
            // Blokada przed zatwierdzeniem: gdy Auth odmówi, osoba zostaje aktywna i można ponowić.
            await deps.authAdmin.blockSignIn(memberId);
          }),
        locations: () =>
          asMember(async (sql, session) => ({
            base: await tools.baseLocation(sql, session),
            sites: await locations.sites(sql, { activeOnly: false }),
            services: await locations.services(sql),
          })),
        siteManagerCandidates: () =>
          asMember((sql, session) => {
            locations.requireLocationManager(session);
            return locations.siteManagerCandidates(sql);
          }),
        addSite: (input) =>
          asMember((sql, session) => {
            locations.requireLocationManager(session);
            return locations.addSite(sql, session, input, deps.clock.now());
          }),
        changeSiteManager: (siteId, managerId) =>
          asMember((sql, session) => {
            locations.requireLocationManager(session);
            return locations.changeSiteManager(sql, siteId, managerId);
          }),
        addService: (input) =>
          asMember((sql, session) => {
            locations.requireLocationManager(session);
            return locations.addService(sql, session, input, deps.clock.now());
          }),
        registerMovement: movementCommand(movements.registerMovement),
        undoMovement: movementCommand(movements.undoMovement),
        correctTool: movementCommand(corrections.correctTool),
        markToolLost: movementCommand(corrections.markToolLost),
        retireTool: movementCommand(corrections.retireTool),
        recentMovements: ({ limit = 20 } = {}) =>
          asMember((sql, session) => movements.recentMovements(sql, session, limit, deps.clock.now())),
        settings: () =>
          asMember((sql, session) => {
            settings.requireSettingsManager(session);
            return settings.companySettings(sql, session);
          }),
        updateSettings: (input) =>
          asMember((sql, session) => {
            settings.requireSettingsManager(session);
            return settings.updateSettings(sql, session, input);
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
  const { userId } = await createAccount(deps, input.owner.email, temporaryPassword);
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
        `insert into app.users (user_id, company_id, role, full_name, email, must_change_password,
                                temporary_password_issued_at, created_at)
         values ($1, $2, 'wlasciciel', $3, $4, true, $5, $5)`,
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

/** Konto logowania; zajęty e-mail (w dowolnej firmie) to błąd Rejestru. */
function createAccount(deps: Deps, email: string, password: string) {
  return deps.authAdmin.createUser({ email, password }).catch((error) => {
    throw error instanceof EmailTakenError ? new RegistryError("email_taken") : error;
  });
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
