import { RegistryError } from "./errors";
import type { Sql } from "./ports";
import type { Session } from "./registry";

export interface CompanySettings {
  /** Po tylu dniach na budowie narzędzie jest alarmem. */
  alarmThresholdDays: number;
}

export const MAX_ALARM_THRESHOLD_DAYS = 365;

export function canManageSettings(session: Session) {
  return session.role === "wlasciciel";
}

export function requireSettingsManager(session: Session) {
  if (!canManageSettings(session)) throw new RegistryError("forbidden");
}

export async function companySettings(sql: Sql, session: Session): Promise<CompanySettings> {
  const [row] = await sql<{ alarm_threshold_days: number }>("select alarm_threshold_days from app.companies where id = $1", [
    session.company.id,
  ]);
  return { alarmThresholdDays: row.alarm_threshold_days };
}

export async function updateSettings(sql: Sql, session: Session, input: CompanySettings): Promise<void> {
  const days = input.alarmThresholdDays;
  if (!Number.isInteger(days) || days < 1 || days > MAX_ALARM_THRESHOLD_DAYS) throw new RegistryError("invalid_input");
  await sql("update app.companies set alarm_threshold_days = $2 where id = $1", [session.company.id, days]);
}
