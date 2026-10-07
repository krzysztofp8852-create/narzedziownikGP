import { RegistryError } from "./errors";
import type { Sql } from "./ports";

/** Strona, z której przyszła prośba o telefon. */
export const CALLBACK_SOURCES = ["o-programie", "demo"] as const;
export type CallbackSource = (typeof CALLBACK_SOURCES)[number];

export function isCallbackSource(value: unknown): value is CallbackSource {
  return CALLBACK_SOURCES.includes(value as CallbackSource);
}

export const MAX_CALLBACK_NAME_LENGTH = 100;
/** Ile próśb o telefon na godzinę przyjmujemy łącznie; więcej to raczej bot niż klienci. */
export const CALLBACK_REQUESTS_PER_HOUR = 20;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Po tylu dniach prośba znika (polityka prywatności, pkt 3). */
const CALLBACK_RETENTION_DAYS = 365;
/** Super-admin widzi prośby z tylu ostatnich dni. */
export const CALLBACK_LIST_DAYS = 90;

export interface CallbackRequestInput {
  phone: string;
  name: string;
  source: CallbackSource;
}

/** Prośba o telefon: numer w zapisie międzynarodowym, imię albo firma (jeśli podane) i strona, z której przyszła. */
export interface CallbackRequest {
  id: string;
  at: Date;
  phone: string;
  name: string | null;
  source: CallbackSource;
}

/**
 * Numer telefonu w zapisie międzynarodowym (+48576763536) albo null, gdy to nie numer. Spacje, kreski, kropki
 * i nawiasy nie mają znaczenia; dziewięć cyfr to numer polski, a 00 na początku to to samo co +.
 */
export function normalizePhone(text: string): string | null {
  const compact = text.replace(/[\s ().-]/g, "").replace(/^00/, "+");
  if (/^\d{9}$/.test(compact)) return `+48${compact}`;
  if (/^48\d{9}$/.test(compact)) return `+${compact}`;
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
}

/** „+48 576 763 536”; numery spoza Polski bez zmian. */
export function formatPhone(phone: string): string {
  const polish = /^\+48(\d{3})(\d{3})(\d{3})$/.exec(phone);
  return polish ? `+48 ${polish[1]} ${polish[2]} ${polish[3]}` : phone;
}

/**
 * Zapisuje prośbę o telefon (transakcja systemowa). Ten sam numer drugi raz w ciągu doby nic nie zapisuje i zwraca
 * null, żeby dział handlowy nie dostał tego samego dwa razy. Ponad `CALLBACK_REQUESTS_PER_HOUR` na godzinę odmawia
 * (`callback_busy`). Przy okazji usuwa prośby starsze niż rok.
 */
export async function requestCallback(sql: Sql, input: CallbackRequestInput, now: Date): Promise<CallbackRequest | null> {
  const phone = normalizePhone(input.phone);
  const name = input.name.trim();
  if (!phone || name.length > MAX_CALLBACK_NAME_LENGTH || !isCallbackSource(input.source)) throw new RegistryError("invalid_input");

  await sql("delete from app.callback_requests where at < $1", [new Date(now.getTime() - CALLBACK_RETENTION_DAYS * DAY)]);
  const [recent] = await sql<{ same: boolean; count: number }>(
    `select bool_or(phone = $1) as same, count(*) filter (where at > $3)::int as count
     from app.callback_requests where at > $2`,
    [phone, new Date(now.getTime() - DAY), new Date(now.getTime() - HOUR)],
  );
  if (recent.same) return null;
  if (recent.count >= CALLBACK_REQUESTS_PER_HOUR) throw new RegistryError("callback_busy");

  const [row] = await sql<{ id: string }>("insert into app.callback_requests (at, phone, name, source) values ($1, $2, $3, $4) returning id", [
    now,
    phone,
    name || null,
    input.source,
  ]);
  return { id: row.id, at: now, phone, name: name || null, source: input.source };
}

/** Prośby o telefon z ostatnich 90 dni, od najnowszej, i ile ich przyszło w ostatnich 7, 30 i 90 dniach. */
export interface CallbackRequestList {
  requests: CallbackRequest[];
  counts: { week: number; month: number; all: number };
}

/** Prośby o telefon z ostatnich `CALLBACK_LIST_DAYS` dni (super-admin, przez RLS). */
export async function callbackRequests(sql: Sql, now: Date): Promise<CallbackRequestList> {
  const requests = await sql<CallbackRequest>("select id, at, phone, name, source from app.callback_requests where at > $1 order by at desc", [
    new Date(now.getTime() - CALLBACK_LIST_DAYS * DAY),
  ]);
  const since = (days: number) => requests.filter((request) => request.at.getTime() > now.getTime() - days * DAY).length;
  return { requests, counts: { week: since(7), month: since(30), all: requests.length } };
}
