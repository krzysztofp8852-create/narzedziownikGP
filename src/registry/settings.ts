import * as changeLog from "./change-log";
import { RegistryError } from "./errors";
import { IDLE_LOGOUT_MINUTES } from "./idle-logout";
import type { Sql } from "./ports";
import type { Session } from "./registry";

export interface CompanySettings {
  /** Po tylu dniach na budowie narzędzie jest alarmem. */
  alarmThresholdDays: number;
  /** Kto poza właścicielem i autorem widzi zgłoszenia. */
  issueVisibility: IssueVisibility;
  /** Kierownik widzi koszty sprzętu lokalizacji, których jest kierownikiem; domyślnie nie. */
  siteManagersSeeCosts: boolean;
  /** Po tylu minutach bezczynności przeglądarka właściciela się wyloguje (15, 30, 60 albo 240); null: nigdy. */
  ownerIdleLogoutMinutes: number | null;
}

export interface IssueVisibility {
  /** Kierownik lokalizacji, której dotyczy zgłoszenie. */
  siteManagers: boolean;
  /** Magazynier: wszystkie zgłoszenia. */
  storekeepers: boolean;
  /** Magazynier, który widzi zgłoszenia, może je też zamykać. */
  storekeepersClose: boolean;
}

export const MAX_ALARM_THRESHOLD_DAYS = 365;

export function canManageSettings(session: Session) {
  return session.role === "wlasciciel";
}

export function requireSettingsManager(session: Session) {
  if (!canManageSettings(session)) throw new RegistryError("forbidden");
}

export async function companySettings(sql: Sql, session: Session): Promise<CompanySettings> {
  const [row] = await sql<{
    alarm_threshold_days: number;
    issues_site_managers: boolean;
    issues_storekeepers: boolean;
    issues_storekeepers_close: boolean;
    site_managers_see_costs: boolean;
    owner_idle_logout_minutes: number | null;
  }>(
    `select alarm_threshold_days, issues_site_managers, issues_storekeepers, issues_storekeepers_close, site_managers_see_costs,
            owner_idle_logout_minutes
     from app.companies where id = $1`,
    [session.company.id],
  );
  return {
    alarmThresholdDays: row.alarm_threshold_days,
    issueVisibility: {
      siteManagers: row.issues_site_managers,
      storekeepers: row.issues_storekeepers,
      storekeepersClose: row.issues_storekeepers_close,
    },
    siteManagersSeeCosts: row.site_managers_see_costs,
    ownerIdleLogoutMinutes: row.owner_idle_logout_minutes,
  };
}

/** Zmienia podane ustawienia; pominięte zostają bez zmian. Każde zmienione trafia do dziennika zmian. */
export async function updateSettings(sql: Sql, session: Session, input: Partial<CompanySettings>, now: Date): Promise<void> {
  const before = await companySettings(sql, session);
  const days = input.alarmThresholdDays;
  if (days !== undefined) {
    if (!Number.isInteger(days) || days < 1 || days > MAX_ALARM_THRESHOLD_DAYS) throw new RegistryError("invalid_input");
    await sql("update app.companies set alarm_threshold_days = $2 where id = $1", [session.company.id, days]);
  }
  const visibility = input.issueVisibility;
  if (visibility !== undefined) {
    const { siteManagers, storekeepers, storekeepersClose } = visibility ?? {};
    const flags = [siteManagers, storekeepers, storekeepersClose];
    // Zamykać może tylko magazynier, który widzi zgłoszenia.
    if (flags.some((flag) => typeof flag !== "boolean") || (storekeepersClose && !storekeepers)) throw new RegistryError("invalid_input");
    await sql(
      "update app.companies set issues_site_managers = $2, issues_storekeepers = $3, issues_storekeepers_close = $4 where id = $1",
      [session.company.id, ...flags],
    );
  }
  const seeCosts = input.siteManagersSeeCosts;
  if (seeCosts !== undefined) {
    if (typeof seeCosts !== "boolean") throw new RegistryError("invalid_input");
    await sql("update app.companies set site_managers_see_costs = $2 where id = $1", [session.company.id, seeCosts]);
  }
  const idleMinutes = input.ownerIdleLogoutMinutes;
  if (idleMinutes !== undefined) {
    if (idleMinutes !== null && !(IDLE_LOGOUT_MINUTES as readonly number[]).includes(idleMinutes)) throw new RegistryError("invalid_input");
    // Bezczynność liczy się najwcześniej od zmiany, więc zapis nikogo od razu nie wyloguje (ADR 0044).
    await sql(
      `update app.companies set owner_idle_logout_minutes = $2, owner_idle_logout_since = $3
       where id = $1 and owner_idle_logout_minutes is distinct from $2`,
      [session.company.id, idleMinutes, now],
    );
  }
  for (const change of changeLog.settingChanges(before, await companySettings(sql, session))) {
    await changeLog.recordChange(sql, session.company.id, change, now);
  }
}
