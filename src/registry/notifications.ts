import type { DeadlineAt } from "./deadlines";
import type { RegistryErrorCode } from "./errors";
import type { Movement, RegisteredKind } from "./movements";
import type { Sql } from "./ports";
import type { NotifiedQualification } from "./qualifications";
import type { FridayReport, ReportKind, WeeklyReport } from "./reports";

/** Budowa albo pojazd w treści powiadomienia; `kind` nie ma we wpisach sprzed pojazdów, a te dotyczą budów. */
export interface NotifiedPlace {
  id: string;
  name: string;
  kind?: "budowa" | "pojazd";
}

/** Adresat powiadomienia: osoba z firmy, w której zaszło zdarzenie. */
export interface Recipient {
  userId: string;
  fullName: string;
}

/** Kierownik dowiaduje się, że ktoś zabrał sprzęt z jego budowy albo pojazdu i już za niego nie odpowiada. */
export interface ToolsTakenNotification {
  kind: "narzedzia_zabrane";
  /** Z e-mailem: to powiadomienie ma kopię e-mailową. */
  recipient: Recipient & { email: string };
  movementId: string;
  /** Kto zabrał. */
  takenBy: string;
  from: NotifiedPlace;
  to: NotifiedPlace;
  tools: { id: string; code: string; name: string }[];
  occurredAt: Date;
}

/** Kierownik budowy (albo pojazdu z włączonym alarmem): narzędzie stoi na niej dłużej niż próg dni firmy. */
export interface ThresholdExceededNotification {
  kind: "prog_przekroczony";
  recipient: Recipient;
  tool: { id: string; code: string; name: string };
  location: NotifiedPlace;
  /** Od kiedy narzędzie tam stoi. */
  since: Date;
  thresholdDays: number;
}

/** Właściciel: zbiorczo narzędzia, które w danym dniu przekroczyły próg dni. */
export interface ThresholdsExceededNotification {
  kind: "progi_przekroczone";
  recipient: Recipient;
  thresholdDays: number;
  tools: { id: string; code: string; name: string; location: { id: string; name: string } }[];
}

/** Autor: serwer odrzucił ruch z jego kolejki offline; ruch czeka na liście „Do wyjaśnienia”. */
export interface MovementRejectedNotification {
  kind: "ruch_odrzucony";
  recipient: Recipient;
  rejectionId: string;
  movementKind: RegisteredKind;
  tools: { id: string; code: string; name: string }[];
  to: { id: string; name: string } | null;
  /** Kod błędu Rejestru. */
  reason: RegistryErrorCode;
  occurredAt: Date;
}

/** Właściciel: raport tygodniowy firmy z poniedziałku, 7:00. */
export interface WeeklyReportNotification {
  kind: "raport_tygodniowy";
  /** Z e-mailem: raport tygodniowy ma kopię e-mailową. */
  recipient: Recipient & { email: string };
  report: WeeklyReport;
}

/** Raport piątkowy z 16:00: właściciel dostaje całą firmę, a kierownik swoje lokalizacje. */
export interface FridayReportNotification {
  kind: "raport_piatkowy";
  recipient: Recipient;
  report: FridayReport;
}

/** Właściciel: za 7 dni (albo jutro) firma przejdzie w tryb tylko do odczytu, jeśli nie wpłynie opłata. */
export interface ReadOnlySoonNotification {
  kind: "tylko_do_odczytu_wkrotce";
  /** Z e-mailem: ostrzeżenie ma kopię e-mailową. */
  recipient: Recipient & { email: string };
  /** Ostatni opłacony dzień (RRRR-MM-DD). */
  paidUntil: string;
  /** Pierwszy dzień trybu tylko do odczytu (RRRR-MM-DD). */
  readOnlyFrom: string;
  /** Ile dni zostało do przełączenia (1 = jutro). */
  daysLeft: number;
}

/** Właściciel: firma przeszła w tryb tylko do odczytu po terminie płatności albo ręcznie (super-admin). */
export interface ReadOnlyNotification {
  kind: "tylko_do_odczytu";
  recipient: Recipient;
  reason: "po_terminie" | "reczny";
  /** Ostatni opłacony dzień (RRRR-MM-DD); null, gdy nic jeszcze nie wpłynęło. */
  paidUntil: string | null;
  /** Od kiedy firma jest w trybie (RRRR-MM-DD). */
  since: string;
}

/** Termin w przypomnieniu: tydzień przed nim (`overdue` false) albo po nim, z tym, gdzie był wtedy sprzęt. */
export type NotifiedDeadline = DeadlineAt;

/**
 * Przypomnienie o terminach przeglądów, kalibracji, badań UDT i końca gwarancji: właściciel dostaje wszystkie z danego
 * dnia w jednym wpisie, a kierownik te, które dotyczą sprzętu na jego budowie albo pojeździe.
 */
export interface DeadlinesNotification {
  kind: "terminy";
  recipient: Recipient;
  deadlines: NotifiedDeadline[];
}

/** Właściciel: ktoś przyjął sprzęt wynajęty z wypożyczalni, czyli nowy koszt. */
export interface RentedToolNotification {
  kind: "sprzet_wynajety";
  recipient: Recipient;
  tool: { id: string; code: string; name: string };
  location: { id: string; name: string; kind: "baza" | "budowa" | "pojazd" };
  rentalCompany: string;
  /** Termin zwrotu (RRRR-MM-DD). */
  returnOn: string;
  /** Kto przyjął. */
  addedBy: string;
}

/**
 * Przypomnienie o uprawnieniach ludzi 30 dni przed końcem ważności albo po nim: właściciel dostaje wszystkie z danego
 * dnia w jednym wpisie, a osoba z kontem te, które są jej własne.
 */
export interface QualificationsNotification {
  kind: "uprawnienia";
  recipient: Recipient;
  qualifications: NotifiedQualification[];
}

/** Powiadomienie dla użytkownika firmy. Trafia do jego dzwonka, a port powiadomień wysyła kopię. */
export type Notification =
  | ToolsTakenNotification
  | ThresholdExceededNotification
  | ThresholdsExceededNotification
  | MovementRejectedNotification
  | WeeklyReportNotification
  | FridayReportNotification
  | ReadOnlySoonNotification
  | ReadOnlyNotification
  | DeadlinesNotification
  | RentedToolNotification
  | QualificationsNotification;

/**
 * Powiadomienia, których kopię port powiadomień wysyła także e-mailem; pozostałe idą tylko do dzwonka i push.
 * Raport piątkowy dostaje e-mailem tylko właściciel.
 */
export type EmailedNotification =
  | ToolsTakenNotification
  | WeeklyReportNotification
  | ReadOnlySoonNotification
  | (FridayReportNotification & { recipient: Recipient & { email: string } });

/** Rodzaj powiadomienia. */
export type NotificationKind = Notification["kind"];

type WithoutRecipient<N> = N extends unknown ? Omit<N, "recipient"> : never;

/** Treść powiadomienia w dzwonku: dane zdarzenia bez adresata. */
export type NotificationContent = WithoutRecipient<Notification>;

/**
 * Powiadomienia wynikające z ruchu: przy przeniesieniu kierownik budowy lub pojazdu źródłowego, o ile to nie on
 * zabrał sprzęt i jego konto jest aktywne. Czyta e-mail adresata w transakcji aktora, więc polega na
 * tym, że RLS pokazuje każdemu w firmie e-maile pozostałych osób.
 */
export async function notificationsFor(sql: Sql, movement: Movement): Promise<ToolsTakenNotification[]> {
  if (movement.kind !== "przeniesienie" || !movement.from || !movement.to) return [];
  const [manager] = await sql<{ user_id: string; full_name: string; email: string; from_kind: "budowa" | "pojazd"; to_kind: "budowa" | "pojazd" }>(
    `select u.user_id, u.full_name, u.email, l.kind as from_kind, lt.kind as to_kind
     from app.movements m
     join app.locations l on l.id = m.from_location_id
     join app.locations lt on lt.id = m.to_location_id
     join app.users u on u.user_id = l.manager_id
     where m.id = $1 and u.user_id <> m.author_id and u.active`,
    [movement.id],
  );
  if (!manager) return [];
  return [
    {
      kind: "narzedzia_zabrane",
      recipient: { userId: manager.user_id, fullName: manager.full_name, email: manager.email },
      movementId: movement.id,
      takenBy: movement.author,
      from: { ...movement.from, kind: manager.from_kind },
      to: { ...movement.to, kind: manager.to_kind },
      tools: movement.tools,
      occurredAt: movement.occurredAt,
    },
  ];
}

/** Które z dwóch ostrzeżeń przed trybem tylko do odczytu: tydzień przed (także spóźnione) czy dzień przed. */
export function readOnlyWarning(notification: Pick<ReadOnlySoonNotification, "daysLeft">): "tydzien" | "dzien" {
  return notification.daysLeft === 1 ? "dzien" : "tydzien";
}

/** Klucz raportu w dzwonku: adresat dostaje raport z danego dnia najwyżej raz. */
export function reportKey(kind: ReportKind, day: string): string {
  return `raport_${kind}:${day}`;
}

/**
 * Klucz zdarzenia: to samo zdarzenie daje adresatowi najwyżej jedno powiadomienie w dzwonku. Zbiorcze (progi dni,
 * terminy, uprawnienia) nie mają klucza, bo każde narzędzie (termin, uprawnienie) wchodzi do nich raz, gdy zadanie dzienne je wykryje, a ręczne
 * włączenie trybu tylko do odczytu, bo powiadamia o nim samo przełączenie. Ostrzeżenia przed trybem są dwa
 * na każdy termin (tydzień i dzień przed), a przełączenie po terminie jedno.
 * W transakcji użytkownika ten sam klucz składa funkcja `app.deliver_notification`.
 */
export function dedupeKey(notification: Notification): string | null {
  switch (notification.kind) {
    case "narzedzia_zabrane":
      return `ruch:${notification.movementId}`;
    case "prog_przekroczony":
      return `prog:${notification.tool.id}:${notification.since.toISOString()}`;
    case "progi_przekroczone":
    case "terminy":
    case "uprawnienia":
      return null;
    case "ruch_odrzucony":
      return `odrzucony:${notification.rejectionId}`;
    case "raport_tygodniowy":
    case "raport_piatkowy":
      return reportKey(notification.report.kind, notification.report.day);
    case "tylko_do_odczytu_wkrotce":
      return `tylko_do_odczytu_wkrotce:${notification.readOnlyFrom}:${readOnlyWarning(notification)}`;
    case "tylko_do_odczytu":
      return notification.reason === "po_terminie" ? `tylko_do_odczytu:${notification.since}` : null;
    case "sprzet_wynajety":
      return `wynajem:${notification.tool.id}`;
  }
}
