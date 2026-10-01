import type { Notification, NotificationContent } from "./notifications";
import { dedupeKey } from "./notifications";
import type { Sql } from "./ports";
import type { PushCopy } from "./push";
import type { Session } from "./registry";
import { UUID_PATTERN } from "./validation";

/** Powiadomienie w dzwonku użytkownika. */
export interface BellEntry {
  id: string;
  createdAt: Date;
  read: boolean;
  notification: NotificationContent;
}

export interface Bell {
  /** Ile powiadomień jest nieprzeczytanych (także poza `entries`). */
  unread: number;
  /** Od najnowszego. */
  entries: BellEntry[];
}

/** Najwięcej powiadomień na jednej liście dzwonka. */
const MAX_ENTRIES = 100;

/**
 * Wkłada powiadomienia do dzwonków adresatów w transakcji zdarzenia aktora. Funkcja w bazie sprawdza,
 * że aktor naprawdę wywołał to zdarzenie, i nie dubluje powiadomienia, które adresat już ma (np. przy
 * ponowieniu operacji). Zwraca kopie push tylko nowych wpisów.
 */
export async function deliver(sql: Sql, notifications: Notification[], now: Date): Promise<PushCopy[]> {
  const copies: PushCopy[] = [];
  for (const notification of notifications) {
    const { recipient, ...content } = notification;
    const [{ id }] = await sql<{ id: string | null }>("select app.deliver_notification($1, $2, $3, $4) as id", [
      recipient.userId,
      notification.kind,
      JSON.stringify(content),
      now,
    ]);
    if (id) copies.push(pushCopy(recipient.userId, id, content));
  }
  return copies;
}

/** Jak `deliver`, ale w transakcji systemowej (zadanie harmonogramu, poza RLS), dla wskazanej firmy. */
export async function deliverAsSystem(sql: Sql, companyId: string, notifications: Notification[], now: Date): Promise<PushCopy[]> {
  const copies: PushCopy[] = [];
  for (const notification of notifications) {
    const { recipient, ...content } = notification;
    const [row] = await sql<{ id: string }>(
      `insert into app.notifications (company_id, recipient_id, kind, content, dedupe_key, created_at)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing
       returning id`,
      [companyId, recipient.userId, notification.kind, JSON.stringify(content), dedupeKey(notification), now],
    );
    if (row) copies.push(pushCopy(recipient.userId, row.id, content));
  }
  return copies;
}

export function pushCopy(recipientId: string, notificationId: string, notification: NotificationContent): PushCopy {
  return { recipientId, message: { window: "dzwonek", notificationId, notification } };
}

/** Dzwonek aktora: nieprzeczytane i ostatnie powiadomienia. */
export async function bell(sql: Sql, session: Session, limit: number): Promise<Bell> {
  const unread = await unreadCount(sql, session);
  const rows = await sql<{ id: string; created_at: Date; read_at: Date | null; content: Record<string, unknown> }>(
    `select id, created_at, read_at, content from app.notifications
     where recipient_id = $1 order by created_at desc, id desc limit $2`,
    [session.userId, Math.max(1, Math.min(limit, MAX_ENTRIES))],
  );
  return {
    unread,
    entries: rows.map((row) => ({
      id: row.id,
      createdAt: new Date(row.created_at),
      read: row.read_at !== null,
      notification: reviveContent(row.content),
    })),
  };
}

/** Liczba nieprzeczytanych powiadomień aktora (licznik przy dzwonku). */
export async function unreadCount(sql: Sql, session: Session): Promise<number> {
  const [{ unread }] = await sql<{ unread: number }>(
    "select count(*)::int as unread from app.notifications where recipient_id = $1 and read_at is null",
    [session.userId],
  );
  return unread;
}

/** Oznacza własne powiadomienie jako przeczytane i zwraca je; cudzego albo nieistniejącego nie ma (null). */
export async function markRead(sql: Sql, session: Session, id: string, now: Date): Promise<BellEntry | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const [row] = await sql<{ id: string; created_at: Date; content: Record<string, unknown> }>(
    `update app.notifications set read_at = coalesce(read_at, $3)
     where id = $1 and recipient_id = $2 returning id, created_at, content`,
    [id, session.userId, now],
  );
  return row ? { id: row.id, createdAt: new Date(row.created_at), read: true, notification: reviveContent(row.content) } : null;
}

export async function markAllRead(sql: Sql, session: Session, now: Date): Promise<void> {
  await sql("update app.notifications set read_at = $2 where recipient_id = $1 and read_at is null", [session.userId, now]);
}

/** Treść z JSON-a: daty wracają jako Date. */
function reviveContent(raw: Record<string, unknown>): NotificationContent {
  const content = { ...raw } as NotificationContent & Record<string, unknown>;
  switch (content.kind) {
    case "narzedzia_zabrane":
      return { ...content, occurredAt: new Date(content.occurredAt) };
    case "prog_przekroczony":
      return { ...content, since: new Date(content.since) };
    case "progi_przekroczone":
    case "terminy":
      return content;
    case "ruch_odrzucony":
      return { ...content, occurredAt: new Date(content.occurredAt) };
    case "raport_tygodniowy":
    case "raport_piatkowy":
    case "tylko_do_odczytu_wkrotce":
    case "tylko_do_odczytu":
    case "sprzet_wynajety":
      return content;
  }
}
