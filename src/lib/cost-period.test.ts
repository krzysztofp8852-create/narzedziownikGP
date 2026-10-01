import { describe, expect, it } from "vitest";
import { costPeriodSearch, monthPeriod, parseCostPeriod, parseSummaryPeriod, shiftMonth } from "./cost-period";

describe("okres zestawienia kosztów w adresie", () => {
  it("bez parametrów to cała budowa", () => {
    expect(parseCostPeriod({})).toEqual({ mode: "cala" });
    expect(costPeriodSearch({ mode: "cala" })).toBe("");
  });

  it("miesiąc to dni od pierwszego do ostatniego, także w lutym roku przestępnego", () => {
    expect(parseCostPeriod({ miesiac: "2026-02" })).toEqual({ mode: "miesiac", month: "2026-02", period: { from: "2026-02-01", to: "2026-02-28" } });
    expect(monthPeriod("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(costPeriodSearch(parseCostPeriod(new URLSearchParams("miesiac=2026-12")))).toBe("?miesiac=2026-12");
  });

  it("własny zakres ma pierwszeństwo przed miesiącem, a zły zakres i zły miesiąc to cała budowa", () => {
    expect(parseCostPeriod({ od: "2026-03-05", do: "2026-03-20", miesiac: "2026-02" })).toEqual({
      mode: "zakres",
      period: { from: "2026-03-05", to: "2026-03-20" },
    });
    expect(costPeriodSearch({ mode: "zakres", period: { from: "2026-03-05", to: "2026-03-20" } })).toBe("?od=2026-03-05&do=2026-03-20");
    for (const params of [{ od: "2026-03-20", do: "2026-03-05" }, { od: "2026-02-30", do: "2026-03-05" }, { od: "2026-03-05" }, { miesiac: "2026-13" }, { miesiac: "marzec" }]) {
      expect(parseCostPeriod(params), JSON.stringify(params)).toEqual({ mode: "cala" });
    }
  });

  it("poprzedni miesiąc przechodzi przez granicę roku", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});

describe("okres zestawienia wszystkich budów i pojazdów", () => {
  it("bez okresu to bieżący miesiąc w Polsce, a podany okres zostaje", () => {
    expect(parseSummaryPeriod({}, new Date("2026-03-31T23:30:00Z"))).toEqual({
      mode: "miesiac",
      month: "2026-04",
      period: { from: "2026-04-01", to: "2026-04-30" },
    });
    expect(parseSummaryPeriod({ od: "2026-03-05", do: "2026-03-20" })).toEqual({ mode: "zakres", period: { from: "2026-03-05", to: "2026-03-20" } });
  });
});
