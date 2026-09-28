import { RegistryError } from "./errors";
import type { IssueEntry } from "./issues";
import type { NotificationContent } from "./notifications";
import type { Sql } from "./ports";
import type { Session } from "./registry";
import type { SupportReply } from "./support-chat";

/** Subskrypcja Web Push jednej przeglądarki, tak jak ją zwraca `PushSubscription.toJSON()`. */
export interface PushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Kopia wpisu wysyłana push: skąd pochodzi (okno, które otwiera kliknięcie) i dane wpisu: 🔔 dzwonek,
 * 📋 zgłoszenia albo odpowiedź supportu w 💬 czacie.
 */
export type PushMessage =
  | { window: "dzwonek"; notificationId: string; notification: NotificationContent }
  | { window: "zgloszenia"; entryId: string; entry: IssueEntry }
  | { window: "czat"; messageId: string; reply: SupportReply };

/** Kopia push dla adresata; wysyła ją port powiadomień po zatwierdzeniu transakcji. */
export interface PushCopy {
  recipientId: string;
  message: PushMessage;
}

/**
 * Usługi push przeglądarek (Chrome i Android, Safari i iPhone, Firefox, Edge). Serwer wysyła żądania pod adres
 * z subskrypcji, więc przyjmujemy tylko te, żeby nikt nie kazał mu pukać do adresów wewnętrznych.
 */
const PUSH_SERVICE_HOSTS = [/^fcm\.googleapis\.com$/, /^([a-z0-9-]+\.)*push\.apple\.com$/, /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/, /^([a-z0-9-]+\.)*notify\.windows\.com$/];

const MAX_ENDPOINT_LENGTH = 2000;
const MAX_KEY_LENGTH = 200;

/**
 * Zapisuje subskrypcję przeglądarki aktora. Ta sama przeglądarka (adres subskrypcji) należy najwyżej do jednej
 * osoby: gdy telefon zmienia właściciela, kopie idą już tylko do nowej.
 */
export async function subscribe(sql: Sql, subscription: PushSubscriptionData, now: Date): Promise<void> {
  const { endpoint, keys } = normalize(subscription);
  await sql("select app.save_push_subscription($1, $2, $3, $4)", [endpoint, keys.p256dh, keys.auth, now]);
}

/** Usuwa subskrypcję przeglądarki aktora; cudzej nie rusza. */
export async function unsubscribe(sql: Sql, session: Session, endpoint: string): Promise<void> {
  await sql("delete from app.push_subscriptions where endpoint = $1 and user_id = $2", [endpoint, session.userId]);
}

/** Subskrypcje adresatów, w transakcji systemowej (poza RLS). */
export async function subscriptionsOf(sql: Sql, userIds: string[]): Promise<(PushSubscriptionData & { userId: string })[]> {
  const rows = await sql<{ endpoint: string; user_id: string; p256dh: string; auth: string }>(
    "select endpoint, user_id, p256dh, auth from app.push_subscriptions where user_id = any($1::uuid[]) order by created_at",
    [userIds],
  );
  return rows.map((row) => ({ userId: row.user_id, endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }));
}

/** Usuwa subskrypcje, które według usługi push wygasły. Transakcja systemowa. */
export async function forgetExpired(sql: Sql, endpoints: string[]): Promise<void> {
  await sql("delete from app.push_subscriptions where endpoint = any($1::text[])", [endpoints]);
}

function normalize(raw: PushSubscriptionData): PushSubscriptionData {
  const endpoint = typeof raw?.endpoint === "string" ? raw.endpoint.trim() : "";
  const p256dh = typeof raw?.keys?.p256dh === "string" ? raw.keys.p256dh.trim() : "";
  const auth = typeof raw?.keys?.auth === "string" ? raw.keys.auth.trim() : "";
  if (!isPushService(endpoint) || !p256dh || !auth || p256dh.length > MAX_KEY_LENGTH || auth.length > MAX_KEY_LENGTH) {
    throw new RegistryError("invalid_input");
  }
  return { endpoint, keys: { p256dh, auth } };
}

function isPushService(endpoint: string): boolean {
  if (endpoint.length > MAX_ENDPOINT_LENGTH || !URL.canParse(endpoint)) return false;
  const url = new URL(endpoint);
  return url.protocol === "https:" && !url.port && !url.username && PUSH_SERVICE_HOSTS.some((host) => host.test(url.hostname));
}
