import * as bell from "./bell";
import type { Bell, BellEntry } from "./bell";
import * as board from "./board";
import * as catalog from "./catalog";
import type { CatalogTool } from "./catalog";
import type { WhereIsWhat } from "./board";
import { RegistryError, ReplayedOperationError } from "./errors";
import { type AuthAdmin, type Clock, type Db, EmailTakenError, type Notifier, type PhotoStore, type Sql } from "./ports";
import * as corrections from "./corrections";
import * as deadlineReminders from "./deadline-reminders";
import * as deadlines from "./deadlines";
import type { AddDocumentInput, CompleteDeadlineInput, DeadlineChanges, NewDeadlineInput, UpcomingDeadline } from "./deadlines";
import * as demo from "./demo";
import type { DemoAccount, DemoUse } from "./demo";
import * as history from "./history";
import * as issues from "./issues";
import type { CloseIssueInput, CommentOnIssueInput, FileIssueInput, Issue, IssueSummary } from "./issues";
import type { HistoryFilterOptions, HistoryFilters, MovementHistory } from "./history";
import type { CorrectToolInput, MarkToolLostInput, RetireToolInput } from "./corrections";
import * as locations from "./locations";
import type { NewSiteInput, NewVehicleInput, Service, Site, SiteManagerCandidate, Vehicle } from "./locations";
import * as movements from "./movements";
import type { Movement, RecentMovement, RegisterMovementInput, UndoMovementInput } from "./movements";
import * as notifications from "./notifications";
import type { EmailedNotification, ToolsTakenNotification } from "./notifications";
import * as photos from "./photos";
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
import * as supportChat from "./support-chat";
import type { SupportChat, SupportMessageInput, SupportReplyInput, SupportThread, SupportThreadSummary } from "./support-chat";
import type { CompanySubscription, ManagedCompany, NewCompanyInput, NewSubscription, TierId, ToolLimitWarning } from "./subscriptions";
import * as thresholds from "./thresholds";
import type { FinishedSite, ForceCloseSiteInput } from "./site-closing";
import { generateTemporaryPassword } from "./temporary-password";
import * as toolImport from "./tool-import";
import type { ImportToolsInput, ToolImportPreview, ToolImportRow } from "./tool-import";
import * as team from "./team";
import type { AddedMember, NewMemberInput, TeamMember } from "./team";
import * as stickers from "./stickers";
import type { StickerBatch, StickerCandidate, StickerSelection } from "./stickers";
import * as toolReports from "./tool-reports";
import type { AcceptToolReportInput, RejectToolReportInput, ReportToolInput, ToolReport } from "./tool-reports";
import * as tools from "./tools";
import type { AddToolInput, Category, EditToolInput, ToolCard } from "./tools";
import { EMAIL_PATTERN, UUID_PATTERN } from "./validation";

export type Role = "wlasciciel" | "magazynier" | "kierownik" | "pracownik";

export type { LostOnBoard, ToolOnBoard, WhereIsWhat } from "./board";
export type { CatalogTool } from "./catalog";
export type {
  AddDocumentInput,
  CompleteDeadlineInput,
  DeadlineChanges,
  DeadlineDocument,
  DeadlineKind,
  DeadlineStatus,
  DeadlineSummary,
  DocumentKind,
  NewDeadlineInput,
  NewDocument,
  NextDeadline,
  ToolDeadline,
  UpcomingDeadline,
} from "./deadlines";
export {
  canAttachDocument,
  canCompleteDeadlines,
  canManageDeadlines,
  DEADLINE_KINDS,
  DOCUMENT_KINDS,
  MAX_CYCLE_MONTHS,
  MAX_DEADLINE_NOTE_LENGTH,
  UPCOMING_DAYS,
} from "./deadlines";
export type { AddToolInput, Category, EditToolInput, HistoryEntry, LocationKind, LostTool, ToolCard, ToolState } from "./tools";
export { canManageTools, canSeeValues } from "./tools";
export type { ImportPreviewRow, ImportRowError, ImportToolsInput, ToolImportPreview, ToolImportRow } from "./tool-import";
export { canImportTools, MAX_IMPORT_ROWS } from "./tool-import";
export type { HistoryFilterOptions, HistoryFilters, MovementHistory } from "./history";
export type { CompanySettings, IssueVisibility } from "./settings";
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
export { canMoveEverywhere, canMoveTools, canRegisterMovements, MAX_TRANSCRIPT_LENGTH, MovementConflictError, REGISTER_SOURCES, UNDO_WINDOW_MS } from "./movements";
export { readOnlyWarning } from "./notifications";
export type {
  DeadlinesNotification,
  EmailedNotification,
  FridayReportNotification,
  MovementRejectedNotification,
  Notification,
  NotifiedPlace,
  NotificationContent,
  NotificationKind,
  NotifiedDeadline,
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
export type {
  CloseIssueInput,
  CommentOnIssueInput,
  FileIssueInput,
  Issue,
  IssueComment,
  IssueEntry,
  IssueKind,
  IssueStatus,
  IssueSubject,
  IssueSummary,
} from "./issues";
export { ISSUE_KINDS, MAX_ISSUE_TEXT_LENGTH } from "./issues";
export { MAX_PHOTO_BYTES } from "./photos";
export type { PushMessage, PushSubscriptionData } from "./push";
export type {
  UserMessage,
  SupportChat,
  SupportChatMessage,
  SupportMessageContext,
  SupportMessageInput,
  SupportReply,
  SupportReplyInput,
  SupportSender,
  SupportThread,
  SupportThreadMessage,
  SupportThreadSummary,
} from "./support-chat";
export { canUseSupportChat, MAX_SUPPORT_MESSAGE_LENGTH } from "./support-chat";
export type { RejectedMovement } from "./queued-movements";
export type { AddedMember, MemberRole, NewMemberInput, TeamMember } from "./team";
export { canManageTeam, MEMBER_ROLES } from "./team";
export type { AcceptToolReportInput, RejectToolReportInput, ReportToolInput, ToolReport } from "./tool-reports";
export { canReportTools, canReviewToolReports } from "./tool-reports";
export type { StickerBatch, StickerCandidate, StickerSelection } from "./stickers";
export type { DemoAccount, DemoUse } from "./demo";
export { DEMO_EMAIL_DOMAIN, isDemoEmail } from "./demo";
export { canPrintStickers } from "./stickers";

export interface Session {
  userId: string;
  fullName: string;
  role: Role;
  mustChangePassword: boolean;
  /**
   * `readOnly`: firma jest w trybie tylko do odczytu (ręcznie albo po 14 dniach od „opłacone do”). `demo`: firma
   * demo, do której wchodzi się bez hasła ze strony /demo.
   */
  company: { id: string; name: string; readOnly: boolean; demo: boolean };
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
  /** Wątki czatu z supportem ze wszystkich firm: z nieprzeczytanymi na górze, potem od najnowszej wiadomości. */
  supportThreads(): Promise<SupportThreadSummary[]>;
  /** Wątek (identyfikator to jego użytkownik) z wiadomościami i kontekstem albo null, gdy go nie ma. */
  supportThread(threadId: string): Promise<SupportThread | null>;
  /** Liczba wątków z nieprzeczytanymi wiadomościami użytkowników. */
  unreadSupportThreadCount(): Promise<number>;
  /** Otwarcie wątku: wiadomości użytkownika są przeczytane. */
  markSupportThreadRead(threadId: string): Promise<void>;
  /** Odpowiedź GP Engineering w wątku, z tekstem i (albo) zdjęciem. Użytkownik dostaje ją w oknie 💬 z kopią push. */
  replyToSupportThread(input: SupportReplyInput): Promise<void>;
  /** Zdjęcie z dowolnego wątku; null, gdy go nie ma. */
  supportPhoto(messageId: string): Promise<Blob | null>;
}

export interface Registry {
  /** Aktor systemowy: skrypty i zadania harmonogramu, poza RLS. */
  system(): {
    /** Firma z bazą i właścicielem, na najniższym progu, bez danych do faktury (skrypty i testy). */
    createCompany(input: CreateCompanyInput): Promise<CreatedCompany>;
    /** Konto super-admina (GP Engineering) z wygenerowanym hasłem, do przekazania raz. */
    createSuperAdmin(input: { email: string }): Promise<{ userId: string; password: string }>;
    /**
     * Adresy kont Supabase Auth, na które logowanie próbuje wpuścić z tym loginem, po kolei: e-mail to on sam,
     * a nazwa użytkownika pracownika to adresy jego kont (ta sama nazwa bywa w kilku firmach). Pusta lista,
     * gdy login nie jest ani e-mailem, ani nadaną nazwą użytkownika.
     */
    signInEmails(login: string): Promise<string[]>;
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
     * Zadanie dzienne progów dni (jak `notifyExceededThresholds`) tylko dla jednej firmy: scenariusz demo przechodzi
     * z nim przez swoje dni, żeby dzwonek miał alarmy. Inne firmy nic nie dostają.
     */
    notifyCompanyExceededThresholds(companyId: string): Promise<{ tools: number }>;
    /** Raporty, na które przyszła pora (jak `sendDueReports`), tylko dla jednej firmy (scenariusz demo). */
    sendCompanyDueReports(companyId: string): Promise<{ weekly: number; friday: number }>;
    /**
     * Zadanie dzienne: przypomnienia o terminach sprzętu w obiegu, tydzień przed terminem w Polsce i (poza gwarancją) po
     * nim, każde raz. Właściciel dostaje jedno zbiorcze, a kierownik budowy albo pojazdu o sprzęcie, który jest u niego.
     */
    notifyDueDeadlines(): Promise<{ deadlines: number }>;
    /** Przypomnienia o terminach (jak `notifyDueDeadlines`) tylko dla jednej firmy (scenariusz demo). */
    notifyCompanyDueDeadlines(companyId: string): Promise<{ deadlines: number }>;
    /**
     * Zadanie dzienne: właściciele firm dostają ostrzeżenie 7 dni i 1 dzień przed trybem tylko do odczytu
     * (dzwonek, push i e-mail) i wpis o samym przełączeniu (dzwonek i push), każde raz na termin. Przy ręcznym
     * trybie nic. Zwraca, ile firm dostało ostrzeżenie, a ile wpis o przełączeniu. Danych firm nic nie kasuje.
     */
    notifySubscriptionDeadlines(): Promise<{ warned: number; switched: number }>;
    /** Konta obecnej firmy demo (włączonej ostatnio), po roli; pusta lista, gdy demo nie założono. */
    demoAccounts(): Promise<DemoAccount[]>;
    /** Kiedy ktoś ostatnio wszedł do obecnego demo (zadanie godzinowe odświeża tylko używane); null, gdy demo nie założono. */
    demoUse(): Promise<DemoUse | null>;
    /** Czy użytkownik ma konto w firmie demo, obecnej albo poprzedniej (wtedy wraca na stronę /demo). */
    isDemoAccount(userId: string): Promise<boolean>;
    /**
     * Firma staje się obecnym demo (skrypt demo, po wypełnieniu jej danymi): abonament opłacony na lata, a konta
     * poprzednich firm demo są dezaktywowane i mają zablokowane logowanie.
     */
    activateDemoCompany(companyId: string): Promise<void>;
  };
  /**
   * Zalogowany super-admin (GP Engineering), poza firmami. Każde polecenie sprawdza tę rolę w bazie
   * (RLS), a komuś innemu odmawia (`forbidden`).
   */
  superAdmin(userId: string): SuperAdminRegistry;
  /**
   * Zalogowany użytkownik; firmę i rolę Rejestr ustala sam, a RLS ich pilnuje. W trybie tylko do odczytu każde
   * polecenie zapisu danych firmy odmawia (`read_only`), a zapytania działają. Zapisy spraw samego aktora (hasło,
   * dzwonek, push, czat z supportem) działają zawsze.
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
    /**
     * Narzędzia w obiegu z kategorią, marką, lokalizacją, dniami w niej i odpowiedzialnym kierownikiem, bez wartości
     * (dla interpretacji tekstu i wyszukiwania).
     */
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
     * Termin przy narzędziu: przegląd, kalibracja, badanie UDT albo koniec gwarancji, jeden każdego rodzaju
     * (drugi: `deadline_taken`), z opcjonalnym cyklem w miesiącach. Tylko właściciel; widzi je każdy w firmie.
     */
    addDeadline(input: NewDeadlineInput): Promise<{ deadlineId: string }>;
    /** Zmienia datę, cykl albo opis terminu. Tylko właściciel. */
    updateDeadline(deadlineId: string, changes: DeadlineChanges): Promise<void>;
    /** Usuwa termin razem z dokumentami. Tylko właściciel. */
    deleteDeadline(deadlineId: string): Promise<void>;
    /**
     * Wykonany przegląd, kalibracja albo badanie UDT (najpóźniej dziś w Polsce), z opcjonalnym dokumentem (np.
     * protokołem): następny termin to podany, a bez niego liczy się z cyklu (bez cyklu go nie ma). Właściciel
     * i magazynier. Ponowne wysłanie tej samej operacji zwraca bieżący termin. Zwraca następny termin.
     */
    completeDeadline(input: CompleteDeadlineInput): Promise<{ dueOn: string | null }>;
    /**
     * Dokument przy terminie: PDF albo zdjęcie do 4 MB (inaczej `document_invalid`). Właściciel, a magazynier bez faktur.
     * Każdy w firmie go widzi, poza fakturą (ma cenę), którą widzi tylko właściciel.
     */
    addDeadlineDocument(input: AddDocumentInput): Promise<{ documentId: string }>;
    /** Usuwa dokument terminu. Tylko właściciel. */
    deleteDeadlineDocument(documentId: string): Promise<void>;
    /** Plik dokumentu z nazwą; null, gdy aktor go nie widzi. */
    deadlineDocument(documentId: string): Promise<{ file: Blob; fileName: string } | null>;
    /** Terminy sprzętu w obiegu w najbliższych 30 dniach i te po terminie (bez wygasłych gwarancji). Widzi je każda rola. */
    upcomingDeadlines(): Promise<UpcomingDeadline[]>;
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
    /**
     * Zgłoszenie do właściciela: uszkodzenie (z narzędziem w obiegu, które od razu dostaje flagę „uszkodzone”),
     * brak lub zaginięcie (stan narzędzia się nie zmienia) albo inna sprawa, z opisem i opcjonalnym zdjęciem.
     * Składa je każda rola. Trafia do okna 📋 każdego, kto je widzi, poza autorem, z kopią push.
     */
    fileIssue(input: FileIssueInput): Promise<{ issueId: string }>;
    /**
     * Zgłoszenia, które aktor widzi: właściciel wszystkie, autor swoje, a kierownik lokalizacji i magazynier
     * według ustawień firmy. Otwarte przed zamkniętymi, od najnowszego.
     */
    issues(): Promise<IssueSummary[]>;
    /** Zgłoszenie z wątkiem albo null, gdy aktor go nie widzi. */
    issue(issueId: string): Promise<Issue | null>;
    /** Komentarz pod otwartym zgłoszeniem; komentuje każdy, kto je widzi. Wątek tylko się dopisuje. */
    commentOnIssue(input: CommentOnIssueInput): Promise<void>;
    /**
     * Zamyka zgłoszenie komentarzem. Właściciel zawsze (przy uszkodzeniu może uznać narzędzie za sprawne,
     * co zdejmuje flagę), magazynier tylko za zgodą w ustawieniach, kierownik i pracownik nigdy.
     */
    closeIssue(input: CloseIssueInput): Promise<void>;
    /** Zdjęcie zgłoszenia, które aktor widzi; null, gdy go nie widzi albo zgłoszenie nie ma zdjęcia. */
    issuePhoto(issueId: string): Promise<Blob | null>;
    /** Liczba nieprzeczytanych wpisów okna 📋 (licznik w nagłówku). */
    unreadIssueEntryCount(): Promise<number>;
    /** Otwarcie zgłoszenia: jego wpisy w oknie 📋 aktora są przeczytane. */
    markIssueRead(issueId: string): Promise<void>;
    markAllIssueEntriesRead(): Promise<void>;
    /** Wszystkie osoby w firmie, także dezaktywowane. Tylko właściciel. */
    team(): Promise<TeamMember[]>;
    /**
     * Zakłada konto kierownika, magazyniera lub pracownika z hasłem tymczasowym do przekazania osobiście.
     * Pracownik dostaje nazwę użytkownika unikalną w firmie (zajęta: `username_taken`), a e-mail może pominąć.
     */
    addMember(input: NewMemberInput): Promise<AddedMember>;
    /** Nowe hasło tymczasowe dla kierownika, magazyniera lub pracownika; przy logowaniu znowu musi ustawić własne. */
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
     * Tylko adresy znanych usług push. Przeglądarka, która należała do kogoś innego, przechodzi na aktora. W firmie
     * demo odmawia (`demo_push`), a kopie na konta firm demo nie wychodzą.
     */
    subscribeToPush(subscription: PushSubscriptionData): Promise<void>;
    /** Wyłącza powiadomienia push w tej przeglądarce aktora (np. przy wylogowaniu). Cudzej nie rusza. */
    unsubscribeFromPush(endpoint: string): Promise<void>;
    /**
     * Wiadomość na czacie z supportem, z tekstem i (albo) zdjęciem, i kontekstem (ekran, wersja aplikacji). Tylko
     * właściciel, kierownik i magazynier, także w trybie tylko do odczytu. Po pierwszej wiadomości (i po każdej,
     * na którą od doby nie odpowiedzieliśmy) przychodzi automatyczna odpowiedź. Support dostaje e-mail. W firmie
     * demo odmawia (`demo_chat`), bo konto roli dzielą wszyscy oglądający.
     */
    sendSupportMessage(input: SupportMessageInput): Promise<void>;
    /** Okno 💬: wątek aktora z supportem, od najstarszej wiadomości. W firmie demo odmawia (`demo_chat`). */
    supportChat(): Promise<SupportChat>;
    /** Liczba nieprzeczytanych odpowiedzi supportu (licznik 💬 w nagłówku); automatyczne się nie liczą. */
    unreadSupportReplyCount(): Promise<number>;
    /** Otwarcie okna 💬: odpowiedzi są przeczytane. */
    markSupportChatRead(): Promise<void>;
    /** Zdjęcie z wątku aktora; null, gdy go nie ma, wiadomość jest z cudzego wątku albo to firma demo. */
    supportPhoto(messageId: string): Promise<Blob | null>;
    /**
     * Raport tygodniowy firmy w tej chwili: narzędzia ponad progiem, zaginione, kwota poza bazą wobec raportu
     * z poprzedniego tygodnia, zgłoszenia narzędzi, sprzęt najdłużej nieużywany i terminy w najbliższych 30 dniach
     * (także te po terminie). Tylko właściciel.
     */
    weeklyReport(): Promise<WeeklyReport>;
    /** Raport piątkowy w tej chwili: sprzęt poza bazą według lokalizacji. Właściciel całą firmę, kierownik swoje. */
    fridayReport(): Promise<FridayReport>;
    /** Raport z dzwonka aktora z danego dnia (RRRR-MM-DD), tak jak go wtedy dostał; null, gdy go nie dostał. */
    sentReport(kind: ReportKind, day: string): Promise<Report | null>;
    /** Ustawienia firmy. Tylko właściciel. */
    settings(): Promise<CompanySettings>;
    /**
     * Zmienia podane ustawienia firmy: próg dni alarmu (1–365) i kto widzi zgłoszenia (zamykać może tylko
     * magazynier, który je widzi). Pominięte zostają bez zmian. Tylko właściciel.
     */
    updateSettings(input: Partial<CompanySettings>): Promise<void>;
    /** Abonament firmy: próg z limitem, liczba narzędzi, „opłacone do” i stan. Tylko właściciel. */
    subscription(): Promise<CompanySubscription>;
  };
}

export const MIN_PASSWORD_LENGTH = 8;
const RECOVERY_WINDOW_MS = 60 * 60 * 1000;

export interface RegistryDeps {
  db: Db;
  clock: Clock;
  authAdmin: AuthAdmin;
  notifier: Notifier;
  /** Zdjęcia zgłoszeń. */
  photos: PhotoStore;
  /** Zdjęcia z czatu z supportem. */
  chatPhotos: PhotoStore;
  /** Dokumenty terminów narzędzi: zdjęcia i PDF. */
  documents: PhotoStore;
}

export function createRegistry(deps: RegistryDeps): Registry {
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
      signInEmails: (login) => deps.db.transaction((sql) => team.signInEmails(sql, login)),
      notifyExceededThresholds: async () => {
        const now = deps.clock.now();
        const companyIds = await deps.db.transaction((sql) => thresholds.companiesWithSites(sql));
        let tools = 0;
        // Każda firma w osobnej transakcji: błąd jednej nie zabiera powiadomień pozostałym.
        for (const companyId of companyIds) {
          try {
            tools += await notifyThresholds(deps, companyId, now);
          } catch (error) {
            console.error(`Nie sprawdzono progów dni firmy ${companyId}`, error);
          }
        }
        return { tools };
      },
      sendDueReports: async () => {
        const now = deps.clock.now();
        const sent = { weekly: 0, friday: 0 };
        if (reports.dueReports(now).length === 0) return sent;
        const companyIds = await deps.db.transaction((sql) => reports.companies(sql));
        for (const companyId of companyIds) {
          const result = await sendDueReportsOf(deps, companyId, now);
          sent.weekly += result.weekly;
          sent.friday += result.friday;
        }
        return sent;
      },
      notifyCompanyExceededThresholds: async (companyId) => ({ tools: await notifyThresholds(deps, companyId, deps.clock.now()) }),
      notifyDueDeadlines: async () => {
        const now = deps.clock.now();
        const companyIds = await deps.db.transaction((sql) => deadlineReminders.companiesWithDeadlines(sql));
        let count = 0;
        // Każda firma w osobnej transakcji: błąd jednej nie zabiera przypomnień pozostałym.
        for (const companyId of companyIds) {
          try {
            count += await remindDeadlines(deps, companyId, now);
          } catch (error) {
            console.error(`Nie sprawdzono terminów firmy ${companyId}`, error);
          }
        }
        return { deadlines: count };
      },
      notifyCompanyDueDeadlines: async (companyId) => ({ deadlines: await remindDeadlines(deps, companyId, deps.clock.now()) }),
      sendCompanyDueReports: (companyId) => sendDueReportsOf(deps, companyId, deps.clock.now()),
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
      demoAccounts: () => deps.db.transaction((sql) => demo.demoAccounts(sql)),
      demoUse: () => deps.db.transaction((sql) => demo.demoUse(sql)),
      isDemoAccount: (userId) => deps.db.transaction((sql) => demo.isDemoAccount(sql, userId)),
      activateDemoCompany: async (companyId) => {
        const retired = await deps.db.transaction((sql) => demo.activateDemoCompany(sql, companyId, deps.clock.now()));
        for (const userId of retired) await deps.authAdmin.blockSignIn(userId);
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
        supportThreads: () => asSuperAdmin((sql) => supportChat.threads(sql)),
        supportThread: (threadId) => asSuperAdmin((sql) => supportChat.thread(sql, threadId)),
        unreadSupportThreadCount: () => asSuperAdmin((sql) => supportChat.unreadThreadCount(sql)),
        markSupportThreadRead: (threadId) => asSuperAdmin((sql) => supportChat.markRead(sql, threadId, "support")),
        replyToSupportThread: async (input) => {
          const sent = await savingPhoto(deps.chatPhotos, (save) =>
            retryOnReplay(() =>
              asSuperAdmin(async (sql) => {
                const content = await supportChat.checkMessage(input);
                const sent = await supportChat.reply(sql, userId, input, content, deps.clock.now());
                if (sent?.photoKey && content.photo) await save(sent.photoKey, content.photo.blob);
                return sent;
              }),
            ),
          );
          if (sent) await sendPushCopies(deps, [sent.copy]);
        },
        supportPhoto: async (messageId) => {
          const key = await asSuperAdmin((sql) => supportChat.visiblePhotoKey(sql, messageId));
          return key ? deps.chatPhotos.read(key) : null;
        },
      };
    },
    as: (userId) => {
      /**
       * Transakcja członka firmy. Bez `allowPendingPasswordChange` wymaga zmienionego hasła tymczasowego.
       * `access` w trybie tylko do odczytu: `write` (polecenie zapisu danych firmy) od razu odmawia, `read`
       * (domyślnie) idzie w transakcji, w której baza odrzuci każdy zapis, a `personal` (sprawy samego aktora:
       * hasło, dzwonek, push, czat z supportem) działa jak zawsze.
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
      /** Zapis spraw samego aktora (dzwonek, push, czat z supportem); działa także w trybie tylko do odczytu. */
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
            if (error instanceof ReplayedOperationError || error instanceof movements.ConcurrentMoveError) return attempt();
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

      /**
       * Wpis w wątku zgłoszenia (komentarz, zamknięcie), z jednym ponowieniem, gdy równoległa ponowka zapisała
       * tę samą operację. Kopie push nowych wpisów okna 📋 idą po zatwierdzeniu.
       */
      const issueCommand = async <I>(command: (sql: Sql, session: Session, input: I, now: Date) => Promise<PushCopy[]>, input: I) => {
        const copies = await retryOnReplay(() => asWriter((sql, session) => command(sql, session, input, deps.clock.now())));
        await sendPushCopies(deps, copies);
      };

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
        toolCatalog: () => asMember((sql) => catalog.toolCatalog(sql, deps.clock.now())),
        categories: () => asMember((sql) => tools.listCategories(sql)),
        addCategory: (input) =>
          asWriter((sql, session) => {
            tools.requireToolManager(session);
            return tools.addCategory(sql, session, input, deps.clock.now());
          }),
        suggestCode: (categoryId) => asMember((sql) => tools.suggestCode(sql, categoryId)),
        addTool: (input) =>
          retryOnReplay(() =>
            asWriter(async (sql, session) => {
              tools.requireToolManager(session);
              return withLimitWarning(sql, await tools.addTool(sql, session, input, deps.clock.now()));
            }),
          ),
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
        importTools: (input) =>
          retryOnReplay(() =>
            asWriter(async (sql, session) => withLimitWarning(sql, await toolImport.importTools(sql, session, input, deps.clock.now()))),
          ),
        toolCard: (toolId) => asMember((sql, session) => tools.toolCard(sql, session, toolId, deps.clock.now())),
        addDeadline: (input) => asWriter((sql, session) => deadlines.addDeadline(sql, session, input, deps.clock.now())),
        updateDeadline: (deadlineId, changes) => asWriter((sql, session) => deadlines.updateDeadline(sql, session, deadlineId, changes)),
        completeDeadline: (input) =>
          savingPhoto(deps.documents, (save) =>
            retryOnReplay(() =>
              asWriter(async (sql, session) => {
                const { dueOn, file } = await deadlines.completeDeadline(sql, session, input, deps.clock.now());
                if (file) await save(file.key, file.blob);
                return { dueOn };
              }),
            ),
          ),
        addDeadlineDocument: (input) =>
          savingPhoto(deps.documents, (save) =>
            retryOnReplay(() =>
              asWriter(async (sql, session) => {
                const { documentId, file } = await deadlines.addDocument(sql, session, input, deps.clock.now());
                if (file) await save(file.key, file.blob);
                return { documentId };
              }),
            ),
          ),
        deleteDeadlineDocument: async (documentId) => {
          const { fileKeys } = await asWriter((sql, session) => deadlines.deleteDocument(sql, session, documentId));
          await removeFiles(deps.documents, fileKeys);
        },
        upcomingDeadlines: () => asMember((sql) => deadlines.upcomingDeadlines(sql, deps.clock.now())),
        deadlineDocument: async (documentId) => {
          const document = await asMember((sql) => deadlines.visibleDocument(sql, documentId));
          const file = document && (await deps.documents.read(document.key));
          return file ? { file, fileName: document.fileName } : null;
        },
        deleteDeadline: async (deadlineId) => {
          const { fileKeys } = await asWriter((sql, session) => deadlines.deleteDeadline(sql, session, deadlineId));
          await removeFiles(deps.documents, fileKeys);
        },
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
          const { result, copies } = await retryOnReplay(() =>
            asWriter(async (sql, session) => {
              const reported = await toolReports.reportTool(sql, session, input, deps.clock.now());
              // Ponowienie niczego nie dubluje w oknie 📋 właścicieli, więc nie daje kopii push.
              const copies = await issues.deliverToolReport(sql, session, reported.toolId, deps.clock.now());
              return { result: await withLimitWarning(sql, reported), copies };
            }),
          );
          await sendPushCopies(deps, copies);
          return result;
        },
        toolReports: () =>
          asMember((sql, session) => {
            toolReports.requireToolReviewer(session);
            return toolReports.toolReports(sql);
          }),
        acceptToolReport: (input) => asWriter((sql, session) => toolReports.acceptToolReport(sql, session, input)),
        rejectToolReport: movementOnlyCommand(toolReports.rejectToolReport),
        fileIssue: async (input) => {
          const { issueId, copies } = await savingPhoto(deps.photos, (save) =>
            retryOnReplay(() =>
              asWriter(async (sql, session) => {
                // Zdjęcie sprawdzamy dopiero tu: w trybie tylko do odczytu polecenie odmawia, zanim sprawdzi dane.
                const photo = input.photo ? await photos.checkPhoto(input.photo) : null;
                const filed = await issues.fileIssue(sql, session, input, photo, deps.clock.now());
                if (photo && filed.photoKey) await save(filed.photoKey, photo.blob);
                return filed;
              }),
            ),
          );
          await sendPushCopies(deps, copies);
          return { issueId };
        },
        issues: () => asMember((sql, session) => issues.listIssues(sql, session)),
        issue: (issueId) => asMember((sql, session) => issues.issueDetails(sql, session, issueId)),
        commentOnIssue: (input) => issueCommand(issues.commentOnIssue, input),
        closeIssue: (input) => issueCommand(issues.closeIssue, input),
        issuePhoto: async (issueId) => {
          const key = await asMember((sql) => issues.visiblePhotoKey(sql, issueId));
          return key ? deps.photos.read(key) : null;
        },
        unreadIssueEntryCount: () => asMember((sql, session) => issues.unreadCount(sql, session)),
        markIssueRead: (issueId) => asPersonal((sql, session) => issues.markIssueRead(sql, session, issueId, deps.clock.now())),
        markAllIssueEntriesRead: () => asPersonal((sql, session) => issues.markAllRead(sql, session, deps.clock.now())),
        team: () =>
          asMember((sql, session) => {
            team.requireTeamManager(session);
            return team.listTeam(sql);
          }),
        addMember: async (input) => {
          // Uprawnienia sprawdzamy, zanim powstanie konto logowania.
          const member = await asWriter(async (sql, session) => {
            team.requireTeamManager(session);
            const member = team.normalizeNewMember(input);
            await team.requireFreeUsername(sql, member.username);
            return member;
          });
          const temporaryPassword = generateTemporaryPassword();
          const { userId } = await createAccount(deps, team.accountEmail(member), temporaryPassword);
          try {
            await asWriter((sql, session) => {
              team.requireTeamManager(session);
              return team.insertMember(sql, session, userId, member, deps.clock.now());
            });
          } catch (error) {
            await deps.authAdmin.deleteUser(userId).catch((cleanupError) => console.error(cleanupError));
            throw error;
          }
          return { userId, fullName: member.fullName, email: member.email, username: member.username, temporaryPassword };
        },
        resetMemberPassword: (memberId) =>
          asWriter(async (sql, session) => {
            team.requireTeamManager(session);
            demo.refuseInDemo(session);
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
            demo.refuseInDemo(session);
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
        subscribeToPush: (subscription) =>
          asPersonal((sql, session) => {
            demo.refusePushInDemo(session);
            return push.subscribe(sql, subscription, deps.clock.now());
          }),
        unsubscribeFromPush: (endpoint) => asPersonal((sql, session) => push.unsubscribe(sql, session, endpoint)),
        sendSupportMessage: async (input) => {
          const sent = await savingPhoto(deps.chatPhotos, (save) =>
            retryOnReplay(() =>
              // Czat działa także w trybie tylko do odczytu: zablokowany użytkownik musi móc do nas napisać.
              asPersonal(async (sql, session) => {
                supportChat.requireSupportChatUser(session);
                demo.refuseChatInDemo(session);
                const content = await supportChat.checkMessage(input);
                const sent = await supportChat.sendMessage(sql, session, input, content, deps.clock.now());
                if (sent?.photoKey && content.photo) await save(sent.photoKey, content.photo.blob);
                return sent;
              }),
            ),
          );
          // Wiadomość jest w wątku, więc błąd e-maila tylko odnotowujemy.
          if (sent) await deps.notifier.sendToSupport(sent.userMessage).catch((error) => console.error("Nie wysłano e-maila do supportu", error));
        },
        supportChat: () =>
          asMember((sql, session) => {
            supportChat.requireSupportChatUser(session);
            demo.refuseChatInDemo(session);
            return supportChat.chat(sql, session);
          }),
        unreadSupportReplyCount: () =>
          asMember(async (sql, session) => {
            supportChat.requireSupportChatUser(session);
            // W demo okno 💬 nie pokazuje wspólnego wątku, więc nie ma czego liczyć.
            return session.company.demo ? 0 : supportChat.unreadReplyCount(sql, session);
          }),
        markSupportChatRead: () =>
          asPersonal((sql, session) => {
            supportChat.requireSupportChatUser(session);
            return supportChat.markRead(sql, session.userId, "uzytkownik");
          }),
        supportPhoto: async (messageId) => {
          const key = await asMember(async (sql, session) => {
            supportChat.requireSupportChatUser(session);
            // Wspólnego wątku demo nikt nie ogląda, także jego zdjęć.
            return session.company.demo ? null : supportChat.visiblePhotoKey(sql, messageId);
          });
          return key ? deps.chatPhotos.read(key) : null;
        },
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

/** Progi dni jednej firmy w jednej transakcji systemowej; kopie push po zatwierdzeniu. Zwraca liczbę nowych przekroczeń. */
async function notifyThresholds(deps: RegistryDeps, companyId: string, now: Date): Promise<number> {
  const result = await deps.db.transaction((sql) => thresholds.notifyExceededThresholds(sql, companyId, now));
  await sendPushCopies(deps, result.copies);
  return result.tools;
}

/** Przypomnienia o terminach jednej firmy w jednej transakcji systemowej; kopie push po zatwierdzeniu. Zwraca liczbę nowych. */
async function remindDeadlines(deps: RegistryDeps, companyId: string, now: Date): Promise<number> {
  const result = await deps.db.transaction((sql) => deadlineReminders.notifyDueDeadlines(sql, companyId, now));
  await sendPushCopies(deps, result.copies);
  return result.deadlines;
}

/** Raporty jednej firmy, na które przyszła pora. Każdy osobno: błąd jednego nie zabiera pozostałych. */
async function sendDueReportsOf(deps: RegistryDeps, companyId: string, now: Date): Promise<{ weekly: number; friday: number }> {
  const sent = { weekly: 0, friday: 0 };
  for (const { kind } of reports.dueReports(now)) {
    try {
      if (await sendReport(deps, companyId, kind, now)) sent[kind === "tygodniowy" ? "weekly" : "friday"] += 1;
    } catch (error) {
      console.error(`Nie wysłano raportu (${kind}) firmy ${companyId}`, error);
    }
  }
  return sent;
}

/**
 * Raport firmy z tej chwili: składa go (tak jak widzi firmę) jej najdawniej dodany aktywny właściciel, a zapis
 * w dzwonkach idzie w transakcji systemowej, raz na dzień. Kopie push i e-mail wysyła po zatwierdzeniu.
 * Zwraca, czy raport właśnie poszedł.
 */
async function sendReport(deps: RegistryDeps, companyId: string, kind: ReportKind, now: Date): Promise<boolean> {
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
 * Polecenie, które zapisuje zdjęcie (`save`) przed zatwierdzeniem swojej transakcji: gdy Storage odmówi, nic się
 * nie zapisze. Gdy transakcja się potem nie zatwierdzi, zapisane zdjęcie nie ma do czego należeć, więc je usuwamy.
 */
async function savingPhoto<T>(store: PhotoStore, command: (save: (key: string, photo: Blob) => Promise<void>) => Promise<T>): Promise<T> {
  const saved: string[] = [];
  try {
    return await command(async (key, photo) => {
      await store.save(key, photo);
      saved.push(key);
    });
  } catch (error) {
    await Promise.all(saved.map((key) => store.remove(key).catch((cleanupError) => console.error(cleanupError))));
    throw error;
  }
}

/** Usuwa pliki, które po zatwierdzonym zapisie nie mają już do czego należeć. Zapis się nie cofnie, więc błąd tylko odnotowujemy. */
async function removeFiles(store: PhotoStore, keys: string[]) {
  await Promise.all(keys.map((key) => store.remove(key).catch((error) => console.error("Nie usunięto pliku", key, error))));
}

/** Jedno ponowienie, gdy równoległa ponowka tej samej operacji właśnie się zapisała; drugie podejście odczyta jej wynik. */
async function retryOnReplay<T>(attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    if (error instanceof ReplayedOperationError) return attempt();
    throw error;
  }
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
async function sendPushCopies(deps: RegistryDeps, copies: PushCopy[]) {
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
  deps: RegistryDeps,
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
function createAccount(deps: RegistryDeps, email: string, password: string) {
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
    company_demo: boolean;
    paid_until: string | null;
    manual_read_only: boolean | null;
  }>(
    `select u.full_name, u.role, u.must_change_password, c.id as company_id, c.name as company_name, c.demo_since is not null as company_demo,
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
      demo: row.company_demo,
    },
  };
}
