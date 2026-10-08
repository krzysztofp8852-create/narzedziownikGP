import { RegistryError } from "./errors";
import type { Sql } from "./ports";
import type { Role, Session } from "./registry";
import { warsawTime } from "./validation";
import { isCalendarDay, UUID_PATTERN } from "./validation";

/**
 * Pakiet abonamentu (ADR 0040): obowiązkowe, jednorazowe wdrożenie ze szkoleniem z programu (na miejscu u klienta albo
 * zdalnie) i opłata roczna, w zł brutto (bez doliczanego VAT). Wyznacza limit osób zapisujących ruchy (aktywni właściciele, kierownicy
 * i magazynierzy; pracownicy się nie liczą) i limit narzędzi. Duży pakiet nie ma żadnego z limitów.
 */
export interface SubscriptionTier {
  id: TierId;
  name: string;
  /** Null w dużym pakiecie. */
  maxPeople: number | null;
  /** Null w dużym pakiecie. */
  toolLimit: number | null;
  implementationPrice: number;
  yearlyPrice: number;
}

export const TIERS = [
  { id: "maly", name: "Mały", maxPeople: 5, toolLimit: 150, implementationPrice: 3000, yearlyPrice: 400 },
  { id: "sredni", name: "Średni", maxPeople: 30, toolLimit: 500, implementationPrice: 6000, yearlyPrice: 800 },
  { id: "duzy", name: "Duży", maxPeople: null, toolLimit: null, implementationPrice: 12000, yearlyPrice: 2000 },
] as const satisfies readonly (Omit<SubscriptionTier, "id"> & { id: string })[];

export type TierId = (typeof TIERS)[number]["id"];

/** Role osób zapisujących ruchy, które zajmują miejsca w pakiecie. */
export const RECORDER_ROLES = ["wlasciciel", "kierownik", "magazynier"] as const satisfies readonly Role[];

/** Warunek SQL: aktywne konto osoby zapisującej ruchy (`u` to app.users). */
const ACTIVE_RECORDER = `u.active and u.role in (${RECORDER_ROLES.map((role) => `'${role}'`).join(", ")})`;

/** Osoby zapisujące ruchy wobec limitu pakietu. */
export interface RecorderSeats {
  tier: SubscriptionTier;
  /** Aktywne konta właścicieli, kierowników i magazynierów. */
  recorderCount: number;
  /** Ile osób zapisujących ruchy da się jeszcze dodać; null w pakiecie bez limitu. */
  seatsLeft: number | null;
  /** Gdy miejsc nie ma: najniższy pakiet z miejscem na jeszcze jedną osobę i dopłata do niego (różnica cen wdrożenia, zł brutto). */
  upgrade: { tier: SubscriptionTier; surcharge: number } | null;
}

/** Pakiet firm założonych skryptem, bez wyboru pakietu: bez limitów, jak firmy sprzed pakietów. */
export const DEFAULT_TIER: TierId = "duzy";

/** Po tylu dniach od „opłacone do” firma przechodzi w tryb tylko do odczytu. */
export const GRACE_DAYS = 14;

/**
 * Stan abonamentu dziś: `czeka_na_wplate` przed pierwszym wpisem „opłacone do”, `po_terminie` po tym dniu,
 * a `tylko_do_odczytu` ręcznie albo po upływie 14 dni od „opłacone do”.
 */
export type SubscriptionStatus = "aktywna" | "czeka_na_wplate" | "po_terminie" | "tylko_do_odczytu";

export interface InvoiceData {
  /** Nabywca na fakturze. */
  name: string;
  /** NIP, same cyfry. */
  taxId: string;
  address: string;
}

/** Firma z abonamentem, tak jak widzi ją super-admin. */
export interface ManagedCompany {
  id: string;
  name: string;
  /** Null u firm założonych skryptem przed panelem. */
  invoice: InvoiceData | null;
  /** Najdawniej dodany właściciel. */
  owner: { fullName: string; email: string } | null;
  tier: SubscriptionTier;
  /** Narzędzia firmy poza wycofanymi. */
  toolCount: number;
  /** Aktywne konta właścicieli, kierowników i magazynierów. */
  recorderCount: number;
  /** Ostatni opłacony dzień (RRRR-MM-DD). */
  paidUntil: string | null;
  /** Pierwszy dzień automatycznego trybu tylko do odczytu, gdy nic nie wpłynie. */
  readOnlyFrom: string | null;
  manualReadOnly: boolean;
  status: SubscriptionStatus;
  createdAt: Date;
}

/** Firma przekroczyła limit narzędzi w pakiecie. Polecenie się wykonało; to tylko ostrzeżenie z propozycją pakietu. */
export interface ToolLimitWarning {
  tier: SubscriptionTier;
  /** Narzędzia firmy poza wycofanymi. */
  toolCount: number;
  /** Najniższy pakiet, w którym te narzędzia się mieszczą. */
  suggestedTier: SubscriptionTier;
}

/** Abonament firmy w ustawieniach właściciela. */
export interface CompanySubscription {
  tier: SubscriptionTier;
  /** Narzędzia firmy poza wycofanymi. */
  toolCount: number;
  /** Ostatni opłacony dzień (RRRR-MM-DD). */
  paidUntil: string | null;
  /** Pierwszy dzień automatycznego trybu tylko do odczytu, gdy nic nie wpłynie. */
  readOnlyFrom: string | null;
  status: SubscriptionStatus;
  limitWarning: ToolLimitWarning | null;
  /** Miejsca na osoby zapisujące ruchy w pakiecie. */
  recorders: RecorderSeats;
}

/** Abonament nowej firmy. */
export interface NewSubscription {
  tier: TierId;
  paidUntil: string | null;
  invoice: InvoiceData | null;
}

export interface NewCompanyInput {
  name: string;
  baseName: string;
  owner: { email: string; fullName: string };
  invoice: InvoiceData;
  tier: TierId;
  /** Gdy pierwszy przelew jest już zaksięgowany. */
  paidUntil?: string | null;
}

export function tier(id: TierId): SubscriptionTier {
  return TIERS.find((candidate) => candidate.id === id)!;
}

export function requireTier(id: string): TierId {
  const found = TIERS.find((candidate) => candidate.id === id);
  if (!found) throw new RegistryError("invalid_input");
  return found.id;
}

/** Miejsca w pakiecie przy tylu osobach zapisujących ruchy (po zmianie na niższy pakiet może ich być ponad limit). */
export function recorderSeats(id: TierId, recorderCount: number): RecorderSeats {
  const current = tier(id);
  const seatsLeft = current.maxPeople === null ? null : Math.max(current.maxPeople - recorderCount, 0);
  const next = seatsLeft === 0 ? TIERS.find((candidate) => candidate.maxPeople === null || candidate.maxPeople > recorderCount)! : null;
  return {
    tier: current,
    recorderCount,
    seatsLeft,
    upgrade: next && { tier: next, surcharge: next.implementationPrice - current.implementationPrice },
  };
}

/**
 * Miejsca na osoby zapisujące ruchy w firmie aktora. Abonament widzi z firmy tylko właściciel, a osoby z firmy każdy
 * jej członek, więc to zapytanie właściciela.
 */
export async function companyRecorderSeats(sql: Sql): Promise<RecorderSeats> {
  const [row] = await sql<{ tier: TierId; recorders: string }>(
    `select s.tier,
            (select count(*) from app.users u where u.company_id = s.company_id and ${ACTIVE_RECORDER}) as recorders
     from app.subscriptions s where s.company_id = app.current_company_id()`,
  );
  if (!row) throw new RegistryError("no_access");
  return recorderSeats(row.tier, Number(row.recorders));
}

/**
 * Wolne miejsce w pakiecie na nową osobę tej roli; bez niego `recorder_limit` (ADR 0024). Pracownik nie
 * zapisuje ruchów, więc miejsca nie zajmuje. Blokuje wiersz firmy do końca transakcji: w transakcji, która zapisuje
 * osobę, dwa równoległe dodania nie zajmą tego samego miejsca. Blokadę (jak zmianę firmy) RLS daje tylko właścicielowi,
 * więc komuś innemu odmawia, zamiast liczyć bez niej.
 */
export async function requireRecorderSeat(sql: Sql, role: Role) {
  if (!(RECORDER_ROLES as readonly Role[]).includes(role)) return;
  const [locked] = await sql("select 1 from app.companies where id = app.current_company_id() for update");
  if (!locked) throw new RegistryError("forbidden");
  if ((await companyRecorderSeats(sql)).seatsLeft === 0) throw new RegistryError("recorder_limit");
}

export function requirePaidUntil(day: string): string {
  if (!isCalendarDay(day)) throw new RegistryError("invalid_input");
  return day;
}

/** Dane do faktury po sprawdzeniu: nabywca, adres i NIP z poprawną cyfrą kontrolną. */
export function normalizeInvoice(raw: InvoiceData): InvoiceData {
  const invoice = { name: raw.name.trim(), taxId: raw.taxId.replace(/[\s-]/g, ""), address: raw.address.trim() };
  if (!invoice.name || !invoice.address || !isValidTaxId(invoice.taxId)) throw new RegistryError("invalid_input");
  return invoice;
}

const TAX_ID_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7];

function isValidTaxId(taxId: string) {
  if (!/^\d{10}$/.test(taxId)) return false;
  const digits = [...taxId].map(Number);
  const checksum = TAX_ID_WEIGHTS.reduce((sum, weight, index) => sum + weight * digits[index], 0) % 11;
  return checksum === digits[9];
}

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Pierwszy dzień automatycznego trybu tylko do odczytu: dzień po 14 dniach od „opłacone do”. */
export function readOnlyFrom(paidUntil: string): string {
  return addDays(paidUntil, GRACE_DAYS + 1);
}

/** Stan abonamentu w chwili `now`, liczony dniami kalendarza w Polsce. */
export function subscriptionStatus(subscription: { paidUntil: string | null; manualReadOnly: boolean }, now: Date): SubscriptionStatus {
  if (subscription.manualReadOnly) return "tylko_do_odczytu";
  if (!subscription.paidUntil) return "czeka_na_wplate";
  const today = warsawTime(now).day;
  if (today > addDays(subscription.paidUntil, GRACE_DAYS)) return "tylko_do_odczytu";
  if (today > subscription.paidUntil) return "po_terminie";
  return "aktywna";
}

/** Abonament firmy aktora bez danych do faktury, widoczny w transakcji każdego członka firmy. */
export interface CompanyPlan {
  tier: TierId;
  paidUntil: string | null;
  manualReadOnly: boolean;
  /** Narzędzia firmy poza wycofanymi. */
  toolCount: number;
}

/** Abonament firmy aktora transakcji (przez funkcję w bazie, bo samą tabelę widzi tylko właściciel). */
export async function currentPlan(sql: Sql): Promise<CompanyPlan> {
  const [row] = await sql<{ tier: TierId; paid_until: string | null; manual_read_only: boolean; tools: string }>(
    "select tier, to_char(paid_until, 'YYYY-MM-DD') as paid_until, manual_read_only, tools from app.current_company_plan()",
  );
  if (!row) throw new RegistryError("no_access");
  return { tier: row.tier, paidUntil: row.paid_until, manualReadOnly: row.manual_read_only, toolCount: Number(row.tools) };
}

/** Ostrzeżenie, gdy narzędzi jest więcej niż limit pakietu; duży pakiet nie ma limitu. */
export function limitWarning(plan: Pick<CompanyPlan, "tier" | "toolCount">): ToolLimitWarning | null {
  const current = tier(plan.tier);
  if (current.toolLimit === null || plan.toolCount <= current.toolLimit) return null;
  const suggestedTier = TIERS.find((candidate) => candidate.toolLimit === null || candidate.toolLimit >= plan.toolCount)!;
  return { tier: current, toolCount: plan.toolCount, suggestedTier };
}

/** Ostrzeżenie o limicie po poleceniu, które dodało narzędzia, w jego transakcji. */
export async function toolLimitWarning(sql: Sql): Promise<ToolLimitWarning | null> {
  return limitWarning(await currentPlan(sql));
}

export function requireSubscriptionReader(session: Session) {
  if (session.role !== "wlasciciel") throw new RegistryError("forbidden");
}

/** Abonament firmy do ustawień właściciela. */
export async function companySubscription(sql: Sql, now: Date): Promise<CompanySubscription> {
  const plan = await currentPlan(sql);
  return {
    tier: tier(plan.tier),
    toolCount: plan.toolCount,
    paidUntil: plan.paidUntil,
    readOnlyFrom: plan.paidUntil ? readOnlyFrom(plan.paidUntil) : null,
    status: subscriptionStatus(plan, now),
    limitWarning: limitWarning(plan),
    recorders: await companyRecorderSeats(sql),
  };
}

/** Czy aktor transakcji jest super-adminem (według RLS, nie według aplikacji). */
export async function isSuperAdmin(sql: Sql): Promise<boolean> {
  const [row] = await sql<{ super_admin: boolean }>("select app.is_super_admin() as super_admin");
  return row.super_admin;
}

export async function requireSuperAdmin(sql: Sql) {
  if (!(await isSuperAdmin(sql))) throw new RegistryError("forbidden");
}

export async function insertSubscription(sql: Sql, companyId: string, subscription: NewSubscription) {
  await sql(
    `insert into app.subscriptions (company_id, tier, paid_until, invoice_name, tax_id, invoice_address)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      companyId,
      subscription.tier,
      subscription.paidUntil,
      subscription.invoice?.name ?? null,
      subscription.invoice?.taxId ?? null,
      subscription.invoice?.address ?? null,
    ],
  );
}

/** Wszystkie firmy, po nazwie; z `companyId` tylko ta jedna. */
export async function managedCompanies(sql: Sql, now: Date, companyId?: string): Promise<ManagedCompany[]> {
  if (companyId !== undefined && !UUID_PATTERN.test(companyId)) return [];
  const rows = await sql<{
    id: string;
    name: string;
    created_at: Date;
    tier: TierId;
    paid_until: string | null;
    manual_read_only: boolean;
    invoice_name: string | null;
    tax_id: string | null;
    invoice_address: string | null;
    owner_name: string | null;
    owner_email: string | null;
    tools: string | null;
    recorders: string;
  }>(
    `select c.id, c.name, c.created_at, s.tier, to_char(s.paid_until, 'YYYY-MM-DD') as paid_until,
            s.manual_read_only, s.invoice_name, s.tax_id, s.invoice_address, o.full_name as owner_name, o.email as owner_email,
            n.tools, r.recorders
     from app.companies c
     join app.subscriptions s on s.company_id = c.id
     left join lateral (
       select u.full_name, u.email from app.users u
       where u.company_id = c.id and u.role = 'wlasciciel' and u.active
       order by u.created_at, u.user_id limit 1
     ) o on true
     left join lateral (
       select count(*) as recorders from app.users u where u.company_id = c.id and ${ACTIVE_RECORDER}
     ) r on true
     left join app.company_tool_counts() n on n.company_id = c.id
     where $1::uuid is null or c.id = $1::uuid
     order by lower(c.name), c.created_at`,
    [companyId ?? null],
  );
  return rows.map((row) => {
    const paidUntil = row.paid_until;
    const manualReadOnly = row.manual_read_only;
    return {
      id: row.id,
      name: row.name,
      invoice:
        row.invoice_name && row.tax_id && row.invoice_address
          ? { name: row.invoice_name, taxId: row.tax_id, address: row.invoice_address }
          : null,
      owner: row.owner_name && row.owner_email ? { fullName: row.owner_name, email: row.owner_email } : null,
      tier: tier(row.tier),
      toolCount: Number(row.tools ?? 0),
      recorderCount: Number(row.recorders),
      paidUntil,
      readOnlyFrom: paidUntil ? readOnlyFrom(paidUntil) : null,
      manualReadOnly,
      status: subscriptionStatus({ paidUntil, manualReadOnly }, now),
      createdAt: new Date(row.created_at),
    };
  });
}

/** Zmienia abonament firmy; nieznana firma to `not_found`. */
export async function updateSubscription(
  sql: Sql,
  companyId: string,
  change: { tier: TierId } | { paidUntil: string } | { manualReadOnly: boolean },
) {
  if (!UUID_PATTERN.test(companyId)) throw new RegistryError("not_found");
  const [column, value] =
    "tier" in change
      ? ["tier", change.tier]
      : "paidUntil" in change
        ? ["paid_until", change.paidUntil]
        : ["manual_read_only", change.manualReadOnly];
  const updated = await sql(`update app.subscriptions set ${column} = $2 where company_id = $1 returning company_id`, [companyId, value]);
  if (updated.length === 0) throw new RegistryError("not_found");
}
