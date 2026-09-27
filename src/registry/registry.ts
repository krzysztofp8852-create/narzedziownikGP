import * as bell from "./bell";
import type { Bell, BellEntry } from "./bell";
import * as board from "./board";
import * as catalog from "./catalog";
import type { CatalogTool } from "./catalog";
import type { WhereIsWhat } from "./board";
import { RegistryError } from "./errors";
import { type AuthAdmin, type Clock, type Db, EmailTakenError, type Notifier, type Sql } from "./ports";
import * as corrections from "./corrections";
import * as history from "./history";
import type { HistoryFilterOptions, HistoryFilters, MovementHistory } from "./history";
import type { CorrectToolInput, MarkToolLostInput, RetireToolInput } from "./corrections";
import * as locations from "./locations";
import type { NewSiteInput, Service, Site, SiteManagerCandidate } from "./locations";
import * as movements from "./movements";
import type { Movement, RecentMovement, RegisterMovementInput, UndoMovementInput } from "./movements";
import * as notifications from "./notifications";
import type { EmailedNotification, ToolsTakenNotification } from "./notifications";
import * as settings from "./settings";
import type { CompanySettings } from "./settings";
import * as siteClosing from "./site-closing";
import * as thresholds from "./thresholds";
import type { FinishedSite, ForceCloseSiteInput } from "./site-closing";
import { generateTemporaryPassword } from "./temporary-password";
import * as toolImport from "./tool-import";
import type { ImportToolsInput, ToolImportPreview, ToolImportRow } from "./tool-import";
import * as team from "./team";
import type { NewMemberInput, TeamMember } from "./team";
import * as stickers from "./stickers";
import type { StickerBatch, StickerCandidate, StickerSelection } from "./stickers";
import * as toolReports from "./tool-reports";
import type { AcceptToolReportInput, RejectToolReportInput, ReportToolInput, ToolReport } from "./tool-reports";
import * as tools from "./tools";
import type { AddToolInput, Category, EditToolInput, ToolCard } from "./tools";
import { EMAIL_PATTERN, UUID_PATTERN } from "./validation";

export type Role = "wlasciciel" | "magazynier" | "kierownik";

export type { LostOnBoard, ToolOnBoard, WhereIsWhat } from "./board";
export type { CatalogTool } from "./catalog";
export type { AddToolInput, Category, EditToolInput, HistoryEntry, LocationKind, LostTool, ToolCard, ToolState } from "./tools";
export { canManageTools, canSeeValues } from "./tools";
export type { ImportPreviewRow, ImportRowError, ImportToolsInput, ToolImportPreview, ToolImportRow } from "./tool-import";
export { canImportTools, MAX_IMPORT_ROWS } from "./tool-import";
export type { HistoryFilterOptions, HistoryFilters, MovementHistory } from "./history";
export type { CompanySettings } from "./settings";
export { canManageSettings, MAX_ALARM_THRESHOLD_DAYS } from "./settings";
export { isCalendarDay, UUID_PATTERN } from "./validation";
export type { CorrectToolInput, MarkToolLostInput, RetireToolInput } from "./corrections";
export { canCorrectTools, TOOL_STATES } from "./corrections";
export type { NewSiteInput, Service, Site, SiteManagerCandidate, SiteStatus } from "./locations";
export { canManageLocations } from "./locations";
export type { FinishedSite, ForceCloseSiteInput } from "./site-closing";
export { canCloseSite, canForceCloseSites } from "./site-closing";
export type {
  Movement,
  MovementConflict,
  MovementKind,
  MovementSource,
  RecentMovement,
  RegisteredKind,
  RegisterMovementInput,
  RegisterSource,
  UndoMovementInput,
} from "./movements";
export { canMoveEverywhere, canMoveTools, MAX_TRANSCRIPT_LENGTH, MovementConflictError, REGISTER_SOURCES, UNDO_WINDOW_MS } from "./movements";
export type {
  EmailedNotification,
  Notification,
  NotificationContent,
  NotificationKind,
  ThresholdExceededNotification,
  ThresholdsExceededNotification,
  ToolsTakenNotification,
} from "./notifications";
export type { Bell, BellEntry } from "./bell";
export type { MemberRole, NewMemberInput, TeamMember } from "./team";
export { canManageTeam, MEMBER_ROLES } from "./team";
export type { AcceptToolReportInput, RejectToolReportInput, ReportToolInput, ToolReport } from "./tool-reports";
export { canReportTools, canReviewToolReports } from "./tool-reports";
export type { StickerBatch, StickerCandidate, StickerSelection } from "./stickers";
export { canPrintStickers } from "./stickers";

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

/** Dane do eksportu z jednej chwili. */
export interface ExportData {
  /** Kiedy je odczytano (zegar Rejestru). */
  generatedAt: Date;
  /** Tablica „Gdzie jest co”; wartości w zł tylko dla właściciela. */
  board: WhereIsWhat;
  /** Wszystkie ruchy pasujące do filtrów, od najnowszego. */
  movements: Movement[];
}

/** Zapisany ruch z powiadomieniami, które z niego wynikły. */
export interface RegisteredMovement extends Movement {
  /** Np. dla kierownika, któremu przeniesienie zabrało sprzęt. Są w jego dzwonku, a kopię wysyła port powiadomień. */
  notifications: ToolsTakenNotification[];
}

export interface Registry {
  /** Aktor systemowy: skrypty i zadania harmonogramu, poza RLS. */
  system(): {
    createCompany(input: CreateCompanyInput): Promise<CreatedCompany>;
    /**
     * Zadanie dzienne: narzędzia, które od ostatniego uruchomienia przekroczyły próg dni na budowie
     * (każde raz na pobyt). Kierownik budowy dostaje powiadomienie o każdym, a właściciel jedno zbiorcze.
     */
    notifyExceededThresholds(): Promise<{ tools: number }>;
  };
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
    /** Narzędzia w obiegu z kategorią i lokalizacją, bez wartości (dla interpretacji tekstu). */
    toolCatalog(): Promise<CatalogTool[]>;
    categories(): Promise<Category[]>;
    addCategory(input: { name: string; prefix: string }): Promise<Category>;
    /** Kolejny wolny kod w kategorii, np. S-05. */
    suggestCode(categoryId: string): Promise<string>;
    addTool(input: AddToolInput): Promise<{ toolId: string; code: string }>;
    editTool(toolId: string, input: EditToolInput): Promise<void>;
    /**
     * Podgląd importu narzędzi z pliku: błędy każdego wiersza (brak nazwy, powtórzony lub zajęty kod,
     * zła wartość, nieznana kategoria lub lokalizacja) i kody nadane wierszom bez kodu. Nic nie
     * zapisuje. Tylko właściciel.
     */
    previewToolImport(rows: ToolImportRow[]): Promise<ToolImportPreview>;
    /**
     * Zatwierdza import w całości albo wcale: każde narzędzie dostaje ruch „przyjęcie” (źródło
     * `import`) do lokalizacji z pliku, a bez niej na bazę. Wiersz z błędem odrzuca cały import
     * (`import_invalid`). Tylko właściciel.
     */
    importTools(input: ImportToolsInput): Promise<{ imported: number }>;
    /** Karta narzędzia albo null, gdy użytkownik go nie widzi (nie ma go albo jest w innej firmie). */
    toolCard(toolId: string): Promise<ToolCard | null>;
    /**
     * Druk naklejek QR: wybrane narzędzia albo wszystkie jeszcze nieoklejone. `print` robi z nich plik
     * w tej samej transakcji, więc datę druku (wydrukowane przestają być nieoklejone) zapisujemy tylko
     * wtedy, gdy plik powstał. Tylko właściciel.
     */
    printStickers<T>(selection: StickerSelection, print: (batch: StickerBatch) => Promise<T>): Promise<T>;
    /** Narzędzia, którym można wydrukować naklejkę (zaakceptowane, w obiegu), po kodzie. Tylko właściciel. */
    stickerCandidates(): Promise<StickerCandidate[]>;
    /**
     * Zgłoszenie narzędzia kupionego na budowę. Tylko kierownik, na swoją aktywną budowę: narzędzie
     * od razu jest tam jako zgłoszone, z kodem nadanym jak przy dodawaniu, i uczestniczy w ruchach.
     */
    reportTool(input: ReportToolInput): Promise<{ toolId: string; code: string }>;
    /** Zgłoszenia narzędzi czekające na decyzję, od najstarszego. Tylko właściciel. */
    toolReports(): Promise<ToolReport[]>;
    /** Akceptuje zgłoszenie, uzupełniając kod i wartość. Tylko właściciel. */
    acceptToolReport(input: AcceptToolReportInput): Promise<void>;
    /** Odrzuca zgłoszenie z komentarzem: narzędzie jest wycofane, historia zostaje. Tylko właściciel. */
    rejectToolReport(input: RejectToolReportInput): Promise<Movement>;
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
     * Oznacza budowę jako zakończoną: znika z tablicy, a jej historia zostaje. Kierownik zamyka
     * swoją, właściciel każdą. Gdy zostały na niej narzędzia w obiegu, odmawia (`site_not_empty`).
     */
    closeSite(siteId: string): Promise<void>;
    /**
     * Zamyka budowę mimo pozostałych narzędzi, z obowiązkowym powodem. Tylko właściciel. Każde
     * z nich zaginęło na tej budowie pod opieką jej kierownika; wynikiem jest ten ruch zaginięcia,
     * a przy pustej budowie null.
     */
    forceCloseSite(input: ForceCloseSiteInput): Promise<Movement | null>;
    /** Zakończone budowy, od ostatnio zamkniętej, z datą i osobą, która zamknęła. */
    finishedSites(): Promise<FinishedSite[]>;
    /**
     * Wydanie, zwrot, przeniesienie, wysłanie do serwisu albo przyjęcie z serwisu jednego lub wielu
     * narzędzi. Gdy któreś narzędzie nie jest w lokalizacji źródłowej, odrzuca cały ruch błędem
     * MovementConflictError. Powiadomienia z wyniku wysyła port powiadomień, tylko przy pierwszym zapisie.
     */
    registerMovement(input: RegisterMovementInput): Promise<RegisteredMovement>;
    /**
     * Cofa własny ruch (wydanie, zwrot, przeniesienie, serwis) zapisany najwyżej 15 minut temu, o ile od tamtej pory żadne
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
    /**
     * Historia ruchów firmy od najnowszego, zawężona filtrami (lokalizacja, osoba, narzędzie, dni
     * czasu polskiego). Bez limitu wszystkie pasujące ruchy. Widzi ją każda rola.
     */
    movementHistory(filters?: HistoryFilters, options?: { limit?: number }): Promise<MovementHistory>;
    /** Lokalizacje, osoby i narzędzia, po których można filtrować historię. */
    historyFilterOptions(): Promise<HistoryFilterOptions>;
    /** Stan „Gdzie jest co” i historia z filtrami do eksportu, w jednej transakcji. */
    exportData(filters?: HistoryFilters): Promise<ExportData>;
    /** Dzwonek: nieprzeczytane i ostatnie powiadomienia aktora, od najnowszego. */
    bell(options?: { limit?: number }): Promise<Bell>;
    /** Liczba nieprzeczytanych powiadomień aktora (licznik przy dzwonku). */
    unreadNotificationCount(): Promise<number>;
    /** Oznacza własne powiadomienie jako przeczytane; null, gdy aktor go nie ma. */
    markNotificationRead(notificationId: string): Promise<BellEntry | null>;
    markAllNotificationsRead(): Promise<void>;
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
  notifier: Notifier;
}

export function createRegistry(deps: Deps): Registry {
  return {
    system: () => ({
      createCompany: (input) => createCompany(deps, input),
      notifyExceededThresholds: () => deps.db.transaction((sql) => thresholds.notifyExceededThresholds(sql, deps.clock.now())),
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
       * operację albo ruszyć te narzędzia, a drugie podejście to zobaczy. Ponowne wysłanie zapisanej
       * operacji zwraca jej ruch (`replayed`), zanim polecenie cokolwiek sprawdzi. `result` buduje
       * wynik z ruchu w tej samej transakcji.
       */
      const movementCommand =
        <I extends { operationId: string }, R, M extends Movement | null = Movement>(
          command: (sql: Sql, session: Session, input: I, now: Date) => Promise<M>,
          result: (sql: Sql, movement: M) => Promise<R>,
        ) =>
        async (input: I): Promise<{ result: R; replayed: boolean }> => {
          const replay = (sql: Sql, session: Session) =>
            movements.movementByOperation(sql, session, input.operationId).then(async (movement) =>
              movement ? { result: await result(sql, movement as M), replayed: true } : null,
            );
          const attempt = () =>
            asMember(async (sql, session) => {
              if (!UUID_PATTERN.test(input.operationId)) throw new RegistryError("invalid_input");
              const replayed = await replay(sql, session);
              if (replayed) return replayed;
              const movement = await command(sql, session, input, deps.clock.now());
              return { result: await result(sql, movement), replayed: false };
            });
          try {
            return await attempt();
          } catch (error) {
            if (error instanceof tools.ReplayedOperationError || error instanceof movements.ConcurrentMoveError) return attempt();
            // Każde zapytanie widzi to, co zatwierdzono przed nim: równoległa ponowka tej samej operacji
            // mogła zapisać ruch już po naszym sprawdzeniu identyfikatora, a przed sprawdzeniem stanu,
            // który ten ruch zmienił. Wtedy zwracamy jej ruch zamiast odmowy.
            if (error instanceof RegistryError && UUID_PATTERN.test(input.operationId)) {
              const replayed = await asMember(replay).catch(() => null);
              if (replayed) return replayed;
            }
            throw error;
          }
        };
      /** Polecenie ruchu, którego wynikiem jest sam ruch (bez powiadomień). */
      const movementOnlyCommand =
        <I extends { operationId: string }, M extends Movement | null = Movement>(
          command: (sql: Sql, session: Session, input: I, now: Date) => Promise<M>,
        ) =>
        async (input: I) =>
          (await movementCommand(command, async (_sql, movement: M) => movement)(input)).result;

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
        toolCatalog: () => asMember((sql) => catalog.toolCatalog(sql)),
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
        previewToolImport: (rows) =>
          asMember((sql, session) => {
            toolImport.requireImporter(session);
            return toolImport.previewToolImport(sql, session, rows);
          }),
        importTools: async (input) => {
          const attempt = () => asMember((sql, session) => toolImport.importTools(sql, session, input, deps.clock.now()));
          try {
            return await attempt();
          } catch (error) {
            // Równoległa ponowka już zapisała ten import; drugie podejście odczyta jej wynik.
            if (error instanceof tools.ReplayedOperationError) return attempt();
            throw error;
          }
        },
        toolCard: (toolId) => asMember((sql, session) => tools.toolCard(sql, session, toolId, deps.clock.now())),
        printStickers: (selection, print) =>
          asMember(async (sql, session) => {
            stickers.requireStickerPrinter(session);
            return print(await stickers.printStickers(sql, session, selection, deps.clock.now()));
          }),
        stickerCandidates: () =>
          asMember((sql, session) => {
            stickers.requireStickerPrinter(session);
            return stickers.stickerCandidates(sql);
          }),
        reportTool: async (input) => {
          const attempt = () => asMember((sql, session) => toolReports.reportTool(sql, session, input, deps.clock.now()));
          try {
            return await attempt();
          } catch (error) {
            // Równoległa ponowka już zapisała tę operację; drugie podejście odczyta jej wynik.
            if (error instanceof tools.ReplayedOperationError) return attempt();
            throw error;
          }
        },
        toolReports: () =>
          asMember((sql, session) => {
            toolReports.requireToolReviewer(session);
            return toolReports.toolReports(sql);
          }),
        acceptToolReport: (input) => asMember((sql, session) => toolReports.acceptToolReport(sql, session, input)),
        rejectToolReport: movementOnlyCommand(toolReports.rejectToolReport),
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
        closeSite: async (siteId) => {
          const attempt = () => asMember((sql, session) => siteClosing.closeSite(sql, session, siteId, deps.clock.now()));
          try {
            return await attempt();
          } catch (error) {
            // Równoległy ruch dowiózł narzędzie na budowę; drugie podejście je zobaczy.
            if (error instanceof movements.ConcurrentMoveError) return attempt();
            throw error;
          }
        },
        forceCloseSite: movementOnlyCommand(siteClosing.forceCloseSite),
        finishedSites: () => asMember((sql) => siteClosing.finishedSites(sql)),
        registerMovement: async (input) => {
          const { result, replayed } = await movementCommand(movements.registerMovement, async (sql, movement) => {
            const list = await notifications.notificationsFor(sql, movement);
            // Ponowienie operacji niczego nie dubluje w dzwonku, a w wyniku są te same powiadomienia.
            await bell.deliver(sql, list, deps.clock.now());
            return { ...movement, notifications: list };
          })(input);
          if (!replayed) await sendNotifications(deps.notifier, result.notifications);
          return result;
        },
        undoMovement: movementOnlyCommand(movements.undoMovement),
        correctTool: movementOnlyCommand(corrections.correctTool),
        markToolLost: movementOnlyCommand(corrections.markToolLost),
        retireTool: movementOnlyCommand(corrections.retireTool),
        recentMovements: ({ limit = 20 } = {}) =>
          asMember((sql, session) => movements.recentMovements(sql, session, limit, deps.clock.now())),
        movementHistory: (filters = {}, options = {}) => asMember((sql) => history.movementHistory(sql, filters, options)),
        historyFilterOptions: () => asMember((sql, session) => history.historyFilterOptions(sql, session)),
        exportData: (filters = {}) =>
          asMember(async (sql, session) => {
            const now = deps.clock.now();
            return {
              generatedAt: now,
              board: await board.whereIsWhat(sql, session, now),
              movements: (await history.movementHistory(sql, filters, {})).movements,
            };
          }),
        bell: ({ limit = 50 } = {}) => asMember((sql, session) => bell.bell(sql, session, limit)),
        unreadNotificationCount: () => asMember((sql, session) => bell.unreadCount(sql, session)),
        markNotificationRead: (notificationId) =>
          asMember((sql, session) => bell.markRead(sql, session, notificationId, deps.clock.now())),
        markAllNotificationsRead: () => asMember((sql, session) => bell.markAllRead(sql, session, deps.clock.now())),
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
 * Wysyła powiadomienia już zapisanego ruchu. Ruch się nie cofnie, więc błąd wysyłki tylko odnotowujemy.
 */
async function sendNotifications(notifier: Notifier, list: EmailedNotification[]) {
  await Promise.all(
    list.map((notification) =>
      notifier.send(notification).catch((error) => console.error("Nie wysłano powiadomienia", notification.kind, error)),
    ),
  );
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
