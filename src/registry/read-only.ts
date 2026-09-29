import { deliverAsSystem, pushCopy } from "./bell";
import { RegistryError } from "./errors";
import type { EmailedNotification, Notification, NotificationContent, ReadOnlyNotification } from "./notifications";
import type { Sql } from "./ports";
import type { PushCopy } from "./push";
import { owners } from "./reports";
import { type CompanyPlan, readOnlyFrom, subscriptionStatus, updateSubscription } from "./subscriptions";
import { daysBetween, UUID_PATTERN, warsawTime } from "./validation";

/** SQLSTATE zapisu w transakcji READ ONLY. */
const READ_ONLY_SQL_TRANSACTION = "25006";

/** Czy firma jest w trybie tylko do odczytu: ręcznie albo po 14 dniach od „opłacone do”. */
export function isReadOnly(plan: Pick<CompanyPlan, "paidUntil" | "manualReadOnly">, now: Date): boolean {
  return subscriptionStatus(plan, now) === "tylko_do_odczytu";
}

/**
 * Transakcja firmy w trybie tylko do odczytu: zapytania działają, a każdy zapis odrzuci sama baza, także
 * w poleceniu, które nie sprawdziło trybu samo.
 */
export async function enterReadOnly(sql: Sql) {
  await sql("set transaction read only");
}

/** Zapis odrzucony przez bazę w transakcji tylko do odczytu to błąd Rejestru `read_only`. */
export function readOnlyError(error: unknown): unknown {
  return (error as { code?: string } | null)?.code === READ_ONLY_SQL_TRANSACTION ? new RegistryError("read_only") : error;
}

/** Abonament firmy z terminem płatności, sprawdzany przez zadanie dzienne. */
export interface PaidSubscription {
  companyId: string;
  paidUntil: string;
  manualReadOnly: boolean;
}

/** Firmy z wpisanym „opłacone do”. Transakcja systemowa (poza RLS). */
export async function paidSubscriptions(sql: Sql): Promise<PaidSubscription[]> {
  const rows = await sql<{ company_id: string; paid_until: string; manual_read_only: boolean }>(
    `select company_id, to_char(paid_until, 'YYYY-MM-DD') as paid_until, manual_read_only
     from app.subscriptions where paid_until is not null order by company_id`,
  );
  return rows.map((row) => ({ companyId: row.company_id, paidUntil: row.paid_until, manualReadOnly: row.manual_read_only }));
}

/** Ostrzeżenie tydzień przed przełączeniem wychodzi, gdy do niego zostało 2–7 dni, więc spóźnione zadanie go nie gubi. */
const WEEK_WARNING_DAYS = 7;
/**
 * Wpis o przełączeniu wychodzi w dniu przełączenia albo dzień później (spóźnione zadanie). Firma, która jest
 * w trybie od dawna (np. założona z datą z przeszłości), nie dostaje go z opóźnieniem.
 */
const SWITCH_LOOKBACK_DAYS = 1;

/** Co zadanie dzienne ma dziś powiedzieć właścicielowi o terminie płatności. */
function dueNotice(subscription: PaidSubscription, now: Date): NotificationContent | null {
  if (subscription.manualReadOnly) return null;
  const since = readOnlyFrom(subscription.paidUntil);
  const daysLeft = daysBetween(warsawTime(now).day, since);
  if (daysLeft >= 1 && daysLeft <= WEEK_WARNING_DAYS) {
    return { kind: "tylko_do_odczytu_wkrotce", paidUntil: subscription.paidUntil, readOnlyFrom: since, daysLeft };
  }
  if (daysLeft <= 0 && daysLeft >= -SWITCH_LOOKBACK_DAYS) {
    return { kind: "tylko_do_odczytu", reason: "po_terminie", paidUntil: subscription.paidUntil, since };
  }
  return null;
}

/**
 * Zadanie dzienne dla jednej firmy: ostrzeżenie 7 dni i 1 dzień przed trybem tylko do odczytu (dzwonek i e-mail)
 * oraz wpis o samym przełączeniu (dzwonek). Każdy aktywny właściciel dostaje każde z nich raz. Transakcja
 * systemowa (poza RLS). Zwraca, co firma dziś dostała, i kopie push i e-mail nowych wpisów.
 */
export async function notifyDeadline(
  sql: Sql,
  subscription: PaidSubscription,
  now: Date,
): Promise<{ notice: Notification["kind"] | null; copies: PushCopy[]; emails: EmailedNotification[] }> {
  const notice = dueNotice(subscription, now);
  if (!notice) return { notice: null, copies: [], emails: [] };
  const notifications: Notification[] = (await owners(sql, subscription.companyId)).map(
    (owner) => ({ ...notice, recipient: owner }) as Notification,
  );
  const copies = await deliverAsSystem(sql, subscription.companyId, notifications, now);
  const fresh = new Set(copies.map((copy) => copy.recipientId));
  const emails = notifications.filter(
    (notification): notification is EmailedNotification & Notification =>
      notification.kind === "tylko_do_odczytu_wkrotce" && fresh.has(notification.recipient.userId),
  );
  return { notice: copies.length > 0 ? notice.kind : null, copies, emails };
}

/**
 * Ręczny tryb tylko do odczytu, w transakcji super-admina. Gdy firma przez to przechodzi w tryb (włączenie z wyłączonego,
 * albo wyłączenie już po terminie płatności, kiedy zostaje w nim automatycznie), aktywni właściciele dostają wpis do
 * dzwonka w tej samej transakcji. Zwraca kopie push nowych wpisów.
 */
export async function setManualReadOnly(sql: Sql, companyId: string, on: boolean, now: Date): Promise<PushCopy[]> {
  if (!UUID_PATTERN.test(companyId)) throw new RegistryError("not_found");
  const [before] = await sql<{ manual_read_only: boolean; paid_until: string | null }>(
    "select manual_read_only, to_char(paid_until, 'YYYY-MM-DD') as paid_until from app.subscriptions where company_id = $1 for update",
    [companyId],
  );
  await updateSubscription(sql, companyId, { manualReadOnly: on });
  if (on === before.manual_read_only) return [];
  const paidUntil = before.paid_until;
  // Wyłączony tryb ręczny po terminie: firma zostaje w trybie, teraz już z powodu płatności.
  const overdue = !on && paidUntil !== null && isReadOnly({ paidUntil, manualReadOnly: false }, now);
  if (!on && !overdue) return [];
  const content: Omit<ReadOnlyNotification, "recipient"> = overdue
    ? { kind: "tylko_do_odczytu", reason: "po_terminie", paidUntil, since: readOnlyFrom(paidUntil!) }
    : { kind: "tylko_do_odczytu", reason: "reczny", paidUntil, since: warsawTime(now).day };
  const rows = await sql<{ notification_id: string; owner_id: string }>(
    "select notification_id, owner_id from app.notify_owners_of_read_only($1, $2, $3)",
    [companyId, JSON.stringify(content), now],
  );
  return rows.map((row) => pushCopy(row.owner_id, row.notification_id, content));
}
