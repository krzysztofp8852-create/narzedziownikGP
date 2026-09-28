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
import type { NewSiteInput, NewVehicleInput, Service, Site, SiteManagerCandidate, Vehicle } from "./locations";
import * as movements from "./movements";
import type { Movement, RecentMovement, RegisterMovementInput, UndoMovementInput } from "./movements";
import * as notifications from "./notifications";
import type { EmailedNotification, ToolsTakenNotification } from "./notifications";
import * as push from "./push";
import type { PushCopy, PushSubscriptionData } from "./push";
import * as queuedMovements from "./queued-movements";
import * as readOnly from "./read-only";
import * as reports from "./reports";
import type { FridayReport, Report, ReportKind, WeeklyReport } from "./reports";
import type { RejectedMovement } from "./queued-movements";
import * as settings from "./settings";
import type { CompanySettings } from "./settings";
import * as siteClosing from "./site-closing";
import * as subscriptions from "./subscriptions";
import type { CompanySubscription, ManagedCompany, NewCompanyInput, NewSubscription, TierId, ToolLimitWarning } from "./subscriptions";
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
export type {
  CompanySubscription,
  InvoiceData,
  ManagedCompany,
  NewCompanyInput,
  SubscriptionStatus,
  SubscriptionTier,
  TierId,
  ToolLimitWarning,
} from "./subscriptions";
export { TIERS } from "./subscriptions";
export { canManageSettings, MAX_ALARM_THRESHOLD_DAYS } from "./settings";
export { isCalendarDay, UUID_PATTERN } from "./validation";
export type { CorrectToolInput, MarkToolLostInput, RetireToolInput } from "./corrections";
export { canCorrectTools, TOOL_STATES } from "./corrections";
export type { NewSiteInput, NewVehicleInput, Service, Site, SiteManagerCandidate, SiteStatus, Vehicle } from "./locations";
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
export { readOnlyWarning } from "./notifications";
export type {
  EmailedNotification,
  FridayReportNotification,
  MovementRejectedNotification,
  Notification,
  NotifiedPlace,
  NotificationContent,
  NotificationKind,
  ReadOnlyNotification,
  ReadOnlySoonNotification,
  ThresholdExceededNotification,
  ThresholdsExceededNotification,
  ToolsTakenNotification,
  WeeklyReportNotification,
} from "./notifications";
export type { FridayReport, Report, ReportKind, WeeklyReport } from "./reports";
export { isReportKind } from "./reports";
export type { Bell, BellEntry } from "./bell";
export type { PushMessage, PushSubscriptionData } from "./push";
export type { RejectedMovement } from "./queued-movements";
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
  /** `readOnly`: firma jest w trybie tylko do odczytu (ręcznie albo po 14 dniach od „opłacone do”). */
  company: { id: string; name: string; readOnly: boolean };
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

/** Wynik ruchu z kolejki offline: zapisany albo odrzucony na listę „Do wyjaśnienia”. */
export type QueuedMovementResult = { status: "registered"; movement: RegisteredMovement } | { status: "rejected"; rejection: RejectedMovement };

/** Wynik polecenia, które dodało narzędzia: ostrzeżenie, gdy firma ma ich więcej niż limit progu. */
export interface WithLimitWarning {
  limitWarning: ToolLimitWarning | null;
}

/** Zapisany ruch z powiadomieniami, które z niego wynikły. */
export interface RegisteredMovement extends Movement {
  /** Np. dla kierownika, któremu przeniesienie zabrało sprzęt. Są w jego dzwonku, a kopię wysyła port powiadomień. */
  notifications: ToolsTakenNotification[];
}

/** Polecenia i zapytania super-admina; każde najpierw sprawdza tę rolę w bazie. */
export interface SuperAdminRegistry {
  /** Czy ten użytkownik jest super-adminem; nigdy nie odmawia. */
  isSuperAdmin(): Promise<boolean>;
  /** Wszystkie firmy z progiem, liczbą narzędzi, „opłacone do” i stanem abonamentu, po nazwie. */
  companies(): Promise<ManagedCompany[]>;
  /** Jedna firma albo null, gdy jej nie ma. */
  company(companyId: string): Promise<ManagedCompany | null>;
  /** Firma z bazą, abonamentem, danymi do faktury i właścicielem z hasłem tymczasowym. */
  createCompany(input: NewCompanyInput): Promise<CreatedCompany>;
  /** Przejście na inny próg abonamentu. */
  changeTier(companyId: string, tier: TierId): Promise<void>;
  /** „Opłacone do” (RRRR-MM-DD) po zaksięgowaniu przelewu. */
  setPaidUntil(companyId: string, day: string): Promise<void>;
  /** Ręczny tryb tylko do odczytu, niezależny od płatności. Włączenie trafia do dzwonków właścicieli firmy. */
  setManualReadOnly(companyId: string, on: boolean): Promise<void>;
}

export interface Registry {
  /** Aktor systemowy: skrypty i zadania harmonogramu, poza RLS. */
  system(): {
    /** Firma z bazą i właścicielem, na najniższym progu, bez danych do faktury (skrypty i testy). */
    createCompany(input: CreateCompanyInput): Promise<CreatedCompany>;
    /** Konto super-admina (GP Engineering) z wygenerowanym hasłem, do przekazania raz. */
    createSuperAdmin(input: { email: string }): Promise<{ userId: string; password: string }>;
    /**
     * Zadanie dzienne: narzędzia, które od ostatniego uruchomienia przekroczyły próg dni na budowie
     * (każde raz na pobyt). Kierownik budowy dostaje powiadomienie o każdym, a właściciel jedno zbiorcze.
     */
    notifyExceededThresholds(): Promise<{ tools: number }>;
    /**
     * Zadanie harmonogramu: raporty, na które przyszła pora w Polsce (tygodniowy od poniedziałku 7:00, piątkowy
     * od piątku 16:00, do końca tego dnia). Każda firma dostaje każdy raport raz na dzień: do dzwonka, push
     * i e-mailem (e-mail tylko właściciel). Zwraca, ile firm dostało który raport.
     */
    sendDueReports(): Promise<{ weekly: number; friday: number }>;
    /**
     * Zadanie dzienne: właściciele firm dostają ostrzeżenie 7 dni i 1 dzień przed trybem tylko do odczytu
     * (dzwonek, push i e-mail) i wpis o samym przełączeniu (dzwonek i push), każde raz na termin. Przy ręcznym
     * trybie nic. Zwraca, ile firm dostało ostrzeżenie, a ile wpis o przełączeniu. Danych firm nic nie kasuje.
     */
    notifySubscriptionDeadlines(): Promise<{ warned: number; switched: number }>;
  };
  /**
   * Zalogowany super-admin (GP Engineering), poza firmami. Każde polecenie sprawdza tę rolę w bazie
   * (RLS), a komuś innemu odmawia (`forbidden`).
   */
  superAdmin(userId: string): SuperAdminRegistry;
  /**
   * Zalogowany użytkownik; firmę i rolę Rejestr ustala sam, a RLS ich pilnuje. W trybie tylko do odczytu każde
   * polecenie zapisu danych firmy odmawia (`read_only`), a zapytania działają. Zapisy spraw samego aktora (hasło,
   * dzwonek, push) działają zawsze.
   */
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
     * Tablica „Gdzie jest co”: baza, aktywne budowy i pojazdy, serwisy i zaginione, z alarmami. Wartości
     * w zł (narzędzia, sumy lokalizacji, kwota poza bazą) tylko dla właściciela.
     */
    whereIsWhat(): Promise<WhereIsWhat>;
    /** Narzędzia w obiegu z kategorią i lokalizacją, bez wartości (dla interpretacji tekstu). */
    toolCatalog(): Promise<CatalogTool[]>;
    categories(): Promise<Category[]>;
    addCategory(input: { name: string; prefix: string }): Promise<Category>;
    /** Kolejny wolny kod w kategorii, np. S-05. */
    suggestCode(categoryId: string): Promise<string>;
    /** Ponad limitem progu narzędzie też się dodaje, a wynik ma ostrzeżenie. */
    addTool(input: AddToolInput): Promise<{ toolId: string; code: string } & WithLimitWarning>;
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
     * (`import_invalid`). Tylko właściciel. Ponad limitem progu import też się zapisuje, a wynik ma ostrzeżenie.
     */
    importTools(input: ImportToolsInput): Promise<{ imported: number } & WithLimitWarning>;
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
     * od razu jest tam jako zgłoszone, z kodem nadanym jak przy dodawaniu, i uczestniczy w ruchach. Ponad
     * limitem progu wynik ma ostrzeżenie.
     */
    reportTool(input: ReportToolInput): Promise<{ toolId: string; code: string } & WithLimitWarning>;
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
    /** Baza, budowy (także zakończone), serwisy i pojazdy (także nieaktywne) firmy. */
    locations(): Promise<{ base: { id: string; name: string }; sites: Site[]; services: Service[]; vehicles: Vehicle[] }>;
    /** Aktywni kierownicy, którym można przypisać budowę albo pojazd. Tylko właściciel. */
    siteManagerCandidates(): Promise<SiteManagerCandidate[]>;
    /** Nowa aktywna budowa z kierownikiem. Tylko właściciel. */
    addSite(input: NewSiteInput): Promise<{ locationId: string }>;
    /** Przekazuje budowę innemu aktywnemu kierownikowi. Tylko właściciel. */
    changeSiteManager(siteId: string, managerId: string): Promise<void>;
    /** Serwis jako lokalizacja, np. „Serwis Hilti Poznań”. Tylko właściciel. */
    addService(input: { name: string }): Promise<{ locationId: string }>;
    /** Nowy aktywny pojazd (np. „Bus WX 12345”) z kierownikiem i wyłączonym alarmem po progu dni. Tylko właściciel. */
    addVehicle(input: NewVehicleInput): Promise<{ locationId: string }>;
    /** Przekazuje aktywny pojazd innemu aktywnemu kierownikowi. Tylko właściciel. */
    changeVehicleManager(vehicleId: string, managerId: string): Promise<void>;
    /** Włącza albo wyłącza alarm po progu dni dla aktywnego pojazdu. Tylko właściciel. */
    setVehicleAlarm(vehicleId: string, enabled: boolean): Promise<void>;
    /**
     * Dezaktywuje pojazd (np. po sprzedaży): znika z tablicy, a jego historia zostaje. Tylko właściciel. Gdy
     * zostały na nim narzędzia w obiegu, odmawia (`vehicle_not_empty`).
     */
    deactivateVehicle(vehicleId: string): Promise<void>;
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
     * Ruch z kolejki offline telefonu, z czasem zdarzenia z chwili zapisu w telefonie. Gdy serwer go nie
     * przyjmie (konflikt, uprawnienia, zakończona budowa), odrzucenie jest ostateczne: trafia na listę
     * „Do wyjaśnienia” autora i do jego dzwonka, a ponowne wysłanie tej samej operacji je zwraca. Błędy,
     * po których warto ponowić (np. trzeba zmienić hasło, awaria), rzuca jak `registerMovement`.
     */
    registerQueuedMovement(input: RegisterMovementInput): Promise<QueuedMovementResult>;
    /** Lista „Do wyjaśnienia”: odrzucone ruchy aktora z kolejki offline, od najnowszego. */
    movementsToClarify(): Promise<RejectedMovement[]>;
    /** Autor oznacza odrzucony ruch jako wyjaśniony; znika z jego listy. */
    resolveRejectedMovement(rejectionId: string): Promise<void>;
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
    /**
     * Włącza powiadomienia push w przeglądarce aktora: każdy nowy wpis w jego dzwonku przyjdzie tam jako kopia.
     * Tylko adresy znanych usług push. Przeglądarka, która należała do kogoś innego, przechodzi na aktora.
     */
    subscribeToPush(subscription: PushSubscriptionData): Promise<void>;
    /** Wyłącza powiadomienia push w tej przeglądarce aktora (np. przy wylogowaniu). Cudzej nie rusza. */
    unsubscribeFromPush(endpoint: string): Promise<void>;
    /**
     * Raport tygodniowy firmy w tej chwili: narzędzia ponad progiem, zaginione, kwota poza bazą wobec raportu
     * z poprzedniego tygodnia, zgłoszenia narzędzi i sprzęt najdłużej nieużywany. Tylko właściciel.
     */
    weeklyReport(): Promise<WeeklyReport>;
    /** Raport piątkowy w tej chwili: sprzęt poza bazą według lokalizacji. Właściciel całą firmę, kierownik swoje. */
    fridayReport(): Promise<FridayReport>;
    /** Raport z dzwonka aktora z danego dnia (RRRR-MM-DD), tak jak go wtedy dostał; null, gdy go nie dostał. */
    sentReport(kind: ReportKind, day: string): Promise<Report | null>;
    /** Ustawienia firmy. Tylko właściciel. */
    settings(): Promise<CompanySettings>;
    /** Zmienia ustawienia firmy, np. próg dni alarmu (1–365). Tylko właściciel. */
    updateSettings(input: CompanySettings): Promise<void>;
    /** Abonament firmy: próg z limitem, liczba narzędzi, „opłacone do” i stan. Tylko właściciel. */
    subscription(): Promise<CompanySubscription>;
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
      createCompany: async (raw) =>
        createCompany(deps, normalizeNewCompany(raw), { tier: subscriptions.DEFAULT_TIER, paidUntil: null, invoice: null }, (fn) =>
          deps.db.transaction(fn),
        ),
      createSuperAdmin: async ({ email: raw }) => {
        const email = raw.trim().toLowerCase();
        if (!EMAIL_PATTERN.test(email)) throw new RegistryError("invalid_input");
        const password = generateTemporaryPassword();
        const { userId } = await createAccount(deps, email, password);
        try {
          await deps.db.transaction((sql) =>
            sql("insert into app.super_admins (user_id, created_at) values ($1, $2)", [userId, deps.clock.now()]),
          );
        } catch (error) {
          await deps.authAdmin.deleteUser(userId).catch((cleanupError) => console.error(cleanupError));
          throw error;
        }
        return { userId, password };
      },
      notifyExceededThresholds: async () => {
        const now = deps.clock.now();
        const companyIds = await deps.db.transaction((sql) => thresholds.companiesWithSites(sql));
        let tools = 0;
        // Każda firma w osobnej transakcji: błąd jednej nie zabiera powiadomień pozostałym.
        for (const companyId of companyIds) {
          try {
            const result = await deps.db.transaction((sql) => thresholds.notifyExceededThresholds(sql, companyId, now));
            tools += result.tools;
            await sendPushCopies(deps, result.copies);
          } catch (error) {
            console.error(`Nie sprawdzono progów dni firmy ${companyId}`, error);
          }
        }
        return { tools };
      },
      sendDueReports: async () => {
        const now = deps.clock.now();
        const sent = { weekly: 0, friday: 0 };
        const due = reports.dueReports(now);
        if (due.length === 0) return sent;
        const companyIds = await deps.db.transaction((sql) => reports.companies(sql));
        // Każdy raport każdej firmy osobno: błąd jednego nie zabiera pozostałych.
        for (const companyId of companyIds) {
          for (const { kind } of due) {
            try {
              if (await sendReport(deps, companyId, kind, now)) sent[kind === "tygodniowy" ? "weekly" : "friday"] += 1;
            } catch (error) {
              console.error(`Nie wysłano raportu (${kind}) firmy ${companyId}`, error);
            }
          }
        }
        return sent;
      },
      notifySubscriptionDeadlines: async () => {
        const now = deps.clock.now();
        const paid = await deps.db.transaction((sql) => readOnly.paidSubscriptions(sql));
        const result = { warned: 0, switched: 0 };
        // Każda firma w osobnej transakcji: błąd jednej nie zabiera powiadomień pozostałym.
        for (const subscription of paid) {
          try {
            const { notice, copies, emails } = await deps.db.transaction((sql) => readOnly.notifyDeadline(sql, subscription, now));
            if (notice === "tylko_do_odczytu_wkrotce") result.warned += 1;
            if (notice === "tylko_do_odczytu") result.switched += 1;
            await Promise.all([sendNotifications(deps.notifier, emails), sendPushCopies(deps, copies)]);
          } catch (error) {
            console.error(`Nie sprawdzono terminu płatności firmy ${subscription.companyId}`, error);
          }
        }
        return result;
      },
    }),
    superAdmin: (userId) => {
      /** Transakcja super-admina: RLS widzi jego JWT, a Rejestr najpierw sprawdza rolę. */
      const asSuperAdmin = <T>(fn: (sql: Sql) => Promise<T>) =>
        withActor(deps.db, userId, async (sql) => {
          await subscriptions.requireSuperAdmin(sql);
          return fn(sql);
        });
      return {
        isSuperAdmin: () => withActor(deps.db, userId, (sql) => subscriptions.isSuperAdmin(sql)),
        companies: () => asSuperAdmin((sql) => subscriptions.managedCompanies(sql, deps.clock.now())),
        company: (companyId) =>
          asSuperAdmin(async (sql) => (await subscriptions.managedCompanies(sql, deps.clock.now(), companyId))[0] ?? null),
        createCompany: async (raw) => {
          // Uprawnienia sprawdzamy, zanim powstanie konto logowania.
          const { input, subscription } = await asSuperAdmin(async () => ({
            input: normalizeNewCompany(raw),
            subscription: {
              tier: subscriptions.requireTier(raw.tier),
              paidUntil: raw.paidUntil ? subscriptions.requirePaidUntil(raw.paidUntil) : null,
              invoice: subscriptions.normalizeInvoice(raw.invoice),
            },
          }));
          return createCompany(deps, input, subscription, asSuperAdmin);
        },
        changeTier: (companyId, tier) =>
          asSuperAdmin((sql) => subscriptions.updateSubscription(sql, companyId, { tier: subscriptions.requireTier(tier) })),
        setPaidUntil: (companyId, day) =>
          asSuperAdmin((sql) => subscriptions.updateSubscription(sql, companyId, { paidUntil: subscriptions.requirePaidUntil(day) })),
        setManualReadOnly: async (companyId, on) => {
          const copies = await asSuperAdmin((sql) => readOnly.setManualReadOnly(sql, companyId, on === true, deps.clock.now()));
          await sendPushCopies(deps, copies);
        },
      };
    },
    as: (userId) => {
      /**
       * Transakcja członka firmy. Bez `allowPendingPasswordChange` wymaga zmienionego hasła tymczasowego.
       * `access` w trybie tylko do odczytu: `write` (polecenie zapisu danych firmy) od razu odmawia, `read`
       * (domyślnie) idzie w transakcji, w której baza odrzuci każdy zapis, a `personal` (sprawy samego aktora:
       * hasło, dzwonek, push) działa jak zawsze.
       */
      const asMember = <T>(
        fn: (sql: Sql, session: Session) => Promise<T>,
        opts: { allowPendingPasswordChange?: boolean; access?: "read" | "write" | "personal" } = {},
      ) =>
        withActor(deps.db, userId, async (sql) => {
          const session = await loadSession(sql, userId, deps.clock.now());
          if (!session) throw new RegistryError("no_access");
          if (session.mustChangePassword && !opts.allowPendingPasswordChange) {
            throw new RegistryError("password_change_required");
          }
          const access = opts.access ?? "read";
          if (session.company.readOnly && access !== "personal") {
            if (access === "write") throw new RegistryError("read_only");
            await readOnly.enterReadOnly(sql);
          }
          try {
            return await fn(sql, session);
          } catch (error) {
            throw readOnly.readOnlyError(error);
          }
        });
      /** Polecenie zapisu danych firmy; w trybie tylko do odczytu odmawia (`read_only`). */
      const asWriter = <T>(fn: (sql: Sql, session: Session) => Promise<T>) => asMember(fn, { access: "write" });
      /** Zapis spraw samego aktora (dzwonek, push); działa także w trybie tylko do odczytu. */
      const asPersonal = <T>(fn: (sql: Sql, session: Session) => Promise<T>) => asMember(fn, { access: "personal" });
      /** Z ostrzeżeniem o limicie narzędzi w progu, w transakcji polecenia, które je dodało. */
      const withLimitWarning = async <R>(sql: Sql, result: R): Promise<R & WithLimitWarning> => ({
        ...result,
        limitWarning: await subscriptions.toolLimitWarning(sql),
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
            asWriter(async (sql, session) => {
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

      const registerMovement = async (input: RegisterMovementInput): Promise<RegisteredMovement> => {
        // Kopie push nowych wpisów dzwonka z podejścia, które się zatwierdziło.
        let copies: PushCopy[] = [];
        const { result, replayed } = await movementCommand(movements.registerMovement, async (sql, movement) => {
          const list = await notifications.notificationsFor(sql, movement);
          // Ponowienie operacji niczego nie dubluje w dzwonku, a w wyniku są te same powiadomienia.
          copies = await bell.deliver(sql, list, deps.clock.now());
          return { ...movement, notifications: list };
        })(input);
        await Promise.all([replayed ? null : sendNotifications(deps.notifier, result.notifications), sendPushCopies(deps, copies)]);
        return result;
      };

      return {
        session: () => withActor(deps.db, userId, (sql) => loadSession(sql, userId, deps.clock.now())),
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
            { allowPendingPasswordChange: true, access: "personal" },
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
            { allowPendingPasswordChange: true, access: "personal" },
          );
        },
        whereIsWhat: () => asMember((sql, session) => board.whereIsWhat(sql, session, deps.clock.now())),
        toolCatalog: () => asMember((sql) => catalog.toolCatalog(sql)),
        categories: () => asMember((sql) => tools.listCategories(sql)),
        addCategory: (input) =>
          asWriter((sql, session) => {
            tools.requireToolManager(session);
            return tools.addCategory(sql, session, input, deps.clock.now());
          }),
        suggestCode: (categoryId) => asMember((sql) => tools.suggestCode(sql, categoryId)),
        addTool: async (input) => {
          const attempt = () =>
            asWriter(async (sql, session) => {
              tools.requireToolManager(session);
              return withLimitWarning(sql, await tools.addTool(sql, session, input, deps.clock.now()));
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
          asWriter((sql, session) => {
            tools.requireToolManager(session);
            return tools.editTool(sql, session, toolId, input);
          }),
        previewToolImport: (rows) =>
          asMember((sql, session) => {
            toolImport.requireImporter(session);
            return toolImport.previewToolImport(sql, session, rows);
          }),
        importTools: async (input) => {
          const attempt = () =>
            asWriter(async (sql, session) => withLimitWarning(sql, await toolImport.importTools(sql, session, input, deps.clock.now())));
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
          asWriter(async (sql, session) => {
            stickers.requireStickerPrinter(session);
            return print(await stickers.printStickers(sql, session, selection, deps.clock.now()));
          }),
        stickerCandidates: () =>
          asMember((sql, session) => {
            stickers.requireStickerPrinter(session);
            return stickers.stickerCandidates(sql);
          }),
        reportTool: async (input) => {
          const attempt = () =>
            asWriter(async (sql, session) => withLimitWarning(sql, await toolReports.reportTool(sql, session, input, deps.clock.now())));
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
        acceptToolReport: (input) => asWriter((sql, session) => toolReports.acceptToolReport(sql, session, input)),
        rejectToolReport: movementOnlyCommand(toolReports.rejectToolReport),
        team: () =>
          asMember((sql, session) => {
            team.requireTeamManager(session);
            return team.listTeam(sql);
          }),
        addMember: async (input) => {
          // Uprawnienia sprawdzamy, zanim powstanie konto logowania.
          const member = await asWriter(async (_sql, session) => {
            team.requireTeamManager(session);
            return team.normalizeNewMember(input);
          });
          const temporaryPassword = generateTemporaryPassword();
          const { userId } = await createAccount(deps, member.email, temporaryPassword);
          try {
            await asWriter((sql, session) => {
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
          asWriter(async (sql, session) => {
            team.requireTeamManager(session);
            await team.requireManagedMember(sql, memberId);
            await team.markPasswordTemporary(sql, memberId, deps.clock.now());
            const temporaryPassword = generateTemporaryPassword();
            // Hasło zmieniamy przed zatwierdzeniem transakcji: gdy Auth odmówi, flaga się nie zmieni.
            await deps.authAdmin.setPassword(memberId, temporaryPassword);
            return { temporaryPassword };
          }),
        deactivateMember: (memberId) =>
          asWriter(async (sql, session) => {
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
            vehicles: await locations.vehicles(sql, { activeOnly: false }),
          })),
        siteManagerCandidates: () =>
          asMember((sql, session) => {
            locations.requireLocationManager(session);
            return locations.siteManagerCandidates(sql);
          }),
        addSite: (input) =>
          asWriter((sql, session) => {
            locations.requireLocationManager(session);
            return locations.addSite(sql, session, input, deps.clock.now());
          }),
        changeSiteManager: (siteId, managerId) =>
          asWriter((sql, session) => {
            locations.requireLocationManager(session);
            return locations.changeSiteManager(sql, siteId, managerId);
          }),
        addService: (input) =>
          asWriter((sql, session) => {
            locations.requireLocationManager(session);
            return locations.addService(sql, session, input, deps.clock.now());
          }),
        addVehicle: (input) =>
          asWriter((sql, session) => {
            locations.requireLocationManager(session);
            return locations.addVehicle(sql, session, input, deps.clock.now());
          }),
        changeVehicleManager: (vehicleId, managerId) =>
          asWriter((sql, session) => {
            locations.requireLocationManager(session);
            return locations.changeVehicleManager(sql, vehicleId, managerId);
          }),
        setVehicleAlarm: (vehicleId, enabled) =>
          asWriter((sql, session) => {
            locations.requireLocationManager(session);
            return locations.setVehicleAlarm(sql, vehicleId, enabled);
          }),
        deactivateVehicle: (vehicleId) =>
          asWriter((sql, session) => {
            locations.requireLocationManager(session);
            return locations.deactivateVehicle(sql, vehicleId);
          }),
        closeSite: async (siteId) => {
          const attempt = () => asWriter((sql, session) => siteClosing.closeSite(sql, session, siteId, deps.clock.now()));
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
        registerMovement,
        registerQueuedMovement: async (queued) => {
          // Telefon ze spieszącym się zegarem nie może odrzucić ruchu na zawsze: taki ruch zdarzył się najpóźniej teraz.
          const now = deps.clock.now();
          const input = queued.occurredAt && queued.occurredAt > now ? { ...queued, occurredAt: now } : queued;
          const rejected = await asMember((sql, session) => queuedMovements.rejectionByOperation(sql, session, input.operationId));
          if (rejected) return { status: "rejected", rejection: rejected };
          try {
            return { status: "registered", movement: await registerMovement(input) };
          } catch (error) {
            if (!queuedMovements.isFinalRejection(error, input)) throw error;
            const { rejection, copies } = await asWriter((sql, session) =>
              queuedMovements.recordRejection(sql, session, input, error, deps.clock.now()),
            );
            await sendPushCopies(deps, copies);
            return { status: "rejected", rejection };
          }
        },
        movementsToClarify: () => asMember((sql, session) => queuedMovements.movementsToClarify(sql, session)),
        resolveRejectedMovement: (rejectionId) =>
          asWriter((sql, session) => queuedMovements.resolveRejectedMovement(sql, session, rejectionId, deps.clock.now())),
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
        markNotificationRead: (notificationId) => asPersonal((sql, session) => bell.markRead(sql, session, notificationId, deps.clock.now())),
        markAllNotificationsRead: () => asPersonal((sql, session) => bell.markAllRead(sql, session, deps.clock.now())),
        subscribeToPush: (subscription) => asPersonal((sql) => push.subscribe(sql, subscription, deps.clock.now())),
        unsubscribeFromPush: (endpoint) => asPersonal((sql, session) => push.unsubscribe(sql, session, endpoint)),
        weeklyReport: () => asMember((sql, session) => reports.weeklyReport(sql, session, deps.clock.now())),
        fridayReport: () => asMember((sql, session) => reports.fridayReport(sql, session, deps.clock.now())),
        sentReport: (kind, day) => asMember((sql, session) => reports.sentReport(sql, session, kind, day)),
        settings: () =>
          asMember((sql, session) => {
            settings.requireSettingsManager(session);
            return settings.companySettings(sql, session);
          }),
        updateSettings: (input) =>
          asWriter((sql, session) => {
            settings.requireSettingsManager(session);
            return settings.updateSettings(sql, session, input);
          }),
        subscription: () =>
          asMember((sql, session) => {
            subscriptions.requireSubscriptionReader(session);
            return subscriptions.companySubscription(sql, deps.clock.now());
          }),
      };
    },
  };
}

/**
 * Raport firmy z tej chwili: składa go (tak jak widzi firmę) jej najdawniej dodany aktywny właściciel, a zapis
 * w dzwonkach idzie w transakcji systemowej, raz na dzień. Kopie push i e-mail wysyła po zatwierdzeniu.
 * Zwraca, czy raport właśnie poszedł.
 */
async function sendReport(deps: Deps, companyId: string, kind: ReportKind, now: Date): Promise<boolean> {
  const [owner] = await deps.db.transaction((sql) => reports.owners(sql, companyId));
  if (!owner) return false;
  const report = await withActor(deps.db, owner.userId, async (sql) => {
    const session = await loadSession(sql, owner.userId, now);
    if (!session) throw new RegistryError("no_access");
    return kind === "tygodniowy" ? reports.weeklyReport(sql, session, now) : reports.fridayReport(sql, session, now);
  });
  const result = await deps.db.transaction((sql) => reports.deliverReport(sql, companyId, report, now));
  await Promise.all([sendNotifications(deps.notifier, result.emails), sendPushCopies(deps, result.copies)]);
  return result.delivered;
}

/**
 * Wysyła e-maile z powiadomieniami już zapisanego zdarzenia (ruchu, raportu). Zdarzenie się nie cofnie, więc błąd
 * wysyłki tylko odnotowujemy.
 */
async function sendNotifications(notifier: Notifier, list: EmailedNotification[]) {
  await Promise.all(
    list.map((notification) =>
      notifier.send(notification).catch((error) => console.error("Nie wysłano powiadomienia", notification.kind, error)),
    ),
  );
}

/**
 * Wysyła kopie push już zapisanych wpisów na przeglądarki adresatów i usuwa subskrypcje, które wygasły.
 * Subskrypcje innych osób czyta transakcja systemowa. Wpis w dzwonku zostaje, więc błąd tylko odnotowujemy.
 */
async function sendPushCopies(deps: Deps, copies: PushCopy[]) {
  if (copies.length === 0) return;
  try {
    const subscriptions = await deps.db.transaction((sql) => push.subscriptionsOf(sql, [...new Set(copies.map((copy) => copy.recipientId))]));
    const expired: string[] = [];
    await Promise.all(
      copies.flatMap((copy) =>
        subscriptions
          .filter((subscription) => subscription.userId === copy.recipientId)
          .map(({ endpoint, keys }) =>
            deps.notifier
              .push({ endpoint, keys }, copy.message)
              .then((outcome) => void (outcome === "expired" && expired.push(endpoint)))
              .catch((error) => console.error("Nie wysłano powiadomienia push", copy.message.window, error)),
          ),
      ),
    );
    if (expired.length > 0) await deps.db.transaction((sql) => push.forgetExpired(sql, [...new Set(expired)]));
  } catch (error) {
    console.error("Nie wysłano powiadomień push", error);
  }
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

function normalizeNewCompany(raw: CreateCompanyInput): CreateCompanyInput {
  const input = {
    name: raw.name.trim(),
    baseName: raw.baseName.trim(),
    owner: { email: raw.owner.email.trim().toLowerCase(), fullName: raw.owner.fullName.trim() },
  };
  if (!input.name || !input.baseName || !input.owner.fullName || !EMAIL_PATTERN.test(input.owner.email)) {
    throw new RegistryError("invalid_input");
  }
  return input;
}

/**
 * Zakłada konto logowania właściciela, a potem w jednej transakcji `transaction` (systemowej albo
 * super-admina) firmę, bazę, właściciela i abonament.
 */
async function createCompany(
  deps: Deps,
  input: CreateCompanyInput,
  subscription: NewSubscription,
  transaction: <T>(fn: (sql: Sql) => Promise<T>) => Promise<T>,
): Promise<CreatedCompany> {
  const temporaryPassword = generateTemporaryPassword();
  const { userId } = await createAccount(deps, input.owner.email, temporaryPassword);
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
        `insert into app.users (user_id, company_id, role, full_name, email, must_change_password,
                                temporary_password_issued_at, created_at)
         values ($1, $2, 'wlasciciel', $3, $4, true, $5, $5)`,
        [userId, company.id, input.owner.fullName, input.owner.email, now],
      );
      await subscriptions.insertSubscription(sql, company.id, subscription);
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

/** Sesja aktora transakcji (`userId` to jego JWT), z trybem tylko do odczytu firmy w chwili `now`. */
async function loadSession(sql: Sql, userId: string, now: Date): Promise<Session | null> {
  const [row] = await sql<{
    full_name: string;
    role: Role;
    must_change_password: boolean;
    company_id: string;
    company_name: string;
    paid_until: string | null;
    manual_read_only: boolean | null;
  }>(
    `select u.full_name, u.role, u.must_change_password, c.id as company_id, c.name as company_name,
            to_char(p.paid_until, 'YYYY-MM-DD') as paid_until, p.manual_read_only
     from app.users u join app.companies c on c.id = u.company_id
     left join app.current_company_plan() p on true
     where u.user_id = $1 and u.active`,
    [userId],
  );
  if (!row) return null;
  return {
    userId,
    fullName: row.full_name,
    role: row.role,
    mustChangePassword: row.must_change_password,
    company: {
      id: row.company_id,
      name: row.company_name,
      readOnly: readOnly.isReadOnly({ paidUntil: row.paid_until, manualReadOnly: row.manual_read_only === true }, now),
    },
  };
}
