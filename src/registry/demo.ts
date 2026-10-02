import { type PurgedCompany, purgeCompany } from "./company-deletion";
import { RegistryError } from "./errors";
import { UUID_PATTERN } from "./validation";
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

/**
 * Czy to konto firmy demo, także poprzedniego demo: już usuniętego, jeśli ktoś do niego wszedł (dziennik demo pamięta
 * wejście), albo dopiero dezaktywowanego.
 */
export async function isDemoAccount(sql: Sql, userId: string): Promise<boolean> {
  const [row] = await sql<{ demo: boolean }>(
    `select exists (
       select 1 from app.users u join app.companies c on c.id = u.company_id
       where u.user_id = $1 and c.demo_since is not null
     ) or exists (select 1 from app.demo_events where user_id = $1) as demo`,
    [userId],
  );
  return row.demo;
}

/** Tak długo demo ma opłacony abonament; nigdy nie przechodzi w tryb tylko do odczytu. */
const DEMO_PAID_DAYS = 3650;

/**
 * Firma staje się obecnym demo (od `now`): próg „Średni” i abonament opłacony na lata. Konta poprzednich firm demo
 * (z ich osobami) są dezaktywowane, a ich identyfikatory wracają, żeby zablokować też logowanie.
 */
export async function activateDemoCompany(sql: Sql, companyId: string, now: Date): Promise<string[]> {
  const retired = await sql<{ user_id: string }>(
    `update app.users set active = false
     where active and company_id in (select id from app.companies where demo_since is not null and id <> $1)
     returning user_id`,
    [companyId],
  );
  await sql("update app.people set active = false where user_id = any($1::uuid[])", [retired.map((row) => row.user_id)]);
  const [company] = await sql<{ id: string }>("update app.companies set demo_since = $2 where id = $1 returning id", [companyId, now]);
  if (!company) throw new RegistryError("not_found");
  const paidUntil = new Date(now.getTime() + DEMO_PAID_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await sql("update app.subscriptions set tier = 'sredni', implementation_tier = 'duzy', paid_until = $2 where company_id = $1", [companyId, paidUntil]);
  return retired.map((row) => row.user_id);
}

/** Firmy demo zastąpione nowszym demo: do usunięcia w całości. */
export async function retiredDemoCompanies(sql: Sql): Promise<string[]> {
  const rows = await sql<{ id: string }>("select id from app.companies where app.is_retired_demo(id) order by demo_since");
  return rows.map((row) => row.id);
}

/**
 * Usuwa zastąpioną firmę demo ze wszystkim, co w niej naklikano, także historię ruchów, wątki zgłoszeń i czat
 * (baza pozwala na to tylko zastąpionemu demo). Transakcja systemowa. Zwraca pliki i konta do usunięcia potem.
 */
export async function purgeDemoCompany(sql: Sql, companyId: string): Promise<PurgedCompany> {
  const [retired] = await sql<{ retired: boolean }>("select app.is_retired_demo($1) as retired", [companyId]);
  if (!retired.retired) throw new RegistryError("forbidden");
  return purgeCompany(sql, companyId);
}

/** Urządzenie oglądającego, z nagłówka User-Agent. */
export type DemoDevice = "telefon" | "tablet" | "komputer";

/**
 * Wejście do roli obecnego demo: ze strony /demo albo przełączenie roli paskiem demo (`switched`). Nowa sesja
 * (`sessionId`) należy do wizyty sesji, z której przyszło przełączenie (`previousSessionId`), a bez niej zaczyna nową.
 * Nic nie zapisuje, gdy konto nie należy do obecnego demo.
 */
export async function recordDemoEntry(
  sql: Sql,
  entry: { userId: string; sessionId: string | null; previousSessionId: string | null; switched: boolean; device: DemoDevice },
  now: Date,
) {
  if (!UUID_PATTERN.test(entry.userId)) return;
  await sql(
    `insert into app.demo_events (at, company_id, visit_id, session_id, user_id, role, kind, detail, device)
     select $1, u.company_id,
            coalesce((select e.visit_id from app.demo_events e where e.kind = 'wejscie' and e.session_id = $4 order by e.at limit 1), gen_random_uuid()),
            $3, u.user_id, u.role, 'wejscie', $5, $6
     from app.users u
     where u.user_id = $2 and u.active and u.company_id = (select id from app.companies where demo_since is not null order by demo_since desc limit 1)`,
    [now, entry.userId, uuidOrNull(entry.sessionId), uuidOrNull(entry.previousSessionId), entry.switched ? "pasek" : "demo", entry.device],
  );
}

/** Najdłuższa zapisywana ścieżka ekranu. */
const MAX_PATH_LENGTH = 200;

/**
 * Ekran obecnego demo otwarty w sesji `sessionId` (ścieżka bez parametrów). Należy do wizyty wejścia tej sesji, a gdy
 * go nie ma, do ostatniej wizyty konta. Nic nie zapisuje poza obecnym demo ani dla ścieżki spoza aplikacji.
 */
export async function recordDemoPage(sql: Sql, page: { userId: string; sessionId: string | null; path: string }, now: Date) {
  if (!UUID_PATTERN.test(page.userId) || !page.path.startsWith("/") || page.path.length > MAX_PATH_LENGTH) return;
  await sql(
    `insert into app.demo_events (at, company_id, visit_id, session_id, user_id, role, kind, detail)
     select $1, u.company_id, ${visitOf("$3")}, $3, u.user_id, u.role, 'strona', $4
     from app.users u
     where u.user_id = $2 and u.active and u.company_id = (select id from app.companies where demo_since is not null order by demo_since desc limit 1)`,
    [now, page.userId, uuidOrNull(page.sessionId), page.path],
  );
}

/**
 * Polecenie Rejestru wykonane na koncie obecnego demo. Rejestr nie zna sesji przeglądarki, więc akcja należy do wizyty,
 * w której konto było ostatnio widziane.
 */
export async function recordDemoAction(sql: Sql, action: { userId: string; command: string }, now: Date) {
  await sql(
    `insert into app.demo_events (at, company_id, visit_id, session_id, user_id, role, kind, detail)
     select $1, u.company_id, ${visitOf("null")}, null, u.user_id, u.role, 'akcja', $3
     from app.users u
     where u.user_id = $2 and u.company_id = (select id from app.companies where demo_since is not null order by demo_since desc limit 1)`,
    [now, action.userId, action.command],
  );
}

/** Identyfikator sesji z JWT; coś innego niż UUID traktujemy jak brak sesji. */
function uuidOrNull(value: string | null) {
  return value && UUID_PATTERN.test(value) ? value : null;
}

/** Wizyta zdarzenia konta `u`: wejścia w tej sesji, a bez niego ostatniego zdarzenia konta. */
function visitOf(sessionParam: string) {
  return `coalesce(
    (select e.visit_id from app.demo_events e where e.kind = 'wejscie' and e.session_id = ${sessionParam} order by e.at limit 1),
    (select e.visit_id from app.demo_events e where e.user_id = u.user_id order by e.at desc, e.id desc limit 1)
  )`;
}

/** Zdarzenie wizyty w demo. */
export interface DemoEvent {
  at: Date;
  role: Role;
  kind: "wejscie" | "strona" | "akcja";
  /** Wejście: `demo` albo `pasek`. Strona: ścieżka. Akcja: nazwa polecenia Rejestru. */
  detail: string;
}

/** Wizyta jednej przeglądarki w demo: od wejścia ze strony /demo przez przełączenia roli. */
export interface DemoVisit {
  id: string;
  startedAt: Date;
  lastSeenAt: Date;
  device: DemoDevice | null;
  /** Role w kolejności wejścia, bez powtórzeń. */
  roles: Role[];
  pageCount: number;
  actionCount: number;
  /** Od najstarszego. */
  events: DemoEvent[];
}

/** Z tylu ostatnich dni dziennik pokazuje wizyty. */
const DEMO_LOG_DAYS = 30;
/** Najwięcej zdarzeń czytanych naraz. */
const DEMO_LOG_EVENTS = 5000;

/** Wizyty w demo z ostatnich 30 dni, od najnowszej. Transakcja super-admina (RLS). */
export async function demoVisits(sql: Sql, now: Date): Promise<DemoVisit[]> {
  const rows = await sql<{ visit: string; at: Date; role: Role; kind: DemoEvent["kind"]; detail: string; device: DemoDevice | null }>(
    `select coalesce(visit_id::text, 'konto-' || user_id) as visit, at, role, kind, detail, device
     from (select * from app.demo_events where at >= $1 order by at desc, id desc limit $2) recent
     order by at, id`,
    [new Date(now.getTime() - DEMO_LOG_DAYS * 24 * 60 * 60 * 1000), DEMO_LOG_EVENTS],
  );
  const visits = new Map<string, DemoVisit>();
  for (const row of rows) {
    let visit = visits.get(row.visit);
    if (!visit) {
      visit = { id: row.visit, startedAt: row.at, lastSeenAt: row.at, device: null, roles: [], pageCount: 0, actionCount: 0, events: [] };
      visits.set(row.visit, visit);
    }
    visit.lastSeenAt = row.at;
    visit.device ??= row.device;
    if (!visit.roles.includes(row.role)) visit.roles.push(row.role);
    if (row.kind === "strona") visit.pageCount += 1;
    if (row.kind === "akcja") visit.actionCount += 1;
    visit.events.push({ at: row.at, role: row.role, kind: row.kind, detail: row.detail });
  }
  return [...visits.values()].sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
}

/**
 * Polecenia członka firmy, które dziennik demo zapisuje jako akcje oglądającego (po udanym wykonaniu). Zapytania
 * (tablica, historia, karta narzędzia) widać w dzienniku jako otwarte ekrany.
 */
export const LOGGED_DEMO_COMMANDS = [
  "addCategory",
  "addTool",
  "editTool",
  "importTools",
  "addDeadline",
  "updateDeadline",
  "deleteDeadline",
  "completeDeadline",
  "addDeadlineDocument",
  "deleteDeadlineDocument",
  "printStickers",
  "reportTool",
  "acceptToolReport",
  "rejectToolReport",
  "addRentedTool",
  "returnToRental",
  "fileIssue",
  "commentOnIssue",
  "closeIssue",
  "addMember",
  "addPerson",
  "editPerson",
  "deactivatePerson",
  "addPersonAccount",
  "addSite",
  "changeSiteManager",
  "changeSiteAddress",
  "setBaseAddress",
  "addService",
  "addVehicle",
  "changeVehicleManager",
  "setVehicleAlarm",
  "deactivateVehicle",
  "closeSite",
  "forceCloseSite",
  "registerMovement",
  "registerQueuedMovement",
  "resolveRejectedMovement",
  "undoMovement",
  "correctTool",
  "markToolLost",
  "retireTool",
  "exportData",
  "updateSettings",
  "setDailyRate",
  "setDailyRates",
] as const;
export type LoggedDemoCommand = (typeof LOGGED_DEMO_COMMANDS)[number];

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
