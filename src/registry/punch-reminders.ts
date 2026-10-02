import { deliverAsSystem } from "./bell";
import type { ForgottenExitNotification } from "./notifications";
import type { Sql } from "./ports";
import type { PunchPlaceKind } from "./punches";
import type { PushCopy } from "./push";
import { warsawTime } from "./validation";

/** Od tej godziny w Polsce osoba nadal odbita dostaje przypomnienie o wyjściu. */
export const EXIT_REMINDER_HOUR = 18;

/** Firmy z odbiciami otwartymi teraz, dla których zadania harmonogramu sprawdzają zapomniane wyjścia. */
export async function companiesWithOpenPunches(sql: Sql): Promise<string[]> {
  const rows = await sql<{ company_id: string }>("select distinct company_id from app.punches where left_at is null order by company_id");
  return rows.map((row) => row.company_id);
}

/**
 * Zadanie harmonogramu dla jednej firmy, od 18:00 w Polsce: przypomnienie o wyjściu dla każdego odbicia otwartego
 * teraz, raz na odbicie. Dostaje je ten, kto odbił wejście (osoba sama albo kierownik za osobę z kartoteki), a gdy
 * jego konto nie jest już aktywne, osoba ze swoim aktywnym kontem; każdy jedno zbiorcze o wszystkich swoich.
 * Wcześniej nic. Transakcja systemowa (poza RLS). Zwraca liczbę odbić, o których przypomniało, i kopie push nowych
 * wpisów dzwonka.
 */
export async function notifyForgottenExits(sql: Sql, companyId: string, now: Date): Promise<{ punches: number; copies: PushCopy[] }> {
  if (warsawTime(now).hour < EXIT_REMINDER_HOUR) return { punches: 0, copies: [] };
  const rows = await sql<{
    id: string;
    person_id: string;
    person_name: string;
    location_id: string;
    location_kind: PunchPlaceKind;
    location_name: string;
    entered_at: Date;
    recipient_id: string | null;
    recipient_name: string | null;
  }>(
    `with reminded as (
       update app.punches set exit_reminded_at = $2
       where company_id = $1 and left_at is null and exit_reminded_at is null and entered_at <= $2
       returning id, person_id, location_id, entered_at, punched_by
     )
     select r.id, r.person_id, pe.full_name as person_name, r.location_id, l.kind as location_kind, l.name as location_name,
            r.entered_at, coalesce(bu.user_id, ou.user_id) as recipient_id, coalesce(bu.full_name, ou.full_name) as recipient_name
     from reminded r
     join app.people pe on pe.id = r.person_id
     join app.locations l on l.id = r.location_id
     left join app.users bu on bu.user_id = r.punched_by and bu.active
     left join app.users ou on ou.user_id = pe.user_id and ou.active
     order by pe.full_name, r.id`,
    [companyId, now],
  );
  const notifications: ForgottenExitNotification[] = [];
  const addressed = rows.filter((row) => row.recipient_id !== null);
  for (const entries of Map.groupBy(addressed, (row) => row.recipient_id!).values()) {
    notifications.push({
      kind: "przypomnienie_wyjscia",
      recipient: { userId: entries[0].recipient_id!, fullName: entries[0].recipient_name! },
      punches: entries.map((row) => ({
        id: row.id,
        person: { id: row.person_id, fullName: row.person_name },
        place: { id: row.location_id, kind: row.location_kind, name: row.location_name },
        enteredAt: new Date(row.entered_at),
      })),
    });
  }
  const copies = await deliverAsSystem(sql, companyId, notifications, now);
  return { punches: rows.length, copies };
}

/**
 * Zadanie harmonogramu o północy w Polsce: odbicia otwarte z poprzednich dni (wejście przed dzisiejszą północą)
 * zamykają się „bez wyjścia” o północy po dniu wejścia. Trafiają do wyjaśnienia i nie liczą się do czasu na budowie,
 * dopóki ktoś nie uzupełni wyjścia. Bez `companyId` we wszystkich firmach jednym zapisem (nikogo nie powiadamia).
 * Transakcja systemowa (poza RLS). Zwraca liczbę zamkniętych odbić.
 */
export async function closeForgottenExits(sql: Sql, now: Date, companyId: string | null = null): Promise<number> {
  const rows = await sql(
    `update app.punches
     set left_at = (((entered_at at time zone 'Europe/Warsaw')::date + 1)::timestamp) at time zone 'Europe/Warsaw',
         exit_via = 'bez_wyjscia'
     where left_at is null and ($2::uuid is null or company_id = $2)
       and entered_at < ((($1::timestamptz at time zone 'Europe/Warsaw')::date)::timestamp) at time zone 'Europe/Warsaw'
     returning id`,
    [now, companyId],
  );
  return rows.length;
}
