import { randomUUID } from "node:crypto";
import readXlsxFile from "read-excel-file/node";
import { describe, expect, it } from "vitest";
import { setupRegistryTestbed } from "@/registry/testing/harness";
import { exportWorkbook } from "./workbook";

const testbed = setupRegistryTestbed();
const DAY = 24 * 60 * 60 * 1000;

/**
 * Zawbud z kierownikiem Nowakiem (Rataje), serwisem Hilti i narzędziami przyjętymi 2 marca o 7:00:
 * młot H-01 za 3200 zł, szlifierki S-01 za 450,50 zł i S-02 bez wartości, agregat A-01 za 1200 zł.
 * 3 marca o 7:00 Nowak wydaje H-01 i S-01 na Rataje, a 10 marca właściciel oznacza A-01 jako
 * zaginiony na bazie. Eksport robimy 5 kwietnia o 9:00.
 */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Swarzędz" });
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const storekeeperId = await testbed.givenMember(zawbud, "magazynier", "Ewa Magazyn");
  const owner = testbed.registry.as(zawbud.ownerId);
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
  await owner.addService({ name: "Serwis Hilti" });
  const category = await owner.addCategory({ name: "Elektronarzędzia", prefix: "E" });
  const tool = async (code: string, name: string, value?: number) =>
    (await owner.addTool({ operationId: randomUUID(), code, name, categoryId: category.id, value })).toolId;
  const h01 = await tool("H-01", "Młot Hilti", 3200);
  const s01 = await tool("S-01", "Szlifierka kątowa", 450.5);
  await tool("S-02", "Szlifierka mała");
  const a01 = await tool("A-01", "Agregat", 1200);
  const { base } = await owner.whereIsWhat();

  testbed.clock.set("2026-03-03T07:00:00+01:00");
  await testbed.registry.as(nowakId).registerMovement({
    operationId: randomUUID(),
    kind: "wydanie",
    fromLocationId: base.id,
    toLocationId: ratajeId,
    toolIds: [h01, s01],
    source: "checklista",
  });
  testbed.clock.set("2026-03-10T12:15:00+01:00");
  await owner.markToolLost({ operationId: randomUUID(), toolId: a01, reason: "nie ma go na bazie" });
  testbed.clock.set("2026-04-05T09:00:00+02:00");

  return { zawbud, owner, nowakId, storekeeperId, ratajeId, h01 };
}

async function sheetsOf(file: Buffer) {
  const sheets = await readXlsxFile(file);
  return Object.fromEntries(sheets.map((sheet) => [sheet.sheet, sheet.data]));
}

const STATE_HEADER = ["Lokalizacja", "Rodzaj lokalizacji", "Kierownik", "Kod", "Nazwa", "Stan", "Od ilu dni", "Alarm"];
const HISTORY_HEADER = ["Czas zdarzenia", "Rodzaj", "Narzędzia", "Skąd", "Dokąd", "Osoba", "Źródło", "Powód", "Zmiana stanu", "Cofnięty", "Czas zapisu"];

/** Czas polski jako data w Excelu (bez strefy): 3 marca 7:00 w Polsce to 3 marca 7:00 w arkuszu. */
function wallClock(text: string) {
  return new Date(`${text}Z`);
}

describe("eksport do Excela", () => {
  it("właściciel dostaje stan „Gdzie jest co” z wartościami i przefiltrowaną historię z czasem polskim", async () => {
    const z = await givenZawbud();

    const sheets = await sheetsOf(await exportWorkbook(await z.owner.exportData({ toolId: z.h01 })));

    expect(Object.keys(sheets)).toEqual(["Gdzie jest co", "Historia"]);
    expect(sheets["Gdzie jest co"]).toEqual([
      [...STATE_HEADER, "Wartość (zł)"],
      ["Magazyn Swarzędz", "Baza", null, "S-02", "Szlifierka mała", "W obiegu", 34, null, null],
      ["Rataje", "Budowa", "Adam Nowak", "H-01", "Młot Hilti", "W obiegu", 33, "po progu", 3200],
      ["Rataje", "Budowa", "Adam Nowak", "S-01", "Szlifierka kątowa", "W obiegu", 33, "po progu", 450.5],
      ["Magazyn Swarzędz", null, null, "A-01", "Agregat", "Zaginione", 25, null, 1200],
    ]);
    expect(sheets["Historia"]).toEqual([
      HISTORY_HEADER,
      [
        wallClock("2026-03-03T07:00:00"),
        "Wydanie",
        "H-01 Młot Hilti, S-01 Szlifierka kątowa",
        "Magazyn Swarzędz",
        "Rataje",
        "Adam Nowak",
        "checklista",
        null,
        null,
        null,
        wallClock("2026-03-03T07:00:00"),
      ],
      [
        wallClock("2026-03-02T07:00:00"),
        "Przyjęcie",
        "H-01 Młot Hilti",
        null,
        "Magazyn Swarzędz",
        "Właściciel Zawbud",
        "panel",
        null,
        null,
        null,
        wallClock("2026-03-02T07:00:00"),
      ],
    ]);
  });

  it("zaginięcie, powód i cofnięcie trafiają do historii w eksporcie", async () => {
    const z = await givenZawbud();
    const issued = await testbed.registry.as(z.nowakId).registerMovement({
      operationId: randomUUID(),
      kind: "zwrot",
      fromLocationId: z.ratajeId,
      toLocationId: (await z.owner.whereIsWhat()).base.id,
      toolIds: [z.h01],
      source: "checklista",
    });
    await testbed.registry.as(z.nowakId).undoMovement({ operationId: randomUUID(), movementId: issued.id });

    const history = (await sheetsOf(await exportWorkbook(await z.owner.exportData({ from: "2026-03-10" }))))["Historia"];

    expect(history.slice(1).map((row) => [row[1], row[2], row[7], row[8], row[9]])).toEqual([
      ["Cofnięcie", "H-01 Młot Hilti", null, null, null],
      ["Zwrot", "H-01 Młot Hilti", null, null, "tak"],
      ["Zaginięcie", "A-01 Agregat", "nie ma go na bazie", "W obiegu → Zaginione", null],
    ]);
  });

  it("kierownik i magazynier dostają ten sam eksport bez żadnej wartości w złotówkach", async () => {
    const z = await givenZawbud();
    const ownerSheets = await sheetsOf(await exportWorkbook(await z.owner.exportData({})));

    for (const actorId of [z.nowakId, z.storekeeperId]) {
      const file = await exportWorkbook(await testbed.registry.as(actorId).exportData({}));
      const sheets = await sheetsOf(file);

      expect(sheets["Gdzie jest co"]).toEqual(ownerSheets["Gdzie jest co"].map((row) => row.slice(0, -1)));
      expect(sheets["Historia"]).toEqual(ownerSheets["Historia"]);
      expect(JSON.stringify(sheets)).not.toMatch(/Wartość|zł|3200|450\.5|1200/);
    }
  });

  it("dni w miejscu liczą się od ostatniego ruchu, jak na tablicy", async () => {
    const z = await givenZawbud();
    testbed.clock.advance(DAY);

    const state = (await sheetsOf(await exportWorkbook(await z.owner.exportData({}))))["Gdzie jest co"];

    expect(state.slice(1).map((row) => [row[3], row[6]])).toEqual([
      ["S-02", 35],
      ["H-01", 34],
      ["S-01", 34],
      ["A-01", 26],
    ]);
  });
});
