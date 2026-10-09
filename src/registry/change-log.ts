import { RegistryError } from "./errors";
import type { Sql } from "./ports";
import type { Role, Session } from "./registry";
import type { CompanySettings } from "./settings";
import { UUID_PATTERN } from "./validation";

export const CHANGE_KINDS = [
  "firma_zalozona",
  "konto_zalozone",
  "konto_dezaktywowane",
  "osoba_dezaktywowana",
  "haslo_zresetowane",
  "ustawienie_zmienione",
] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

/** Ustawienia firmy w dzienniku zmian. */
export const LOGGED_SETTINGS = [
  "prog_dni",
  "zgloszenia_kierownik",
  "zgloszenia_magazynier",
  "zgloszenia_magazynier_zamyka",
  "koszty_kierownik",
  "wylogowanie_wlasciciela",
] as const;
export type LoggedSetting = (typeof LOGGED_SETTINGS)[number];

/** Wartość `wylogowanie_wlasciciela`, gdy właściciela bezczynność nie wylogowuje; inaczej liczba minut. */
export const IDLE_LOGOUT_OFF = "wylaczone";

/** Tyle najnowszych wpisów pokazuje dziennik; całość jest w pełnym eksporcie danych firmy. */
export const CHANGE_LOG_LIMIT = 200;

/**
 * Wpis dziennika zmian. Autor: osoba z firmy (z imieniem i nazwiskiem z chwili zmiany), super-admin albo program.
 * `personName`, `role` i `login` dotyczą konta albo osoby; `setting` z `oldValue` i `newValue` (liczba dni albo minut,
 * `true`/`false` albo `wylaczone`) tylko zmiany ustawienia.
 */
export interface ChangeLogEntry {
  id: string;
  at: Date;
  actorKind: "osoba" | "super_admin" | "system";
  actorName: string | null;
  kind: ChangeKind;
  personName: string | null;
  role: Role | null;
  login: string | null;
  setting: LoggedSetting | null;
  oldValue: string | null;
  newValue: string | null;
}

/** Zmiana do zapisu; autora dopisuje baza z JWT transakcji. */
export type NewChange =
  | { kind: "firma_zalozona" | "konto_zalozone"; personName: string; role: Role; login: string }
  | { kind: "konto_dezaktywowane" | "osoba_dezaktywowana" | "haslo_zresetowane"; personName: string }
  | { kind: "ustawienie_zmienione"; setting: LoggedSetting; oldValue: string; newValue: string };

export function canReadChangeLog(session: Session) {
  return session.role === "wlasciciel";
}

export function requireChangeLogReader(session: Session) {
  if (!canReadChangeLog(session)) throw new RegistryError("forbidden");
}

/** Dopisuje zmianę w transakcji polecenia, które ją wykonało. `actor_kind` i resztę autora nadpisuje wyzwalacz. */
export async function recordChange(sql: Sql, companyId: string, change: NewChange, now: Date) {
  const person = "personName" in change ? change : null;
  const account = "role" in change ? change : null;
  const setting = change.kind === "ustawienie_zmienione" ? change : null;
  await sql(
    `insert into app.change_log (company_id, at, actor_kind, kind, person_name, role, login, setting, old_value, new_value)
     values ($1, $2, 'system', $3, $4, $5, $6, $7, $8, $9)`,
    [
      companyId,
      now,
      change.kind,
      person?.personName ?? null,
      account?.role ?? null,
      account?.login ?? null,
      setting?.setting ?? null,
      setting?.oldValue ?? null,
      setting?.newValue ?? null,
    ],
  );
}

/** Zmienione ustawienia firmy, w kolejności z ustawień; niezmienione pomija. */
export function settingChanges(before: CompanySettings, after: CompanySettings): NewChange[] {
  const values = (settings: CompanySettings): Record<LoggedSetting, string> => ({
    prog_dni: String(settings.alarmThresholdDays),
    zgloszenia_kierownik: String(settings.issueVisibility.siteManagers),
    zgloszenia_magazynier: String(settings.issueVisibility.storekeepers),
    zgloszenia_magazynier_zamyka: String(settings.issueVisibility.storekeepersClose),
    koszty_kierownik: String(settings.siteManagersSeeCosts),
    wylogowanie_wlasciciela: settings.ownerIdleLogoutMinutes === null ? IDLE_LOGOUT_OFF : String(settings.ownerIdleLogoutMinutes),
  });
  const [old, next] = [values(before), values(after)];
  return LOGGED_SETTINGS.filter((setting) => old[setting] !== next[setting]).map((setting) => ({
    kind: "ustawienie_zmienione",
    setting,
    oldValue: old[setting],
    newValue: next[setting],
  }));
}

/** Najnowsze wpisy firmy `companyId`, od najnowszego. Inne firmy odcina RLS (widzi je tylko super-admin). */
export async function changeLog(sql: Sql, companyId: string): Promise<ChangeLogEntry[]> {
  if (!UUID_PATTERN.test(companyId)) return [];
  return sql<ChangeLogEntry>(
    `select id::text as id, at, actor_kind as "actorKind", actor_name as "actorName", kind, person_name as "personName",
            role, login, setting, old_value as "oldValue", new_value as "newValue"
     from app.change_log c where c.company_id = $1
     order by c.id desc limit $2`,
    [companyId, CHANGE_LOG_LIMIT],
  );
}
