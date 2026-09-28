import { describe, expect, it } from "vitest";
import { keywordInterpreter } from "./keyword-interpreter";

const base = { id: "baza", name: "Magazyn", kind: "baza" as const };
const request = (text: string) => ({
  text,
  sites: [
    { id: "rataje", name: "Rataje", mine: true },
    { id: "winogrady", name: "Winogrady", mine: false },
  ],
  services: [{ id: "hilti", name: "Serwis Hilti" }],
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
      serviceId: null,
      everything: false,
      mentions: [
        { phrase: "dwie szlifierki", quantity: 2, codes: ["S-01", "S-02"] },
        { phrase: "młot", quantity: 1, codes: ["H-01"] },
      ],
      whereIs: false,
    });
  });

  it("„oddaję s-02 z Winograd”: zwrot z Winograd po kodzie", async () => {
    expect(await keywordInterpreter.interpret(request("oddaję s-02 z Winograd"))).toMatchObject({
      kind: "zwrot",
      siteId: "winogrady",
      mentions: [{ phrase: "s-02", quantity: 1, codes: ["S-02"] }],
    });
  });

  it("„wysyłam s-01 do serwisu Hilti”: wysłanie do serwisu Hilti, a „Hilti” to serwis, nie młot", async () => {
    expect(await keywordInterpreter.interpret(request("wysyłam s-01 do serwisu Hilti"))).toMatchObject({
      kind: "do_serwisu",
      serviceId: "hilti",
      mentions: [{ phrase: "s-01", quantity: 1, codes: ["S-01"] }],
    });
  });

  it("„odbieram młot z serwisu”: przyjęcie z serwisu", async () => {
    expect(await keywordInterpreter.interpret(request("odbieram młot z serwisu"))).toMatchObject({
      kind: "z_serwisu",
      siteId: null,
      mentions: [{ phrase: "młot", codes: ["H-01"] }],
    });
  });

  it("„zabieram wszystko z Winograd na Rataje”: przeniesienie całego sprzętu z Winograd na Rataje", async () => {
    expect(await keywordInterpreter.interpret(request("zabieram wszystko z Winograd na Rataje"))).toEqual({
      kind: "przeniesienie",
      siteId: "rataje",
      fromSiteId: "winogrady",
      serviceId: null,
      everything: true,
      mentions: [],
      whereIs: false,
    });
  });

  it("„gdzie jest młot?” i „kto ma s-02”: pytanie, gdzie jest sprzęt, a nie ruch", async () => {
    expect(await keywordInterpreter.interpret(request("gdzie jest młot?"))).toMatchObject({
      whereIs: true,
      mentions: [{ phrase: "młot", codes: ["H-01"] }],
    });
    expect(await keywordInterpreter.interpret(request("Kto ma S-02"))).toMatchObject({ whereIs: true, mentions: [{ codes: ["S-02"] }] });
    expect(await keywordInterpreter.interpret(request("biorę młot na Rataje"))).toMatchObject({ whereIs: false });
  });
});
