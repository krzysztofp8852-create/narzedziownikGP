import { RegistryError } from "./errors";
import type { Sql } from "./ports";
import type { Session } from "./registry";
import { type Category, type LocationKind, MAX_VALUE, type ToolState } from "./tools";
import { isCalendarDay, UUID_PATTERN, warsawTime } from "./validation";

/** Do czego odnosi się stawka dzienna: cała firma, kategoria albo jedno narzędzie. */
export type RateTarget = { kind: "firma" } | { kind: "kategoria"; categoryId: string } | { kind: "narzedzie"; toolId: string };

/** Nowa stawka dla celu: procent (firma, kategoria) albo kwota zł/dzień (narzędzie); null zdejmuje nadpisanie. */
export interface RateChange {
  target: RateTarget;
  rate: number | null;
}

/** Stawki obowiązujące dziś, do ustawień firmy. */
export interface DailyRates {
  /** Dzień startu kosztów (RRRR-MM-DD): pierwsze ustawienie stawki firmy; null, dopóki jej nie ustawiono. */
  costStartDay: string | null;
  /** Procent wartości narzędzia na dzień dla firmy; null, dopóki go nie ustawiono. */
  companyPercent: number | null;
  /** Kategorie z własnym procentem, po nazwie. */
  categories: { category: Category; percent: number }[];
}

/**
 * Stawka dzienna narzędzia i jej źródło. Przy stawce procentowej `amount` to procent wartości z tego dnia; null,
 * gdy narzędzie nie ma wartości.
 */
export type EffectiveRate =
  | { source: "wypozyczalnia" | "narzedzie"; amount: number }
  | { source: "kategoria" | "firma"; percent: number; amount: number | null };

/** Okres zestawienia: dni kalendarza w Polsce (RRRR-MM-DD), oba włącznie. */
export interface CostPeriod {
  from: string;
  to: string;
}

/** Koszt jednego narzędzia w lokalizacji i okresie. */
export interface ToolCost {
  tool: { id: string; code: string; name: string };
  /** Rozpoczęte doby w Polsce, w których narzędzie było w lokalizacji. */
  days: number;
  /** Stawki z okresu (zł/dzień) z liczbą dni każdej, od najwcześniejszej; kilka, gdy stawka albo wartość się zmieniła. */
  rates: { amount: number; days: number }[];
  /** Dni bez stawki, np. przy stawce procentowej dla narzędzia bez wartości; nie wchodzą do kwoty. */
  daysWithoutRate: number;
  /** Kwota w zł. */
  amount: number;
}

/** Koszt sprzętu lokalizacji. Przed dniem startu kosztów nie ma kwot, tylko stan „brak stawki”. */
export type LocationCosts =
  | { status: "brak_stawki" }
  | {
      status: "koszty";
      location: { id: string; name: string; kind: LocationKind };
      /** Okres, z którego są dni (do dziś najwyżej); null przy całej budowie, na której nie było sprzętu. */
      period: CostPeriod | null;
      total: number;
      /** Narzędzia z co najmniej jednym dniem w okresie, po kodzie. */
      tools: ToolCost[];
    };

/** Lokalizacje, w których sprzęt kosztuje: baza i serwis się nie liczą. */
export type CostedKind = Extract<LocationKind, "budowa" | "pojazd">;

/** Kwota sprzętu jednej budowy albo pojazdu w zestawieniu kosztów. */
export interface LocationCostTotal {
  /** `open`: aktywna budowa albo aktywny pojazd. */
  location: { id: string; name: string; kind: CostedKind; open: boolean };
  /** Narzędzia z co najmniej jednym dniem w okresie. */
  toolCount: number;
  /** Kwota w zł. */
  amount: number;
}

/** Zestawienie kosztów budów i pojazdów w okresie. Przed dniem startu kosztów nie ma kwot, tylko stan „brak stawki”. */
export type CostSummary =
  | { status: "brak_stawki" }
  | {
      status: "koszty";
      /** Okres z dniami do dziś najwyżej. */
      period: CostPeriod;
      total: number;
      /** Budowy, potem pojazdy, każde od najdroższych, przy równej kwocie po nazwie. */
      locations: LocationCostTotal[];
    };

/**
 * Stawki ustawia i ogląda tylko właściciel, jak wartości w zł. Koszty widzi też kierownik, gdy właściciel na to
 * pozwolił, ale tylko lokalizacji, których jest kierownikiem (`canSeeCostsOf`).
 */
export function canManageRates(session: Session) {
  return session.role === "wlasciciel";
}

export function requireRateManager(session: Session) {
  if (!canManageRates(session)) throw new RegistryError("forbidden");
}

/** Czy aktor widzi jakiekolwiek koszty: właściciel, a kierownik za zgodą właściciela. Magazynier i pracownik nigdy. */
export function canSeeCosts(session: Session) {
  return canManageRates(session) || (session.role === "kierownik" && session.company.siteManagersSeeCosts);
}

/** Czy aktor widzi koszty budowy albo pojazdu z tym kierownikiem: właściciel każdej, kierownik ze zgodą swojej. */
export function canSeeCostsOf(session: Session, location: { managerId: string | null }) {
  return canManageRates(session) || (canSeeCosts(session) && location.managerId === session.userId);
}

export function requireCostViewer(session: Session) {
  if (!canSeeCosts(session)) throw new RegistryError("forbidden");
}

const COSTED_KINDS: readonly LocationKind[] = ["budowa", "pojazd"] satisfies CostedKind[];

export async function dailyRates(sql: Sql, now: Date): Promise<DailyRates> {
  const book = await loadRateBook(sql);
  const today = warsawTime(now).day;
  const categories = await sql<Category>("select id, name, prefix from app.categories order by name");
  return {
    costStartDay: book.startDay,
    companyPercent: book.at(book.company, today)?.percent ?? null,
    categories: categories.flatMap((category) => {
      const percent = book.at(book.categories.get(category.id), today)?.percent;
      return percent == null ? [] : [{ category, percent }];
    }),
  };
}

/**
 * Nowa stawka od dziś: procent dla firmy (wymagany) albo kategorii, kwota zł/dzień dla narzędzia; null zdejmuje
 * nadpisanie kategorii albo narzędzia. Pierwsza stawka firmy wyznacza dzień startu kosztów. Stawka równa
 * obowiązującej dziś niczego nie dopisuje.
 */
export async function setDailyRate(sql: Sql, session: Session, { target, rate }: RateChange, now: Date): Promise<void> {
  let row: { kind: RateTarget["kind"]; categoryId: string | null; toolId: string | null; percent: number | null; amount: number | null };
  if (target.kind === "firma") {
    if (!isPercent(rate)) throw new RegistryError("invalid_input");
    row = { kind: "firma", categoryId: null, toolId: null, percent: rate, amount: null };
  } else if (target.kind === "kategoria") {
    if (rate !== null && !isPercent(rate)) throw new RegistryError("invalid_input");
    const [category] = UUID_PATTERN.test(target.categoryId)
      ? await sql("select 1 from app.categories where id = $1", [target.categoryId])
      : [];
    if (!category) throw new RegistryError("invalid_input");
    row = { kind: "kategoria", categoryId: target.categoryId, toolId: null, percent: rate, amount: null };
  } else if (target.kind === "narzedzie") {
    if (rate !== null && !isAmount(rate)) throw new RegistryError("invalid_input");
    const [tool] = UUID_PATTERN.test(target.toolId) ? await sql("select 1 from app.tools where id = $1", [target.toolId]) : [];
    if (!tool) throw new RegistryError("not_found");
    row = { kind: "narzedzie", categoryId: null, toolId: target.toolId, percent: null, amount: rate };
  } else {
    throw new RegistryError("invalid_input");
  }
  const book = await loadRateBook(sql);
  const today = warsawTime(now).day;
  const timeline = target.kind === "firma" ? book.company : target.kind === "kategoria" ? book.categories.get(target.categoryId) : book.tools.get(target.toolId);
  const current = book.at(timeline, today);
  if ((current?.percent ?? null) === row.percent && (current?.amount ?? null) === row.amount) return;
  await sql(
    `insert into app.daily_rates (company_id, kind, category_id, tool_id, percent, amount, valid_from, recorded_at, recorded_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [session.company.id, row.kind, row.categoryId, row.toolId, row.percent, row.amount, today, now, session.userId],
  );
}

/** Stawka narzędzia obowiązująca dziś; null przed dniem startu kosztów albo gdy żaden poziom jej nie daje. */
export async function currentToolRate(sql: Sql, tool: { id: string; categoryId: string }, now: Date): Promise<EffectiveRate | null> {
  const book = await loadRateBook(sql, [tool.id]);
  return book.rateOn(tool, warsawTime(now).day);
}

/**
 * Koszt sprzętu budowy albo pojazdu: każda rozpoczęta doba w Polsce, w której narzędzie tam było, razy stawka z tego
 * dnia. Pobyty wynikają z historii ruchów bez cofniętych; kończy je ruch wychodzący, korekta, zaginięcie,
 * wycofanie albo zwrot do wypożyczalni, a trwający liczy się do dziś. Bez okresu: cała budowa, od pierwszego do ostatniego dnia sprzętu.
 */
export async function locationCosts(
  sql: Sql,
  session: Session,
  locationId: string,
  period: CostPeriod | undefined,
  now: Date,
): Promise<LocationCosts> {
  if (period !== undefined) requirePeriod(period);
  const [location] = UUID_PATTERN.test(locationId)
    ? await sql<{ id: string; name: string; kind: LocationKind; manager_id: string | null }>(
        "select id, name, kind, manager_id from app.locations where id = $1",
        [locationId],
      )
    : [];
  if (!location) throw new RegistryError("not_found");
  if (!COSTED_KINDS.includes(location.kind)) throw new RegistryError("invalid_input");
  if (!canSeeCostsOf(session, { managerId: location.manager_id })) throw new RegistryError("forbidden");

  const costs = await costsIn(sql, [location.id], period, now);
  if (!costs) return { status: "brak_stawki" };
  const { range, tools } = costs.get(location.id)!;
  return {
    status: "koszty",
    location: { id: location.id, name: location.name, kind: location.kind },
    period: range,
    total: sumAmounts(tools),
    tools,
  };
}

/**
 * Zestawienie kosztów w okresie: każda aktywna budowa i aktywny pojazd z kwotą (także zerową), a zakończona budowa
 * albo nieaktywny pojazd, gdy mają koszt w okresie. Właściciel widzi wszystkie, kierownik ze zgodą swoje.
 */
export async function costSummary(sql: Sql, session: Session, period: CostPeriod, now: Date): Promise<CostSummary> {
  requirePeriod(period);
  const locations = await sql<{ id: string; name: string; kind: CostedKind; open: boolean }>(
    `select id, name, kind, (kind = 'budowa' and status = 'aktywna') or (kind = 'pojazd' and active) as open
     from app.locations
     where kind::text = any($1::text[]) and ($2::uuid is null or manager_id = $2)`,
    [COSTED_KINDS, canManageRates(session) ? null : session.userId],
  );
  const costs = await costsIn(
    sql,
    locations.map((location) => location.id),
    period,
    now,
  );
  if (!costs) return { status: "brak_stawki" };
  const rows = locations.flatMap((location): LocationCostTotal[] => {
    const { tools } = costs.get(location.id)!;
    if (!location.open && tools.length === 0) return [];
    return [{ location: { id: location.id, name: location.name, kind: location.kind, open: location.open }, toolCount: tools.length, amount: sumAmounts(tools) }];
  });
  rows.sort(
    (a, b) =>
      COSTED_KINDS.indexOf(a.location.kind) - COSTED_KINDS.indexOf(b.location.kind) ||
      b.amount - a.amount ||
      a.location.name.localeCompare(b.location.name, "pl"),
  );
  return {
    status: "koszty",
    period: clipToToday(period, warsawTime(now).day),
    total: sumAmounts(rows),
    locations: rows,
  };
}

function requirePeriod(period: CostPeriod) {
  if (!(isCalendarDay(period?.from) && isCalendarDay(period?.to) && period.from <= period.to)) throw new RegistryError("invalid_input");
}

/** Okres z końcem najpóźniej dziś, gdy dziś do niego należy. */
function clipToToday(period: CostPeriod, today: string): CostPeriod {
  return { from: period.from, to: period.to > today && today >= period.from ? today : period.to };
}

/** Suma kwot w zł, liczona w groszach. */
function sumAmounts(rows: { amount: number }[]) {
  return Math.round(rows.reduce((sum, row) => sum + toGrosze(row.amount), 0)) / 100;
}

/** Okres z dniami sprzętu (null: nie było go tam w ogóle) i narzędzia z kosztem, po kodzie. */
interface CostsOfLocation {
  range: CostPeriod | null;
  tools: ToolCost[];
}

/**
 * Koszt sprzętu każdej z podanych lokalizacji w okresie (bez niego: od pierwszego do ostatniego dnia sprzętu tam):
 * okres z dniami i narzędzia po kodzie. null przed dniem startu kosztów.
 */
async function costsIn(
  sql: Sql,
  locationIds: string[],
  period: CostPeriod | undefined,
  now: Date,
): Promise<Map<string, CostsOfLocation> | null> {
  const today = warsawTime(now).day;
  const stays = await staysIn(sql, locationIds);
  const toolIds = [...new Set([...stays.values()].flatMap((byTool) => [...byTool.keys()]))];
  const book = await loadRateBook(sql, toolIds);
  if (book.startDay === null) return null;

  const tools = await sql<{ id: string; code: string; name: string; category_id: string }>(
    "select id, code, name, category_id from app.tools where id = any($1::uuid[]) order by code",
    [toolIds],
  );
  const costs = new Map<string, CostsOfLocation>();
  for (const locationId of locationIds) {
    const daysByTool = new Map([...(stays.get(locationId) ?? [])].map(([toolId, list]) => [toolId, stayDays(list, today)]));
    const allDays = [...daysByTool.values()].flatMap((days) => [...days]).sort();
    const range: CostPeriod | null = period
      ? clipToToday(period, today)
      : allDays.length > 0
        ? { from: allDays[0], to: allDays[allDays.length - 1] }
        : null;
    const rows = tools.flatMap((tool): ToolCost[] => {
      const days = [...(daysByTool.get(tool.id) ?? [])].filter((day) => range && day >= range.from && day <= range.to).sort();
      if (days.length === 0) return [];
      const rates = new Map<number, number>();
      let daysWithoutRate = 0;
      for (const day of days) {
        const rate = book.rateOn({ id: tool.id, categoryId: tool.category_id }, day)?.amount;
        if (rate == null) daysWithoutRate += 1;
        else rates.set(toGrosze(rate), (rates.get(toGrosze(rate)) ?? 0) + 1);
      }
      const grosze = [...rates].reduce((sum, [rate, count]) => sum + rate * count, 0);
      return [
        {
          tool: { id: tool.id, code: tool.code, name: tool.name },
          days: days.length,
          rates: [...rates].map(([rate, count]) => ({ amount: rate / 100, days: count })),
          daysWithoutRate,
          amount: grosze / 100,
        },
      ];
    });
    costs.set(locationId, { range, tools: rows });
  }
  return costs;
}

interface Stay {
  from: Date;
  /** null: narzędzie dalej tam jest. */
  to: Date | null;
}

/**
 * Pobyty w każdej z podanych lokalizacji narzędzi, które kiedyś do którejś z nich trafiły, z historii ruchów bez
 * cofniętych: lokalizacja → narzędzie → pobyty.
 */
async function staysIn(sql: Sql, locationIds: string[]): Promise<Map<string, Map<string, Stay[]>>> {
  const rows = await sql<{ tool_id: string; to_location_id: string | null; to_state: ToolState | null; occurred_at: Date }>(
    `select mt.tool_id, m.to_location_id, m.to_state, m.occurred_at
     from app.movement_tools mt
     join app.movements m on m.id = mt.movement_id
     where mt.tool_id in (
             select arrived.tool_id from app.movement_tools arrived
             join app.movements a on a.id = arrived.movement_id
             where a.to_location_id = any($1::uuid[])
           )
       and m.kind <> 'cofniecie'
       and not exists (select 1 from app.movements r where r.reverses_movement_id = m.id)
     order by mt.tool_id, m.occurred_at, m.recorded_at, m.sequence_number`,
    [locationIds],
  );
  const wanted = new Set(locationIds);
  const stays = new Map<string, Map<string, Stay[]>>();
  const current = new Map<string, { locationId: string | null; state: ToolState }>();
  for (const row of rows) {
    const before = current.get(row.tool_id) ?? { locationId: null, state: "w_obiegu" };
    const after = { locationId: row.to_location_id ?? before.locationId, state: row.to_state ?? before.state };
    current.set(row.tool_id, after);
    const wasAt = before.state === "w_obiegu" ? before.locationId : null;
    const isAt = after.state === "w_obiegu" ? after.locationId : null;
    if (wasAt === isAt) continue;
    if (wasAt && wanted.has(wasAt)) stays.get(wasAt)!.get(row.tool_id)!.at(-1)!.to = new Date(row.occurred_at);
    if (isAt && wanted.has(isAt)) {
      const byTool = stays.get(isAt) ?? new Map<string, Stay[]>();
      stays.set(isAt, byTool);
      byTool.set(row.tool_id, [...(byTool.get(row.tool_id) ?? []), { from: new Date(row.occurred_at), to: null }]);
    }
  }
  return stays;
}

/** Dni (RRRR-MM-DD) w Polsce, w których narzędzie było w lokalizacji choćby chwilę, najpóźniej dziś. */
function stayDays(stays: Stay[], today: string): Set<string> {
  const days = new Set<string>();
  for (const stay of stays) {
    // Pobyt kończący się równo o północy nie zaczyna kolejnej doby.
    const last = stay.to ? warsawTime(new Date(Math.max(stay.from.getTime(), stay.to.getTime() - 1))).day : today;
    for (let day = warsawTime(stay.from).day; day <= last && day <= today; day = nextDay(day)) days.add(day);
  }
  return days;
}

function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

interface Dated {
  validFrom: string;
}
interface RateEntry extends Dated {
  percent: number | null;
  amount: number | null;
}
interface ValueEntry extends Dated {
  value: number | null;
}

/** Wszystkie stawki firmy, stawki wypożyczalni i historia wartości wskazanych narzędzi, od najstarszego wpisu. */
async function loadRateBook(sql: Sql, toolIds: string[] = []) {
  const rates = await sql<{
    kind: RateTarget["kind"];
    category_id: string | null;
    tool_id: string | null;
    percent: string | null;
    amount: string | null;
    valid_from: string;
  }>(
    `select kind, category_id, tool_id, percent::text, amount::text, valid_from::text
     from app.daily_rates order by valid_from, sequence_number`,
  );
  const values = await sql<{ tool_id: string; value: string | null; valid_from: string }>(
    `select tool_id, value::text, valid_from::text from app.tool_value_history
     where tool_id = any($1::uuid[]) order by valid_from, sequence_number`,
    [toolIds],
  );
  // Stawkę wypożyczalni widzi ten, kto widzi koszty narzędzia (RLS); stała przez cały wynajem.
  const rentalRates = await sql<{ tool_id: string; amount: string }>(
    "select tool_id, amount::text from app.rental_rates where tool_id = any($1::uuid[])",
    [toolIds],
  );
  const rentals = new Map(rentalRates.map((row) => [row.tool_id, Number(row.amount)]));
  const number = (text: string | null) => (text === null ? null : Number(text));
  const company: RateEntry[] = [];
  const categories = new Map<string, RateEntry[]>();
  const tools = new Map<string, RateEntry[]>();
  const push = <T>(map: Map<string, T[]>, key: string, entry: T) => map.set(key, [...(map.get(key) ?? []), entry]);
  for (const row of rates) {
    const entry = { validFrom: row.valid_from, percent: number(row.percent), amount: number(row.amount) };
    if (row.kind === "firma") company.push(entry);
    else if (row.kind === "kategoria") push(categories, row.category_id!, entry);
    else push(tools, row.tool_id!, entry);
  }
  const toolValues = new Map<string, ValueEntry[]>();
  for (const row of values) push(toolValues, row.tool_id, { validFrom: row.valid_from, value: number(row.value) });

  const startDay = company[0]?.validFrom ?? null;
  /** Wpis obowiązujący w danym dniu: ostatni z dnia startu i sprzed niego obowiązuje wstecz, późniejsze od swojego dnia. */
  const at = <T extends Dated>(timeline: T[] | undefined, day: string): T | undefined => {
    let found: T | undefined;
    for (const entry of timeline ?? []) {
      if (entry.validFrom > day && (startDay === null || entry.validFrom > startDay)) break;
      found = entry;
    }
    return found;
  };
  /** Pierwszeństwo: stawka wypożyczalni, kwota narzędzia, procent kategorii, procent firmy. */
  const rateOn = (tool: { id: string; categoryId: string }, day: string): EffectiveRate | null => {
    if (startDay === null) return null;
    const rental = rentals.get(tool.id);
    if (rental !== undefined) return { source: "wypozyczalnia", amount: rental };
    const own = at(tools.get(tool.id), day)?.amount;
    if (own != null) return { source: "narzedzie", amount: own };
    const categoryPercent = at(categories.get(tool.categoryId), day)?.percent;
    const companyPercent = at(company, day)?.percent;
    const [source, percent] = categoryPercent != null ? (["kategoria", categoryPercent] as const) : (["firma", companyPercent] as const);
    if (percent == null) return null;
    const value = at(toolValues.get(tool.id), day)?.value;
    return { source, percent, amount: value == null ? null : Math.round((toGrosze(value) * toGrosze(percent)) / 10_000) / 100 };
  };
  return { startDay, company, categories, tools, at, rateOn };
}

/** Grosze z kwoty w zł (także setne części procentu z procentu). */
function toGrosze(amount: number) {
  return Math.round(amount * 100);
}

const MAX_RATE_PERCENT = 100;

function hasTwoDecimals(value: number) {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

function isPercent(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_RATE_PERCENT && hasTwoDecimals(value);
}

/** Kwota w zł: od 0 do największej wartości narzędzia, z najwyżej dwoma miejscami po przecinku. */
export function isAmount(value: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_VALUE && hasTwoDecimals(value);
}
