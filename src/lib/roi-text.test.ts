import { describe, expect, it } from "vitest";
import { perWorkerLoss, roiCases } from "./roi-text";

// Kwoty w złotówkach mają twardą spację między tysiącami, jak w cenniku: „1 000 zł”.
const zl = (text: string) => text.replace(/ /g, " ");

describe("statystyki strat nad cennikiem", () => {
  it("dzieli roczną stratę na pracownika na narzędzia i czas szukania w wariancie środkowym", () => {
    expect(perWorkerLoss()).toEqual({ toolLoss: 600, timeCost: 4320, total: 4920 });
  });

  it("liczy straty firmy 5, 25 i 100 osób i jaką ich część pokrywa jej pakiet w pierwszym i kolejnych latach", () => {
    expect(roiCases().map(({ firstYearShare, ...rest }) => ({ ...rest, firstYearShare: Math.round(firstYearShare * 10) / 10 }))).toEqual([
      {
        size: "small",
        workers: 5,
        tierName: "Mały",
        totalLoss: zl("24 600 zł"),
        firstYearCost: zl("3 400 zł"),
        nextYearCost: zl("400 zł"),
        firstYearShare: 13.8,
        firstYearPercent: "14%",
        nextYearPercent: "2%",
      },
      {
        size: "medium",
        workers: 25,
        tierName: "Średni",
        totalLoss: zl("123 000 zł"),
        firstYearCost: zl("6 800 zł"),
        nextYearCost: zl("800 zł"),
        firstYearShare: 5.5,
        firstYearPercent: "6%",
        nextYearPercent: "poniżej 1%",
      },
      {
        size: "large",
        workers: 100,
        tierName: "Duży",
        totalLoss: zl("492 000 zł"),
        firstYearCost: zl("14 000 zł"),
        nextYearCost: zl("2 000 zł"),
        firstYearShare: 2.8,
        firstYearPercent: "3%",
        nextYearPercent: "poniżej 1%",
      },
    ]);
  });
});
