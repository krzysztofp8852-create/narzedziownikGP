import type { Sql } from "./ports";
import type { Session } from "./registry";

/** Czasy bezczynności (w minutach), po których właściciel może być wylogowany; brak ustawienia to sesja bez limitu. */
export const IDLE_LOGOUT_MINUTES = [15, 30, 60, 240] as const;

/** Przeglądarka z sesją Supabase Auth: jej identyfikator i chwila zalogowania (z JWT). */
export interface BrowserSession {
  id: string;
  signedInAt: Date;
}

/**
 * `off`: tej osoby bezczynność nie wylogowuje. `active`: sesja wygaśnie za `remainingMs` bez aktywności.
 * `expired`: bezczynność przekroczyła ustawiony czas, przeglądarkę trzeba wylogować.
 */
export type IdleStatus = { kind: "off" } | { kind: "active"; remainingMs: number } | { kind: "expired" };

/**
 * Wylogowanie po bezczynności tej osoby: ustawienie firmy, ale tylko dla właściciela (ADR 0044). W firmie demo konto
 * właściciela dzielą wszyscy oglądający, więc tam go nie ma.
 */
export function idleLogoutMinutes(role: Session["role"], demo: boolean, companySetting: number | null): number | null {
  return role === "wlasciciel" && !demo ? companySetting : null;
}

/** Wiersze sesji, które i tak wygasły; usunięty wiersz nie przedłuża sesji, bo liczy się wtedy wcześniejsza chwila. */
const STALE_ACTIVITY_MS = 24 * 60 * 60 * 1000;

/**
 * Stan sesji przeglądarki w chwili `now`. Bezczynność liczy się od najpóźniejszej z chwil: zalogowania, zmiany ustawienia
 * (zapis nikogo od razu nie wyloguje) i ostatniej aktywności. Samo sprawdzenie nie jest aktywnością.
 */
export async function idleStatus(sql: Sql, session: Session, browser: BrowserSession, now: Date): Promise<IdleStatus> {
  if (session.idleLogoutMinutes === null) return { kind: "off" };
  const [row] = await sql<{ since: Date | null; last_active_at: Date | null }>(
    `select c.owner_idle_logout_since as since,
            (select a.last_active_at from app.session_activity a where a.user_id = $2 and a.session_id = $3) as last_active_at
     from app.companies c where c.id = $1`,
    [session.company.id, session.userId, browser.id],
  );
  const moments = [browser.signedInAt, row?.since, row?.last_active_at].flatMap((at) => (at ? [new Date(at).getTime()] : []));
  return statusAt(Math.max(...moments), session.idleLogoutMinutes, now);
}

/** Osoba coś zrobiła w przeglądarce: odsuwa wylogowanie, chyba że sesja już wygasła. */
export async function recordActivity(sql: Sql, session: Session, browser: BrowserSession, now: Date): Promise<IdleStatus> {
  const status = await idleStatus(sql, session, browser, now);
  const minutes = session.idleLogoutMinutes;
  if (status.kind !== "active" || minutes === null) return status;
  await sql(
    `insert into app.session_activity (user_id, session_id, last_active_at) values ($1, $2, $3)
     on conflict (user_id, session_id) do update set last_active_at = greatest(app.session_activity.last_active_at, excluded.last_active_at)`,
    [session.userId, browser.id, now],
  );
  await sql("delete from app.session_activity where user_id = $1 and last_active_at < $2", [
    session.userId,
    new Date(now.getTime() - STALE_ACTIVITY_MS),
  ]);
  return statusAt(now.getTime(), minutes, now);
}

function statusAt(idleSince: number, minutes: number, now: Date): IdleStatus {
  const remainingMs = idleSince + minutes * 60_000 - now.getTime();
  return remainingMs > 0 ? { kind: "active", remainingMs } : { kind: "expired" };
}
