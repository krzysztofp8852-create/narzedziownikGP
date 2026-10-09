import * as bell from "./bell";
import * as callbackRequests from "./callback-requests";
import type { CallbackRequestInput, CallbackRequestList } from "./callback-requests";
import type { Bell, BellEntry } from "./bell";
import * as board from "./board";
import * as catalog from "./catalog";
import type { CatalogTool } from "./catalog";
import type { WhereIsWhat } from "./board";
import { RegistryError, ReplayedOperationError } from "./errors";
import { type AuthAdmin, type Clock, type Db, EmailTakenError, type Geocoder, type MapPosition, type Notifier, type PhotoStore, type Sql } from "./ports";
import * as companyDeletion from "./company-deletion";
import * as companyExport from "./company-export";
import type { CompanyExportSummary, ExportSink } from "./company-export";
import * as corrections from "./corrections";
import * as costs from "./costs";
import type { CostPeriod, CostSummary, DailyRates, LocationCosts, RateChange, RateTarget } from "./costs";
import * as deadlineReminders from "./deadline-reminders";
import * as deadlines from "./deadlines";
import type { AddDocumentInput, CompleteDeadlineInput, Deadline, DeadlineChanges, NewDeadlineInput, UpcomingDeadline } from "./deadlines";
import * as demo from "./demo";
import type { DemoAccount, DemoDevice, DemoUse, DemoVisit } from "./demo";
import * as history from "./history";
import * as issues from "./issues";
import type { CloseIssueInput, CommentOnIssueInput, FileIssueInput, Issue, IssueSummary } from "./issues";
import type { HistoryFilterOptions, HistoryFilters, MovementHistory } from "./history";
import type { CorrectToolInput, MarkToolLostInput, RetireToolInput } from "./corrections";
import * as locations from "./locations";
import type { LocatedAddress, MapPin, NewSiteInput, NewVehicleInput, Service, Site, SiteManagerCandidate, Vehicle, VehicleData } from "./locations";
import * as movements from "./movements";
import type { Movement, RecentMovement, RegisterMovementInput, UndoMovementInput } from "./movements";
import * as notifications from "./notifications";
import type { EmailedNotification, ToolsTakenNotification } from "./notifications";
import * as photos from "./photos";
import * as push from "./push";
import type { PushCopy, PushDevice, PushSubscriptionData } from "./push";
import * as queuedMovements from "./queued-movements";
import * as readOnly from "./read-only";
import * as rentals from "./rentals";
import type { AddRentedToolInput, ReturnToRentalInput } from "./rentals";
import * as reports from "./reports";
import type { FridayReport, Report, ReportKind, WeeklyReport } from "./reports";
import type { RejectedMovement } from "./queued-movements";
import * as settings from "./settings";
import type { CompanySettings } from "./settings";
import * as siteClosing from "./site-closing";
import * as subscriptions from "./subscriptions";
import * as supportChat from "./support-chat";
import type { SupportChat, SupportMessageInput, SupportReplyInput, SupportThread, SupportThreadSummary } from "./support-chat";
import type {
  CompanySubscription,
  ManagedCompany,
  NewCompanyInput,
  NewSubscription,
  TierId,
  ToolLimitWarning,
} from "./subscriptions";
import * as thresholds from "./thresholds";
import type { FinishedSite, ForceCloseSiteInput } from "./site-closing";
import { generateTemporaryPassword } from "./temporary-password";
import * as toolImport from "./tool-import";
import type { ImportToolsInput, ToolImportPreview, ToolImportRow } from "./tool-import";
import * as people from "./people";
import type { NewPersonInput, Person } from "./people";
import * as punchReminders from "./punch-reminders";
import * as punches from "./punches";
import type {
  CorrectPunchInput,
  ExplainPunchConflictInput,
  ExplainPunchInput,
  PeopleOnSite,
  Poster,
  PersonPunchOutcome,
  PersonToPunch,
  Punch,
  PunchConflict,
  PunchInput,
  PunchOutcome,
  PunchPeopleInput,
  PunchPreview,
  QueuedPunchInput,
  QueuedPunchResult,
} from "./punches";
import * as timeOnSite from "./time-on-site";
import type { OwnTimeOnSite, TimeOnSiteSummary } from "./time-on-site";
import * as qualificationReminders from "./qualification-reminders";
import * as qualifications from "./qualifications";
import type {
  AddQualificationDocumentInput,
  CompleteQualificationInput,
  CustomQualificationKind,
  NewQualificationInput,
  PersonQualifications,
  QualificationChanges,
  UpcomingQualification,
} from "./qualifications";
import * as team from "./team";
import type { AddedMember, NewMemberInput, PersonAccountInput, TeamMember } from "./team";
import * as stickers from "./stickers";
import type { StickerBatch, StickerCandidate, StickerSelection } from "./stickers";
import * as toolList from "./tool-list";
import type { ListedTool } from "./tool-list";
import * as toolReports from "./tool-reports";
import type { AcceptToolReportInput, RejectToolReportInput, ReportToolInput, ToolReport } from "./tool-reports";
import * as tools from "./tools";
import type { AddToolInput, Category, EditToolInput, ToolCard } from "./tools";
import * as tutorial from "./tutorial";
import type { Tutorial, TutorialOutcome } from "./tutorial";
import { EMAIL_PATTERN, UUID_PATTERN } from "./validation";

export type Role = "wlasciciel" | "magazynier" | "kierownik" | "pracownik";

export type { LostOnBoard, ToolOnBoard, WhereIsWhat } from "./board";
export type { CatalogTool } from "./catalog";
export type { CompanyExportSummary, ExportSink } from "./company-export";
export type { ListedTool } from "./tool-list";
export type {
  AddDocumentInput,
  CompleteDeadlineInput,
  Deadline,
  DeadlineChanges,
  DeadlineDocument,
  DeadlineKind,
  DeadlineStatus,
  DeadlineSubject,
  DeadlineSummary,
  DocumentKind,
  NewDeadlineInput,
  NewDocument,
  NextDeadline,
  UpcomingDeadline,
  VehicleDeadlineKind,
} from "./deadlines";
export {
  canAttachDocument,
  canCompleteDeadlines,
  canManageDeadlines,
  ADDABLE_DEADLINE_KINDS,
  DEADLINE_KINDS,
  DOCUMENT_KINDS,
  deadlineSubject,
  documentKindsOf,
  isDateOnlyKind,
  isPolicyKind,
  MAX_CYCLE_MONTHS,
  MAX_DEADLINE_NAME_LENGTH,
  MAX_DEADLINE_NOTE_LENGTH,
  UPCOMING_DAYS,
  VEHICLE_DEADLINE_KINDS,
} from "./deadlines";
export type { AddToolInput, Category, EditToolInput, HistoryEntry, LocationKind, LostTool, ToolCard, ToolRental, ToolState } from "./tools";
export type { AddRentedToolInput, ReturnToRentalInput } from "./rentals";
export { canRentTools, MAX_RENTAL_COMPANY_LENGTH } from "./rentals";
export { canHandleRentalsAt } from "./movements";
export { canManageTools, canSeeValues } from "./tools";
export type { ImportPreviewRow, ImportRowError, ImportToolsInput, ToolImportPreview, ToolImportRow } from "./tool-import";
export { canImportTools, MAX_IMPORT_ROWS } from "./tool-import";
export type { HistoryFilterOptions, HistoryFilters, MovementHistory } from "./history";
export type { CompanySettings, IssueVisibility } from "./settings";
export type { CostedKind, CostPeriod, CostSummary, DailyRates, EffectiveRate, LocationCostTotal, LocationCosts, RateChange, RateTarget, ToolCost } from "./costs";
export { canManageRates, canSeeCosts, canSeeCostsOf } from "./costs";
export type {
  CompanySubscription,
  InvoiceData,
  ManagedCompany,
  NewCompanyInput,
  RecorderSeats,
  SubscriptionStatus,
  SubscriptionTier,
  TierId,
  ToolLimitWarning,
} from "./subscriptions";
export { TIERS } from "./subscriptions";
export { confirmsCompanyName } from "./company-deletion";
export { canManageSettings, MAX_ALARM_THRESHOLD_DAYS } from "./settings";
export { isCalendarDay, isMonth, shiftMonth, UUID_PATTERN } from "./validation";
export type { CorrectToolInput, MarkToolLostInput, RetireToolInput } from "./corrections";
export { canCorrectTools, TOOL_STATES } from "./corrections";
export type { MapPin, NewSiteInput, NewVehicleInput, Service, Site, SiteManagerCandidate, SiteStatus, Vehicle, VehicleData } from "./locations";
export type { MapPosition } from "./ports";
export { canManageLocations, MAX_REGISTRATION_NUMBER_LENGTH } from "./locations";
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
  ForgottenExitNotification,
  FridayReportNotification,
  MovementRejectedNotification,
  Notification,
  NotifiedPlace,
  NotificationContent,
  NotificationKind,
  NotifiedDeadline,
  NotifiedPunch,
  QualificationsNotification,
  ReadOnlyNotification,
  ReadOnlySoonNotification,
  ThresholdExceededNotification,
  ThresholdsExceededNotification,
  ToolsTakenNotification,
  WeeklyReportNotification,
} from "./notifications";
export type { FridayReport, Report, ReportKind, WeeklyReport } from "./reports";
export type {
  AddQualificationDocumentInput,
  CompleteQualificationInput,
  CustomQualificationKind,
  NewQualificationDocument,
  NewQualificationInput,
  NotifiedQualification,
  PersonQualifications,
  Qualification,
  QualificationChanges,
  QualificationDocument,
  QualificationKind,
  QualificationStatus,
  UpcomingQualification,
} from "./qualifications";
export {
  canAddQualificationKinds,
  canAttachQualificationDocument,
  canDeleteQualifications,
  canManageQualifications,
  detailOf,
  hasNote,
  isMedicalKind,
  MAX_QUALIFICATION_DETAIL_LENGTH,
  MAX_QUALIFICATION_KIND_NAME_LENGTH,
  MAX_QUALIFICATION_NOTE_LENGTH,
  QUALIFICATION_KINDS,
  UPCOMING_QUALIFICATION_DAYS,
} from "./qualifications";
export type {
  CorrectPunchInput,
  ExplainPunchConflictInput,
  ExplainPunchInput,
  PeopleOnSite,
  PhonePosition,
  PersonPunchOutcome,
  PersonToPunch,
  Poster,
  Punch,
  PunchAction,
  PunchCheck,
  PunchConflict,
  PunchConflictReason,
  PunchCorrection,
  PunchCorrectionField,
  PunchEnd,
  PunchExitVia,
  PunchInput,
  PunchOutcome,
  PunchPeopleInput,
  PunchPlace,
  PunchPlaceKind,
  PunchPreview,
  PunchResult,
  QueuedPunchInput,
  QueuedPunchResult,
  SavedPunchOutcome,
} from "./punches";
export {
  canClarifyPunches,
  canCorrectPunches,
  canPrintPoster,
  canPunchOthers,
  canSetPunchRadius,
  DEFAULT_PUNCH_RADIUS_M,
  MAX_PEOPLE_PER_PUNCH,
  MAX_PUNCH_CORRECTION_REASON_LENGTH,
  MAX_PUNCH_EXPLANATION_LENGTH,
  MAX_PUNCH_RADIUS_M,
  MIN_PUNCH_RADIUS_M,
  PUNCH_CONFLICT_REASONS,
  PUNCH_RESULTS,
} from "./punches";
export type { OwnTimeOnSite, PlaceTime, TimeOnSiteSummary } from "./time-on-site";
export { canSeeTimeOnSiteSummary } from "./time-on-site";
export { normalizePosterCode } from "./poster-code";
export { canSeeReports, isReportKind, reportKindsOf } from "./reports";
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
export type { PushDevice, PushMessage, PushSubscriptionData } from "./push";
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
export type { AddedMember, MemberRole, NewAccountInput, NewMemberInput, PersonAccountInput, TeamMember } from "./team";
export type { NewPersonInput, Person, PersonAccount } from "./people";
export { MAX_PERSON_NAME_LENGTH, MAX_PERSON_NOTE_LENGTH } from "./people";
export { canManageTeam, MEMBER_ROLES } from "./team";
export type { AcceptToolReportInput, RejectToolReportInput, ReportToolInput, ToolReport } from "./tool-reports";
export { canReportTools, canReviewToolReports } from "./tool-reports";
export type { StickerBatch, StickerCandidate, StickerSelection } from "./stickers";
export type { DemoAccount, DemoUse } from "./demo";
export type { CallbackRequest, CallbackRequestInput, CallbackRequestList, CallbackSource } from "./callback-requests";
export { formatPhone, isCallbackSource, MAX_CALLBACK_NAME_LENGTH, normalizePhone } from "./callback-requests";
export { DEMO_EMAIL_DOMAIN, isDemoEmail, LOGGED_DEMO_COMMANDS } from "./demo";
export type { DemoDevice, DemoEvent, DemoVisit, LoggedDemoCommand } from "./demo";
export { canPrintStickers } from "./stickers";
export type { FirstStep, FirstStepId, Tutorial, TutorialOutcome } from "./tutorial";
export { hasTutorial } from "./tutorial";

export interface Session {
  userId: string;
  fullName: string;
  role: Role;
  mustChangePassword: boolean;
  /**
   * `readOnly`: firma jest w trybie tylko do odczytu (ręcznie albo po 14 dniach od „opłacone do”). `demo`: firma
   * demo, do której wchodzi się bez hasła ze strony /demo. `siteManagersSeeCosts`: właściciel pozwolił kierownikom
   * widzieć koszty sprzętu ich lokalizacji.
   */
  company: { id: string; name: string; readOnly: boolean; demo: boolean; siteManagersSeeCosts: boolean };
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
  /**
   * Wszystkie firmy z pakietem, liczbą narzędzi, liczbą osób zapisujących ruchy, „opłacone do”
   * i stanem abonamentu, po nazwie.
   */
  companies(): Promise<ManagedCompany[]>;
  /** Jedna firma albo null, gdy jej nie ma. */
  company(companyId: string): Promise<ManagedCompany | null>;
  /** Firma z bazą, abonamentem w pakiecie, danymi do faktury i właścicielem z hasłem tymczasowym. */
  createCompany(input: NewCompanyInput): Promise<CreatedCompany>;
  /** Inny pakiet; wyższy od razu daje miejsca na kolejne osoby zapisujące ruchy. */
  changeTier(companyId: string, tier: TierId): Promise<void>;
  /** „Opłacone do” (RRRR-MM-DD) po zaksięgowaniu przelewu. */
  setPaidUntil(companyId: string, day: string): Promise<void>;
  /** Ręczny tryb tylko do odczytu, niezależny od płatności. Włączenie trafia do dzwonków właścicieli firmy. */
  setManualReadOnly(companyId: string, on: boolean): Promise<void>;
  /**
   * Usunięcie firmy w całości, na polecenie klienta: wszystkie jej dane z historią, pliki i konta logowania. Tylko
   * firma w trybie tylko do odczytu i tylko z jej nazwą wpisaną w `confirmation`; firmy demo nie usuwa. Zostaje wpis
   * w dzienniku usuniętych firm. Nie da się tego cofnąć. `leftovers`: ile plików i kont logowania nie udało się
   * usunąć po usunięciu danych (szczegóły w logach serwera).
   */
  deleteCompany(companyId: string, confirmation: string): Promise<{ leftovers: number }>;
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
  /** Dziennik demo: wizyty z ostatnich 30 dni (wejścia do ról, ekrany i akcje), od najnowszej. */
  demoVisits(): Promise<DemoVisit[]>;
  /** Prośby o telefon z formularza na stronie z ostatnich 90 dni, od najnowszej, z liczbą z 7, 30 i 90 dni. */
  callbackRequests(): Promise<CallbackRequestList>;
}

export interface Registry {
  /** Aktor systemowy: skrypty i zadania harmonogramu, poza RLS. */
  system(): {
    /** Firma z bazą i właścicielem, na najniższym progu i w dużym pakiecie wdrożenia, bez danych do faktury (skrypty i testy). */
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
     * Zadanie dzienne: przypomnienia o uprawnieniach aktywnych osób, 30 dni przed końcem ważności w Polsce i raz po nim,
     * każde raz. Właściciel dostaje jedno zbiorcze, a osoba z kontem o własnych; kierownik o innych osobach nic.
     */
    notifyDueQualifications(): Promise<{ qualifications: number }>;
    /** Przypomnienia o uprawnieniach (jak `notifyDueQualifications`) tylko dla jednej firmy (scenariusz demo). */
    notifyCompanyDueQualifications(companyId: string): Promise<{ qualifications: number }>;
    /**
     * Zadanie harmonogramu od 18:00 w Polsce: przypomnienie o wyjściu (dzwonek i push) dla każdego odbicia otwartego
     * teraz, raz na odbicie. Dostaje je ten, kto odbił wejście: osoba sama albo kierownik za osobę z kartoteki. Przed
     * 18:00 nic. Zwraca, o ilu odbiciach przypomniało.
     */
    notifyForgottenExits(): Promise<{ punches: number }>;
    /**
     * Zadanie harmonogramu o północy w Polsce: odbicia otwarte z poprzednich dni zamykają się „bez wyjścia” o północy po
     * dniu wejścia, trafiają do wyjaśnienia i nie liczą się do czasu na budowie, dopóki ktoś nie uzupełni wyjścia.
     * Zwraca, ile odbić zamknęło.
     */
    closeForgottenExits(): Promise<{ punches: number }>;
    /** Zamknięcie odbić bez wyjścia (jak `closeForgottenExits`) tylko w jednej firmie (scenariusz demo). */
    closeCompanyForgottenExits(companyId: string): Promise<{ punches: number }>;
    /**
     * Zadanie dzienne: właściciele firm dostają ostrzeżenie 7 dni i 1 dzień przed trybem tylko do odczytu
     * (dzwonek, push i e-mail) i wpis o samym przełączeniu (dzwonek i push), każde raz na termin. Przy ręcznym
     * trybie nic. Zwraca, ile firm dostało ostrzeżenie, a ile wpis o przełączeniu. Danych firm nic nie kasuje.
     */
    notifySubscriptionDeadlines(): Promise<{ warned: number; switched: number }>;
    /**
     * Jednorazowo po wdrożeniu mapy budów (`npm run sites:geocode`): geokoduje bazy z adresem i aktywne budowy bez
     * położenia we wszystkich firmach poza demo. Ręcznie postawionych pinezek nie rusza. Błąd dostawcy przy jednym
     * miejscu trafia do logu, a reszta idzie dalej. Zwraca, ile miejsc dostało położenie, a ilu adresów nie znaleziono.
     */
    geocodeUnplacedLocations(): Promise<{ placed: number; notFound: number }>;
    /** Konta obecnej firmy demo (włączonej ostatnio), po roli; pusta lista, gdy demo nie założono. */
    demoAccounts(): Promise<DemoAccount[]>;
    /** Kiedy ktoś ostatnio wszedł do obecnego demo (zadanie godzinowe odświeża tylko używane); null, gdy demo nie założono. */
    demoUse(): Promise<DemoUse | null>;
    /** Czy użytkownik ma konto w firmie demo, obecnej albo poprzedniej (wtedy wraca na stronę /demo). */
    isDemoAccount(userId: string): Promise<boolean>;
    /**
     * Firma staje się obecnym demo (skrypt demo, po wypełnieniu jej danymi): abonament opłacony na lata, a poprzednie
     * firmy demo znikają w całości, z kontami logowania i plikami. Zwraca, ile ich usunięto.
     */
    activateDemoCompany(companyId: string): Promise<{ purged: number }>;
    /**
     * Wejście do roli obecnego demo (strona /demo albo pasek demo) do dziennika demo. `sessionId`: nowa sesja Supabase
     * Auth, `previousSessionId`: sesja tej przeglądarki sprzed przełączenia roli. Poza obecnym demo nic nie zapisuje.
     */
    recordDemoEntry(entry: { userId: string; sessionId: string | null; previousSessionId: string | null; switched: boolean; device: DemoDevice }): Promise<void>;
    /** Ekran obecnego demo otwarty w tej sesji, do dziennika demo. Poza obecnym demo nic nie zapisuje. */
    recordDemoPage(page: { userId: string; sessionId: string | null; path: string }): Promise<void>;
    /**
     * Prośba o telefon z formularza „oddzwonimy” (bez konta): zapis i e-mail do GP Engineering. Numer w zapisie polskim
     * albo międzynarodowym, inaczej `invalid_input`. Ten sam numer drugi raz w ciągu doby nic nie robi, a ponad 20 próśb
     * na godzinę łącznie odmawia (`callback_busy`).
     */
    requestCallback(input: CallbackRequestInput): Promise<void>;
    /**
     * Pełny eksport danych firmy na jej żądanie (`npm run company:export`): CSV każdej tabeli z jej wierszami, zdjęcia
     * i dokumenty z magazynów i README z opisem struktury, po kolei do `add`. Dane z jednej migawki, w transakcji tylko
     * do odczytu, więc działa też w trybie tylko do odczytu i po końcu umowy. Nieznana firma: `not_found`.
     */
    exportCompany(companyId: string, add: ExportSink): Promise<CompanyExportSummary>;
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
    /**
     * Cały sprzęt firmy na stronę Narzędzia, także zaginiony, wycofany i zwrócony do wypożyczalni: kategoria, marka,
     * gdzie jest (albo było ostatnio), od ilu dni, kto odpowiada; wartość w zł tylko dla właściciela.
     */
    toolList(): Promise<ListedTool[]>;
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
     * Termin przy narzędziu (przegląd, kalibracja, badanie UDT albo koniec gwarancji) albo przy aktywnym pojeździe
     * (przegląd techniczny, OC, AC, legalizacja tachografu albo własny z nazwą), jeden każdego rodzaju, a własne z różnymi
     * nazwami (drugi: `deadline_taken`), z opcjonalnym cyklem w miesiącach. Tylko właściciel; widzi je każdy w firmie.
     */
    addDeadline(input: NewDeadlineInput): Promise<{ deadlineId: string }>;
    /**
     * Zmienia datę, cykl, opis albo nazwę własnego terminu pojazdu. Tylko właściciel; termin zwrotu wynajętego
     * (przedłużenie, bez cyklu) zmienia też kierownik lokalizacji, w której sprzęt stoi, i magazynier.
     */
    updateDeadline(deadlineId: string, changes: DeadlineChanges): Promise<void>;
    /** Usuwa termin razem z dokumentami. Tylko właściciel. */
    deleteDeadline(deadlineId: string): Promise<void>;
    /**
     * Wykonany przegląd, kalibracja, badanie UDT albo termin pojazdu (najpóźniej dziś w Polsce), z opcjonalnym
     * dokumentem (np. protokołem): następny termin to podany, a bez niego liczy się z cyklu od dnia wykonania, przy OC
     * i AC od końca polisy, która jeszcze trwała (bez cyklu go nie ma). Właściciel, a termin narzędzia też magazynier.
     * Ponowne wysłanie tej samej operacji zwraca bieżący termin. Zwraca następny termin.
     */
    completeDeadline(input: CompleteDeadlineInput): Promise<{ dueOn: string | null }>;
    /**
     * Dokument przy terminie: PDF albo zdjęcie do 4 MB (inaczej `document_invalid`). Właściciel, a magazynier do terminów
     * narzędzi, bez faktur. Dokument terminu narzędzia widzi każdy w firmie, a terminu pojazdu właściciel i kierownik
     * pojazdu; fakturę (ma cenę) tylko właściciel.
     */
    addDeadlineDocument(input: AddDocumentInput): Promise<{ documentId: string }>;
    /** Usuwa dokument terminu. Tylko właściciel. */
    deleteDeadlineDocument(documentId: string): Promise<void>;
    /** Plik dokumentu z nazwą; null, gdy aktor go nie widzi. */
    deadlineDocument(documentId: string): Promise<{ file: Blob; fileName: string } | null>;
    /**
     * Terminy sprzętu w obiegu i aktywnych pojazdów w najbliższych 30 dniach i te po terminie (bez wygasłych gwarancji).
     * Widzi je każda rola.
     */
    upcomingDeadlines(): Promise<UpcomingDeadline[]>;
    /** Terminy pojazdu (także nieaktywnego) z dokumentami, które aktor widzi; pusta lista, gdy go nie widzi. */
    vehicleDeadlines(vehicleId: string): Promise<Deadline[]>;
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
    /**
     * Przyjęcie sprzętu wynajętego z wypożyczalni od razu w bazie, na budowie albo pojeździe, w których stoi: kod
     * nadany jak przy dodawaniu, stawka dobowa z umowy i termin zwrotu, bez akceptacji. Właściciel i magazynier
     * wszędzie, kierownik na swojej aktywnej budowie albo pojeździe. Właściciele (poza aktorem) dostają wpis w dzwonku
     * z kopią push. Nie liczy się do limitu narzędzi progu.
     */
    addRentedTool(input: AddRentedToolInput): Promise<{ toolId: string; code: string }>;
    /**
     * Zwrot do wypożyczalni: sprzęt wynajęty w obiegu przechodzi w stan „zwrócone” (znika z tablicy, zostaje
     * w historii; własny sprzęt: `not_rented`). Kierownik lokalizacji, w której sprzęt stoi, magazynier albo
     * właściciel. Autor cofa go w 15 minut jak inne ruchy.
     */
    returnToRental(input: ReturnToRentalInput): Promise<Movement>;
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
    /** Wszystkie konta w firmie, także dezaktywowane. Tylko właściciel. */
    team(): Promise<TeamMember[]>;
    /**
     * Kartoteka Ludzie: wszystkie osoby firmy, z kontem (rola, login, stan konta) i bez niego, także nieaktywne (na
     * końcu). Tylko właściciel.
     */
    people(): Promise<Person[]>;
    /**
     * Osoba bez konta (np. robotnik bez telefonu): imię i nazwisko i opcjonalna notatka. Nie zajmuje miejsca w pakiecie
     * wdrożenia. Tylko właściciel.
     */
    addPerson(input: NewPersonInput): Promise<{ personId: string }>;
    /** Nowe imię i nazwisko i notatka osoby; konto osoby nosi odtąd to imię i nazwisko. Tylko właściciel. */
    editPerson(personId: string, changes: NewPersonInput): Promise<void>;
    /**
     * Osoba odeszła z firmy: znika z aktywnych, a jej historia zostaje. Z kontem działa jak `deactivateMember` (konta
     * właściciela nie, w firmie demo żadnego). Tylko właściciel.
     */
    deactivatePerson(personId: string): Promise<void>;
    /**
     * Konto dla aktywnej osoby z kartoteki, która go nie ma, bez drugiego wpisu w kartotece; jak `addMember`, ale imię
     * i nazwisko konta to imię i nazwisko osoby. Tylko właściciel.
     */
    addPersonAccount(input: PersonAccountInput): Promise<AddedMember>;
    /** Własne rodzaje uprawnień firmy (np. „Operator koparki”), po nazwie. Widzi je każdy w firmie. */
    qualificationKinds(): Promise<CustomQualificationKind[]>;
    /** Nowy własny rodzaj uprawnienia; ta sama nazwa drugi raz: `qualification_kind_taken`. Tylko właściciel. */
    addQualificationKind(input: { name: string }): Promise<{ kindId: string }>;
    /**
     * Aktywne osoby z uprawnieniami, po imieniu i nazwisku: właściciel i kierownik wszystkie, pracownik i magazynier
     * tylko siebie. Dokumentów badań lekarskich nie widzi nikt poza właścicielem.
     */
    peopleQualifications(): Promise<PersonQualifications[]>;
    /** Osoba (także nieaktywna) z uprawnieniami albo null, gdy aktor jej nie widzi (jak `peopleQualifications`). */
    personQualifications(personId: string): Promise<PersonQualifications | null>;
    /**
     * Uprawnienie aktywnej osoby: rodzaj ze stałej listy albo własny, ważne do, opcjonalny cykl, notatka (bez niej przy
     * badaniach lekarskich) i opis (UDT: urządzenie, prawo jazdy: kategoria, SEP: grupa). Drugie tego samego rodzaju
     * i opisu: `qualification_taken`. Właściciel i kierownik.
     */
    addQualification(input: NewQualificationInput): Promise<{ qualificationId: string }>;
    /** Zmienia datę, cykl, notatkę albo opis uprawnienia. Właściciel i kierownik. */
    updateQualification(qualificationId: string, changes: QualificationChanges): Promise<void>;
    /** Usuwa uprawnienie razem z dokumentami. Tylko właściciel. */
    deleteQualification(qualificationId: string): Promise<void>;
    /**
     * Odnowienie uprawnienia (najpóźniej dziś w Polsce), z opcjonalnym dokumentem: nowa data ważności to podana, a bez
     * niej dzień wykonania plus cykl (bez cyklu trzeba ją podać). Właściciel i kierownik, dokument badań lekarskich
     * tylko właściciel. Ponowne wysłanie tej samej operacji zwraca bieżącą datę.
     */
    completeQualification(input: CompleteQualificationInput): Promise<{ dueOn: string }>;
    /**
     * Dokument przy uprawnieniu: PDF albo zdjęcie do 4 MB (inaczej `document_invalid`). Właściciel, a kierownik poza
     * badaniami lekarskimi. Widzi go każdy, kto widzi uprawnienie, poza dokumentami badań (tylko właściciel).
     */
    addQualificationDocument(input: AddQualificationDocumentInput): Promise<{ documentId: string }>;
    /** Usuwa dokument uprawnienia. Tylko właściciel. */
    deleteQualificationDocument(documentId: string): Promise<void>;
    /** Plik dokumentu uprawnienia z nazwą; null, gdy aktor go nie widzi. */
    qualificationDocument(documentId: string): Promise<{ file: Blob; fileName: string } | null>;
    /** Uprawnienia aktywnych osób z najbliższych 30 dni i po terminie, które aktor widzi, od najwcześniejszego. */
    upcomingQualifications(): Promise<UpcomingQualification[]>;
    /**
     * Co zrobi skan plakatu budowy albo bazy (kod z kodu QR albo wpisany ręcznie): wejście, wyjście z tej budowy (strona
     * pyta „Kończysz na tej budowie?”) albo przejście z innej. Niczego nie zapisuje. Nieważny kod (także stary po „Nowy
     * kod” i z innej firmy): `poster_invalid`; zakończona budowa: `site_finished`.
     */
    punchPreview(posterToken: string): Promise<PunchPreview>;
    /**
     * Odbicie aktora skanem plakatu: wejście zapisuje się od razu, wyjście z tej samej budowy dopiero z `confirmExit`
     * (bez niego wynik `potwierdz_wyjscie` i nic się nie zapisuje), a skan na innej budowie to przejście (wyjście
     * z tamtej i wejście na tę). Rejestr liczy odległość telefonu od położenia budowy i zapisuje tylko wynik
     * (`na_budowie` do promienia odbicia, `poza_budowa`, `brak_polozenia`, `bez_sprawdzenia`) i odległość;
     * współrzędnych nigdzie. W firmie demo położenia nie sprawdza („na budowie”). Odbija się każdy z kontem. Ponowne
     * wysłanie tej samej operacji zwraca pierwotny wynik.
     */
    punch(input: PunchInput): Promise<PunchOutcome>;
    /**
     * Lista „Odbij też…” po skanie plakatu (ADR 0034): aktywne osoby z kartoteki oprócz aktora, z tym, co zrobi dla
     * każdej skan (wejście, wyjście, przejście z innej budowy), najpierw odbite tutaj. Niczego nie zapisuje. Właściciel
     * i kierownik; pracownik i magazynier: `forbidden`.
     */
    punchPeoplePreview(posterToken: string): Promise<PersonToPunch[]>;
    /**
     * „Odbij też…”: właściciel albo kierownik po skanie plakatu odbija zaznaczone aktywne osoby z kartoteki. Dla każdej
     * wejście, wyjście (tylko z `confirmExit` przy osobie, inaczej `potwierdz_wyjscie`; osoba nie jest już tu odbita:
     * `nie_odbity_tu`) albo przejście, z wynikiem
     * sprawdzenia położenia odbijającego i oznaczeniem „odbił: X”. Wyniki w kolejności osób; ponowne wysłanie zwraca
     * pierwotne. Nieaktywna osoba albo spoza firmy: `not_found`, aktor na liście albo osoba dwa razy: `invalid_input`;
     * pracownik i magazynier: `forbidden`.
     */
    punchPeople(input: PunchPeopleInput): Promise<PersonPunchOutcome[]>;
    /**
     * Skan plakatu zrobiony bez zasięgu, z kolejki offline telefonu (ADR 0033): zapisuje się jak `punch` w chwili skanu
     * (`scannedAt`, z przyszłości przycięty do teraz), z oznaczeniem „zapisane offline”; wyjście telefon już potwierdził
     * (`confirmExit`). Skan, który nie pasuje do odbić zapisanych w międzyczasie (późniejsze odbicie, wyjście bez
     * wejścia, drugie wejście, stary kod, zakończona budowa), nie zapisuje się, tylko trafia jako konflikt do
     * wyjaśnienia. Z `personId` właściciel albo kierownik odbija osobę z kartoteki jak w `punchPeople` (osoba, która
     * w międzyczasie przestała być aktywna, też trafia do wyjaśnienia). Ponowne wysłanie tej samej operacji zwraca
     * pierwotny wynik. Błędy, po których warto ponowić (np. tryb tylko do odczytu), rzuca.
     */
    registerQueuedPunch(input: QueuedPunchInput): Promise<QueuedPunchResult>;
    /**
     * Zakładka „Ludzie na budowie” budowy albo bazy: odbici teraz i ostatnie odbicia, z promieniem odbicia. Właściciel
     * widzi wszystkie, kierownik na swoich budowach i te, które sam odbił, a każdy własne. Pojazd i serwis: `not_found`.
     */
    peopleOnSite(locationId: string): Promise<PeopleOnSite>;
    /**
     * Odbicia do wyjaśnienia (wynik wejścia albo wyjścia inny niż „na budowie” albo „bez wyjścia”), od najnowszego:
     * właściciel wszystkie, kierownik na swoich budowach bez własnych i bez odbitych przez siebie. Pracownik
     * i magazynier: `forbidden`.
     */
    punchesToClarify(): Promise<Punch[]>;
    /** „Wyjaśnione” z opcjonalną notatką: odbicie znika z listy do wyjaśnienia. Ci, którzy je tam widzą. */
    explainPunch(input: ExplainPunchInput): Promise<void>;
    /**
     * Poprawka godziny wejścia, wyjścia albo obu naraz (jedna transakcja) z powodem (bez niego `reason_required`), także
     * uzupełnienie wyjścia osoby odbitej teraz albo odbicia „bez wyjścia”; poprzednie godziny zostają w historii odbicia.
     * Właściciel, a kierownik na swoich budowach bez własnych odbić; pracownik i magazynier: `forbidden`. Godzina
     * z przyszłości, wejście nie przed wyjściem, bez żadnej godziny albo bez zmiany: `invalid_input`; nachodzi na inne
     * odbicie tej osoby: `punch_overlap`.
     */
    correctPunch(input: CorrectPunchInput): Promise<Punch>;
    /**
     * Skany z kolejki offline, które nie pasowały do odbić zapisanych w międzyczasie, od najnowszego: właściciel
     * wszystkie, kierownik na swoich budowach bez własnych. Pracownik i magazynier: `forbidden`.
     */
    punchConflictsToClarify(): Promise<PunchConflict[]>;
    /** „Wyjaśnione” z opcjonalną notatką: konflikt znika z listy. Ci, którzy go tam widzą. */
    explainPunchConflict(input: ExplainPunchConflictInput): Promise<void>;
    /** Plakat budowy (właściciel albo jej kierownik) albo bazy z adresem (właściciel, bez adresu `poster_no_address`). */
    poster(locationId: string): Promise<Poster>;
    /** „Nowy kod”: stary plakat przestaje działać. Właściciel, a na swojej aktywnej budowie jej kierownik. */
    renewPosterToken(locationId: string): Promise<void>;
    /** Promień odbicia budowy albo bazy, 50–5000 m. Tylko właściciel. */
    setPunchRadius(locationId: string, radiusM: number): Promise<void>;
    /**
     * Zestawienie czasu na budowie w miesiącu (RRRR-MM, zły: `invalid_input`): każda osoba na każdej budowie i bazie
     * z sumami. Liczy się czas od wejścia do wyjścia odbicia w części przypadającej na miesiąc w Polsce; odbicia „bez
     * wyjścia” (dopóki nikt nie uzupełni wyjścia) i osoby odbite teraz się nie liczą, a przejście daje osobne wpisy
     * na obu budowach. Właściciel całą firmę, kierownik budowy, których jest kierownikiem; pracownik i magazynier:
     * `forbidden`.
     */
    timeOnSiteSummary(month: string): Promise<TimeOnSiteSummary>;
    /**
     * Własny czas na budowie aktora w bieżącym i poprzednim miesiącu w Polsce, od bieżącego: sumy na każdym miejscu
     * liczone jak w zestawieniu i własne odbicia z miesiąca (także odbicie teraz i „bez wyjścia”). Każdy z kontem.
     */
    ownTimeOnSite(): Promise<OwnTimeOnSite[]>;
    /**
     * Zakłada konto kierownika, magazyniera lub pracownika z hasłem tymczasowym do przekazania osobiście, i jego osobę
     * w kartotece Ludzie.
     * Pracownik dostaje nazwę użytkownika unikalną w firmie (zajęta: `username_taken`), a e-mail może pominąć.
     * Kierownik i magazynier potrzebują wolnego miejsca w pakiecie (bez niego `recorder_limit`); pracownik nie.
     */
    addMember(input: NewMemberInput): Promise<AddedMember>;
    /** Nowe hasło tymczasowe dla kierownika, magazyniera lub pracownika; przy logowaniu znowu musi ustawić własne. */
    resetMemberPassword(memberId: string): Promise<{ temporaryPassword: string }>;
    /** Blokuje logowanie i dostęp do firmy; osoba konta w kartotece przestaje być aktywna. Osoba i jej historia zostają. */
    deactivateMember(memberId: string): Promise<void>;
    /** Baza (z adresem albo bez), budowy (także zakończone), serwisy i pojazdy (także nieaktywne) firmy. */
    locations(): Promise<{ base: { id: string; name: string; address: string | null }; sites: Site[]; services: Service[]; vehicles: Vehicle[] }>;
    /** Aktywni kierownicy, którym można przypisać budowę albo pojazd. Tylko właściciel. */
    siteManagerCandidates(): Promise<SiteManagerCandidate[]>;
    /** Nowa aktywna budowa z kierownikiem. Tylko właściciel. */
    addSite(input: NewSiteInput): Promise<{ locationId: string }>;
    /** Przekazuje budowę innemu aktywnemu kierownikowi. Tylko właściciel. */
    changeSiteManager(siteId: string, managerId: string): Promise<void>;
    /**
     * Mapa budów, którą widzi każdy w firmie: baza, jeśli ma adres, i aktywne budowy, każda z położeniem z geokodowania
     * adresu albo postawionym ręcznie (bez niego: nie znaleziono adresu).
     */
    siteMap(): Promise<MapPin[]>;
    /**
     * Nowy adres aktywnej budowy; pinezka idzie pod nowy adres (albo, gdy go nie znaleziono, znika z mapy). Ten sam adres
     * niczego nie zmienia. Tylko właściciel.
     */
    changeSiteAddress(siteId: string, address: string): Promise<void>;
    /** Adres bazy na mapie budów; pusty zdejmuje bazę z mapy. Tylko właściciel. */
    setBaseAddress(address: string): Promise<void>;
    /** Ręczne położenie pinezki bazy albo aktywnej budowy; zostaje, dopóki adres się nie zmieni. Tylko właściciel. */
    moveMapPin(locationId: string, position: MapPosition): Promise<void>;
    /** Serwis jako lokalizacja, np. „Serwis Hilti Poznań”. Tylko właściciel. */
    addService(input: { name: string }): Promise<{ locationId: string }>;
    /**
     * Nowy aktywny pojazd (np. „Bus WX 12345” albo osobówka bez sprzętu) z kierownikiem, wyłączonym alarmem po progu
     * dni i opcjonalnie numerem rejestracyjnym i VIN (zły: `vin_invalid`). Tylko właściciel.
     */
    addVehicle(input: NewVehicleInput): Promise<{ locationId: string }>;
    /** Numer rejestracyjny i VIN aktywnego pojazdu; null albo puste czyści pole. Tylko właściciel. */
    changeVehicleData(vehicleId: string, data: VehicleData): Promise<void>;
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
     * Włącza powiadomienia push na urządzeniu aktora, w przeglądarce (Web Push) albo w aplikacji na Androida (FCM):
     * każdy nowy wpis w jego dzwonku przyjdzie tam jako kopia. Przeglądarka tylko z adresem znanej usługi push, aplikacja
     * z tokenem FCM. Urządzenie, które należało do kogoś innego, przechodzi na aktora. W firmie demo odmawia
     * (`demo_push`), a kopie na konta firm demo nie wychodzą.
     */
    subscribeToPush(subscription: PushSubscriptionData): Promise<void>;
    /** Wyłącza powiadomienia push na tym urządzeniu aktora (np. przy wylogowaniu). Cudzego nie rusza. */
    unsubscribeFromPush(device: PushDevice): Promise<void>;
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
    /** Ostatnie raporty z dzwonka aktora, tak jak je wtedy dostał, od najnowszego. */
    receivedReports(): Promise<Report[]>;
    /** Ustawienia firmy. Tylko właściciel. */
    settings(): Promise<CompanySettings>;
    /**
     * Zmienia podane ustawienia firmy: próg dni alarmu (1–365), kto widzi zgłoszenia (zamykać może tylko
     * magazynier, który je widzi) i czy kierownik widzi koszty swoich lokalizacji. Pominięte zostają bez zmian.
     * Tylko właściciel.
     */
    updateSettings(input: Partial<CompanySettings>): Promise<void>;
    /** Stawki dzienne obowiązujące dziś (firma i kategorie) z dniem startu kosztów. Tylko właściciel, także przy zgodzie dla kierownika. */
    dailyRates(): Promise<DailyRates>;
    /**
     * Stawka dzienna od dziś: procent wartości dla firmy albo kategorii (0–100, dwa miejsca po przecinku), kwota zł/dzień
     * dla narzędzia; null zdejmuje nadpisanie kategorii albo narzędzia. Pierwsza stawka firmy to dzień startu kosztów:
     * stawki i wartości z tego dnia liczą się wstecz przez całą historię, a każda późniejsza zmiana od dnia zmiany.
     * Stawka równa obowiązującej dziś niczego nie zmienia. Tylko właściciel.
     */
    setDailyRate(target: RateTarget, rate: number | null): Promise<void>;
    /** Kilka stawek (jak `setDailyRate`) razem albo wcale, np. stawka firmy i kategorii z ustawień. Tylko właściciel. */
    setDailyRates(changes: RateChange[]): Promise<void>;
    /**
     * Koszt sprzętu budowy albo pojazdu w okresie (bez niego: cała budowa): każde narzędzie z liczbą rozpoczętych dób
     * w Polsce, stawkami i kwotą, i suma. Przed dniem startu kosztów stan „brak stawki” zamiast kwot. Baza i serwis
     * nie mają kosztów (`invalid_input`). Właściciel każdej lokalizacji, kierownik swojej, gdy właściciel włączył
     * `siteManagersSeeCosts`.
     */
    locationCosts(locationId: string, period?: CostPeriod): Promise<LocationCosts>;
    /**
     * Zestawienie kosztów sprzętu w okresie: każda aktywna budowa i aktywny pojazd z kwotą (także zerową), zakończone
     * i nieaktywne tylko z kosztem w okresie, i suma. Przed dniem startu kosztów stan „brak stawki”. Właściciel całą
     * firmę, kierownik swoje lokalizacje, gdy właściciel włączył `siteManagersSeeCosts`.
     */
    costSummary(period: CostPeriod): Promise<CostSummary>;
    /** Abonament firmy: próg z limitem, liczba narzędzi, „opłacone do” i stan. Tylko właściciel. */
    subscription(): Promise<CompanySubscription>;
    /**
     * Samouczek aktora: czy już się zamknął (pominięty albo ukończony), a u właściciela pierwsze kroki z faktycznym
     * stanem firmy (kierownik, budowa, narzędzia, wydrukowana naklejka). null dla pracownika i w firmie demo.
     */
    tutorial(): Promise<Tutorial | null>;
    /**
     * Zamyka samouczek aktora (pominięty albo ukończony): potem nie startuje sam, ale można go otworzyć ponownie.
     * Nic poza tym nie zapisuje; działa także w trybie tylko do odczytu. Pracownikowi i w demo odmawia (`forbidden`).
     */
    closeTutorial(outcome: TutorialOutcome): Promise<void>;
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
  /** Dokumenty terminów narzędzi i uprawnień ludzi: zdjęcia i PDF. */
  documents: PhotoStore;
  /** Adres budowy albo bazy na punkt na mapie budów. */
  geocoder: Geocoder;
}

export function createRegistry(deps: RegistryDeps): Registry {
  return {
    system: () => ({
      createCompany: async (raw) =>
        createCompany(
          deps,
          normalizeNewCompany(raw),
          {
            tier: subscriptions.DEFAULT_TIER,
            paidUntil: null,
            invoice: null,
          },
          (fn) => deps.db.transaction(fn),
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
      notifyDueQualifications: async () => {
        const now = deps.clock.now();
        const companyIds = await deps.db.transaction((sql) => qualificationReminders.companiesWithQualifications(sql));
        let count = 0;
        // Każda firma w osobnej transakcji: błąd jednej nie zabiera przypomnień pozostałym.
        for (const companyId of companyIds) {
          try {
            count += await remindQualifications(deps, companyId, now);
          } catch (error) {
            console.error(`Nie sprawdzono uprawnień firmy ${companyId}`, error);
          }
        }
        return { qualifications: count };
      },
      notifyCompanyDueQualifications: async (companyId) => ({ qualifications: await remindQualifications(deps, companyId, deps.clock.now()) }),
      notifyForgottenExits: async () => {
        const now = deps.clock.now();
        const companyIds = await deps.db.transaction((sql) => punchReminders.companiesWithOpenPunches(sql));
        let count = 0;
        // Każda firma w osobnej transakcji: błąd jednej nie zabiera przypomnień pozostałym.
        for (const companyId of companyIds) {
          try {
            count += await remindForgottenExits(deps, companyId, now);
          } catch (error) {
            console.error(`Nie przypomniano o wyjściach w firmie ${companyId}`, error);
          }
        }
        return { punches: count };
      },
      closeForgottenExits: async () => ({ punches: await deps.db.transaction((sql) => punchReminders.closeForgottenExits(sql, deps.clock.now())) }),
      closeCompanyForgottenExits: async (companyId) => ({
        punches: await deps.db.transaction((sql) => punchReminders.closeForgottenExits(sql, deps.clock.now(), companyId)),
      }),
      sendCompanyDueReports: (companyId) => sendDueReportsOf(deps, companyId, deps.clock.now()),
      geocodeUnplacedLocations: async () => {
        const unplaced = await deps.db.transaction((sql) => locations.unplacedLocations(sql));
        const result = { placed: 0, notFound: 0 };
        // Po kolei: dostawca liczy zapytania na sekundę, a zadanie jest jednorazowe.
        for (const located of unplaced) {
          const outcome = await geocodeAndPlace(deps, located, (fn) => deps.db.transaction(fn));
          if (outcome === "placed") result.placed += 1;
          if (outcome === "not_found") result.notFound += 1;
        }
        return result;
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
      demoAccounts: () => deps.db.transaction((sql) => demo.demoAccounts(sql)),
      demoUse: () => deps.db.transaction((sql) => demo.demoUse(sql)),
      isDemoAccount: (userId) => deps.db.transaction((sql) => demo.isDemoAccount(sql, userId)),
      activateDemoCompany: async (companyId) => {
        const retired = await deps.db.transaction((sql) => demo.activateDemoCompany(sql, companyId, deps.clock.now()));
        for (const userId of retired) await deps.authAdmin.blockSignIn(userId);
        const companyIds = await deps.db.transaction((sql) => demo.retiredDemoCompanies(sql));
        let purged = 0;
        // Każda firma w osobnej transakcji: błąd jednej zostawia ją (z zablokowanymi kontami) do następnego demo.
        for (const retiredId of companyIds) {
          try {
            await purgeDemoCompany(deps, retiredId);
            purged += 1;
          } catch (error) {
            console.error(`Nie usunięto poprzedniej firmy demo ${retiredId}`, error);
          }
        }
        return { purged };
      },
      recordDemoEntry: (entry) => deps.db.transaction((sql) => demo.recordDemoEntry(sql, entry, deps.clock.now())),
      recordDemoPage: (page) => deps.db.transaction((sql) => demo.recordDemoPage(sql, page, deps.clock.now())),
      requestCallback: async (input) => {
        const saved = await deps.db.transaction((sql) => callbackRequests.requestCallback(sql, input, deps.clock.now()));
        // Prośba jest zapisana i widać ją w panelu, więc błąd e-maila tylko odnotowujemy.
        if (saved) await deps.notifier.sendCallbackRequest(saved).catch((error) => console.error("Nie wysłano e-maila o prośbie o telefon", error));
      },
      exportCompany: async (companyId, add) => {
        const data = await deps.db.transaction((sql) => companyExport.readCompany(sql, companyId));
        return companyExport.writeExport(data, deps, add, deps.clock.now());
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
        // Usuwa aktor systemowy, bo RLS nikomu nie daje usuwać firm; rolę super-admina sprawdza ta sama transakcja.
        deleteCompany: async (companyId, confirmation) => {
          const purged = await deps.db.transaction((sql) =>
            companyDeletion.deleteCompany(sql, { companyId, confirmation: String(confirmation ?? ""), deletedBy: userId }, deps.clock.now()),
          );
          return { leftovers: await removePurgedLeftovers(deps, companyId, purged) };
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
        demoVisits: () => asSuperAdmin((sql) => demo.demoVisits(sql, deps.clock.now())),
        callbackRequests: () => asSuperAdmin((sql) => callbackRequests.callbackRequests(sql, deps.clock.now())),
      };
    },
    as: (userId) => {
      /** Czy aktor jest kontem firmy demo; ustala to pierwsza transakcja polecenia (sesja aktora się nie zmienia). */
      const actor = { demo: false };
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
          actor.demo = session.company.demo;
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
      /**
       * Polecenie, które zapisało nowy adres budowy albo bazy (`located`). Adres idzie do geokodowania dopiero po
       * zatwierdzeniu, bo to zapytanie do zewnętrznego dostawcy; firma demo nigdy go nie pyta. Gdy dostawca nie
       * znalazł adresu albo nie odpowiada, miejsce zostaje bez położenia, a polecenie i tak się udaje.
       */
      const locatingCommand = async <R>(
        command: (sql: Sql, session: Session) => Promise<{ result: R; located: LocatedAddress | null }>,
      ): Promise<R> => {
        const { result, located, demo: inDemo } = await asWriter(async (sql, session) => ({
          ...(await command(sql, session)),
          demo: session.company.demo,
        }));
        if (located && !inDemo) await geocodeAndPlace(deps, located, asWriter);
        return result;
      };
      /**
       * Nowe konto z hasłem tymczasowym: `prepare` sprawdza dane i wskazuje osobę z kartoteki (bez niej powstaje nowa).
       * Uprawnienia, nazwę użytkownika i miejsce w pakiecie sprawdzamy, zanim powstanie konto logowania.
       */
      const addAccount = async (
        prepare: (sql: Sql, session: Session) => Promise<{ member: team.NewMember; personId: string | null }>,
      ): Promise<AddedMember> => {
        const { member, personId } = await asWriter(async (sql, session) => {
          team.requireTeamManager(session);
          const prepared = await prepare(sql, session);
          await team.requireFreeUsername(sql, prepared.member.username);
          await subscriptions.requireRecorderSeat(sql, prepared.member.role);
          return prepared;
        });
        const temporaryPassword = generateTemporaryPassword();
        const { userId } = await createAccount(deps, team.accountEmail(member), temporaryPassword);
        try {
          await asWriter(async (sql, session) => {
            team.requireTeamManager(session);
            // Jeszcze raz, pod blokadą: równolegle dodana osoba mogła zająć ostatnie miejsce.
            await subscriptions.requireRecorderSeat(sql, member.role);
            return team.insertMember(sql, session, userId, member, deps.clock.now(), personId);
          });
        } catch (error) {
          await deps.authAdmin.deleteUser(userId).catch((cleanupError) => console.error(cleanupError));
          throw error;
        }
        return { userId, fullName: member.fullName, email: member.email, username: member.username, temporaryPassword };
      };
      /** Dezaktywuje konto kierownika, magazyniera lub pracownika i jego osobę; w firmie demo odmawia. */
      const deactivateAccount = async (sql: Sql, session: Session, memberId: string) => {
        demo.refuseInDemo(session);
        await team.requireManagedMember(sql, memberId);
        await team.deactivate(sql, memberId);
        // Blokada przed zatwierdzeniem: gdy Auth odmówi, osoba zostaje aktywna i można ponowić.
        await deps.authAdmin.blockSignIn(memberId);
      };
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

      return loggingDemoCommands(deps, userId, actor, {
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
        toolList: () => asMember((sql, session) => toolList.toolList(sql, session, deps.clock.now())),
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
            return tools.editTool(sql, session, toolId, input, deps.clock.now());
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
        vehicleDeadlines: (vehicleId) => asMember((sql) => deadlines.deadlinesOf(sql, { vehicleId }, deps.clock.now())),
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
        addRentedTool: async (input) => {
          const { result, copies } = await retryOnReplay(() =>
            asWriter(async (sql, session) => {
              const { notifications, ...added } = await rentals.addRentedTool(sql, session, input, deps.clock.now());
              return { result: added, copies: await bell.deliver(sql, notifications, deps.clock.now()) };
            }),
          );
          await sendPushCopies(deps, copies);
          return result;
        },
        returnToRental: movementOnlyCommand(rentals.returnToRental),
        toolReports: () =>
          asMember((sql, session) => {
            toolReports.requireToolReviewer(session);
            return toolReports.toolReports(sql);
          }),
        acceptToolReport: (input) => asWriter((sql, session) => toolReports.acceptToolReport(sql, session, input, deps.clock.now())),
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
        people: () =>
          asMember((sql, session) => {
            team.requireTeamManager(session);
            return people.listPeople(sql);
          }),
        addPerson: (input) =>
          asWriter(async (sql, session) => {
            team.requireTeamManager(session);
            const person = people.normalizePerson(input);
            return { personId: await people.insertPerson(sql, session.company.id, person, deps.clock.now()) };
          }),
        editPerson: (personId, changes) =>
          asWriter(async (sql, session) => {
            team.requireTeamManager(session);
            const person = people.normalizePerson(changes);
            const { userId } = await people.requirePerson(sql, personId);
            // Konto roli demo i jego nazwę widzą wszyscy oglądający (także na stronie /demo).
            if (userId !== null) demo.refuseInDemo(session);
            await people.updatePerson(sql, personId, person);
          }),
        deactivatePerson: (personId) =>
          asWriter(async (sql, session) => {
            team.requireTeamManager(session);
            const person = await people.requirePerson(sql, personId);
            if (!person.active) throw new RegistryError("forbidden");
            if (person.userId === null) return people.deactivatePerson(sql, personId);
            await deactivateAccount(sql, session, person.userId);
          }),
        addPersonAccount: (input) =>
          addAccount(async (sql) => {
            const person = await people.requireAccountlessPerson(sql, String(input.personId));
            return { member: team.normalizeAccount(person.fullName, input), personId: input.personId };
          }),
        addMember: (input) => addAccount(async () => ({ member: team.normalizeNewMember(input), personId: null })),
        qualificationKinds: () => asMember((sql) => qualifications.qualificationKinds(sql)),
        addQualificationKind: (input) => asWriter((sql, session) => qualifications.addQualificationKind(sql, session, input, deps.clock.now())),
        peopleQualifications: () => asMember((sql) => qualifications.peopleQualifications(sql, deps.clock.now())),
        personQualifications: (personId) => asMember((sql) => qualifications.personQualifications(sql, personId, deps.clock.now())),
        addQualification: (input) => asWriter((sql, session) => qualifications.addQualification(sql, session, input, deps.clock.now())),
        updateQualification: (qualificationId, changes) =>
          asWriter((sql, session) => qualifications.updateQualification(sql, session, qualificationId, changes)),
        deleteQualification: async (qualificationId) => {
          const { fileKeys } = await asWriter((sql, session) => qualifications.deleteQualification(sql, session, qualificationId));
          await removeFiles(deps.documents, fileKeys);
        },
        completeQualification: (input) =>
          savingPhoto(deps.documents, (save) =>
            retryOnReplay(() =>
              asWriter(async (sql, session) => {
                const { dueOn, file } = await qualifications.completeQualification(sql, session, input, deps.clock.now());
                if (file) await save(file.key, file.blob);
                return { dueOn };
              }),
            ),
          ),
        addQualificationDocument: (input) =>
          savingPhoto(deps.documents, (save) =>
            retryOnReplay(() =>
              asWriter(async (sql, session) => {
                const { documentId, file } = await qualifications.addQualificationDocument(sql, session, input, deps.clock.now());
                if (file) await save(file.key, file.blob);
                return { documentId };
              }),
            ),
          ),
        deleteQualificationDocument: async (documentId) => {
          const { fileKeys } = await asWriter((sql, session) => qualifications.deleteQualificationDocument(sql, session, documentId));
          await removeFiles(deps.documents, fileKeys);
        },
        qualificationDocument: async (documentId) => {
          const document = await asMember((sql) => qualifications.visibleQualificationDocument(sql, documentId));
          const file = document && (await deps.documents.read(document.key));
          return file ? { file, fileName: document.fileName } : null;
        },
        upcomingQualifications: () => asMember((sql) => qualifications.upcomingQualifications(sql, deps.clock.now())),
        punchPreview: (posterToken) => asMember((sql, session) => punches.punchPreview(sql, session, posterToken)),
        punch: async (input) => {
          const attempt = () => asWriter((sql, session) => punches.punch(sql, session, input, deps.clock.now()));
          try {
            return await attempt();
          } catch (error) {
            // Równoległy skan tej osoby albo ponowka tej samej operacji; drugie podejście zobaczy jego wynik.
            if (error instanceof ReplayedOperationError || error instanceof punches.ConcurrentPunchError) return attempt();
            throw error;
          }
        },
        punchPeoplePreview: (posterToken) => asMember((sql, session) => punches.punchPeoplePreview(sql, session, posterToken)),
        punchPeople: async (input) => {
          const attempt = () => asWriter((sql, session) => punches.punchPeople(sql, session, input, deps.clock.now()));
          try {
            return await attempt();
          } catch (error) {
            // Równoległy skan którejś z osób albo ponowka tej samej operacji; drugie podejście zobaczy jego wynik.
            if (error instanceof ReplayedOperationError || error instanceof punches.ConcurrentPunchError) return attempt();
            throw error;
          }
        },
        registerQueuedPunch: async (input) => {
          const attempt = () => asWriter((sql, session) => punches.queuedPunch(sql, session, input, deps.clock.now()));
          try {
            return await attempt();
          } catch (error) {
            // Równoległy skan tej osoby albo ponowka tej samej operacji; drugie podejście zobaczy jego wynik.
            if (error instanceof ReplayedOperationError || error instanceof punches.ConcurrentPunchError) return attempt();
            throw error;
          }
        },
        peopleOnSite: (locationId) => asMember((sql, session) => punches.peopleOnSite(sql, session, locationId)),
        punchesToClarify: () => asMember((sql, session) => punches.punchesToClarify(sql, session)),
        explainPunch: (input) => asWriter((sql, session) => punches.explainPunch(sql, session, input, deps.clock.now())),
        correctPunch: (input) => asWriter((sql, session) => punches.correctPunch(sql, session, input, deps.clock.now())),
        punchConflictsToClarify: () => asMember((sql, session) => punches.punchConflictsToClarify(sql, session)),
        explainPunchConflict: (input) => asWriter((sql, session) => punches.explainPunchConflict(sql, session, input, deps.clock.now())),
        poster: (locationId) => asMember((sql, session) => punches.poster(sql, session, locationId)),
        renewPosterToken: (locationId) => asWriter((sql, session) => punches.renewPosterToken(sql, session, locationId)),
        setPunchRadius: (locationId, radiusM) => asWriter((sql, session) => punches.setPunchRadius(sql, session, locationId, radiusM)),
        timeOnSiteSummary: (month) => asMember((sql, session) => timeOnSite.timeOnSiteSummary(sql, session, month)),
        ownTimeOnSite: () => asMember((sql, session) => timeOnSite.ownTimeOnSite(sql, session, deps.clock.now())),
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
            await deactivateAccount(sql, session, memberId);
          }),
        locations: () =>
          asMember(async (sql) => ({
            base: await locations.base(sql),
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
          locatingCommand(async (sql, session) => {
            locations.requireLocationManager(session);
            const site = await locations.addSite(sql, session, input, deps.clock.now());
            return { result: { locationId: site.locationId }, located: site };
          }),
        changeSiteManager: (siteId, managerId) =>
          asWriter((sql, session) => {
            locations.requireLocationManager(session);
            return locations.changeSiteManager(sql, siteId, managerId);
          }),
        siteMap: () => asMember((sql) => locations.siteMap(sql)),
        changeSiteAddress: (siteId, address) =>
          locatingCommand(async (sql, session) => {
            locations.requireLocationManager(session);
            const changed = await locations.changeSiteAddress(sql, siteId, address);
            return { result: undefined, located: changed === null ? null : { locationId: siteId, address: changed } };
          }),
        setBaseAddress: (address) =>
          locatingCommand(async (sql, session) => {
            locations.requireLocationManager(session);
            return { result: undefined, located: await locations.setBaseAddress(sql, address) };
          }),
        moveMapPin: (locationId, position) =>
          asWriter((sql, session) => {
            locations.requireLocationManager(session);
            return locations.moveMapPin(sql, locationId, position);
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
        changeVehicleData: (vehicleId, data) =>
          asWriter((sql, session) => {
            locations.requireLocationManager(session);
            return locations.changeVehicleData(sql, vehicleId, data);
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
        unsubscribeFromPush: (device) => asPersonal((sql, session) => push.unsubscribe(sql, session, device)),
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
        receivedReports: () => asMember((sql, session) => reports.receivedReports(sql, session)),
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
        dailyRates: () =>
          asMember((sql, session) => {
            costs.requireRateManager(session);
            return costs.dailyRates(sql, deps.clock.now());
          }),
        setDailyRate: (target, rate) =>
          asWriter((sql, session) => {
            costs.requireRateManager(session);
            return costs.setDailyRate(sql, session, { target, rate }, deps.clock.now());
          }),
        setDailyRates: (changes) =>
          asWriter(async (sql, session) => {
            costs.requireRateManager(session);
            if (!Array.isArray(changes)) throw new RegistryError("invalid_input");
            for (const change of changes) await costs.setDailyRate(sql, session, change, deps.clock.now());
          }),
        locationCosts: (locationId, period) =>
          asMember((sql, session) => {
            costs.requireCostViewer(session);
            return costs.locationCosts(sql, session, locationId, period, deps.clock.now());
          }),
        costSummary: (period) =>
          asMember((sql, session) => {
            costs.requireCostViewer(session);
            return costs.costSummary(sql, session, period, deps.clock.now());
          }),
        subscription: () =>
          asMember((sql, session) => {
            subscriptions.requireSubscriptionReader(session);
            return subscriptions.companySubscription(sql, deps.clock.now());
          }),
        tutorial: () => asMember((sql, session) => tutorial.tutorial(sql, session)),
        closeTutorial: (outcome) => asPersonal((sql, session) => tutorial.closeTutorial(sql, session, outcome)),
      });
    },
  };
}

type MemberRegistry = ReturnType<Registry["as"]>;

/**
 * Polecenia członka firmy, które po udanym wykonaniu na koncie demo trafiają do dziennika demo. Zwykłe firmy nie płacą
 * za to niczym: czy aktor jest w demo, wie już transakcja polecenia. Błąd zapisu dziennika nie psuje polecenia.
 */
/**
 * Geokodowanie adresu i zapis położenia w transakcji z `write` (aktora albo systemowej). Gdy dostawca nie odpowiada,
 * błąd trafia do logu, a miejsce zostaje bez położenia (`failed`).
 */
async function geocodeAndPlace(
  deps: RegistryDeps,
  located: LocatedAddress,
  write: (fn: (sql: Sql) => Promise<void>) => Promise<void>,
): Promise<"placed" | "not_found" | "failed"> {
  try {
    const position = await deps.geocoder.geocode(located.address);
    if (!position) return "not_found";
    await write((sql) => locations.placeGeocoded(sql, located, position));
    return "placed";
  } catch (error) {
    console.error(`Nie zgeokodowano adresu lokalizacji ${located.locationId}`, error);
    return "failed";
  }
}

function loggingDemoCommands(deps: RegistryDeps, userId: string, actor: { demo: boolean }, member: MemberRegistry): MemberRegistry {
  const logged: Record<string, unknown> = { ...member };
  for (const command of demo.LOGGED_DEMO_COMMANDS) {
    const run = member[command] as (...args: unknown[]) => Promise<unknown>;
    logged[command] = async (...args: unknown[]) => {
      const result = await run(...args);
      if (actor.demo) {
        await deps.db
          .transaction((sql) => demo.recordDemoAction(sql, { userId, command }, deps.clock.now()))
          .catch((error) => console.error(`Nie zapisano akcji demo ${command}`, error));
      }
      return result;
    };
  }
  return logged as unknown as MemberRegistry;
}

/** Usuwa zastąpioną firmę demo w jednej transakcji, a po niej jej pliki i konta logowania. */
async function purgeDemoCompany(deps: RegistryDeps, companyId: string) {
  const purged = await deps.db.transaction((sql) => demo.purgeDemoCompany(sql, companyId));
  await removePurgedLeftovers(deps, companyId, purged);
}

/**
 * Pliki i konta logowania usuniętej firmy, po zatwierdzeniu jej transakcji. Plik albo konto, którego nie udało się
 * usunąć, zostaje osierocone, ale nikogo nie wpuszcza: danych firmy już nie ma. Zwraca, ilu nie usunięto.
 */
async function removePurgedLeftovers(deps: RegistryDeps, companyId: string, purged: companyDeletion.PurgedCompany): Promise<number> {
  const cleanups = [
    ...purged.photoKeys.map((key) => () => deps.photos.remove(key)),
    ...purged.chatPhotoKeys.map((key) => () => deps.chatPhotos.remove(key)),
    ...purged.documentKeys.map((key) => () => deps.documents.remove(key)),
    ...purged.userIds.map((userId) => () => deps.authAdmin.deleteUser(userId)),
  ];
  let failed = 0;
  for (const cleanup of cleanups) {
    await cleanup().catch((error) => {
      failed += 1;
      console.error(`Po usunięciu firmy ${companyId}`, error);
    });
  }
  return failed;
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

/** Przypomnienia o uprawnieniach jednej firmy w jednej transakcji systemowej; kopie push po zatwierdzeniu. Zwraca liczbę nowych. */
async function remindQualifications(deps: RegistryDeps, companyId: string, now: Date): Promise<number> {
  const result = await deps.db.transaction((sql) => qualificationReminders.notifyDueQualifications(sql, companyId, now));
  await sendPushCopies(deps, result.copies);
  return result.qualifications;
}

/** Przypomnienia o wyjściu w jednej firmie w jednej transakcji systemowej; kopie push po zatwierdzeniu. Zwraca liczbę odbić. */
async function remindForgottenExits(deps: RegistryDeps, companyId: string, now: Date): Promise<number> {
  const result = await deps.db.transaction((sql) => punchReminders.notifyForgottenExits(sql, companyId, now));
  await sendPushCopies(deps, result.copies);
  return result.punches;
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
 * Wysyła kopie push już zapisanych wpisów na urządzenia adresatów (przeglądarki i aplikacje) i usuwa subskrypcje,
 * które wygasły.
 * Subskrypcje innych osób czyta transakcja systemowa. Wpis w dzwonku zostaje, więc błąd tylko odnotowujemy.
 */
async function sendPushCopies(deps: RegistryDeps, copies: PushCopy[]) {
  if (copies.length === 0) return;
  try {
    const subscriptions = await deps.db.transaction((sql) => push.subscriptionsOf(sql, [...new Set(copies.map((copy) => copy.recipientId))]));
    const expired: PushSubscriptionData[] = [];
    await Promise.all(
      copies.flatMap((copy) =>
        subscriptions
          .filter(({ userId }) => userId === copy.recipientId)
          .map(({ subscription }) =>
            deps.notifier
              .push(subscription, copy.message)
              .then((outcome) => void (outcome === "expired" && expired.push(subscription)))
              .catch((error) => console.error("Nie wysłano powiadomienia push", copy.message.window, error)),
          ),
      ),
    );
    if (expired.length > 0) await deps.db.transaction((sql) => push.forgetExpired(sql, expired));
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
 * super-admina) firmę, bazę, właściciela (z jego osobą w kartotece Ludzie) i abonament.
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
      await people.insertPerson(sql, company.id, { fullName: input.owner.fullName, note: null }, now, userId);
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
    site_managers_see_costs: boolean;
    paid_until: string | null;
    manual_read_only: boolean | null;
  }>(
    `select u.full_name, u.role, u.must_change_password, c.id as company_id, c.name as company_name, c.demo_since is not null as company_demo,
            c.site_managers_see_costs, to_char(p.paid_until, 'YYYY-MM-DD') as paid_until, p.manual_read_only
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
      siteManagersSeeCosts: row.site_managers_see_costs,
    },
  };
}
