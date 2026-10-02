import { formatDay } from "@/i18n/dates";
import { type CostPeriod, isCalendarDay, isMonth, shiftMonth } from "@/registry/registry";

/** Parametry adresu okresu kosztów, np. /budowy/…/koszty?miesiac=2026-03 albo ?od=2026-03-05&do=2026-03-20. */
export const COST_PARAMS = { month: "miesiac", from: "od", to: "do" } as const;

/** Wybrany okres zestawienia: cała budowa, miesiąc (RRRR-MM) albo własny zakres dni. */
export type CostPeriodChoice = { mode: "cala" } | { mode: "miesiac"; month: string; period: CostPeriod } | { mode: "zakres"; period: CostPeriod };

type SearchParams = URLSearchParams | Record<string, string | string[] | undefined>;

/** Pierwsza wartość parametru adresu bez spacji; pusty tekst, gdy go nie ma. */
function param(params: SearchParams, name: string) {
  const value = params instanceof URLSearchParams ? params.get(name) : params[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() || "";
}

/** Okres z adresu: poprawny zakres przed miesiącem, a bez nich (albo przy złych) cała budowa. */
export function parseCostPeriod(params: SearchParams): CostPeriodChoice {
  const get = (name: string) => param(params, name);
  const from = get(COST_PARAMS.from);
  const to = get(COST_PARAMS.to);
  if (isCalendarDay(from) && isCalendarDay(to) && from <= to) return { mode: "zakres", period: { from, to } };
  const month = get(COST_PARAMS.month);
  if (isMonth(month)) return { mode: "miesiac", month, period: monthPeriod(month) };
  return { mode: "cala" };
}

/** Część adresu z okresem („?miesiac=…”), albo pusty tekst dla całej budowy. */
export function costPeriodSearch(choice: CostPeriodChoice): string {
  if (choice.mode === "cala") return "";
  const search =
    choice.mode === "miesiac"
      ? new URLSearchParams({ [COST_PARAMS.month]: choice.month })
      : new URLSearchParams({ [COST_PARAMS.from]: choice.period.from, [COST_PARAMS.to]: choice.period.to });
  return `?${search}`;
}

/** Dni miesiąca RRRR-MM od pierwszego do ostatniego. */
export function monthPeriod(month: string): CostPeriod {
  const [year, number] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** Miesiąc RRRR-MM przesunięty o `delta` miesięcy (z Rejestru). */
export { shiftMonth };

/** Bieżący miesiąc w Polsce (RRRR-MM). */
export function currentMonth(now = new Date()): string {
  return formatDay(now).slice(0, 7);
}

/** Okres z adresu dla zestawienia, które nie ma całej budowy: bez okresu bieżący miesiąc. */
export function parseSummaryPeriod(params: SearchParams, now = new Date()): Exclude<CostPeriodChoice, { mode: "cala" }> {
  const choice = parseCostPeriod(params);
  if (choice.mode !== "cala") return choice;
  const month = currentMonth(now);
  return { mode: "miesiac", month, period: monthPeriod(month) };
}

/** Miesiąc RRRR-MM z adresu (?miesiac=…), a bez niego albo przy złym bieżący miesiąc w Polsce. */
export function parseMonth(params: SearchParams, now = new Date()): string {
  const month = param(params, COST_PARAMS.month);
  return isMonth(month) ? month : currentMonth(now);
}
