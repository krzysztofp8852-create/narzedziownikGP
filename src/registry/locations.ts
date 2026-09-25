import { RegistryError } from "./errors";
import type { Sql } from "./ports";
import type { Session } from "./registry";
import { UUID_PATTERN } from "./validation";

export type SiteStatus = "aktywna" | "zakonczona";

export interface NewSiteInput {
  name: string;
  address: string;
  /** Aktywny kierownik z firmy właściciela. */
  managerId: string;
}

/** Budowa na tablicy. */
export interface Site {
  id: string;
  name: string;
  address: string;
  status: SiteStatus;
  manager: { id: string; fullName: string; active: boolean };
}

export function canManageLocations(session: Session) {
  return session.role === "wlasciciel";
}

export function requireLocationManager(session: Session) {
  if (!canManageLocations(session)) throw new RegistryError("forbidden");
}

export async function addSite(sql: Sql, session: Session, raw: NewSiteInput, now: Date): Promise<{ locationId: string }> {
  const name = raw.name.trim();
  const address = raw.address.trim();
  if (!name || !address) throw new RegistryError("invalid_input");
  await requireSiteManagerCandidate(sql, raw.managerId);
  const [site] = await sql<{ id: string }>(
    `insert into app.locations (company_id, kind, name, address, manager_id, status, created_at)
     values ($1, 'budowa', $2, $3, $4, 'aktywna', $5) returning id`,
    [session.company.id, name, address, raw.managerId, now],
  );
  return { locationId: site.id };
}

export async function changeSiteManager(sql: Sql, siteId: string, managerId: string) {
  const [site] = UUID_PATTERN.test(siteId)
    ? await sql<{ status: SiteStatus }>("select status from app.locations where id = $1 and kind = 'budowa'", [siteId])
    : [];
  if (!site) throw new RegistryError("not_found");
  if (site.status !== "aktywna") throw new RegistryError("site_finished");
  await requireSiteManagerCandidate(sql, managerId);
  await sql("update app.locations set manager_id = $2 where id = $1", [siteId, managerId]);
}

export async function addService(sql: Sql, session: Session, raw: { name: string }, now: Date): Promise<{ locationId: string }> {
  const name = raw.name.trim();
  if (!name) throw new RegistryError("invalid_input");
  const [service] = await sql<{ id: string }>(
    "insert into app.locations (company_id, kind, name, created_at) values ($1, 'serwis', $2, $3) returning id",
    [session.company.id, name, now],
  );
  return { locationId: service.id };
}

/** Aktywni kierownicy firmy, spośród których właściciel wybiera kierownika budowy. */
export async function siteManagerCandidates(sql: Sql): Promise<SiteManagerCandidate[]> {
  return sql(
    `select user_id as id, full_name as "fullName" from app.users
     where role = 'kierownik' and active order by full_name`,
  );
}

/** Kierownikiem budowy może być tylko aktywny kierownik z firmy aktora (RLS ukrywa inne firmy). */
async function requireSiteManagerCandidate(sql: Sql, managerId: string) {
  const [candidate] = UUID_PATTERN.test(managerId)
    ? await sql("select 1 from app.users where user_id = $1 and role = 'kierownik' and active", [managerId])
    : [];
  if (!candidate) throw new RegistryError("invalid_manager");
}

/** Aktywny kierownik, któremu można przypisać budowę. */
export interface SiteManagerCandidate {
  id: string;
  fullName: string;
}

export interface Service {
  id: string;
  name: string;
}

/** Budowy firmy: najpierw aktywne, potem według nazwy. */
export async function sites(sql: Sql, { activeOnly }: { activeOnly: boolean }): Promise<Site[]> {
  const rows = await sql<{
    id: string;
    name: string;
    address: string;
    status: SiteStatus;
    manager_id: string;
    manager_name: string;
    manager_active: boolean;
  }>(
    `select l.id, l.name, l.address, l.status, u.user_id as manager_id, u.full_name as manager_name, u.active as manager_active
     from app.locations l join app.users u on u.user_id = l.manager_id
     where l.kind = 'budowa' and ($1 = false or l.status = 'aktywna')
     order by l.status, l.name`,
    [activeOnly],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    address: row.address,
    status: row.status,
    manager: { id: row.manager_id, fullName: row.manager_name, active: row.manager_active },
  }));
}

export async function services(sql: Sql): Promise<Service[]> {
  return sql<Service>("select id, name from app.locations where kind = 'serwis' order by name");
}
