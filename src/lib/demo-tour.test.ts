import { describe, expect, it } from "vitest";
import { DEMO_ROLES } from "@/demo/company";
import { TOUR_DONE, tourStart, tourSteps } from "./demo-tour";

/** Kroki tak, jak je widać: krok i element, przy którym stoi dymek (`data-tour`). */
const shown = (role: (typeof DEMO_ROLES)[number]) => tourSteps(role).map((step) => `${step.id} @${step.target}`);

describe("przewodnik demo", () => {
  it("właściciel, kierownik i magazynier: wydaj na budowę, zobacz, u kogo jest, przyjmij zwrot", () => {
    for (const role of ["wlasciciel", "kierownik", "magazynier"] as const) {
      expect(shown(role), role).toEqual(["issue @issue", "where @where", "return @return", "finish @demo-roles"]);
    }
  });

  it("pracownik: odbij się w Skanuj i zgłoś usterkę", () => {
    expect(shown("pracownik")).toEqual(["punch @scan", "report @report", "finish @demo-roles"]);
  });

  it("każda rola ma 3–4 kroki, a ostatni prowadzi do innych ról i ceny", () => {
    for (const role of DEMO_ROLES) {
      const steps = tourSteps(role);
      expect(steps.length, role).toBeGreaterThanOrEqual(3);
      expect(steps.length, role).toBeLessThanOrEqual(4);
      expect(steps.at(-1)?.id, role).toBe("finish");
    }
  });
});

describe("start przewodnika", () => {
  const count = 4;

  it("przy pierwszym wejściu do roli włącza się sam od pierwszego kroku", () => {
    expect(tourStart({ requested: false, saved: null, skipped: false, count })).toBe(0);
  });

  it("po powrocie na tablicę idzie dalej od zapamiętanego kroku", () => {
    expect(tourStart({ requested: false, saved: "2", skipped: false, count })).toBe(2);
  });

  it("pominięty albo skończony nie włącza się sam", () => {
    expect(tourStart({ requested: false, saved: "1", skipped: true, count })).toBeNull();
    expect(tourStart({ requested: false, saved: TOUR_DONE, skipped: false, count })).toBeNull();
    expect(tourStart({ requested: false, saved: null, skipped: true, count })).toBeNull();
  });

  it("„Przewodnik” wznawia pominięty od kroku, na którym go pominięto", () => {
    expect(tourStart({ requested: true, saved: "2", skipped: true, count })).toBe(2);
  });

  it("„Przewodnik” po skończonym albo jeszcze nieoglądanym zaczyna od początku", () => {
    expect(tourStart({ requested: true, saved: TOUR_DONE, skipped: false, count })).toBe(0);
    expect(tourStart({ requested: true, saved: null, skipped: true, count })).toBe(0);
  });

  it("zapamiętany krok spoza przewodnika (np. z dłuższego przewodnika) to ostatni albo pierwszy krok", () => {
    expect(tourStart({ requested: false, saved: "9", skipped: false, count })).toBe(3);
    expect(tourStart({ requested: false, saved: "coś", skipped: false, count })).toBe(0);
    expect(tourStart({ requested: true, saved: "-2", skipped: true, count })).toBe(0);
  });
});
