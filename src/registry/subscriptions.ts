import { RegistryError } from "./errors";
import type { Sql } from "./ports";
import { warsawTime } from "./reports";
import { isCalendarDay, UUID_PATTERN } from "./validation";

/**
 * Próg abonamentu: pakiet z limitem narzędzi i ceną netto za miesiąc. Ceny to cennik roboczy ze
 * specyfikacji (#1); limity narzędzi są założeniem roboczym, do potwierdzenia razem z cennikiem.
 */
export interface SubscriptionTier {
  id: TierId;
  name: string;
  toolLimit: number;
  monthlyPrice: number;
}

export const TIERS = [
  { id: "maly", name: "Mały", toolLimit: 50, monthlyPrice: 49 },
  { id: "sredni", name: "Średni", toolLimit: 150, monthlyPrice: 99 },
  { id: "duzy", name: "Duży", toolLimit: 300, monthlyPrice: 199 },
] as const satisfies readonly { id: string; name: string; toolLimit: number; monthlyPrice: number }[];

export type TierId = (typeof TIERS)[number]["id"];

/** Próg firm założonych bez wyboru progu (skryptem). */
export const DEFAULT_TIER: TierId = "maly";

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
  /** Ostatni opłacony dzień (RRRR-MM-DD). */
  paidUntil: string | null;
  /** Pierwszy dzień automatycznego trybu tylko do odczytu, gdy nic nie wpłynie. */
  readOnlyFrom: string | null;
  manualReadOnly: boolean;
  status: SubscriptionStatus;
  createdAt: Date;
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

/** Stan abonamentu w chwili `now`, liczony dniami kalendarza w Polsce. */
export function subscriptionStatus(subscription: { paidUntil: string | null; manualReadOnly: boolean }, now: Date): SubscriptionStatus {
  if (subscription.manualReadOnly) return "tylko_do_odczytu";
  if (!subscription.paidUntil) return "czeka_na_wplate";
  const today = warsawTime(now).day;
  if (today > addDays(subscription.paidUntil, GRACE_DAYS)) return "tylko_do_odczytu";
  if (today > subscription.paidUntil) return "po_terminie";
  return "aktywna";
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
  }>(
    `select c.id, c.name, c.created_at, s.tier, to_char(s.paid_until, 'YYYY-MM-DD') as paid_until, s.manual_read_only,
            s.invoice_name, s.tax_id, s.invoice_address, o.full_name as owner_name, o.email as owner_email, n.tools
     from app.companies c
     join app.subscriptions s on s.company_id = c.id
     left join lateral (
       select u.full_name, u.email from app.users u
       where u.company_id = c.id and u.role = 'wlasciciel' and u.active
       order by u.created_at, u.user_id limit 1
     ) o on true
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
      paidUntil,
      readOnlyFrom: paidUntil ? addDays(paidUntil, GRACE_DAYS + 1) : null,
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
  const [statement, value] =
    "tier" in change
      ? ["update app.subscriptions set tier = $2 where company_id = $1 returning company_id", change.tier]
      : "paidUntil" in change
        ? ["update app.subscriptions set paid_until = $2 where company_id = $1 returning company_id", change.paidUntil]
        : ["update app.subscriptions set manual_read_only = $2 where company_id = $1 returning company_id", change.manualReadOnly];
  const updated = await sql(statement, [companyId, value]);
  if (updated.length === 0) throw new RegistryError("not_found");
}
