import { describe, expect, it } from "vitest";
import type { ListedTool } from "@/registry/registry";
import { ALL, filterTools, LOST, toolListOptions } from "./tool-list";

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
  ...changes,
});

const tools = [
  tool("H-01", { name: "Młotowiertarka", category: "Młotowiertarki", brand: "Hilti", model: "TE 30", location: rataje }),
  tool("H-02", { name: "Młotowiertarka", category: "Młotowiertarki", location: serwis }),
  tool("S-01", { location: bus }),
  tool("S-02", { state: "zaginione", location: rataje }),
  tool("S-03", { state: "wycofane" }),
  tool("K-01", { name: "Minikoparka", category: "Maszyny", state: "zwrocone", rented: true, location: tarasy }),
  tool("S-04"),
];

const codes = (list: ListedTool[]) => list.map((item) => item.code);
const noFilters = { query: "", category: ALL, place: ALL, withRetired: false };

describe("filtry listy narzędzi", () => {
  it("bez filtrów pokazuje sprzęt w obiegu i zaginiony, a wycofany i zwrócony dopiero na życzenie", () => {
    expect(codes(filterTools(tools, noFilters))).toEqual(["H-01", "H-02", "S-01", "S-02", "S-04"]);
    expect(codes(filterTools(tools, { ...noFilters, withRetired: true }))).toEqual(codes(tools));
  });

  it("pole szuka jak lupa: po słowach w nazwie, kategorii, marce i modelu albo po kodzie bez kresek", () => {
    expect(codes(filterTools(tools, { ...noFilters, query: "hilti te 30" }))).toEqual(["H-01"]);
    expect(codes(filterTools(tools, { ...noFilters, query: "mlotowiertarki" }))).toEqual(["H-01", "H-02"]);
    expect(codes(filterTools(tools, { ...noFilters, query: "s02" }))).toEqual(["S-02"]);
  });

  it("zawęża do kategorii i do miejsca, w którym sprzęt jest teraz; zaginione mają osobną pozycję", () => {
    expect(codes(filterTools(tools, { ...noFilters, category: "Szlifierki" }))).toEqual(["S-01", "S-02", "S-04"]);
    expect(codes(filterTools(tools, { ...noFilters, place: "r" }))).toEqual(["H-01"]);
    expect(codes(filterTools(tools, { ...noFilters, place: LOST }))).toEqual(["S-02"]);
    expect(codes(filterTools(tools, { ...noFilters, place: "b", withRetired: true }))).toEqual(["S-04"]);
    expect(codes(filterTools(tools, { ...noFilters, category: "Szlifierki", place: "v", query: "kątowa" }))).toEqual(["S-01"]);
  });

  it("w wyborze są kategorie sprzętu i miejsca, w których coś jest: baza, budowy, pojazdy, serwisy, potem zaginione", () => {
    expect(toolListOptions(tools)).toEqual({
      categories: ["Maszyny", "Młotowiertarki", "Szlifierki"],
      places: [base, rataje, bus, serwis],
      hasLost: true,
      hasRetired: true,
    });
    expect(toolListOptions([tool("S-04")])).toEqual({ categories: ["Szlifierki"], places: [base], hasLost: false, hasRetired: false });
  });
});
