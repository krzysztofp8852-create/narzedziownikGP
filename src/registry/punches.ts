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
export const MAX_PUNCH_CORRECTION_REASON_LENGTH = 500;
/** Tyle osób odbija się najwyżej jednym zatwierdzeniem listy „Odbij też…”. */
export const MAX_PEOPLE_PER_PUNCH = 100;

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
/**
 * Jak skończył się pobyt: skanem (`wyjscie`, `przejscie`), zamknięciem o północy, gdy nikt nie odbił wyjścia
 * (`bez_wyjscia`), albo wyjściem wpisanym poprawką (`uzupelnione`).
 */
export type PunchEnd = PunchExitVia | "bez_wyjscia" | "uzupelnione";

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
  /** null: osoba jest tu odbita teraz. Przy odbiciu „bez wyjścia” północ, o której się zamknęło. */
  leftAt: Date | null;
  exitVia: PunchEnd | null;
  /** Tylko przy wyjściu skanem na tej budowie. */
  exit: PunchCheck | null;
  explained: { at: Date; byName: string; note: string | null } | null;
  /** Wynik wejścia albo wyjścia inny niż „na budowie” albo odbicie „bez wyjścia”, jeszcze niewyjaśnione. */
  toClarify: boolean;
  /** Czas na budowie od wejścia do wyjścia; null, gdy osoba jest tu odbita teraz albo odbicie jest „bez wyjścia”. */
  timeOnSiteMs: number | null;
  /** Poprawki godzin wejścia i wyjścia, po kolei. */
  corrections: PunchCorrection[];
  /** Czy aktor może poprawić godziny tego odbicia. */
  correctable: boolean;
  /** Wejście doszło z kolejki offline telefonu: „zapisane offline”. */
  entryOffline: boolean;
  /** Wyjście (także przejście) doszło z kolejki offline telefonu. */
  exitOffline: boolean;
  /** Kto odbił wejście za tę osobę („odbił: X”); null, gdy osoba sama. */
  entryPunchedByName: string | null;
  /** Kto odbił wyjście albo przejście za tę osobę; null, gdy osoba sama albo jeszcze nie wyszła. */
  exitPunchedByName: string | null;
}

/** Którą godzinę odbicia poprawia poprawka. */
export type PunchCorrectionField = "wejscie" | "wyjscie";

/** Poprawka godziny wejścia albo wyjścia, z powodem, w historii odbicia. */
export interface PunchCorrection {
  field: PunchCorrectionField;
  /** Godzina sprzed poprawki; null, gdy wyjścia nie było (osoba odbita teraz albo odbicie „bez wyjścia”). */
  from: Date | null;
  to: Date;
  reason: string;
  byName: string;
  at: Date;
}

/** Prawdziwa godzina wejścia, wyjścia albo obu naraz (co najmniej jedna), z powodem. */
export interface CorrectPunchInput {
  punchId: string;
  enteredAt?: Date;
  leftAt?: Date;
  reason: string;
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

/**
 * Wynik odbicia osoby z listy „Odbij też…”: jak przy własnym skanie, a do tego `nie_odbity_tu`, gdy lista pokazała
 * wyjście, a ktoś w międzyczasie odbił tę osobę gdzie indziej (nic się dla niej nie zapisało).
 */
export type PersonPunchOutcome = PunchOutcome | { action: "nie_odbity_tu"; place: PunchPlace };

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

/** Osoba zaznaczona na liście „Odbij też…”: co zrobi dla niej skan plakatu, na którym stoi odbijający. */
export interface PersonToPunch {
  person: { id: string; fullName: string };
  action: PunchAction;
  /** Skąd przejście. */
  from: PunchPlace | null;
}

/** Odbicie osób z kartoteki przez właściciela albo kierownika po skanie plakatu („Odbij też…”). */
export interface PunchPeopleInput {
  posterToken: string;
  /** Położenie telefonu odbijającego; null: telefon nie podał położenia. */
  position: PhonePosition | null;
  /**
   * Każda osoba z własnym identyfikatorem operacji (ponowne wysłanie zwraca jej pierwotne odbicie). `confirmExit`:
   * lista pokazała przy osobie wyjście i odbijający ją zaznaczył.
   */
  people: { personId: string; operationId: string; confirmExit?: boolean }[];
}

/** Skan plakatu zrobiony bez zasięgu, wysłany z kolejki offline telefonu. */
export interface QueuedPunchInput extends PunchInput {
  /** Chwila skanu w telefonie: czas wejścia albo wyjścia. */
  scannedAt: Date;
  /** Osoba z kartoteki odbijana przez właściciela albo kierownika; bez niej aktor odbija siebie. */
  personId?: string;
}

/** Odbicie zapisane z czasem skanu albo konflikt do wyjaśnienia (nic się nie zapisało). */
export type QueuedPunchResult =
  | { status: "registered"; outcome: SavedPunchOutcome }
  | { status: "rejected"; conflict: PunchConflict };

export const PUNCH_CONFLICT_REASONS = [
  "kod_niewazny",
  "budowa_zakonczona",
  "pozniejsze_odbicie",
  "nie_odbity_tu",
  "juz_odbity_tu",
  "osoba_nieaktywna",
] as const;
/**
 * Dlaczego skan z kolejki się nie zapisał: kodu plakatu już nie ma (np. „Nowy kod”), budowę zakończono, osoba ma
 * odbicie późniejsze niż skan, telefon potwierdził wyjście, a osoba nie jest tu odbita, telefon nie wiedział,
 * że osoba jest tu już odbita (wyjście bez pytania „Kończysz?” by jej skończyło dzień), albo osoba odbijana przez
 * kierownika przestała być aktywna.
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
  /** Kto odbijał za tę osobę; null, gdy osoba sama. */
  punchedByName: string | null;
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

/** Godziny odbić poprawiają właściciel i kierownik (na swoich budowach); pracownik i magazynier żadnych, także własnych. */
export function canCorrectPunches(session: Session) {
  return session.role === "wlasciciel" || session.role === "kierownik";
}

/** Osoby z kartoteki („Odbij też…”) odbijają po skanie właściciel i kierownik; pracownik i magazynier tylko siebie. */
export function canPunchOthers(session: Session) {
  return session.role === "wlasciciel" || session.role === "kierownik";
}

function requirePunchOthers(session: Session) {
  if (!canPunchOthers(session)) throw new RegistryError("forbidden");
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
  exit_via: PunchEnd | null;
  exit_result: PunchResult | null;
  exit_distance_m: number | null;
  explained_at: Date | null;
  explained_by_name: string | null;
  explanation: string | null;
  entry_offline: boolean;
  exit_offline: boolean;
  entry_punched_by_name: string | null;
  exit_punched_by_name: string | null;
  person_user_id: string | null;
  manager_id: string | null;
  corrections: { field: PunchCorrectionField; from_at: string | null; to_at: string; reason: string; by_name: string | null; corrected_at: string }[];
}

const PUNCH_SELECT = `
  select p.id, p.person_id, pe.full_name as person_name, p.location_id, l.kind as location_kind, l.name as location_name,
         p.entered_at, p.entry_result, p.entry_distance_m, p.left_at, p.exit_via, p.exit_result, p.exit_distance_m,
         p.explained_at, eu.full_name as explained_by_name, p.explanation, p.entry_offline, p.exit_offline,
         case when p.punched_by is distinct from pe.user_id then bu.full_name end as entry_punched_by_name,
         case when p.exit_punched_by is distinct from pe.user_id then xu.full_name end as exit_punched_by_name,
         pe.user_id as person_user_id, l.manager_id,
         coalesce((
           select json_agg(json_build_object('field', c.field, 'from_at', c.from_at, 'to_at', c.to_at, 'reason', c.reason,
                                             'by_name', cu.full_name, 'corrected_at', c.corrected_at) order by c.sequence_number)
           from app.punch_corrections c left join app.users cu on cu.user_id = c.corrected_by
           where c.punch_id = p.id
         ), '[]') as corrections
  from app.punches p
  join app.people pe on pe.id = p.person_id
  join app.locations l on l.id = p.location_id
  left join app.users eu on eu.user_id = p.explained_by
  left join app.users bu on bu.user_id = p.punched_by
  left join app.users xu on xu.user_id = p.exit_punched_by`;

/**
 * Odbicie `p` z wynikiem wejścia albo wyjścia innym niż „na budowie” albo „bez wyjścia” (ten sam warunek sprawdza
 * wyzwalacz w bazie).
 */
const FLAGGED = "(p.entry_result <> 'na_budowie' or coalesce(p.exit_result, 'na_budowie') <> 'na_budowie' or p.exit_via = 'bez_wyjscia')";
/** Warunek „do wyjaśnienia”: odbicie z oznaczeniem, jeszcze niewyjaśnione. */
const TO_CLARIFY = `p.explained_at is null and ${FLAGGED}`;

/**
 * Odbicie poprawia właściciel albo kierownik budowy, jeśli nie jest jego własne (te poprawia właściciel). Odbicia
 * brygady, które kierownik sam odbił, poprawia też on: i tak decyduje, kiedy je odbija. Ten sam warunek sprawdza
 * polityka `punch_corrections_insert`.
 */
function mayCorrect(session: Session, row: Pick<PunchRow, "manager_id" | "person_user_id">) {
  if (session.role === "wlasciciel") return true;
  return session.role === "kierownik" && row.manager_id === session.userId && row.person_user_id !== session.userId;
}

function punchFromRow(row: PunchRow, session: Session): Punch {
  const flagged =
    row.entry_result !== "na_budowie" || (row.exit_result !== null && row.exit_result !== "na_budowie") || row.exit_via === "bez_wyjscia";
  const enteredAt = new Date(row.entered_at);
  const leftAt = row.left_at === null ? null : new Date(row.left_at);
  return {
    id: row.id,
    person: { id: row.person_id, fullName: row.person_name },
    place: { id: row.location_id, kind: row.location_kind, name: row.location_name },
    enteredAt,
    entry: { result: row.entry_result, distanceM: row.entry_distance_m },
    leftAt,
    exitVia: row.exit_via,
    exit: row.exit_result === null ? null : { result: row.exit_result, distanceM: row.exit_distance_m },
    explained:
      row.explained_at === null ? null : { at: new Date(row.explained_at), byName: row.explained_by_name ?? "", note: row.explanation },
    toClarify: flagged && row.explained_at === null,
    timeOnSiteMs: leftAt === null || row.exit_via === "bez_wyjscia" ? null : leftAt.getTime() - enteredAt.getTime(),
    corrections: row.corrections.map((correction) => ({
      field: correction.field,
      from: correction.from_at === null ? null : new Date(correction.from_at),
      to: new Date(correction.to_at),
      reason: correction.reason,
      byName: correction.by_name ?? "",
      at: new Date(correction.corrected_at),
    })),
    correctable: mayCorrect(session, row),
    entryOffline: row.entry_offline,
    exitOffline: row.exit_offline,
    entryPunchedByName: row.entry_punched_by_name,
    exitPunchedByName: row.left_at === null ? null : row.exit_punched_by_name,
  };
}

async function punchById(sql: Sql, session: Session, punchId: string): Promise<Punch> {
  const [row] = await sql<PunchRow>(`${PUNCH_SELECT} where p.id = $1`, [punchId]);
  return punchFromRow(row, session);
}

/** Otwarte odbicie osoby: gdzie jest odbita teraz. */
interface OpenPunch {
  id: string;
  location_id: string;
  location_kind: PunchPlaceKind;
  location_name: string;
}

/**
 * Stan odbić aktywnej osoby: otwarte odbicie (najwyżej jedno) i chwila ostatniego odbicia. Kierownik nie widzi odbić
 * na budowach, których nie prowadzi, więc stan podaje funkcja w bazie: osobie i tym, którzy mogą ją odbić, bez
 * historii. Nieaktywna osoba, osoba innej firmy albo aktor, który jej nie odbija: `not_found`.
 */
async function punchStateOf(sql: Sql, personId: string): Promise<{ open: OpenPunch | null; latest: Date | null }> {
  const [state] = await sql<{
    open_punch_id: string | null;
    location_id: string | null;
    location_kind: PunchPlaceKind | null;
    location_name: string | null;
    latest: Date | null;
  }>(
    `select s.open_punch_id, s.open_location_id as location_id, l.kind as location_kind, l.name as location_name, s.latest
     from app.punch_state($1) s left join app.locations l on l.id = s.open_location_id`,
    [personId],
  );
  if (!state) throw new RegistryError("not_found");
  const open =
    state.open_punch_id === null
      ? null
      : { id: state.open_punch_id, location_id: state.location_id!, location_kind: state.location_kind!, location_name: state.location_name! };
  return { open, latest: state.latest === null ? null : new Date(state.latest) };
}

const placeOfOpen = (open: OpenPunch): PunchPlace => ({ id: open.location_id, kind: open.location_kind, name: open.location_name });

/** Zapisane wejście, wyjście albo przejście (bez pytania o potwierdzenie wyjścia). */
export type SavedPunchOutcome = Exclude<PunchOutcome, { action: "potwierdz_wyjscie" }>;

/** Co zrobi skan plakatu `posterToken` przez aktora; niczego nie zapisuje. */
export async function punchPreview(sql: Sql, session: Session, posterToken: string): Promise<PunchPreview> {
  const place = await placeByToken(sql, posterToken);
  const { open } = await punchStateOf(sql, await actorPerson(sql, session));
  return { place: placeOf(place), ...scanAction(place, open) };
}

/** Co zrobi skan w miejscu `place` dla osoby z otwartym odbiciem `open`. */
function scanAction(place: PlaceRow, open: OpenPunch | null): { action: PunchAction; from: PunchPlace | null } {
  if (!open) return { action: "wejscie", from: null };
  return open.location_id === place.id ? { action: "wyjscie", from: null } : { action: "przejscie", from: placeOfOpen(open) };
}

/**
 * Lista „Odbij też…” po skanie plakatu: aktywne osoby z kartoteki oprócz aktora, z tym, co zrobi dla każdej skan
 * (najpierw odbite tutaj, potem po imieniu i nazwisku). Właściciel i kierownik; niczego nie zapisuje.
 */
export async function punchPeoplePreview(sql: Sql, session: Session, posterToken: string): Promise<PersonToPunch[]> {
  requirePunchOthers(session);
  const place = await placeByToken(sql, posterToken);
  const rows = await sql<{ id: string; full_name: string; open: OpenPunch | null }>(
    `select pe.id, pe.full_name,
            case when s.open_punch_id is not null then json_build_object(
              'id', s.open_punch_id, 'location_id', s.open_location_id, 'location_kind', l.kind, 'location_name', l.name) end as open
     from app.people pe
     cross join lateral app.punch_state(pe.id) s
     left join app.locations l on l.id = s.open_location_id
     where pe.active and pe.user_id is distinct from $1
     order by s.open_location_id is not distinct from $2 desc, pe.full_name, pe.id`,
    [session.userId, place.id],
  );
  return rows.map((row) => ({ person: { id: row.id, fullName: row.full_name }, ...scanAction(place, row.open) }));
}

/** Odbicie zapisane już tą operacją (powtórzone wysłanie), z tym samym wynikiem co za pierwszym razem. */
async function replayedPunch(sql: Sql, session: Session, operationId: string): Promise<SavedPunchOutcome | null> {
  const rows = await sql<{ id: string; entry: boolean }>(
    `select id, entry_operation_id = $1 as entry from app.punches where entry_operation_id = $1 or exit_operation_id = $1`,
    [operationId],
  );
  const entered = rows.find((row) => row.entry);
  const left = rows.find((row) => !row.entry);
  if (entered && left) return { action: "przejscie", left: await punchById(sql, session, left.id), punch: await punchById(sql, session, entered.id) };
  if (entered) return { action: "wejscie", punch: await punchById(sql, session, entered.id) };
  if (left) return { action: "wyjscie", punch: await punchById(sql, session, left.id) };
  return null;
}

/**
 * Skan plakatu przez aktora: wejście, wyjście z potwierdzeniem albo przejście, z wynikiem sprawdzenia położenia.
 * Współrzędnych telefonu nigdzie nie zapisuje.
 */
export async function punch(sql: Sql, session: Session, input: PunchInput, now: Date): Promise<PunchOutcome> {
  if (!UUID_PATTERN.test(String(input.operationId))) throw new RegistryError("invalid_input");
  const position = checkPosition(input.position);
  const replayed = await replayedPunch(sql, session, input.operationId);
  if (replayed) return replayed;
  const place = await placeByToken(sql, input.posterToken);
  const personId = await actorPerson(sql, session);
  const { open } = await punchStateOf(sql, personId);
  const result = positionCheck(session, place, position);

  if (open && open.location_id === place.id && input.confirmExit !== true) return { action: "potwierdz_wyjscie", place: placeOf(place) };
  return applyPunch(sql, session, { personId, own: true, place, open, check: result, operationId: input.operationId, at: now, offline: false });
}

/**
 * „Odbij też…”: właściciel albo kierownik po skanie plakatu odbija zaznaczone osoby z kartoteki. Dla każdej ta sama
 * logika co przy własnym skanie (wejście, wyjście, przejście), z wynikiem sprawdzenia położenia odbijającego
 * i oznaczeniem „odbił: X”. Wyjście tylko z potwierdzeniem przy osobie; bez niego `potwierdz_wyjscie` i nic się dla
 * niej nie zapisuje, a potwierdzone wyjście osoby, która nie jest już tu odbita, to `nie_odbity_tu`. Wyniki
 * w kolejności osób.
 */
export async function punchPeople(sql: Sql, session: Session, input: PunchPeopleInput, now: Date): Promise<PersonPunchOutcome[]> {
  requirePunchOthers(session);
  const people = checkPeople(input.people);
  const position = checkPosition(input.position);
  const ownId = await actorPerson(sql, session);
  if (people.some((person) => person.personId === ownId)) throw new RegistryError("invalid_input");
  const replayed: (SavedPunchOutcome | null)[] = [];
  for (const person of people) replayed.push(await replayedPunch(sql, session, person.operationId));
  // Ponowka całej listy działa także po „Nowy kod”, tak jak przy własnym skanie.
  if (replayed.every((outcome) => outcome !== null)) return replayed as SavedPunchOutcome[];

  const place = await placeByToken(sql, input.posterToken);
  const check = positionCheck(session, place, position);
  const outcomes: PersonPunchOutcome[] = [];
  for (const [index, person] of people.entries()) {
    const earlier = replayed[index];
    if (earlier) {
      outcomes.push(earlier);
      continue;
    }
    const { open } = await punchStateOf(sql, person.personId);
    const here = open !== null && open.location_id === place.id;
    if (here !== (person.confirmExit === true)) {
      outcomes.push({ action: here ? "potwierdz_wyjscie" : "nie_odbity_tu", place: placeOf(place) });
      continue;
    }
    const scan = { personId: person.personId, own: false, place, open, check, operationId: person.operationId, at: now, offline: false };
    outcomes.push(await applyPunch(sql, session, scan));
  }
  return outcomes;
}

/** Lista osób do odbicia po sprawdzeniu: niepusta, bez powtórzeń, z poprawnymi identyfikatorami. */
function checkPeople(raw: PunchPeopleInput["people"]): PunchPeopleInput["people"] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_PEOPLE_PER_PUNCH) throw new RegistryError("invalid_input");
  const people = raw.map((person) => ({
    personId: String(person?.personId),
    operationId: String(person?.operationId),
    confirmExit: person?.confirmExit === true,
  }));
  const valid = people.every((person) => UUID_PATTERN.test(person.personId) && UUID_PATTERN.test(person.operationId));
  const distinct = (values: string[]) => new Set(values).size === values.length;
  if (!valid || !distinct(people.map((person) => person.personId)) || !distinct(people.map((person) => person.operationId))) {
    throw new RegistryError("invalid_input");
  }
  return people;
}

/** Zapisuje skan: wyjście, gdy osoba jest odbita w tym miejscu, przejście, gdy gdzie indziej, a inaczej wejście. */
async function applyPunch(
  sql: Sql,
  session: Session,
  scan: {
    personId: string;
    /** Aktor odbija siebie; inaczej osobę z kartoteki („Odbij też…”). */
    own: boolean;
    place: PlaceRow;
    open: { id: string; location_id: string } | null;
    check: PunchCheck;
    operationId: string;
    at: Date;
    offline: boolean;
  },
): Promise<SavedPunchOutcome> {
  const { open, own, operationId, at: now, offline } = scan;
  if (open && open.location_id === scan.place.id) {
    await closePunch(sql, session, open.id, { via: "wyjscie", check: scan.check, operationId, now, offline, own });
    return { action: "wyjscie", punch: await punchById(sql, session, open.id) };
  }
  if (open) await closePunch(sql, session, open.id, { via: "przejscie", check: null, operationId, now, offline, own });
  const punchId = await insertPunch(sql, session, { personId: scan.personId, placeId: scan.place.id, check: scan.check, operationId, now, offline });
  const entered = await punchById(sql, session, punchId);
  return open ? { action: "przejscie", left: await punchById(sql, session, open.id), punch: entered } : { action: "wejscie", punch: entered };
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
  const replayed = await replayedPunch(sql, session, input.operationId);
  if (replayed) return { status: "registered", outcome: replayed };
  const [earlier] = await conflicts(sql, session, { operationId: input.operationId });
  if (earlier) return { status: "rejected", conflict: earlier };

  const scannedAt = input.scannedAt > now ? now : input.scannedAt;
  const confirmExit = input.confirmExit === true;
  const { personId, own, active } = await queuedPerson(sql, session, input.personId);
  const conflict = (reason: PunchConflictReason, place: PlaceRow | null) =>
    recordConflict(sql, session, { personId, place, operationId: input.operationId, scannedAt, now, confirmExit, reason, position });

  const place = await findPlaceByToken(sql, input.posterToken);
  if (!active) return conflict("osoba_nieaktywna", place);
  if (!place || !place.address) return conflict("kod_niewazny", place);
  if (place.status === "zakonczona") return conflict("budowa_zakonczona", place);
  const { open, latest } = await punchStateOf(sql, personId);
  if (latest !== null && latest > scannedAt) return conflict("pozniejsze_odbicie", place);
  const here = open !== null && open.location_id === place.id;
  if (here && !confirmExit) return conflict("juz_odbity_tu", place);
  if (!here && confirmExit) return conflict("nie_odbity_tu", place);
  const check = positionCheck(session, place, position);
  const scan = { personId, own, place, open, check, operationId: input.operationId, at: scannedAt, offline: true };
  return { status: "registered", outcome: await applyPunch(sql, session, scan) };
}

/**
 * Kogo odbija skan z kolejki: aktora albo osobę z kartoteki (tylko właściciel i kierownik). Osoba, która przed
 * wysłaniem przestała być aktywna, idzie do wyjaśnienia; osoby spoza firmy nie ma (`not_found`).
 */
async function queuedPerson(sql: Sql, session: Session, personId: string | undefined): Promise<{ personId: string; own: boolean; active: boolean }> {
  const ownId = await actorPerson(sql, session);
  if (personId === undefined) return { personId: ownId, own: true, active: true };
  requirePunchOthers(session);
  if (!UUID_PATTERN.test(String(personId)) || personId === ownId) throw new RegistryError("invalid_input");
  const [person] = await sql<{ active: boolean }>("select active from app.people where id = $1", [personId]);
  if (!person) throw new RegistryError("not_found");
  return { personId, own: false, active: person.active };
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
  punched_by_name: string | null;
}

/** Konflikty widoczne dla aktora (RLS): jeden po operacji albo te, które aktor może wyjaśnić, od najnowszego. */
async function conflicts(sql: Sql, session: Session, filter: { operationId: string } | { toClarify: true }): Promise<PunchConflict[]> {
  const byOperation = "operationId" in filter;
  const rows = await sql<ConflictRow>(
    `select c.id, c.operation_id, c.person_id, pe.full_name as person_name, c.location_id, l.kind as location_kind,
            l.name as location_name, c.scanned_at, c.received_at, c.confirm_exit, c.reason, c.check_result, c.check_distance_m,
            case when c.punched_by is distinct from pe.user_id then bu.full_name end as punched_by_name
     from app.punch_conflicts c
     join app.people pe on pe.id = c.person_id
     left join app.locations l on l.id = c.location_id
     left join app.users bu on bu.user_id = c.punched_by
     where ${
       byOperation
         ? "c.operation_id = $1 and c.company_id = $2"
         : "c.explained_at is null and ($1 or (l.manager_id = $2 and pe.user_id is distinct from $2 and c.punched_by <> $2))"
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
    punchedByName: row.punched_by_name,
  }));
}

/**
 * Skany z kolejki offline do wyjaśnienia, które aktor może wyjaśnić: właściciel wszystkie, kierownik na budowach,
 * których jest kierownikiem, bez własnych i bez tych, które sam odbijał. Od najnowszego.
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
    ? await sql<{ manager_id: string | null; mine: boolean; explained: boolean }>(
        `select l.manager_id, (pe.user_id is not distinct from $2 or c.punched_by = $2) as mine, c.explained_at is not null as explained
         from app.punch_conflicts c join app.people pe on pe.id = c.person_id left join app.locations l on l.id = c.location_id
         where c.id = $1`,
        [input.conflictId, session.userId],
      )
    : [];
  if (!row) throw new RegistryError("not_found");
  const allowed = session.role === "wlasciciel" || (session.role === "kierownik" && row.manager_id === session.userId && !row.mine);
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

/**
 * Wyjście albo przejście. Własne odbicie aktor zamyka wprost; odbicie osoby z kartoteki zamyka funkcja w bazie, bo
 * kierownik może przenosić osobę z budowy, której odbić nie widzi.
 */
async function closePunch(
  sql: Sql,
  session: Session,
  punchId: string,
  exit: { via: PunchExitVia; check: PunchCheck | null; operationId: string; now: Date; offline: boolean; own: boolean },
) {
  const values = [punchId, exit.now, exit.via, exit.check?.result ?? null, exit.check?.distanceM ?? null, exit.operationId, exit.offline];
  try {
    const closed = exit.own
      ? (
          await sql(
            `update app.punches set left_at = $2, exit_via = $3, exit_result = $4, exit_distance_m = $5, exit_operation_id = $6,
                                    exit_offline = $7, exit_punched_by = $8
             where id = $1 and left_at is null returning id`,
            [...values, session.userId],
          )
        ).length > 0
      : (await sql<{ closed: boolean }>("select app.close_punch_of($1, $2, $3, $4, $5, $6, $7) as closed", values))[0].closed;
    // Równoległy skan tej osoby zamknął to odbicie po naszym odczycie.
    if (!closed) throw new ConcurrentPunchError();
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
export async function peopleOnSite(sql: Sql, session: Session, locationId: string): Promise<PeopleOnSite> {
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
    present: present.map((row) => punchFromRow(row, session)),
    history: history.map((row) => punchFromRow(row, session)),
  };
}

/**
 * Odbicia do wyjaśnienia, które aktor może wyjaśnić: właściciel wszystkie, kierownik na budowach, których jest
 * kierownikiem, bez własnych i bez tych, które sam odbił (te wyjaśnia właściciel). Od najnowszego skanu.
 */
export async function punchesToClarify(sql: Sql, session: Session): Promise<Punch[]> {
  requirePunchClarifier(session);
  const rows = await sql<PunchRow>(
    `${PUNCH_SELECT}
     where ${TO_CLARIFY}
       and ($1 or (l.manager_id = $2 and pe.user_id is distinct from $2 and p.punched_by <> $2 and p.exit_punched_by is distinct from $2))
     order by coalesce(p.left_at, p.entered_at) desc, p.sequence_number desc`,
    [session.role === "wlasciciel", session.userId],
  );
  return rows.map((row) => punchFromRow(row, session));
}

/** „Wyjaśnione” z opcjonalną notatką: odbicie znika z listy do wyjaśnienia. Wyjaśnione drugi raz niczego nie zmienia. */
export async function explainPunch(sql: Sql, session: Session, input: ExplainPunchInput, now: Date) {
  requirePunchClarifier(session);
  const note = String(input.note ?? "").trim() || null;
  if (note !== null && note.length > MAX_PUNCH_EXPLANATION_LENGTH) throw new RegistryError("invalid_input");
  const [row] = UUID_PATTERN.test(String(input.punchId))
    ? await sql<{ manager_id: string | null; mine: boolean; explained: boolean; flagged: boolean }>(
        `select l.manager_id, (pe.user_id is not distinct from $2 or p.punched_by = $2 or p.exit_punched_by is not distinct from $2) as mine,
                p.explained_at is not null as explained, ${FLAGGED} as flagged
         from app.punches p join app.locations l on l.id = p.location_id join app.people pe on pe.id = p.person_id
         where p.id = $1`,
        [input.punchId, session.userId],
      )
    : [];
  if (!row) throw new RegistryError("not_found");
  const allowed = session.role === "wlasciciel" || (session.role === "kierownik" && row.manager_id === session.userId && !row.mine);
  if (!allowed || !row.flagged) throw new RegistryError("forbidden");
  if (row.explained) return;
  await sql("update app.punches set explained_at = $2, explained_by = $3, explanation = $4 where id = $1", [input.punchId, now, session.userId, note]);
}

/**
 * Poprawka godziny wejścia, wyjścia albo obu naraz z powodem (także uzupełnienie wyjścia osoby odbitej teraz albo
 * odbicia „bez wyjścia”, które wtedy liczy się do czasu na budowie), w jednej transakcji. Poprawia właściciel albo
 * kierownik budowy, jeśli odbicie nie jest jego własne; pracownik i magazynier żadnych. Godzina nie sięga w przyszłość
 * ani nie powtarza obecnej, wejście zostaje przed wyjściem, a pobyt nie nachodzi na inne odbicie tej osoby
 * (`punch_overlap`). Poprzednie godziny zostają w historii odbicia.
 */
export async function correctPunch(sql: Sql, session: Session, input: CorrectPunchInput, now: Date): Promise<Punch> {
  if (!canCorrectPunches(session)) throw new RegistryError("forbidden");
  const reason = String(input.reason ?? "").trim();
  if (!reason) throw new RegistryError("reason_required");
  const isTime = (value: unknown) => value === undefined || (value instanceof Date && !Number.isNaN(value.getTime()));
  const given = [input.enteredAt, input.leftAt].filter((value) => value !== undefined);
  if (reason.length > MAX_PUNCH_CORRECTION_REASON_LENGTH || !isTime(input.enteredAt) || !isTime(input.leftAt) || given.length === 0) {
    throw new RegistryError("invalid_input");
  }
  const [row] = UUID_PATTERN.test(String(input.punchId)) ? await sql<PunchRow>(`${PUNCH_SELECT} where p.id = $1`, [input.punchId]) : [];
  if (!row) throw new RegistryError("not_found");
  if (!mayCorrect(session, row)) throw new RegistryError("forbidden");

  const before = { enteredAt: new Date(row.entered_at).getTime(), leftAt: row.left_at === null ? null : new Date(row.left_at).getTime() };
  // Północ odbicia „bez wyjścia” to nie godzina wyjścia: wyjście trzeba uzupełnić.
  const exitBefore = row.exit_via === "bez_wyjscia" ? null : before.leftAt;
  const enteredAt = input.enteredAt?.getTime() ?? before.enteredAt;
  const leftAt = input.leftAt?.getTime() ?? exitBefore;
  const unchanged = input.enteredAt?.getTime() === before.enteredAt || (input.leftAt !== undefined && input.leftAt.getTime() === exitBefore);
  const future = given.some((value) => value!.getTime() > now.getTime());
  // Bez wyjścia wejście zostaje przed północą, o której odbicie się zamknęło.
  const bound = leftAt ?? before.leftAt;
  if (unchanged || future || (bound !== null && enteredAt >= bound)) throw new RegistryError("invalid_input");
  const [neighbours] = await sql<{ previous_left_at: Date | null; next_entered_at: Date | null }>(
    "select previous_left_at, next_entered_at from app.punch_neighbours($1)",
    [row.id],
  );
  const overlaps =
    (neighbours.previous_left_at !== null && enteredAt < new Date(neighbours.previous_left_at).getTime()) ||
    (leftAt !== null && neighbours.next_entered_at !== null && leftAt > new Date(neighbours.next_entered_at).getTime());
  if (overlaps) throw new RegistryError("punch_overlap");

  const corrections: { field: PunchCorrectionField; at: Date }[] = [
    ...(input.enteredAt ? [{ field: "wejscie" as const, at: input.enteredAt }] : []),
    ...(input.leftAt ? [{ field: "wyjscie" as const, at: input.leftAt }] : []),
  ];
  // Baza pilnuje wejścia przed wyjściem po każdej poprawce: wejście za dotychczasowe wyjście idzie po nowym wyjściu.
  if (before.leftAt !== null && enteredAt >= before.leftAt) corrections.reverse();
  for (const correction of corrections) {
    await sql(
      `insert into app.punch_corrections (company_id, punch_id, field, to_at, reason, corrected_by, corrected_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [session.company.id, row.id, correction.field, correction.at, reason, session.userId, now],
    );
  }
  return punchById(sql, session, row.id);
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
