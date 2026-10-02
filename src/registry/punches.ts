import { isUniqueViolation, RegistryError, ReplayedOperationError } from "./errors";
import type { Sql } from "./ports";
import { normalizePosterCode } from "./poster-code";
import type { Session } from "./registry";
import { UUID_PATTERN } from "./validation";

export const PUNCH_RESULTS = ["na_budowie", "poza_budowa", "brak_polozenia", "bez_sprawdzenia"] as const;
/**
 * Wynik sprawdzenia położenia przy skanie: `na_budowie` (odległość najwyżej promień odbicia), `poza_budowa` (dalej,
 * z odległością), `brak_polozenia` (telefon nie podał położenia) albo `bez_sprawdzenia` (budowa nie ma położenia).
 */
export type PunchResult = (typeof PUNCH_RESULTS)[number];

export const DEFAULT_PUNCH_RADIUS_M = 300;
export const MIN_PUNCH_RADIUS_M = 50;
export const MAX_PUNCH_RADIUS_M = 5000;
export const MAX_PUNCH_EXPLANATION_LENGTH = 500;

/** Położenie telefonu w chwili skanu (WGS 84) z dokładnością w metrach. Rejestr liczy z niego odległość i go nie zapisuje. */
export interface PhonePosition {
  lat: number;
  lng: number;
  accuracy: number;
}

export interface PunchInput {
  /** Identyfikator operacji klienta: ponowne wysłanie zwraca pierwotne odbicie. */
  operationId: string;
  /** Kod plakatu z kodu QR albo wpisany ręcznie. */
  posterToken: string;
  /** null: telefon nie podał położenia. */
  position: PhonePosition | null;
  /** Skan na budowie, na której osoba jest odbita, zapisuje wyjście dopiero z potwierdzeniem. */
  confirmExit?: boolean;
}

/** Gdzie się odbija: budowa albo baza (pojazd i serwis plakatu nie mają). */
export type PunchPlaceKind = "budowa" | "baza";
/** `wyjscie`: skan na tej budowie, `przejscie`: skan na innej (jej położenie sprawdza tamto wejście). */
export type PunchExitVia = "wyjscie" | "przejscie";

/** Miejsce, w którym się odbija: budowa albo baza. */
export interface PunchPlace {
  id: string;
  kind: PunchPlaceKind;
  name: string;
}

/** Wynik sprawdzenia położenia przy wejściu albo wyjściu; odległość tylko wtedy, gdy ją policzono. */
export interface PunchCheck {
  result: PunchResult;
  distanceM: number | null;
}

/** Co robi skan plakatu: wejście, wyjście z tej budowy (po pytaniu „Kończysz?”) albo przejście z innej. */
export type PunchAction = "wejscie" | PunchExitVia;

/** Odbicie: pobyt osoby na budowie albo bazie od wejścia do wyjścia albo przejścia na inną budowę. */
export interface Punch {
  id: string;
  person: { id: string; fullName: string };
  place: PunchPlace;
  enteredAt: Date;
  entry: PunchCheck;
  /** null: osoba jest tu odbita teraz. */
  leftAt: Date | null;
  exitVia: PunchExitVia | null;
  /** Tylko przy wyjściu skanem na tej budowie. */
  exit: PunchCheck | null;
  explained: { at: Date; byName: string; note: string | null } | null;
  /** Wynik wejścia albo wyjścia inny niż „na budowie”, jeszcze niewyjaśniony. */
  toClarify: boolean;
  /** Wejście doszło z kolejki offline telefonu: „zapisane offline”. */
  entryOffline: boolean;
  /** Wyjście (także przejście) doszło z kolejki offline telefonu. */
  exitOffline: boolean;
}

/** Co zrobi skan plakatu, zanim cokolwiek zapisze. `from`: skąd przejście. */
export interface PunchPreview {
  place: PunchPlace;
  action: PunchAction;
  from: PunchPlace | null;
}

/** Wynik skanu: zapisane wejście, wyjście albo przejście, albo pytanie o potwierdzenie wyjścia (nic nie zapisano). */
export type PunchOutcome =
  | { action: "wejscie"; punch: Punch }
  | { action: "wyjscie"; punch: Punch }
  | { action: "przejscie"; left: Punch; punch: Punch }
  | { action: "potwierdz_wyjscie"; place: PunchPlace };

/** Zakładka „Ludzie na budowie”: kto jest odbity teraz i historia odbić, które aktor widzi. */
export interface PeopleOnSite {
  place: PunchPlace;
  radiusM: number;
  /** Czy miejsce ma położenie; bez niego odbicia są „bez sprawdzenia”. */
  positioned: boolean;
  /** Po imieniu i nazwisku. */
  present: Punch[];
  /** Ostatnie odbicia, od najnowszego. */
  history: Punch[];
}

/** Dane do wydruku plakatu budowy albo bazy. */
export interface Poster {
  companyName: string;
  place: PunchPlace;
  address: string;
  /** Kod plakatu w kodzie QR i do wpisania ręcznie. */
  code: string;
}

/** Skan plakatu zrobiony bez zasięgu, wysłany z kolejki offline telefonu. */
export interface QueuedPunchInput extends PunchInput {
  /** Chwila skanu w telefonie: czas wejścia albo wyjścia. */
  scannedAt: Date;
}

/** Odbicie zapisane z czasem skanu albo konflikt do wyjaśnienia (nic się nie zapisało). */
export type QueuedPunchResult =
  | { status: "registered"; outcome: SavedPunchOutcome }
  | { status: "rejected"; conflict: PunchConflict };

export const PUNCH_CONFLICT_REASONS = ["kod_niewazny", "budowa_zakonczona", "pozniejsze_odbicie", "nie_odbity_tu", "juz_odbity_tu"] as const;
/**
 * Dlaczego skan z kolejki się nie zapisał: kodu plakatu już nie ma (np. „Nowy kod”), budowę zakończono, osoba ma
 * odbicie późniejsze niż skan, telefon potwierdził wyjście, a osoba nie jest tu odbita, albo telefon nie wiedział,
 * że osoba jest tu już odbita (wyjście bez pytania „Kończysz?” by jej skończyło dzień).
 */
export type PunchConflictReason = (typeof PUNCH_CONFLICT_REASONS)[number];

/** Skan z kolejki offline, który nie pasował do odbić zapisanych w międzyczasie: czeka na wyjaśnienie. */
export interface PunchConflict {
  id: string;
  operationId: string;
  person: { id: string; fullName: string };
  /** null: kodu plakatu nie ma już w firmie. */
  place: PunchPlace | null;
  scannedAt: Date;
  receivedAt: Date;
  /** Czy osoba potwierdziła w telefonie wyjście („Kończysz?”). */
  confirmExit: boolean;
  /** Wynik sprawdzenia położenia przy skanie, gdy miejsce jest znane. */
  check: PunchCheck | null;
  reason: PunchConflictReason;
}

export interface ExplainPunchConflictInput {
  conflictId: string;
  note: string | null;
}

export interface ExplainPunchInput {
  punchId: string;
  note: string | null;
}

const HISTORY_LIMIT = 100;

/** Plakat budowy drukuje właściciel albo jej kierownik, a plakat bazy właściciel. */
export function canPrintPoster(session: Session, place: { kind: PunchPlaceKind; managerId: string | null }) {
  return session.role === "wlasciciel" || (place.kind === "budowa" && session.role === "kierownik" && place.managerId === session.userId);
}

/** Promień odbicia zmienia właściciel. */
export function canSetPunchRadius(session: Session) {
  return session.role === "wlasciciel";
}

/** Listę odbić do wyjaśnienia mają właściciel i kierownik (odbicia na swoich budowach). */
export function canClarifyPunches(session: Session) {
  return session.role === "wlasciciel" || session.role === "kierownik";
}

function requirePunchClarifier(session: Session) {
  if (!canClarifyPunches(session)) throw new RegistryError("forbidden");
}

/** Odbicie z tą samą operacją już się zapisało w równoległej transakcji; ponowienie je zwróci. */
export class ConcurrentPunchError extends Error {}

interface PlaceRow {
  id: string;
  kind: PunchPlaceKind;
  name: string;
  address: string | null;
  status: "aktywna" | "zakonczona" | null;
  manager_id: string | null;
  latitude: number | null;
  longitude: number | null;
  punch_radius_m: number;
}

const PLACE_COLUMNS = "id, kind, name, address, status, manager_id, latitude, longitude, punch_radius_m";

/** Budowa albo baza z plakatem o tym kodzie w firmie aktora (RLS ukrywa inne firmy); null, gdy takiego nie ma. */
async function findPlaceByToken(sql: Sql, token: string): Promise<PlaceRow | null> {
  const code = normalizePosterCode(token);
  const [place] = code ? await sql<PlaceRow>(`select ${PLACE_COLUMNS} from app.locations where poster_token = $1`, [code]) : [];
  return place ?? null;
}

/** Budowa albo baza z plakatem o tym kodzie w firmie aktora. Baza bez adresu plakatu nie ma. */
async function placeByToken(sql: Sql, token: string): Promise<PlaceRow> {
  const place = await findPlaceByToken(sql, token);
  if (!place) throw new RegistryError("poster_invalid");
  if (place.status === "zakonczona") throw new RegistryError("site_finished");
  if (!place.address) throw new RegistryError("poster_no_address");
  return place;
}

/** Budowa albo baza firmy aktora; pojazd, serwis i inne firmy to `not_found`. */
async function requirePlace(sql: Sql, locationId: string): Promise<PlaceRow> {
  const [place] = UUID_PATTERN.test(String(locationId))
    ? await sql<PlaceRow>(`select ${PLACE_COLUMNS} from app.locations where id = $1 and kind in ('budowa', 'baza')`, [locationId])
    : [];
  if (!place) throw new RegistryError("not_found");
  return place;
}

const placeOf = (row: PlaceRow): PunchPlace => ({ id: row.id, kind: row.kind, name: row.name });

/** Osoba konta aktora; każde aktywne konto ma osobę w kartotece. */
async function actorPerson(sql: Sql, session: Session): Promise<string> {
  const [person] = await sql<{ id: string }>("select id from app.people where user_id = $1 and active", [session.userId]);
  if (!person) throw new RegistryError("forbidden");
  return person.id;
}

const EARTH_RADIUS_M = 6_371_008.8;

/** Odległość po powierzchni Ziemi (wzór haversine) w pełnych metrach. */
function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** Położenie z telefonu po sprawdzeniu; brak to null, a zły zapis `invalid_input`. */
function checkPosition(raw: PhonePosition | null | undefined): PhonePosition | null {
  if (raw === null || raw === undefined) return null;
  const finite = (value: unknown, limit: number) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
  if (!finite(raw.lat, 90) || !finite(raw.lng, 180) || !finite(raw.accuracy, Number.MAX_VALUE) || raw.accuracy < 0) {
    throw new RegistryError("invalid_input");
  }
  return { lat: raw.lat, lng: raw.lng, accuracy: raw.accuracy };
}

/**
 * Wynik skanu w tym miejscu. W firmie demo położenia nie sprawdzamy, żeby oglądający mógł spróbować z dowolnego miejsca.
 * Odległość porównujemy w pełnych metrach, tak jak ją pokazujemy.
 */
function positionCheck(session: Session, place: PlaceRow, position: PhonePosition | null): PunchCheck {
  if (session.company.demo) return { result: "na_budowie", distanceM: null };
  if (place.latitude === null || place.longitude === null) return { result: "bez_sprawdzenia", distanceM: null };
  if (!position) return { result: "brak_polozenia", distanceM: null };
  const distance = distanceM(position, { lat: place.latitude, lng: place.longitude });
  return { result: distance <= place.punch_radius_m ? "na_budowie" : "poza_budowa", distanceM: distance };
}

interface PunchRow {
  id: string;
  person_id: string;
  person_name: string;
  location_id: string;
  location_kind: PunchPlaceKind;
  location_name: string;
  entered_at: Date;
  entry_result: PunchResult;
  entry_distance_m: number | null;
  left_at: Date | null;
  exit_via: PunchExitVia | null;
  exit_result: PunchResult | null;
  exit_distance_m: number | null;
  explained_at: Date | null;
  explained_by_name: string | null;
  explanation: string | null;
  entry_offline: boolean;
  exit_offline: boolean;
}

const PUNCH_SELECT = `
  select p.id, p.person_id, pe.full_name as person_name, p.location_id, l.kind as location_kind, l.name as location_name,
         p.entered_at, p.entry_result, p.entry_distance_m, p.left_at, p.exit_via, p.exit_result, p.exit_distance_m,
         p.explained_at, eu.full_name as explained_by_name, p.explanation, p.entry_offline, p.exit_offline
  from app.punches p
  join app.people pe on pe.id = p.person_id
  join app.locations l on l.id = p.location_id
  left join app.users eu on eu.user_id = p.explained_by`;

/** Odbicie `p` z wynikiem wejścia albo wyjścia innym niż „na budowie” (ten sam warunek sprawdza wyzwalacz w bazie). */
const FLAGGED = "(p.entry_result <> 'na_budowie' or coalesce(p.exit_result, 'na_budowie') <> 'na_budowie')";
/** Warunek „do wyjaśnienia”: odbicie z oznaczeniem, jeszcze niewyjaśnione. */
const TO_CLARIFY = `p.explained_at is null and ${FLAGGED}`;

function punchFromRow(row: PunchRow): Punch {
  const flagged = row.entry_result !== "na_budowie" || (row.exit_result !== null && row.exit_result !== "na_budowie");
  return {
    id: row.id,
    person: { id: row.person_id, fullName: row.person_name },
    place: { id: row.location_id, kind: row.location_kind, name: row.location_name },
    enteredAt: new Date(row.entered_at),
    entry: { result: row.entry_result, distanceM: row.entry_distance_m },
    leftAt: row.left_at === null ? null : new Date(row.left_at),
    exitVia: row.exit_via,
    exit: row.exit_result === null ? null : { result: row.exit_result, distanceM: row.exit_distance_m },
    explained:
      row.explained_at === null ? null : { at: new Date(row.explained_at), byName: row.explained_by_name ?? "", note: row.explanation },
    toClarify: flagged && row.explained_at === null,
    entryOffline: row.entry_offline,
    exitOffline: row.exit_offline,
  };
}

async function punchById(sql: Sql, punchId: string): Promise<Punch> {
  const [row] = await sql<PunchRow>(`${PUNCH_SELECT} where p.id = $1`, [punchId]);
  return punchFromRow(row);
}

/** Otwarte odbicie osoby (najwyżej jedno). */
async function openPunchOf(sql: Sql, personId: string) {
  const [open] = await sql<{ id: string; location_id: string; location_kind: PunchPlaceKind; location_name: string }>(
    `select p.id, p.location_id, l.kind as location_kind, l.name as location_name
     from app.punches p join app.locations l on l.id = p.location_id
     where p.person_id = $1 and p.left_at is null`,
    [personId],
  );
  return open ?? null;
}

/** Zapisane wejście, wyjście albo przejście (bez pytania o potwierdzenie wyjścia). */
export type SavedPunchOutcome = Exclude<PunchOutcome, { action: "potwierdz_wyjscie" }>;

/** Co zrobi skan plakatu `posterToken` przez aktora; niczego nie zapisuje. */
export async function punchPreview(sql: Sql, session: Session, posterToken: string): Promise<PunchPreview> {
  const place = await placeByToken(sql, posterToken);
  const open = await openPunchOf(sql, await actorPerson(sql, session));
  const from = open && open.location_id !== place.id ? { id: open.location_id, kind: open.location_kind, name: open.location_name } : null;
  return { place: placeOf(place), action: !open ? "wejscie" : from ? "przejscie" : "wyjscie", from };
}

/** Odbicie zapisane już tą operacją (powtórzone wysłanie), z tym samym wynikiem co za pierwszym razem. */
async function replayedPunch(sql: Sql, operationId: string): Promise<SavedPunchOutcome | null> {
  const rows = await sql<{ id: string; entry: boolean }>(
    `select id, entry_operation_id = $1 as entry from app.punches where entry_operation_id = $1 or exit_operation_id = $1`,
    [operationId],
  );
  const entered = rows.find((row) => row.entry);
  const left = rows.find((row) => !row.entry);
  if (entered && left) return { action: "przejscie", left: await punchById(sql, left.id), punch: await punchById(sql, entered.id) };
  if (entered) return { action: "wejscie", punch: await punchById(sql, entered.id) };
  if (left) return { action: "wyjscie", punch: await punchById(sql, left.id) };
  return null;
}

/**
 * Skan plakatu przez aktora: wejście, wyjście z potwierdzeniem albo przejście, z wynikiem sprawdzenia położenia.
 * Współrzędnych telefonu nigdzie nie zapisuje.
 */
export async function punch(sql: Sql, session: Session, input: PunchInput, now: Date): Promise<PunchOutcome> {
  if (!UUID_PATTERN.test(String(input.operationId))) throw new RegistryError("invalid_input");
  const position = checkPosition(input.position);
  const replayed = await replayedPunch(sql, input.operationId);
  if (replayed) return replayed;
  const place = await placeByToken(sql, input.posterToken);
  const personId = await actorPerson(sql, session);
  const open = await openPunchOf(sql, personId);
  const result = positionCheck(session, place, position);

  if (open && open.location_id === place.id && input.confirmExit !== true) return { action: "potwierdz_wyjscie", place: placeOf(place) };
  return applyPunch(sql, session, { personId, place, open, check: result, operationId: input.operationId, at: now, offline: false });
}

/** Zapisuje skan: wyjście, gdy osoba jest odbita w tym miejscu, przejście, gdy gdzie indziej, a inaczej wejście. */
async function applyPunch(
  sql: Sql,
  session: Session,
  scan: {
    personId: string;
    place: PlaceRow;
    open: { id: string; location_id: string } | null;
    check: PunchCheck;
    operationId: string;
    at: Date;
    offline: boolean;
  },
): Promise<SavedPunchOutcome> {
  const { open, operationId, at: now, offline } = scan;
  if (open && open.location_id === scan.place.id) {
    await closePunch(sql, open.id, { via: "wyjscie", check: scan.check, operationId, now, offline });
    return { action: "wyjscie", punch: await punchById(sql, open.id) };
  }
  if (open) await closePunch(sql, open.id, { via: "przejscie", check: null, operationId, now, offline });
  const punchId = await insertPunch(sql, session, { personId: scan.personId, placeId: scan.place.id, check: scan.check, operationId, now, offline });
  const entered = await punchById(sql, punchId);
  return open ? { action: "przejscie", left: await punchById(sql, open.id), punch: entered } : { action: "wejscie", punch: entered };
}

/**
 * Skan z kolejki offline telefonu, z czasem skanu (z przyszłości przycięty do teraz). Zapisuje się tak jak skan online
 * w chwili skanu, z oznaczeniem „zapisane offline”; wyjście z tej samej budowy telefon już potwierdził („Kończysz?”).
 * Skan, który nie pasuje do odbić zapisanych w międzyczasie, zapisuje się jako konflikt do wyjaśnienia. Ponowne
 * wysłanie tej samej operacji zwraca pierwotny wynik, także odbicie wysłane wcześniej online.
 */
export async function queuedPunch(sql: Sql, session: Session, input: QueuedPunchInput, now: Date): Promise<QueuedPunchResult> {
  if (!UUID_PATTERN.test(String(input.operationId))) throw new RegistryError("invalid_input");
  if (!(input.scannedAt instanceof Date) || Number.isNaN(input.scannedAt.getTime())) throw new RegistryError("invalid_input");
  const position = checkPosition(input.position);
  const replayed = await replayedPunch(sql, input.operationId);
  if (replayed) return { status: "registered", outcome: replayed };
  const [earlier] = await conflicts(sql, session, { operationId: input.operationId });
  if (earlier) return { status: "rejected", conflict: earlier };

  const scannedAt = input.scannedAt > now ? now : input.scannedAt;
  const confirmExit = input.confirmExit === true;
  const personId = await actorPerson(sql, session);
  const conflict = (reason: PunchConflictReason, place: PlaceRow | null) =>
    recordConflict(sql, session, { personId, place, operationId: input.operationId, scannedAt, now, confirmExit, reason, position });

  const place = await findPlaceByToken(sql, input.posterToken);
  if (!place || !place.address) return conflict("kod_niewazny", place);
  if (place.status === "zakonczona") return conflict("budowa_zakonczona", place);
  const [{ latest }] = await sql<{ latest: Date | null }>(
    "select max(coalesce(left_at, entered_at)) as latest from app.punches where person_id = $1",
    [personId],
  );
  if (latest !== null && new Date(latest) > scannedAt) return conflict("pozniejsze_odbicie", place);
  const open = await openPunchOf(sql, personId);
  const here = open !== null && open.location_id === place.id;
  if (here && !confirmExit) return conflict("juz_odbity_tu", place);
  if (!here && confirmExit) return conflict("nie_odbity_tu", place);
  const check = positionCheck(session, place, position);
  const outcome = await applyPunch(sql, session, { personId, place, open, check, operationId: input.operationId, at: scannedAt, offline: true });
  return { status: "registered", outcome };
}

async function recordConflict(
  sql: Sql,
  session: Session,
  scan: {
    personId: string;
    place: PlaceRow | null;
    operationId: string;
    scannedAt: Date;
    now: Date;
    confirmExit: boolean;
    reason: PunchConflictReason;
    position: PhonePosition | null;
  },
): Promise<QueuedPunchResult> {
  const check = scan.place ? positionCheck(session, scan.place, scan.position) : null;
  try {
    await sql(
      `insert into app.punch_conflicts (company_id, person_id, location_id, punched_by, operation_id, scanned_at, received_at,
                                        confirm_exit, reason, check_result, check_distance_m)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        session.company.id,
        scan.personId,
        scan.place?.id ?? null,
        session.userId,
        scan.operationId,
        scan.scannedAt,
        scan.now,
        scan.confirmExit,
        scan.reason,
        check?.result ?? null,
        check?.distanceM ?? null,
      ],
    );
  } catch (error) {
    if (isUniqueViolation(error, "punch_conflicts_operation_per_company")) throw new ReplayedOperationError();
    throw error;
  }
  const [conflict] = await conflicts(sql, session, { operationId: scan.operationId });
  return { status: "rejected", conflict };
}

interface ConflictRow {
  id: string;
  operation_id: string;
  person_id: string;
  person_name: string;
  location_id: string | null;
  location_kind: PunchPlaceKind | null;
  location_name: string | null;
  scanned_at: Date;
  received_at: Date;
  confirm_exit: boolean;
  reason: PunchConflictReason;
  check_result: PunchResult | null;
  check_distance_m: number | null;
}

/** Konflikty widoczne dla aktora (RLS): jeden po operacji albo te, które aktor może wyjaśnić, od najnowszego. */
async function conflicts(sql: Sql, session: Session, filter: { operationId: string } | { toClarify: true }): Promise<PunchConflict[]> {
  const byOperation = "operationId" in filter;
  const rows = await sql<ConflictRow>(
    `select c.id, c.operation_id, c.person_id, pe.full_name as person_name, c.location_id, l.kind as location_kind,
            l.name as location_name, c.scanned_at, c.received_at, c.confirm_exit, c.reason, c.check_result, c.check_distance_m
     from app.punch_conflicts c
     join app.people pe on pe.id = c.person_id
     left join app.locations l on l.id = c.location_id
     where ${
       byOperation
         ? "c.operation_id = $1 and c.company_id = $2"
         : "c.explained_at is null and ($1 or (l.manager_id = $2 and pe.user_id is distinct from $2))"
     }
     order by c.received_at desc, c.sequence_number desc`,
    byOperation ? [filter.operationId, session.company.id] : [session.role === "wlasciciel", session.userId],
  );
  return rows.map((row) => ({
    id: row.id,
    operationId: row.operation_id,
    person: { id: row.person_id, fullName: row.person_name },
    place: row.location_id === null ? null : { id: row.location_id, kind: row.location_kind!, name: row.location_name! },
    scannedAt: new Date(row.scanned_at),
    receivedAt: new Date(row.received_at),
    confirmExit: row.confirm_exit,
    check: row.check_result === null ? null : { result: row.check_result, distanceM: row.check_distance_m },
    reason: row.reason,
  }));
}

/**
 * Skany z kolejki offline do wyjaśnienia, które aktor może wyjaśnić: właściciel wszystkie, kierownik na budowach,
 * których jest kierownikiem, bez własnych. Od najnowszego.
 */
export function punchConflictsToClarify(sql: Sql, session: Session): Promise<PunchConflict[]> {
  requirePunchClarifier(session);
  return conflicts(sql, session, { toClarify: true });
}

/** „Wyjaśnione” z opcjonalną notatką: konflikt znika z listy. Wyjaśniony drugi raz niczego nie zmienia. */
export async function explainPunchConflict(sql: Sql, session: Session, input: ExplainPunchConflictInput, now: Date) {
  requirePunchClarifier(session);
  const note = String(input.note ?? "").trim() || null;
  if (note !== null && note.length > MAX_PUNCH_EXPLANATION_LENGTH) throw new RegistryError("invalid_input");
  const [row] = UUID_PATTERN.test(String(input.conflictId))
    ? await sql<{ manager_id: string | null; own: boolean; explained: boolean }>(
        `select l.manager_id, pe.user_id is not distinct from $2 as own, c.explained_at is not null as explained
         from app.punch_conflicts c join app.people pe on pe.id = c.person_id left join app.locations l on l.id = c.location_id
         where c.id = $1`,
        [input.conflictId, session.userId],
      )
    : [];
  if (!row) throw new RegistryError("not_found");
  const allowed = session.role === "wlasciciel" || (session.role === "kierownik" && row.manager_id === session.userId && !row.own);
  if (!allowed) throw new RegistryError("forbidden");
  if (row.explained) return;
  await sql("update app.punch_conflicts set explained_at = $2, explained_by = $3, explanation = $4 where id = $1", [
    input.conflictId,
    now,
    session.userId,
    note,
  ]);
}

async function insertPunch(
  sql: Sql,
  session: Session,
  entry: { personId: string; placeId: string; check: PunchCheck; operationId: string; now: Date; offline: boolean },
): Promise<string> {
  try {
    const [row] = await sql<{ id: string }>(
      `insert into app.punches (company_id, person_id, location_id, punched_by, entered_at, entry_result, entry_distance_m,
                                entry_operation_id, entry_offline)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      [
        session.company.id,
        entry.personId,
        entry.placeId,
        session.userId,
        entry.now,
        entry.check.result,
        entry.check.distanceM,
        entry.operationId,
        entry.offline,
      ],
    );
    return row.id;
  } catch (error) {
    throw concurrencyError(error);
  }
}

async function closePunch(
  sql: Sql,
  punchId: string,
  exit: { via: PunchExitVia; check: PunchCheck | null; operationId: string; now: Date; offline: boolean },
) {
  try {
    const closed = await sql(
      `update app.punches set left_at = $2, exit_via = $3, exit_result = $4, exit_distance_m = $5, exit_operation_id = $6,
                              exit_offline = $7
       where id = $1 and left_at is null returning id`,
      [punchId, exit.now, exit.via, exit.check?.result ?? null, exit.check?.distanceM ?? null, exit.operationId, exit.offline],
    );
    // Równoległy skan tej osoby zamknął to odbicie po naszym odczycie.
    if (closed.length === 0) throw new ConcurrentPunchError();
  } catch (error) {
    throw concurrencyError(error);
  }
}

/** Wyścig dwóch skanów tej samej osoby albo tej samej operacji: drugie podejście zobaczy wynik pierwszego. */
function concurrencyError(error: unknown) {
  if (isUniqueViolation(error, "punches_entry_operation_per_company") || isUniqueViolation(error, "punches_exit_operation_per_company")) {
    return new ReplayedOperationError();
  }
  if (isUniqueViolation(error, "punches_one_open_per_person")) return new ConcurrentPunchError();
  return error;
}

/** Zakładka „Ludzie na budowie” budowy albo bazy: odbici teraz i ostatnie odbicia, które aktor widzi (RLS). */
export async function peopleOnSite(sql: Sql, locationId: string): Promise<PeopleOnSite> {
  const place = await requirePlace(sql, locationId);
  const present = await sql<PunchRow>(`${PUNCH_SELECT} where p.location_id = $1 and p.left_at is null order by pe.full_name, p.sequence_number`, [
    place.id,
  ]);
  const history = await sql<PunchRow>(`${PUNCH_SELECT} where p.location_id = $1 order by p.entered_at desc, p.sequence_number desc limit $2`, [
    place.id,
    HISTORY_LIMIT,
  ]);
  return {
    place: placeOf(place),
    radiusM: place.punch_radius_m,
    positioned: place.latitude !== null,
    present: present.map(punchFromRow),
    history: history.map(punchFromRow),
  };
}

/**
 * Odbicia do wyjaśnienia, które aktor może wyjaśnić: właściciel wszystkie, kierownik na budowach, których jest
 * kierownikiem, bez własnych (te wyjaśnia właściciel). Od najnowszego skanu.
 */
export async function punchesToClarify(sql: Sql, session: Session): Promise<Punch[]> {
  requirePunchClarifier(session);
  const rows = await sql<PunchRow>(
    `${PUNCH_SELECT}
     where ${TO_CLARIFY}
       and ($1 or (l.manager_id = $2 and pe.user_id is distinct from $2))
     order by coalesce(p.left_at, p.entered_at) desc, p.sequence_number desc`,
    [session.role === "wlasciciel", session.userId],
  );
  return rows.map(punchFromRow);
}

/** „Wyjaśnione” z opcjonalną notatką: odbicie znika z listy do wyjaśnienia. Wyjaśnione drugi raz niczego nie zmienia. */
export async function explainPunch(sql: Sql, session: Session, input: ExplainPunchInput, now: Date) {
  requirePunchClarifier(session);
  const note = String(input.note ?? "").trim() || null;
  if (note !== null && note.length > MAX_PUNCH_EXPLANATION_LENGTH) throw new RegistryError("invalid_input");
  const [row] = UUID_PATTERN.test(String(input.punchId))
    ? await sql<{ manager_id: string | null; own: boolean; explained: boolean; flagged: boolean }>(
        `select l.manager_id, pe.user_id is not distinct from $2 as own, p.explained_at is not null as explained, ${FLAGGED} as flagged
         from app.punches p join app.locations l on l.id = p.location_id join app.people pe on pe.id = p.person_id
         where p.id = $1`,
        [input.punchId, session.userId],
      )
    : [];
  if (!row) throw new RegistryError("not_found");
  const allowed = session.role === "wlasciciel" || (session.role === "kierownik" && row.manager_id === session.userId && !row.own);
  if (!allowed || !row.flagged) throw new RegistryError("forbidden");
  if (row.explained) return;
  await sql("update app.punches set explained_at = $2, explained_by = $3, explanation = $4 where id = $1", [input.punchId, now, session.userId, note]);
}

/** Plakat budowy (właściciel albo jej kierownik) albo bazy z adresem (właściciel). */
export async function poster(sql: Sql, session: Session, locationId: string): Promise<Poster> {
  const place = await requirePlace(sql, locationId);
  if (!canPrintPoster(session, { kind: place.kind, managerId: place.manager_id })) throw new RegistryError("forbidden");
  if (place.status === "zakonczona") throw new RegistryError("site_finished");
  if (!place.address) throw new RegistryError("poster_no_address");
  const [{ token }] = await sql<{ token: string }>("select poster_token as token from app.locations where id = $1", [place.id]);
  return { companyName: session.company.name, place: placeOf(place), address: place.address, code: token };
}

/** „Nowy kod”: stary plakat przestaje działać. Właściciel, a na swojej budowie jej kierownik. */
export async function renewPosterToken(sql: Sql, session: Session, locationId: string) {
  const place = await requirePlace(sql, locationId);
  if (!canPrintPoster(session, { kind: place.kind, managerId: place.manager_id })) throw new RegistryError("forbidden");
  if (place.status === "zakonczona") throw new RegistryError("site_finished");
  const [{ token }] = await sql<{ token: string | null }>("select app.renew_poster_token($1) as token", [place.id]);
  if (!token) throw new RegistryError("forbidden");
}

/** Promień odbicia budowy albo bazy w metrach (50–5000). Tylko właściciel. */
export async function setPunchRadius(sql: Sql, session: Session, locationId: string, radiusM: number) {
  if (!canSetPunchRadius(session)) throw new RegistryError("forbidden");
  if (!Number.isInteger(radiusM) || radiusM < MIN_PUNCH_RADIUS_M || radiusM > MAX_PUNCH_RADIUS_M) throw new RegistryError("invalid_input");
  const place = await requirePlace(sql, locationId);
  if (place.status === "zakonczona") throw new RegistryError("site_finished");
  await sql("update app.locations set punch_radius_m = $2 where id = $1", [place.id, radiusM]);
}
