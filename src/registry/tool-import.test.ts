import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ToolImportRow } from "./registry";
import { type GivenCompany, setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();
const DAY = 24 * 60 * 60 * 1000;

/** Firma z kategoriami Młoty (H) i Szlifierki (S), budową Rataje i serwisem Hilti. */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Swarzędz" });
  const owner = testbed.registry.as(zawbud.ownerId);
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const hammers = await owner.addCategory({ name: "Młoty", prefix: "H" });
  const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
  const { locationId: hiltiId } = await owner.addService({ name: "Serwis Hilti" });
  return { zawbud, owner, nowakId, hammers, grinders, ratajeId, hiltiId };
}

async function toolCount(company: GivenCompany) {
  const board = await testbed.registry.as(company.ownerId).whereIsWhat();
  return board.base.tools.length + board.sites.flatMap((site) => site.tools).length + board.services.flatMap((s) => s.tools).length;
}

describe("podgląd importu", () => {
  it("pokazuje błędy każdego wiersza i niczego nie zapisuje", async () => {
    const z = await givenZawbud();
    await z.owner.addTool({ operationId: randomUUID(), code: "H-01", name: "Młot Hilti", categoryId: z.hammers.id });
    await testbed.db.transaction((sql) => sql("update app.locations set status = 'zakonczona' where id = $1", [z.ratajeId]));

    const preview = await z.owner.previewToolImport([
      { code: "H-02", name: "Młot Bosch", category: "Młoty", value: "1 200,50 zł" },
      { code: "", name: "  ", category: "Młoty" },
      { code: "S-01", name: "Szlifierka", category: "S" },
      { code: "s-01", name: "Szlifierka druga", category: "Szlifierki" },
      { code: "h-01", name: "Młot z pliku", category: "Młoty" },
      { code: "H 01!", name: "Młot", category: "Młoty" },
      { name: "Młot", category: "Młoty", value: "tysiąc" },
      { name: "Młot", category: "Młoty", value: "-5" },
      { name: "Wiertarka", category: "Wiertarki" },
      { name: "Wiertarka", category: "" },
      { name: "Młot", category: "Młoty", location: "Wilda" },
      { name: "Młot", category: "Młoty", location: "Rataje" },
    ]);

    expect(preview.rows.map((row) => row.errors)).toEqual([
      [],
      ["name_missing"],
      ["code_repeated"],
      ["code_repeated"],
      ["code_taken"],
      ["code_invalid"],
      ["value_invalid"],
      ["value_invalid"],
      ["category_unknown"],
      ["category_missing"],
      ["location_unknown"],
      ["site_finished"],
    ]);
    expect(preview.invalidRows).toBe(11);
    expect(preview.rows[0]).toEqual({
      code: "H-02",
      codeAssigned: false,
      name: "Młot Bosch",
      category: z.hammers,
      brand: null,
      model: null,
      serialNumber: null,
      value: 1200.5,
      location: { id: expect.any(String), name: "Magazyn Swarzędz", kind: "baza" },
      errors: [],
    });
    expect(await toolCount(z.zawbud)).toBe(1);
  });

  it("nazwa lokalizacji, którą ma kilka lokalizacji firmy, jest niejednoznaczna", async () => {
    const z = await givenZawbud();
    await z.owner.addService({ name: "rataje" });

    const preview = await z.owner.previewToolImport([{ name: "Młot", category: "Młoty", location: " RATAJE " }]);

    expect(preview.rows[0].errors).toEqual(["location_ambiguous"]);
  });

  it("wiersze bez kodu dostają kolejne kody kategorii, za najwyższym numerem w firmie i w pliku", async () => {
    const z = await givenZawbud();
    await z.owner.addTool({ operationId: randomUUID(), code: "H-03", name: "Młot Hilti", categoryId: z.hammers.id });

    const preview = await z.owner.previewToolImport([
      { name: "Młot 1", category: "Młoty" },
      { code: "H-07", name: "Młot 2", category: "Młoty" },
      { name: "Szlifierka 1", category: "Szlifierki" },
      { name: "Młot 3", category: "H" },
      { name: "Szlifierka 2", category: "s" },
      { name: "", category: "Młoty" },
      { name: "Wiertarka", category: "Wiertarki" },
    ]);

    expect(preview.rows.map((row) => [row.code, row.codeAssigned])).toEqual([
      ["H-08", true],
      ["H-07", false],
      ["S-01", true],
      ["H-09", true],
      ["S-02", true],
      ["H-10", true],
      [null, false],
    ]);
  });

  it("podgląd i import są tylko dla właściciela", async () => {
    const z = await givenZawbud();
    const storekeeperId = await testbed.givenMember(z.zawbud, "magazynier");
    const rows = [{ name: "Młot", category: "Młoty" }];

    for (const userId of [storekeeperId, z.nowakId]) {
      const actor = testbed.registry.as(userId);
      await expect(actor.previewToolImport(rows)).rejects.toMatchObject({ code: "forbidden" });
      await expect(actor.importTools({ operationId: randomUUID(), rows })).rejects.toMatchObject({ code: "forbidden" });
    }
    expect(await toolCount(z.zawbud)).toBe(0);
  });

  it("odrzuca pusty plik, za dużo wierszy i wiersze, które nie są tekstem", async () => {
    const z = await givenZawbud();
    const many = Array.from({ length: 2001 }, (_, i) => ({ name: `Młot ${i}`, category: "Młoty" }));

    for (const rows of [[], many, [{ name: 5 } as unknown as ToolImportRow], [null as unknown as ToolImportRow]]) {
      await expect(z.owner.previewToolImport(rows)).rejects.toMatchObject({ code: "invalid_input" });
      await expect(z.owner.importTools({ operationId: randomUUID(), rows })).rejects.toMatchObject({ code: "invalid_input" });
    }
  });
});

describe("zatwierdzenie importu", () => {
  it("zapisuje narzędzia z przyjęciem do lokalizacji z pliku, a bez niej na bazę, ze źródłem „import”", async () => {
    const z = await givenZawbud();

    const result = await z.owner.importTools({
      operationId: randomUUID(),
      rows: [
        { code: "H-01", name: "Młot Hilti", category: "Młoty", brand: "Hilti", model: "TE 30", serialNumber: "SN-1", value: "3200" },
        { name: "Szlifierka", category: "Szlifierki", location: "rataje", value: "450,99" },
        { name: "Młot Bosch", category: "Młoty", location: "Serwis Hilti" },
        { name: "Młot Makita", category: "Młoty", location: "Rataje" },
      ],
    });
    testbed.clock.advance(2 * DAY);

    expect(result).toEqual({ imported: 4 });
    const board = await z.owner.whereIsWhat();
    expect(board.base.tools).toEqual([
      { id: expect.any(String), code: "H-01", name: "Młot Hilti", registration: "zaakceptowane", daysInPlace: 2, alarm: false, value: 3200 },
    ]);
    expect(board.sites[0].tools.map((tool) => [tool.code, tool.name, tool.daysInPlace, tool.value])).toEqual([
      ["H-03", "Młot Makita", 2, null],
      ["S-01", "Szlifierka", 2, 450.99],
    ]);
    expect(board.services[0].tools.map((tool) => tool.code)).toEqual(["H-02"]);

    const card = await z.owner.toolCard(board.base.tools[0].id);
    expect(card).toMatchObject({
      brand: "Hilti",
      model: "TE 30",
      serialNumber: "SN-1",
      category: z.hammers,
      history: [{ kind: "przyjecie", source: "import", author: "Właściciel Zawbud", from: null, to: "Magazyn Swarzędz" }],
    });

    const { movements } = await z.owner.movementHistory();
    expect(
      movements.map((movement) => [movement.kind, movement.source, movement.to?.name, movement.tools.map((tool) => tool.code).sort()]),
    ).toEqual(
      expect.arrayContaining([
        ["przyjecie", "import", "Magazyn Swarzędz", ["H-01"]],
        ["przyjecie", "import", "Rataje", ["H-03", "S-01"]],
        ["przyjecie", "import", "Serwis Hilti", ["H-02"]],
      ]),
    );
    expect(movements).toHaveLength(3);
  });

  it("jeden błędny wiersz odrzuca cały import i nic się nie zapisuje", async () => {
    const z = await givenZawbud();

    await expect(
      z.owner.importTools({
        operationId: randomUUID(),
        rows: [
          { name: "Młot Hilti", category: "Młoty" },
          { name: "Szlifierka", category: "Szlifierki", value: "dużo" },
        ],
      }),
    ).rejects.toMatchObject({ code: "import_invalid" });

    expect(await toolCount(z.zawbud)).toBe(0);
    expect((await z.owner.movementHistory()).movements).toEqual([]);
  });

  it("kod zajęty po podglądzie odrzuca cały import przy zatwierdzeniu", async () => {
    const z = await givenZawbud();
    const rows = [
      { name: "Młot 1", category: "Młoty" },
      { code: "H-05", name: "Młot 2", category: "Młoty" },
    ];
    expect((await z.owner.previewToolImport(rows)).invalidRows).toBe(0);
    await z.owner.addTool({ operationId: randomUUID(), code: "H-05", name: "Młot dodany ręcznie", categoryId: z.hammers.id });

    await expect(z.owner.importTools({ operationId: randomUUID(), rows })).rejects.toMatchObject({ code: "import_invalid" });

    expect((await z.owner.whereIsWhat()).base.tools.map((tool) => tool.name)).toEqual(["Młot dodany ręcznie"]);
  });

  it("ponowne wysłanie tego samego importu zwraca pierwotny wynik i nie dubluje narzędzi", async () => {
    const z = await givenZawbud();
    const input = {
      operationId: randomUUID(),
      rows: [
        { name: "Młot 1", category: "Młoty" },
        { name: "Młot 2", category: "Młoty" },
      ],
    };

    const [first, second] = await Promise.all([z.owner.importTools(input), z.owner.importTools(input)]);
    const third = await z.owner.importTools(input);

    expect([first, second, third]).toEqual([{ imported: 2 }, { imported: 2 }, { imported: 2 }]);
    expect((await z.owner.whereIsWhat()).base.tools.map((tool) => tool.code)).toEqual(["H-01", "H-02"]);
  });
});

describe("izolacja firm przy imporcie", () => {
  it("kody, kategorie i lokalizacje innej firmy nie istnieją dla importu, a narzędzia trafiają tylko do firmy importującego", async () => {
    const z = await givenZawbud();
    const budrex = await testbed.givenActiveCompany("Budrex", { baseName: "Magazyn Rataje" });
    const budrexOwner = testbed.registry.as(budrex.ownerId);
    const budrexHammers = await budrexOwner.addCategory({ name: "Młoty", prefix: "H" });
    await budrexOwner.addCategory({ name: "Wiertarki", prefix: "W" });
    await budrexOwner.addService({ name: "Serwis Makita" });
    for (const code of ["H-01", "H-02", "H-30"]) {
      await budrexOwner.addTool({ operationId: randomUUID(), code, name: "Młot Budrexu", categoryId: budrexHammers.id });
    }

    const preview = await z.owner.previewToolImport([
      { code: "H-01", name: "Młot", category: "Młoty" },
      { name: "Młot", category: "Młoty" },
      { name: "Wiertarka", category: "Wiertarki" },
      { name: "Młot", category: "Młoty", location: "Serwis Makita" },
      { name: "Młot", category: "Młoty", location: "Magazyn Rataje" },
    ]);
    expect(preview.rows.map((row) => [row.code, row.errors])).toEqual([
      ["H-01", []],
      ["H-02", []],
      [null, ["category_unknown"]],
      ["H-03", ["location_unknown"]],
      ["H-04", ["location_unknown"]],
    ]);

    await z.owner.importTools({ operationId: randomUUID(), rows: preview.rows.slice(0, 2).map((row) => ({ name: row.name, category: "Młoty" })) });

    expect((await z.owner.whereIsWhat()).base.tools.map((tool) => tool.code)).toEqual(["H-01", "H-02"]);
    expect((await budrexOwner.whereIsWhat()).base.tools.map((tool) => tool.code)).toEqual(["H-01", "H-02", "H-30"]);
    expect((await budrexOwner.movementHistory()).movements.every((movement) => movement.source === "panel")).toBe(true);
  });
});
