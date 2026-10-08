import { RegistryError } from "./errors";
import type { IssueEntry } from "./issues";
import type { NotificationContent } from "./notifications";
import type { Sql } from "./ports";
import type { Session } from "./registry";
import type { SupportReply } from "./support-chat";

/**
 * Subskrypcja push jednego urządzenia, według rodzaju: przeglądarka (Web Push, tak jak ją zwraca
 * `PushSubscription.toJSON()`) albo aplikacja na Androida (token rejestracji w Firebase Cloud Messaging, ADR 0038).
 */
export type PushSubscriptionData =
  | { kind: "przegladarka"; endpoint: string; keys: { p256dh: string; auth: string } }
  | { kind: "aplikacja"; token: string };

/** Urządzenie, na które idą kopie: adres subskrypcji przeglądarki albo token aplikacji. Wystarczy, żeby je wyłączyć. */
export type PushDevice = { kind: "przegladarka"; endpoint: string } | { kind: "aplikacja"; token: string };

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
/** Token rejestracji FCM: kilkaset znaków base64url z dwukropkiem. */
const FCM_TOKEN = /^[A-Za-z0-9_:-]{1,4096}$/;

/**
 * Zapisuje subskrypcję urządzenia aktora. To samo urządzenie (adres subskrypcji przeglądarki albo token aplikacji)
 * należy najwyżej do jednej osoby: gdy telefon zmienia właściciela, kopie idą już tylko do nowej.
 */
export async function subscribe(sql: Sql, subscription: PushSubscriptionData, now: Date): Promise<void> {
  const valid = normalize(subscription);
  if (valid.kind === "aplikacja") await sql("select app.save_app_push_subscription($1, $2)", [valid.token, now]);
  else await sql("select app.save_push_subscription($1, $2, $3, $4)", [valid.endpoint, valid.keys.p256dh, valid.keys.auth, now]);
}

/** Usuwa subskrypcję urządzenia aktora; cudzej nie rusza. */
export async function unsubscribe(sql: Sql, session: Session, device: PushDevice): Promise<void> {
  if (device?.kind === "aplikacja") {
    await sql("delete from app.push_subscriptions where token = $1 and user_id = $2", [String(device.token), session.userId]);
  } else {
    await sql("delete from app.push_subscriptions where endpoint = $1 and user_id = $2", [String(device?.endpoint), session.userId]);
  }
}

/**
 * Subskrypcje adresatów, w transakcji systemowej (poza RLS). Bez kont firm demo: tych nikt nie ma na własność,
 * a subskrypcja sprzed wyłączenia push w demo nie może dalej dostawać kopii.
 */
export async function subscriptionsOf(sql: Sql, userIds: string[]): Promise<{ userId: string; subscription: PushSubscriptionData }[]> {
  const rows = await sql<{ user_id: string; kind: string; endpoint: string; p256dh: string; auth: string; token: string }>(
    `select s.user_id, s.kind, s.endpoint, s.p256dh, s.auth, s.token
     from app.push_subscriptions s
     where s.user_id = any($1::uuid[])
       and not exists (
         select 1 from app.users u join app.companies c on c.id = u.company_id
         where u.user_id = s.user_id and c.demo_since is not null
       )
     order by s.created_at`,
    [userIds],
  );
  return rows.map((row) => ({
    userId: row.user_id,
    subscription:
      row.kind === "aplikacja"
        ? { kind: "aplikacja", token: row.token }
        : { kind: "przegladarka", endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
  }));
}

/** Usuwa subskrypcje, które według usługi push (Web Push albo FCM) wygasły. Transakcja systemowa. */
export async function forgetExpired(sql: Sql, devices: PushDevice[]): Promise<void> {
  const endpoints = devices.flatMap((device) => (device.kind === "przegladarka" ? [device.endpoint] : []));
  const tokens = devices.flatMap((device) => (device.kind === "aplikacja" ? [device.token] : []));
  await sql("delete from app.push_subscriptions where endpoint = any($1::text[]) or token = any($2::text[])", [endpoints, tokens]);
}

function normalize(raw: PushSubscriptionData): PushSubscriptionData {
  if (raw?.kind === "aplikacja") {
    const token = typeof raw.token === "string" ? raw.token.trim() : "";
    if (!FCM_TOKEN.test(token)) throw new RegistryError("invalid_input");
    return { kind: "aplikacja", token };
  }
  if (raw?.kind !== "przegladarka") throw new RegistryError("invalid_input");
  const endpoint = typeof raw?.endpoint === "string" ? raw.endpoint.trim() : "";
  const p256dh = typeof raw?.keys?.p256dh === "string" ? raw.keys.p256dh.trim() : "";
  const auth = typeof raw?.keys?.auth === "string" ? raw.keys.auth.trim() : "";
  if (!isPushService(endpoint) || !p256dh || !auth || p256dh.length > MAX_KEY_LENGTH || auth.length > MAX_KEY_LENGTH) {
    throw new RegistryError("invalid_input");
  }
  return { kind: "przegladarka", endpoint, keys: { p256dh, auth } };
}

function isPushService(endpoint: string): boolean {
  if (endpoint.length > MAX_ENDPOINT_LENGTH || !URL.canParse(endpoint)) return false;
  const url = new URL(endpoint);
  return url.protocol === "https:" && !url.port && !url.username && PUSH_SERVICE_HOSTS.some((host) => host.test(url.hostname));
}
