import { describe, expect, it } from "vitest";
import { formatMoney, formatMoneyChange } from "@/i18n/money";
import type { FridayReport, WeeklyReport } from "@/registry/registry";
import { reportSummary } from "./report-text";

const weekly = (offBaseValue: number, offBaseChange: number | null): WeeklyReport => ({
  kind: "tygodniowy",
  day: "2026-03-09",
  thresholdDays: 30,
  overThreshold: [],
  lost: [],
  offBaseValue,
  previousOffBaseValue: offBaseChange === null ? null : offBaseValue - offBaseChange,
  offBaseChange,
  toolReports: [],
  longestUnused: [],
});

const friday: FridayReport = {
  kind: "piatkowy",
  day: "2026-03-06",
  locations: [
    { id: "r", name: "Rataje", kind: "budowa", manager: { id: "n", fullName: "Adam Nowak" }, tools: [{ id: "1", code: "S-01", name: "Szlifierka", days: 4 }] },
    {
      id: "w",
      name: "Winogrady",
      kind: "budowa",
      manager: { id: "k", fullName: "Jan Kowalski" },
      tools: [
        { id: "2", code: "S-02", name: "Szlifierka mała", days: 4 },
        { id: "3", code: "S-03", name: "Szlifierka duża", days: 1 },
      ],
    },
  ],
};

describe("podsumowanie raportu w wierszu listy raportów", () => {
  it("tygodniowy: kwota poza bazą, ze zmianą od poprzedniego tygodnia, gdy jest z czym porównać", () => {
    expect(reportSummary(weekly(1830.5, null))).toBe(`poza bazą ${formatMoney(1830.5)}`);
    expect(reportSummary(weekly(1830.5, -450.5))).toBe(`poza bazą ${formatMoney(1830.5)} (${formatMoneyChange(-450.5)} w tydzień)`);
  });

  it("piątkowy: ile sztuk sprzętu jest poza bazą na wszystkich lokalizacjach", () => {
    expect(reportSummary(friday)).toBe("poza bazą: 3 szt.");
  });
});
