import { RegistryError } from "./errors";
import type { Sql } from "./ports";
import type { Session } from "./registry";

export interface CompanySettings {
  /** Po tylu dniach na budowie narzędzie jest alarmem. */
  alarmThresholdDays: number;
  /** Kto poza właścicielem i autorem widzi zgłoszenia. */
  issueVisibility: IssueVisibility;
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
  }>("select alarm_threshold_days, issues_site_managers, issues_storekeepers, issues_storekeepers_close from app.companies where id = $1", [
    session.company.id,
  ]);
  return {
    alarmThresholdDays: row.alarm_threshold_days,
    issueVisibility: {
      siteManagers: row.issues_site_managers,
      storekeepers: row.issues_storekeepers,
      storekeepersClose: row.issues_storekeepers_close,
    },
  };
}

/** Zmienia podane ustawienia; pominięte zostają bez zmian. */
export async function updateSettings(sql: Sql, session: Session, input: Partial<CompanySettings>): Promise<void> {
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
}
