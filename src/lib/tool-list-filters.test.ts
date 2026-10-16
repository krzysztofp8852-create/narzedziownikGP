import { describe, expect, it } from "vitest";
import type { ListedTool } from "@/registry/registry";
import {
  ALARM,
  ALL,
  changeFilters,
  filterTools,
  IN_SERVICE,
  LOST,
  parseToolListFilters,
  type ToolListFilters,
  toolListOptions,
  toolListSearch,
} from "./tool-list-filters";

const base = { id: "b", name: "Magazyn Swarzędz", kind: "baza" } as const;
const rataje = { id: "r", name: "Rataje", kind: "budowa" } as const;
const bus = { id: "v", name: "Bus WX 12345", kind: "pojazd" } as const;
const serwis = { id: "s", name: "Serwis Hilti", kind: "serwis" } as const;
const tarasy = { id: "t", name: "Tarasy", kind: "budowa" } as const;

const tool = (code: string, changes: Partial<ListedTool> = {}): ListedTool => ({
  id: code,
  code,
  name: "Szlifierka kątowa",
  category: "Szlifierki",
  brand: null,
  model: null,
  state: "w_obiegu",
  registration: "zaakceptowane",
  location: base,
  daysInPlace: 0,
  responsible: null,
  damaged: false,
  rented: false,
  alarm: false,
  ...changes,
});

const tools = [
  tool("H-01", { name: "Młotowiertarka", category: "Młotowiertarki", brand: "Hilti", model: "TE 30", location: rataje, alarm: true }),
  tool("H-02", { name: "Młotowiertarka", category: "Młotowiertarki", location: serwis }),
  tool("S-01", { location: bus }),
  tool("S-02", { state: "zaginione", location: rataje }),
  tool("S-03", { state: "wycofane" }),
  tool("K-01", { name: "Minikoparka", category: "Maszyny", state: "zwrocone", rented: true, location: tarasy }),
  tool("S-04"),
];

const codes = (list: ListedTool[]) => list.map((item) => item.code);
const noFilters: ToolListFilters = { query: "", category: ALL, place: ALL, show: ALL, withRetiredAndReturned: false };

describe("filtry listy narzędzi", () => {
  it("bez filtrów pokazuje sprzęt w obiegu i zaginiony, a wycofany i zwrócony dopiero na życzenie", () => {
    expect(codes(filterTools(tools, noFilters))).toEqual(["H-01", "H-02", "S-01", "S-02", "S-04"]);
    expect(codes(filterTools(tools, { ...noFilters, withRetiredAndReturned: true }))).toEqual(codes(tools));
  });

  it("pole szuka jak lupa: po słowach w nazwie, kategorii, marce i modelu albo po kodzie bez kresek", () => {
    expect(codes(filterTools(tools, { ...noFilters, query: "hilti te 30" }))).toEqual(["H-01"]);
    expect(codes(filterTools(tools, { ...noFilters, query: "mlotowiertarki" }))).toEqual(["H-01", "H-02"]);
    expect(codes(filterTools(tools, { ...noFilters, query: "s02" }))).toEqual(["S-02"]);
  });

  it("zawęża do kategorii i do miejsca, w którym sprzęt jest teraz", () => {
    expect(codes(filterTools(tools, { ...noFilters, category: "Szlifierki" }))).toEqual(["S-01", "S-02", "S-04"]);
    expect(codes(filterTools(tools, { ...noFilters, place: "r" }))).toEqual(["H-01"]);
    expect(codes(filterTools(tools, { ...noFilters, place: "b", withRetiredAndReturned: true }))).toEqual(["S-04"]);
    expect(codes(filterTools(tools, { ...noFilters, category: "Szlifierki", place: "v", query: "kątowa" }))).toEqual(["S-01"]);
  });

  it("pokazuje same zaginione, sam sprzęt w serwisie albo sam sprzęt z alarmem, także razem z innymi filtrami", () => {
    expect(codes(filterTools(tools, { ...noFilters, show: LOST }))).toEqual(["S-02"]);
    expect(codes(filterTools(tools, { ...noFilters, show: IN_SERVICE }))).toEqual(["H-02"]);
    expect(codes(filterTools(tools, { ...noFilters, show: ALARM }))).toEqual(["H-01"]);
    expect(codes(filterTools(tools, { ...noFilters, show: ALARM, place: "r", category: "Młotowiertarki" }))).toEqual(["H-01"]);
    expect(codes(filterTools(tools, { ...noFilters, show: IN_SERVICE, query: "hilti" }))).toEqual([]);
  });

  it("zaginione nie są w żadnej lokalizacji: wybór zaginionych czyści lokalizację, a wybór lokalizacji zdejmuje zaginione", () => {
    expect(changeFilters({ ...noFilters, place: "r", category: "Szlifierki" }, { show: LOST })).toEqual({
      ...noFilters,
      category: "Szlifierki",
      show: LOST,
    });
    expect(changeFilters({ ...noFilters, show: LOST }, { place: "r" })).toEqual({ ...noFilters, place: "r" });
    expect(changeFilters({ ...noFilters, show: ALARM }, { place: "r" })).toEqual({ ...noFilters, show: ALARM, place: "r" });
    expect(changeFilters({ ...noFilters, place: "s" }, { show: IN_SERVICE })).toEqual({ ...noFilters, show: IN_SERVICE, place: "s" });
  });

  it("w wyborze są kategorie sprzętu i miejsca, w których coś jest: baza, budowy, pojazdy, serwisy; do tego liczby zaginionych, w serwisie i z alarmem", () => {
    expect(toolListOptions(tools)).toEqual({
      categories: ["Maszyny", "Młotowiertarki", "Szlifierki"],
      places: [base, rataje, bus, serwis],
      counts: { [LOST]: 1, [IN_SERVICE]: 1, [ALARM]: 1 },
      hasRetiredOrReturned: true,
    });
    expect(toolListOptions([tool("S-04")])).toEqual({
      categories: ["Szlifierki"],
      places: [base],
      counts: { [LOST]: 0, [IN_SERVICE]: 0, [ALARM]: 0 },
      hasRetiredOrReturned: false,
    });
  });
});

describe("filtry listy narzędzi w adresie", () => {
  const rataje = "6f1c2c8e-3f2a-4b7e-9a1d-2b3c4d5e6f70";

  it("zapisuje filtry po polsku i pomija te, które niczego nie zawężają", () => {
    expect(toolListSearch(noFilters)).toBe("");
    expect(toolListSearch({ ...noFilters, show: ALARM })).toBe("?pokaz=z-alarmem");
    expect(toolListSearch({ query: "hilti te", category: "Młotowiertarki", place: rataje, show: IN_SERVICE, withRetiredAndReturned: true })).toBe(
      `?szukaj=hilti+te&kategoria=M%C5%82otowiertarki&lokalizacja=${rataje}&pokaz=w-serwisie&wycofane=tak`,
    );
  });

  it("odczytuje każdy filtr z adresu, także z parametrów strony Next.js", () => {
    for (const show of [LOST, IN_SERVICE, ALARM]) {
      expect(parseToolListFilters(new URLSearchParams(`pokaz=${show}`))).toEqual({ ...noFilters, show });
    }
    expect(parseToolListFilters({ szukaj: " hilti ", kategoria: "Młotowiertarki", lokalizacja: rataje, pokaz: ["w-serwisie", "zaginione"], wycofane: "tak" })).toEqual({
      query: "hilti",
      category: "Młotowiertarki",
      place: rataje,
      show: IN_SERVICE,
      withRetiredAndReturned: true,
    });
    const filters = { query: "s02", category: "Szlifierki", place: rataje, show: ALARM, withRetiredAndReturned: false } as const;
    expect(parseToolListFilters(new URLSearchParams(toolListSearch(filters)))).toEqual(filters);
  });

  it("nieznany filtr i lokalizację, która nie jest identyfikatorem, pomija", () => {
    expect(parseToolListFilters({ pokaz: "wszystko", lokalizacja: "Rataje", wycofane: "nie" })).toEqual(noFilters);
    expect(parseToolListFilters({ lokalizacja: "zaginione" })).toEqual(noFilters);
    expect(parseToolListFilters({})).toEqual(noFilters);
  });

  it("zaginione nie są w żadnej lokalizacji: przy pokaz=zaginione lokalizację z adresu zdejmuje", () => {
    expect(parseToolListFilters({ pokaz: "zaginione", lokalizacja: rataje })).toEqual({ ...noFilters, show: LOST });
  });
});
