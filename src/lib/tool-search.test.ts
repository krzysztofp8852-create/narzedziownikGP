import { describe, expect, it } from "vitest";
import { matchesTool } from "./tool-search";

const drill = { code: "H-01", name: "Młotowiertarka", category: "Młotowiertarki i młoty", brand: "Hilti", model: "TE 30-A36" };

describe("wyszukiwanie narzędzia", () => {
  it("po nazwie bez polskich znaków i wielkości liter, po kodzie bez kreski", () => {
    expect(matchesTool(drill, "mlotowiert")).toBe(true);
    expect(matchesTool(drill, "h01")).toBe(true);
    expect(matchesTool(drill, "H-0")).toBe(true);
    expect(matchesTool(drill, "szlifierka")).toBe(false);
  });

  it("po marce, modelu i kategorii, a przy kilku słowach każde musi pasować", () => {
    expect(matchesTool(drill, "hilti")).toBe(true);
    expect(matchesTool(drill, "Hilti TE 30")).toBe(true);
    expect(matchesTool(drill, "młoty")).toBe(true);
    expect(matchesTool(drill, "hilti makita")).toBe(false);
  });

  it("bez marki i kategorii szuka po nazwie i kodzie, jak w checklistach", () => {
    expect(matchesTool({ code: "S-01", name: "Szlifierka kątowa" }, "katowa szlif")).toBe(true);
    expect(matchesTool({ code: "S-01", name: "Szlifierka kątowa" }, "")).toBe(true);
  });
});
