import { describe, expect, it } from "vitest";
import { guessMapping, IMPORT_FIELDS, mapRows } from "./columns";
import { sampleImportFile } from "./sample";
import { readSheetFile } from "./sheet";

describe("przykładowy plik importu", () => {
  it("mapowanie rozpoznaje każdą kolumnę, a wiersze mają kategorie i lokalizacje firmy", async () => {
    const file = await sampleImportFile({
      categories: [{ name: "Wiertarki i młoty" }, { name: "Szlifierki" }, { name: "Pomiarowe" }],
      base: "Magazyn Swarzędz",
      sites: ["Rataje"],
      today: "2026-03-02",
    });
    const sheet = await readSheetFile({ name: "narzedzia-przyklad.xlsx", data: new Uint8Array(file).buffer });
    const mapping = guessMapping(sheet.headers);

    expect(IMPORT_FIELDS.filter((field) => mapping[field] === null)).toEqual([]);
    expect(mapRows(sheet, mapping).map(({ name, category, location, code }) => ({ name, category, location, code }))).toEqual([
      { name: "Młotowiertarka", category: "Wiertarki i młoty", location: "Rataje", code: "" },
      { name: "Szlifierka kątowa 125 mm", category: "Szlifierki", location: "Magazyn Swarzędz", code: "" },
      { name: "Niwelator laserowy", category: "Pomiarowe", location: "", code: "" },
    ]);
    // Terminy w przykładzie są za kilka miesięcy od dziś, w zapisie, który ludzie wpisują w Excelu.
    expect(mapRows(sheet, mapping).map(({ inspectionDue, warrantyUntil }) => [inspectionDue, warrantyUntil])).toEqual([
      ["2.09.2026", "2.03.2028"],
      ["", ""],
      ["2.06.2026", "2.03.2027"],
    ]);
  });

  it("bez pasującej kategorii bierze kolejne kategorie firmy", async () => {
    const file = await sampleImportFile({ categories: [{ name: "Elektronarzędzia" }], base: "Baza", sites: [], today: "2026-03-02" });
    const sheet = await readSheetFile({ name: "narzedzia-przyklad.xlsx", data: new Uint8Array(file).buffer });

    expect(mapRows(sheet, guessMapping(sheet.headers)).map((row) => [row.category, row.location])).toEqual([
      ["Elektronarzędzia", "Baza"],
      ["Elektronarzędzia", "Baza"],
      ["Elektronarzędzia", ""],
    ]);
  });
});
