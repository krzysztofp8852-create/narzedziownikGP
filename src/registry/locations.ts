import { RegistryError } from "./errors";
import type { Sql } from "./ports";
import type { Role, Session } from "./registry";
import { UUID_PATTERN } from "./validation";

export type SiteStatus = "aktywna" | "zakonczona";

export interface NewSiteInput {
  name: string;
  address: string;
  /** Aktywny kierownik albo właściciel z firmy właściciela. */
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

export interface NewVehicleInput {
  /** Np. „Bus WX 12345”. */
  name: string;
  /** Aktywny kierownik albo właściciel z firmy właściciela. */
  managerId: string;
}

/** Pojazd (np. bus brygady): sprzęt na nim jest poza bazą. */
export interface Vehicle {
  id: string;
  name: string;
  /** Nieaktywny (np. sprzedany) nie przyjmuje sprzętu i nie ma go na tablicy. */
  active: boolean;
  /** Alarm po progu dni; domyślnie wyłączony. */
  alarmEnabled: boolean;
  manager: { id: string; fullName: string; active: boolean };
}

export async function addVehicle(sql: Sql, session: Session, raw: NewVehicleInput, now: Date): Promise<{ locationId: string }> {
  const name = raw.name.trim();
  if (!name) throw new RegistryError("invalid_input");
  await requireSiteManagerCandidate(sql, raw.managerId);
  const [vehicle] = await sql<{ id: string }>(
    `insert into app.locations (company_id, kind, name, manager_id, active, alarm_enabled, created_at)
     values ($1, 'pojazd', $2, $3, true, false, $4) returning id`,
    [session.company.id, name, raw.managerId, now],
  );
  return { locationId: vehicle.id };
}

export async function changeVehicleManager(sql: Sql, vehicleId: string, managerId: string) {
  await requireActiveVehicle(sql, vehicleId);
  await requireSiteManagerCandidate(sql, managerId);
  await sql("update app.locations set manager_id = $2 where id = $1", [vehicleId, managerId]);
}

export async function setVehicleAlarm(sql: Sql, vehicleId: string, enabled: boolean) {
  if (typeof enabled !== "boolean") throw new RegistryError("invalid_input");
  await requireActiveVehicle(sql, vehicleId);
  await sql("update app.locations set alarm_enabled = $2 where id = $1", [vehicleId, enabled]);
}

/** Dezaktywuje pojazd, na którym nie zostało żadne narzędzie w obiegu; historia zostaje. */
export async function deactivateVehicle(sql: Sql, vehicleId: string) {
  await requireActiveVehicle(sql, vehicleId);
  const [{ tools }] = await sql<{ tools: number }>(
    "select count(*)::int as tools from app.tools where location_id = $1 and state = 'w_obiegu'",
    [vehicleId],
  );
  if (tools > 0) throw new RegistryError("vehicle_not_empty");
  await sql("update app.locations set active = false where id = $1", [vehicleId]).catch((error) => {
    // Równoległy ruch dowiózł narzędzie na pojazd po naszym sprawdzeniu.
    throw (error as { code?: string }).code === "GP409" ? new RegistryError("vehicle_not_empty") : error;
  });
}

/** Aktywny pojazd firmy aktora (RLS ukrywa inne firmy). */
async function requireActiveVehicle(sql: Sql, vehicleId: string) {
  const [vehicle] = UUID_PATTERN.test(vehicleId)
    ? await sql<{ active: boolean }>("select active from app.locations where id = $1 and kind = 'pojazd'", [vehicleId])
    : [];
  if (!vehicle) throw new RegistryError("not_found");
  if (!vehicle.active) throw new RegistryError("vehicle_inactive");
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

/**
 * Aktywni kierownicy i właściciele firmy, spośród których właściciel wybiera kierownika budowy albo pojazdu. Właściciel
 * małej firmy sam prowadzi budowy i jeździ busem, a osobne konto kierownika zajęłoby miejsce w pakiecie wdrożenia.
 */
export async function siteManagerCandidates(sql: Sql): Promise<SiteManagerCandidate[]> {
  return sql(
    `select user_id as id, full_name as "fullName", role from app.users
     where role in ('kierownik', 'wlasciciel') and active order by full_name`,
  );
}

/** Kierownikiem budowy i pojazdu może być tylko aktywny kierownik albo właściciel z firmy aktora (RLS ukrywa inne firmy). */
async function requireSiteManagerCandidate(sql: Sql, managerId: string) {
  const [candidate] = UUID_PATTERN.test(managerId)
    ? await sql("select 1 from app.users where user_id = $1 and role in ('kierownik', 'wlasciciel') and active", [managerId])
    : [];
  if (!candidate) throw new RegistryError("invalid_manager");
}

/** Aktywny kierownik albo właściciel, któremu można przypisać budowę albo pojazd. */
export interface SiteManagerCandidate {
  id: string;
  fullName: string;
  role: Extract<Role, "kierownik" | "wlasciciel">;
}

export interface Service {
  id: string;
  name: string;
}

/** Budowy firmy: najpierw aktywne, potem według nazwy. */
export async function sites(sql: Sql, { activeOnly }: { activeOnly: boolean }): Promise<Site[]> {
  const rows = await sql<SiteRow>(
    `select ${SITE_COLUMNS}
     from app.locations l join app.users u on u.user_id = l.manager_id
     where l.kind = 'budowa' and ($1 = false or l.status = 'aktywna')
     order by l.status, l.name`,
    [activeOnly],
  );
  return rows.map(siteFromRow);
}

/** Kolumny budowy `l` z jej kierownikiem `u`, do odczytu przez siteFromRow. */
export const SITE_COLUMNS =
  "l.id, l.name, l.address, l.status, u.user_id as manager_id, u.full_name as manager_name, u.active as manager_active";

export interface SiteRow {
  id: string;
  name: string;
  address: string;
  status: SiteStatus;
  manager_id: string;
  manager_name: string;
  manager_active: boolean;
}

export function siteFromRow(row: SiteRow): Site {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    status: row.status,
    manager: { id: row.manager_id, fullName: row.manager_name, active: row.manager_active },
  };
}

export async function services(sql: Sql): Promise<Service[]> {
  return sql<Service>("select id, name from app.locations where kind = 'serwis' order by name");
}

/** Pojazdy firmy: najpierw aktywne, potem według nazwy. */
export async function vehicles(sql: Sql, { activeOnly }: { activeOnly: boolean }): Promise<Vehicle[]> {
  const rows = await sql<{
    id: string;
    name: string;
    active: boolean;
    alarm_enabled: boolean;
    manager_id: string;
    manager_name: string;
    manager_active: boolean;
  }>(
    `select l.id, l.name, l.active, l.alarm_enabled,
            u.user_id as manager_id, u.full_name as manager_name, u.active as manager_active
     from app.locations l join app.users u on u.user_id = l.manager_id
     where l.kind = 'pojazd' and ($1 = false or l.active)
     order by l.active desc, l.name`,
    [activeOnly],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    active: row.active,
    alarmEnabled: row.alarm_enabled,
    manager: { id: row.manager_id, fullName: row.manager_name, active: row.manager_active },
  }));
}
