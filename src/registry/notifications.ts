import type { Movement } from "./movements";
import type { Sql } from "./ports";

/** Kierownik dowiaduje się, że ktoś zabrał sprzęt z jego budowy i już za niego nie odpowiada. */
export interface ToolsTakenNotification {
  kind: "narzedzia_zabrane";
  recipient: { userId: string; fullName: string; email: string };
  movementId: string;
  /** Kto zabrał. */
  takenBy: string;
  from: { id: string; name: string };
  to: { id: string; name: string };
  tools: { id: string; code: string; name: string }[];
  occurredAt: Date;
}

/** Powiadomienie dla użytkownika firmy; wysyła je port powiadomień. */
export type Notification = ToolsTakenNotification;

/**
 * Powiadomienia wynikające z ruchu: przy przeniesieniu kierownik budowy źródłowej, o ile to nie on
 * zabrał sprzęt i jego konto jest aktywne. Czyta e-mail adresata w transakcji aktora, więc polega na
 * tym, że RLS pokazuje każdemu w firmie e-maile pozostałych osób.
 */
export async function notificationsFor(sql: Sql, movement: Movement): Promise<Notification[]> {
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
