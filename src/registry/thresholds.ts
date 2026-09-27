import { deliverAsSystem } from "./bell";
import type { Notification, Recipient } from "./notifications";
import type { Sql } from "./ports";
import type { Role } from "./registry";
import { DAY_MS, type LocationKind } from "./tools";

/**
 * Zadanie dzienne łapie przekroczenia z ostatnich dwóch dób: jedno spóźnione albo pominięte
 * uruchomienie niczego nie gubi, a próg obniżony przez właściciela nie zasypie dzwonka narzędziami,
 * które stoją za długo od tygodni.
 */
const LOOKBACK_MS = 2 * DAY_MS;

/** Chwila, od której narzędzie stojące w lokalizacji od `since` ma alarm: stoi tam dłużej niż próg dni. */
export function alarmStartsAt(since: Date, thresholdDays: number): Date {
  return new Date(new Date(since).getTime() + (thresholdDays + 1) * DAY_MS);
}

/** Alarm na tablicy: narzędzie na budowie dłużej niż próg dni. Ta sama reguła co w zadaniu dziennym. */
export function hasAlarm(locationKind: LocationKind, since: Date, thresholdDays: number, now: Date): boolean {
  return locationKind === "budowa" && alarmStartsAt(since, thresholdDays).getTime() <= now.getTime();
}

/** Firmy z aktywnymi budowami, dla których zadanie dzienne sprawdza progi. */
export async function companiesWithSites(sql: Sql): Promise<string[]> {
  const rows = await sql<{ company_id: string }>(
    "select distinct company_id from app.locations where kind = 'budowa' and status = 'aktywna' order by company_id",
  );
  return rows.map((row) => row.company_id);
}

/**
 * Wykrywa narzędzia firmy, które od ostatniego uruchomienia przekroczyły próg dni firmy na budowie, i każde
 * zapisuje raz na pobyt. Kierownik budowy dostaje powiadomienie o każdym narzędziu, a właściciel jedno
 * zbiorcze. Transakcja systemowa (poza RLS). Zwraca liczbę nowych przekroczeń.
 */
export async function notifyExceededThresholds(sql: Sql, companyId: string, now: Date): Promise<{ tools: number }> {
  const candidates = await sql<{
    tool_id: string;
    code: string;
    name: string;
    located_since: Date;
    threshold_days: number;
    location_id: string;
    location_name: string;
  }>(
    `select t.id as tool_id, t.code, t.name, t.located_since, co.alarm_threshold_days as threshold_days,
            l.id as location_id, l.name as location_name
     from app.tools t
     join app.locations l on l.id = t.location_id
     join app.companies co on co.id = t.company_id
     where t.company_id = $1 and t.state = 'w_obiegu' and l.kind = 'budowa' and l.status = 'aktywna'
     order by t.code`,
    [companyId],
  );
  const exceeded = candidates.filter((row) => {
    const startsAt = alarmStartsAt(row.located_since, row.threshold_days).getTime();
    return startsAt <= now.getTime() && startsAt > now.getTime() - LOOKBACK_MS;
  });

  const detected: typeof exceeded = [];
  for (const row of exceeded) {
    const inserted = await sql(
      `insert into app.threshold_alerts (tool_id, company_id, located_since, detected_at) values ($1, $2, $3, $4)
       on conflict do nothing returning tool_id`,
      [row.tool_id, companyId, row.located_since, now],
    );
    if (inserted.length > 0) detected.push(row);
  }

  if (detected.length === 0) return { tools: 0 };
  const people = await activePeople(sql, companyId);
  const managers = await siteManagers(sql, [...new Set(detected.map((row) => row.location_id))]);
  const notifications: Notification[] = [];
  for (const row of detected) {
    const manager = managers.get(row.location_id);
    if (!manager) continue;
    notifications.push({
      kind: "prog_przekroczony",
      recipient: manager,
      tool: { id: row.tool_id, code: row.code, name: row.name },
      location: { id: row.location_id, name: row.location_name },
      since: new Date(row.located_since),
      thresholdDays: row.threshold_days,
    });
  }
  for (const owner of people.filter((person) => person.role === "wlasciciel")) {
    notifications.push({
      kind: "progi_przekroczone",
      recipient: owner,
      thresholdDays: detected[0].threshold_days,
      tools: detected.map((row) => ({
        id: row.tool_id,
        code: row.code,
        name: row.name,
        location: { id: row.location_id, name: row.location_name },
      })),
    });
  }
  await deliverAsSystem(sql, companyId, notifications, now);
  return { tools: detected.length };
}

async function activePeople(sql: Sql, companyId: string): Promise<(Recipient & { role: Role })[]> {
  const rows = await sql<{ user_id: string; full_name: string; role: Role }>(
    "select user_id, full_name, role from app.users where company_id = $1 and active order by full_name",
    [companyId],
  );
  return rows.map((row) => ({ userId: row.user_id, fullName: row.full_name, role: row.role }));
}

/** Aktywni kierownicy budów, według budowy. */
async function siteManagers(sql: Sql, locationIds: string[]): Promise<Map<string, Recipient>> {
  const rows = await sql<{ location_id: string; user_id: string; full_name: string }>(
    `select l.id as location_id, u.user_id, u.full_name
     from app.locations l join app.users u on u.user_id = l.manager_id
     where l.id = any($1::uuid[]) and u.active`,
    [locationIds],
  );
  return new Map(rows.map((row) => [row.location_id, { userId: row.user_id, fullName: row.full_name }]));
}
