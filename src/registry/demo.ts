import { RegistryError } from "./errors";
import type { Sql } from "./ports";
import type { Role, Session } from "./registry";

/** Konta firmy demo mają adresy w tej domenie; e-maile na nie nie wychodzą. */
export const DEMO_EMAIL_DOMAIN = "demo.narzedziownik.gp-engineering.pl";

/** Czy e-mail należy do konta demo (takiego adresu nikt nie odbiera). */
export function isDemoEmail(email: string) {
  return email.trim().toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

/** Konto obecnej firmy demo, na które strona /demo loguje bez hasła. */
export interface DemoAccount {
  userId: string;
  role: Role;
  fullName: string;
  /** Adres konta logowania (u pracownika techniczny). */
  loginEmail: string;
}

const ROLE_ORDER: Role[] = ["wlasciciel", "kierownik", "magazynier", "pracownik"];

/** Aktywne konta firmy demo włączonej ostatnio: właściciel, kierownicy, magazynier i pracownicy, w kolejności dodania. */
export async function demoAccounts(sql: Sql): Promise<DemoAccount[]> {
  const rows = await sql<{ user_id: string; role: Role; full_name: string; email: string }>(
    `select u.user_id, u.role, u.full_name, a.email
     from app.users u join auth.users a on a.id = u.user_id
     where u.active and u.company_id = (select id from app.companies where demo_since is not null order by demo_since desc limit 1)
     order by u.created_at, u.full_name`,
  );
  return rows
    .map((row) => ({ userId: row.user_id, role: row.role, fullName: row.full_name, loginEmail: row.email }))
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
}

/** Użycie obecnego demo: kiedy ktoś ostatnio do niego wszedł (null: jeszcze nikt). */
export interface DemoUse {
  lastEntryAt: Date | null;
}

/**
 * Kiedy ktoś ostatnio wszedł do obecnego demo, w dowolnej roli. Wejście (także przełączenie roli paskiem demo) to
 * logowanie w Supabase Auth, więc zostaje w `auth.users.last_sign_in_at` kont firmy. Null, gdy demo nie założono.
 */
export async function demoUse(sql: Sql): Promise<DemoUse | null> {
  const [row] = await sql<{ last_entry_at: Date | null }>(
    `select max(a.last_sign_in_at) as last_entry_at
     from app.users u join auth.users a on a.id = u.user_id
     where u.company_id = (select id from app.companies where demo_since is not null order by demo_since desc limit 1)
     having count(*) > 0`,
  );
  return row ? { lastEntryAt: row.last_entry_at } : null;
}

/** Czy to konto firmy demo, także poprzedniego demo (już dezaktywowane). */
export async function isDemoAccount(sql: Sql, userId: string): Promise<boolean> {
  const [row] = await sql<{ demo: boolean }>(
    `select exists (
       select 1 from app.users u join app.companies c on c.id = u.company_id
       where u.user_id = $1 and c.demo_since is not null
     ) as demo`,
    [userId],
  );
  return row.demo;
}

/** Tak długo demo ma opłacony abonament; nigdy nie przechodzi w tryb tylko do odczytu. */
const DEMO_PAID_DAYS = 3650;

/**
 * Firma staje się obecnym demo (od `now`): próg „Średni” i abonament opłacony na lata. Konta poprzednich firm demo
 * są dezaktywowane, a ich identyfikatory wracają, żeby zablokować też logowanie.
 */
export async function activateDemoCompany(sql: Sql, companyId: string, now: Date): Promise<string[]> {
  const retired = await sql<{ user_id: string }>(
    `update app.users set active = false
     where active and company_id in (select id from app.companies where demo_since is not null and id <> $1)
     returning user_id`,
    [companyId],
  );
  const [company] = await sql<{ id: string }>("update app.companies set demo_since = $2 where id = $1 returning id", [companyId, now]);
  if (!company) throw new RegistryError("not_found");
  const paidUntil = new Date(now.getTime() + DEMO_PAID_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await sql("update app.subscriptions set tier = 'sredni', paid_until = $2 where company_id = $1", [companyId, paidUntil]);
  return retired.map((row) => row.user_id);
}

/**
 * W firmie demo nie wolno zablokować nikomu wejścia: dezaktywacja albo hasło tymczasowe odebrałyby rolę
 * następnym oglądającym.
 */
export function refuseInDemo(session: Session) {
  if (session.company.demo) throw new RegistryError("demo_locked");
}

/**
 * Wątek czatu z supportem należy do konta, a konto roli demo dzielą wszyscy oglądający: następny widziałby
 * wiadomości poprzedniego. W demo czat nie przyjmuje ani nie pokazuje wiadomości.
 */
export function refuseChatInDemo(session: Session) {
  if (session.company.demo) throw new RegistryError("demo_chat");
}

/**
 * Push to kopia wpisu z dzwonka konta, a konto roli demo dzielą wszyscy oglądający: telefon jednego dostawałby ruchy
 * innych i codzienne alarmy także po zmianie demo. W demo powiadomień push nie da się włączyć.
 */
export function refusePushInDemo(session: Session) {
  if (session.company.demo) throw new RegistryError("demo_push");
}
