import { describe, expect, it } from "vitest";
import { keywordInterpreter } from "./keyword-interpreter";

const base = { id: "baza", name: "Magazyn", kind: "baza" as const };
const request = (text: string) => ({
  text,
  sites: [
    { id: "rataje", name: "Rataje", mine: true },
    { id: "winogrady", name: "Winogrady", mine: false },
  ],
  tools: [
    { code: "S-01", name: "Szlifierka kątowa", category: "Szlifierki", location: base },
    { code: "S-02", name: "Szlifierka mała", category: "Szlifierki", location: base },
    { code: "H-01", name: "Młot Hilti", category: "Młoty", location: base },
  ],
});

describe("interpretacja słowami kluczowymi (bez AI, lokalnie i w teście dymnym)", () => {
  it("„biorę dwie szlifierki i młot na Rataje”: wydanie na Rataje, dwie z szlifierek i młot", async () => {
    expect(await keywordInterpreter.interpret(request("biorę dwie szlifierki i młot na Rataje"))).toEqual({
      kind: "wydanie",
      siteId: "rataje",
      fromSiteId: null,
      mentions: [
        { phrase: "dwie szlifierki", quantity: 2, codes: ["S-01", "S-02"] },
        { phrase: "młot", quantity: 1, codes: ["H-01"] },
      ],
    });
  });

  it("„oddaję s-02 z Winograd”: zwrot z Winograd po kodzie", async () => {
    expect(await keywordInterpreter.interpret(request("oddaję s-02 z Winograd"))).toMatchObject({
      kind: "zwrot",
      siteId: "winogrady",
      mentions: [{ phrase: "s-02", quantity: 1, codes: ["S-02"] }],
    });
  });
});
