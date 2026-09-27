import type { Movement } from "./movements";
import type { Sql } from "./ports";

/** Adresat powiadomienia: osoba z firmy, w której zaszło zdarzenie. */
export interface Recipient {
  userId: string;
  fullName: string;
  email: string;
}

/** Kierownik dowiaduje się, że ktoś zabrał sprzęt z jego budowy i już za niego nie odpowiada. */
export interface ToolsTakenNotification {
  kind: "narzedzia_zabrane";
  recipient: Recipient;
  movementId: string;
  /** Kto zabrał. */
  takenBy: string;
  from: { id: string; name: string };
  to: { id: string; name: string };
  tools: { id: string; code: string; name: string }[];
  occurredAt: Date;
}

/** Kierownik budowy: narzędzie stoi na niej dłużej niż próg dni firmy. */
export interface ThresholdExceededNotification {
  kind: "prog_przekroczony";
  recipient: Recipient;
  tool: { id: string; code: string; name: string };
  location: { id: string; name: string };
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

/** Powiadomienie dla użytkownika firmy. Trafia do jego dzwonka, a port powiadomień wysyła kopię. */
export type Notification = ToolsTakenNotification | ThresholdExceededNotification | ThresholdsExceededNotification;

/** Powiadomienia, których kopię port powiadomień wysyła e-mailem; pozostałe są tylko w dzwonku. */
export type EmailedNotification = ToolsTakenNotification;

/** Rodzaj powiadomienia. */
export type NotificationKind = Notification["kind"];

type WithoutRecipient<N> = N extends unknown ? Omit<N, "recipient"> : never;

/** Treść powiadomienia w dzwonku: dane zdarzenia bez adresata. */
export type NotificationContent = WithoutRecipient<Notification>;

/**
 * Powiadomienia wynikające z ruchu: przy przeniesieniu kierownik budowy źródłowej, o ile to nie on
 * zabrał sprzęt i jego konto jest aktywne. Czyta e-mail adresata w transakcji aktora, więc polega na
 * tym, że RLS pokazuje każdemu w firmie e-maile pozostałych osób.
 */
export async function notificationsFor(sql: Sql, movement: Movement): Promise<ToolsTakenNotification[]> {
  if (movement.kind !== "przeniesienie" || !movement.from || !movement.to) return [];
  const [manager] = await sql<{ user_id: string; full_name: string; email: string }>(
    `select u.user_id, u.full_name, u.email
     from app.movements m
     join app.locations l on l.id = m.from_location_id
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
      from: movement.from,
      to: movement.to,
      tools: movement.tools,
      occurredAt: movement.occurredAt,
    },
  ];
}

/**
 * Klucz zdarzenia: to samo zdarzenie daje adresatowi najwyżej jedno powiadomienie w dzwonku. Zbiorcze
 * nie ma klucza, bo każde narzędzie wchodzi do niego raz, gdy zadanie dzienne wykryje przekroczenie.
 */
export function dedupeKey(notification: Notification): string | null {
  switch (notification.kind) {
    case "narzedzia_zabrane":
      return `ruch:${notification.movementId}`;
    case "prog_przekroczony":
      return `prog:${notification.tool.id}:${notification.since.toISOString()}`;
    case "progi_przekroczone":
      return null;
  }
}
