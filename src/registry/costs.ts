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
export type EffectiveRate = { source: "narzedzie"; amount: number } | { source: "kategoria" | "firma"; percent: number; amount: number | null };

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

/** Koszty i stawki widzi tylko właściciel, jak wartości w zł. */
export function canSeeCosts(session: Session) {
  return session.role === "wlasciciel";
}

export function requireCostViewer(session: Session) {
  if (!canSeeCosts(session)) throw new RegistryError("forbidden");
}

/** Lokalizacje, w których sprzęt kosztuje: baza i serwis się nie liczą. */
const COSTED_KINDS: readonly LocationKind[] = ["budowa", "pojazd"];

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
 * dnia. Pobyty wynikają z historii ruchów bez cofniętych; kończy je ruch wychodzący, korekta, zaginięcie albo
 * wycofanie, a trwający liczy się do dziś. Bez okresu: cała budowa, od pierwszego do ostatniego dnia sprzętu.
 */
export async function locationCosts(sql: Sql, locationId: string, period: CostPeriod | undefined, now: Date): Promise<LocationCosts> {
  if (period !== undefined && !(isCalendarDay(period.from) && isCalendarDay(period.to) && period.from <= period.to)) {
    throw new RegistryError("invalid_input");
  }
  const [location] = UUID_PATTERN.test(locationId)
    ? await sql<{ id: string; name: string; kind: LocationKind }>("select id, name, kind from app.locations where id = $1", [locationId])
    : [];
  if (!location) throw new RegistryError("not_found");
  if (!COSTED_KINDS.includes(location.kind)) throw new RegistryError("invalid_input");

  const today = warsawTime(now).day;
  const stays = await staysIn(sql, location.id);
  const book = await loadRateBook(sql, [...stays.keys()]);
  if (book.startDay === null) return { status: "brak_stawki" };

  const daysByTool = new Map([...stays].map(([toolId, list]) => [toolId, stayDays(list, today)]));
  const allDays = [...daysByTool.values()].flatMap((days) => [...days]).sort();
  const range: CostPeriod | null = period
    ? { from: period.from, to: period.to > today && today >= period.from ? today : period.to }
    : allDays.length > 0
      ? { from: allDays[0], to: allDays[allDays.length - 1] }
      : null;

  const tools = await sql<{ id: string; code: string; name: string; category_id: string }>(
    "select id, code, name, category_id from app.tools where id = any($1::uuid[]) order by code",
    [[...stays.keys()]],
  );
  const rows = tools.flatMap((tool): ToolCost[] => {
    const days = [...daysByTool.get(tool.id)!].filter((day) => range && day >= range.from && day <= range.to).sort();
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
  return {
    status: "koszty",
    location: { id: location.id, name: location.name, kind: location.kind },
    period: range,
    total: Math.round(rows.reduce((sum, row) => sum + toGrosze(row.amount), 0)) / 100,
    tools: rows,
  };
}

interface Stay {
  from: Date;
  /** null: narzędzie dalej tam jest. */
  to: Date | null;
}

/** Pobyty w lokalizacji narzędzi, które kiedyś do niej trafiły, z historii ruchów bez cofniętych. */
async function staysIn(sql: Sql, locationId: string): Promise<Map<string, Stay[]>> {
  const rows = await sql<{ tool_id: string; to_location_id: string | null; to_state: ToolState | null; occurred_at: Date }>(
    `select mt.tool_id, m.to_location_id, m.to_state, m.occurred_at
     from app.movement_tools mt
     join app.movements m on m.id = mt.movement_id
     where mt.tool_id in (
             select arrived.tool_id from app.movement_tools arrived
             join app.movements a on a.id = arrived.movement_id
             where a.to_location_id = $1
           )
       and m.kind <> 'cofniecie'
       and not exists (select 1 from app.movements r where r.reverses_movement_id = m.id)
     order by mt.tool_id, m.occurred_at, m.recorded_at, m.sequence_number`,
    [locationId],
  );
  const stays = new Map<string, Stay[]>();
  const current = new Map<string, { locationId: string | null; state: ToolState }>();
  for (const row of rows) {
    const before = current.get(row.tool_id) ?? { locationId: null, state: "w_obiegu" };
    const after = { locationId: row.to_location_id ?? before.locationId, state: row.to_state ?? before.state };
    current.set(row.tool_id, after);
    const wasHere = before.locationId === locationId && before.state === "w_obiegu";
    const isHere = after.locationId === locationId && after.state === "w_obiegu";
    const list = stays.get(row.tool_id) ?? [];
    stays.set(row.tool_id, list);
    if (!wasHere && isHere) list.push({ from: new Date(row.occurred_at), to: null });
    if (wasHere && !isHere) list[list.length - 1].to = new Date(row.occurred_at);
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

/** Wszystkie stawki firmy i historia wartości wskazanych narzędzi, od najstarszego wpisu. */
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
  /** Pierwszeństwo: kwota narzędzia, procent kategorii, procent firmy. */
  const rateOn = (tool: { id: string; categoryId: string }, day: string): EffectiveRate | null => {
    if (startDay === null) return null;
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

function isAmount(value: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_VALUE && hasTwoDecimals(value);
}
