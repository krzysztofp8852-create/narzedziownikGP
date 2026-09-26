import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Movement } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();
const DAY = 24 * 60 * 60 * 1000;

/**
 * Firma z kierownikami Nowakiem (Rataje) i Kowalskim (Wilda), serwisem Hilti i trzema narzędziami
 * przyjętymi na bazę 2 marca: H-01, S-01, S-02. Potem:
 * - 3 marca 7:00 Nowak wydaje S-01 i H-01 na Rataje,
 * - 6 marca 0:30 czasu polskiego (5 marca w UTC) Kowalski wydaje S-02 na Wildę,
 * - 8 marca 7:00 Nowak zwraca S-01 z Rataj.
 */
async function givenZawbudWithHistory() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Swarzędz" });
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const kowalskiId = await testbed.givenMember(zawbud, "kierownik", "Jan Kowalski");
  const owner = testbed.registry.as(zawbud.ownerId);
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
  const { locationId: wildaId } = await owner.addSite({ name: "Wilda", address: "ul. Górna Wilda 5", managerId: kowalskiId });
  const { locationId: hiltiId } = await owner.addService({ name: "Serwis Hilti" });
  const hammers = await owner.addCategory({ name: "Młoty", prefix: "H" });
  const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
  const tool = async (code: string, name: string, categoryId: string) =>
    (await owner.addTool({ operationId: randomUUID(), code, name, categoryId })).toolId;
  const h01 = await tool("H-01", "Młot Hilti", hammers.id);
  const s01 = await tool("S-01", "Szlifierka kątowa", grinders.id);
  const s02 = await tool("S-02", "Szlifierka mała", grinders.id);
  const { base } = await owner.whereIsWhat();

  const move = (actorId: string, kind: "wydanie" | "zwrot", siteId: string, toolIds: string[]) =>
    testbed.registry.as(actorId).registerMovement({
      operationId: randomUUID(),
      kind,
      fromLocationId: kind === "wydanie" ? base.id : siteId,
      toLocationId: kind === "wydanie" ? siteId : base.id,
      toolIds,
      source: "checklista",
    });
  testbed.clock.set("2026-03-03T07:00:00+01:00");
  await move(nowakId, "wydanie", ratajeId, [s01, h01]);
  testbed.clock.set("2026-03-06T00:30:00+01:00");
  await move(kowalskiId, "wydanie", wildaId, [s02]);
  testbed.clock.set("2026-03-08T07:00:00+01:00");
  await move(nowakId, "zwrot", ratajeId, [s01]);

  return { zawbud, owner, nowakId, kowalskiId, ratajeId, wildaId, hiltiId, baseId: base.id, h01, s01, s02 };
}

/** Ruch w skrócie: rodzaj, autor i kody narzędzi. */
function brief(movements: Movement[]) {
  return movements.map((movement) => [movement.kind, movement.author, movement.tools.map((tool) => tool.code).join(" ")]);
}

describe("historia ruchów", () => {
  it("bez filtrów pokazuje wszystkie ruchy firmy od najnowszego, z trasą, osobą, czasem i źródłem", async () => {
    const z = await givenZawbudWithHistory();

    const { movements, hasMore } = await z.owner.movementHistory();

    expect(hasMore).toBe(false);
    expect(brief(movements)).toEqual([
      ["zwrot", "Adam Nowak", "S-01"],
      ["wydanie", "Jan Kowalski", "S-02"],
      ["wydanie", "Adam Nowak", "H-01 S-01"],
      ["przyjecie", "Właściciel Zawbud", "S-02"],
      ["przyjecie", "Właściciel Zawbud", "S-01"],
      ["przyjecie", "Właściciel Zawbud", "H-01"],
    ]);
    expect(movements[0]).toMatchObject({
      kind: "zwrot",
      source: "checklista",
      occurredAt: new Date("2026-03-08T07:00:00+01:00"),
      from: { id: z.ratajeId, name: "Rataje" },
      to: { id: z.baseId, name: "Magazyn Swarzędz" },
      undoneBy: null,
    });
  });

  it("filtr budowy: ruchy na tę budowę i z niej", async () => {
    const z = await givenZawbudWithHistory();

    const { movements } = await z.owner.movementHistory({ locationId: z.ratajeId });

    expect(brief(movements)).toEqual([
      ["zwrot", "Adam Nowak", "S-01"],
      ["wydanie", "Adam Nowak", "H-01 S-01"],
    ]);
  });

  it("filtr osoby: ruchy, które zapisała ta osoba", async () => {
    const z = await givenZawbudWithHistory();

    const { movements } = await z.owner.movementHistory({ personId: z.kowalskiId });

    expect(brief(movements)).toEqual([["wydanie", "Jan Kowalski", "S-02"]]);
  });

  it("filtr narzędzia: ruchy, w których było to narzędzie, z wszystkimi narzędziami ruchu", async () => {
    const z = await givenZawbudWithHistory();

    const { movements } = await z.owner.movementHistory({ toolId: z.s01 });

    expect(brief(movements)).toEqual([
      ["zwrot", "Adam Nowak", "S-01"],
      ["wydanie", "Adam Nowak", "H-01 S-01"],
      ["przyjecie", "Właściciel Zawbud", "S-01"],
    ]);
  });

  it("zakres dat obejmuje całe dni od pierwszego do ostatniego, liczone czasem polskim", async () => {
    const z = await givenZawbudWithHistory();

    const march3to5 = await z.owner.movementHistory({ from: "2026-03-03", to: "2026-03-05" });
    const fromMarch6 = await z.owner.movementHistory({ from: "2026-03-06" });
    const untilMarch2 = await z.owner.movementHistory({ to: "2026-03-02" });

    expect(brief(march3to5.movements)).toEqual([["wydanie", "Adam Nowak", "H-01 S-01"]]);
    expect(brief(fromMarch6.movements)).toEqual([
      ["zwrot", "Adam Nowak", "S-01"],
      ["wydanie", "Jan Kowalski", "S-02"],
    ]);
    expect(untilMarch2.movements.map((movement) => movement.kind)).toEqual(["przyjecie", "przyjecie", "przyjecie"]);
  });

  it("filtry łączą się: budowa, osoba, narzędzie i daty naraz", async () => {
    const z = await givenZawbudWithHistory();

    const { movements } = await z.owner.movementHistory({
      locationId: z.ratajeId,
      personId: z.nowakId,
      toolId: z.h01,
      from: "2026-03-01",
      to: "2026-03-31",
    });
    const nothing = await z.owner.movementHistory({ locationId: z.wildaId, toolId: z.s01 });

    expect(brief(movements)).toEqual([["wydanie", "Adam Nowak", "H-01 S-01"]]);
    expect(nothing.movements).toEqual([]);
  });

  it("cofnięty ruch zostaje w historii z odnośnikiem do cofnięcia, które też jest w historii", async () => {
    const z = await givenZawbudWithHistory();
    const issued = await testbed.registry.as(z.nowakId).registerMovement({
      operationId: randomUUID(),
      kind: "wydanie",
      fromLocationId: z.baseId,
      toLocationId: z.ratajeId,
      toolIds: [z.s01],
      source: "checklista",
    });
    const undo = await testbed.registry.as(z.nowakId).undoMovement({ operationId: randomUUID(), movementId: issued.id });

    const { movements } = await z.owner.movementHistory({ toolId: z.s01, from: "2026-03-08" });

    expect(movements.map((movement) => [movement.kind, movement.undoneBy, movement.undoes])).toEqual([
      ["cofniecie", null, issued.id],
      ["wydanie", undo.id, null],
      ["zwrot", null, null],
    ]);
  });

  it("korekta z powodem jest w historii jak każdy ruch", async () => {
    const z = await givenZawbudWithHistory();
    testbed.clock.advance(DAY);
    await z.owner.correctTool({ operationId: randomUUID(), toolId: z.h01, locationId: z.hiltiId, reason: "pojechał do naprawy" });

    const { movements } = await z.owner.movementHistory({ locationId: z.hiltiId });

    expect(movements).toEqual([
      expect.objectContaining({
        kind: "korekta",
        author: "Właściciel Zawbud",
        source: "panel",
        from: { id: z.ratajeId, name: "Rataje" },
        to: { id: z.hiltiId, name: "Serwis Hilti" },
        reason: "pojechał do naprawy",
      }),
    ]);
  });

  it("kierownik i magazynier widzą tę samą historię firmy co właściciel", async () => {
    const z = await givenZawbudWithHistory();
    const storekeeperId = await testbed.givenMember(z.zawbud, "magazynier", "Ewa Magazyn");

    const ownerView = await z.owner.movementHistory({ locationId: z.wildaId });

    expect(await testbed.registry.as(z.nowakId).movementHistory({ locationId: z.wildaId })).toEqual(ownerView);
    expect(await testbed.registry.as(storekeeperId).movementHistory({ locationId: z.wildaId })).toEqual(ownerView);
  });

  it("z limitem zwraca najnowsze ruchy i mówi, że jest ich więcej", async () => {
    const z = await givenZawbudWithHistory();

    const firstTwo = await z.owner.movementHistory({}, { limit: 2 });
    const all = await z.owner.movementHistory({}, { limit: 6 });

    expect(brief(firstTwo.movements)).toEqual([
      ["zwrot", "Adam Nowak", "S-01"],
      ["wydanie", "Jan Kowalski", "S-02"],
    ]);
    expect(firstTwo.hasMore).toBe(true);
    expect(all.movements).toHaveLength(6);
    expect(all.hasMore).toBe(false);
    expect(await z.owner.movementHistory({}, { limit: 0 })).toEqual({ movements: [firstTwo.movements[0]], hasMore: true });
  });

  it("odrzuca filtr, który nie jest identyfikatorem albo dniem; zakres od końca do początku jest pusty", async () => {
    const z = await givenZawbudWithHistory();

    for (const filters of [{ locationId: "rataje" }, { personId: "1" }, { toolId: "S-01" }, { from: "3 marca" }, { to: "2026-02-30" }]) {
      await expect(z.owner.movementHistory(filters)).rejects.toMatchObject({ code: "invalid_input" });
    }
    expect((await z.owner.movementHistory({ from: "2026-03-08", to: "2026-03-03" })).movements).toEqual([]);
  });
});

describe("historia a izolacja firm", () => {
  it("firma B nie widzi ruchów firmy A, także filtrując po jej budowie, osobie i narzędziu", async () => {
    const z = await givenZawbudWithHistory();
    const budrex = await testbed.givenActiveCompany("Budrex");
    const budrexOwner = testbed.registry.as(budrex.ownerId);

    expect((await budrexOwner.movementHistory()).movements).toEqual([]);
    for (const filters of [{ locationId: z.ratajeId }, { personId: z.nowakId }, { toolId: z.s01 }]) {
      expect((await budrexOwner.movementHistory(filters)).movements).toEqual([]);
    }
    const options = await budrexOwner.historyFilterOptions();
    expect(JSON.stringify(options)).not.toMatch(/Rataje|Nowak|S-01/);
  });
});

describe("opcje filtrów historii", () => {
  it("lokalizacje, wszystkie osoby (także dezaktywowane) i wszystkie narzędzia (także wycofane)", async () => {
    const z = await givenZawbudWithHistory();
    await z.owner.deactivateMember(z.kowalskiId);
    await z.owner.retireTool({ operationId: randomUUID(), toolId: z.s02, reason: "sprzedana" });

    const options = await testbed.registry.as(z.nowakId).historyFilterOptions();

    expect(options.base).toEqual({ id: z.baseId, name: "Magazyn Swarzędz" });
    expect(options.sites.map((site) => site.name)).toEqual(["Rataje", "Wilda"]);
    expect(options.services).toEqual([{ id: z.hiltiId, name: "Serwis Hilti" }]);
    expect(options.people).toEqual([
      { id: z.nowakId, fullName: "Adam Nowak", active: true },
      { id: z.kowalskiId, fullName: "Jan Kowalski", active: false },
      { id: z.zawbud.ownerId, fullName: "Właściciel Zawbud", active: true },
    ]);
    expect(options.tools).toEqual([
      { id: z.h01, code: "H-01", name: "Młot Hilti" },
      { id: z.s01, code: "S-01", name: "Szlifierka kątowa" },
      { id: z.s02, code: "S-02", name: "Szlifierka mała" },
    ]);
  });
});

describe("dane do eksportu", () => {
  it("stan i cała historia z filtrami; wartości w zł tylko u właściciela, u kierownika i magazyniera żadnego klucza wartości", async () => {
    const z = await givenZawbudWithHistory();
    await z.owner.editTool(z.h01, { value: 3200 });
    const storekeeperId = await testbed.givenMember(z.zawbud, "magazynier", "Ewa Magazyn");

    const ownerData = await z.owner.exportData({ locationId: z.ratajeId });

    expect(ownerData.generatedAt).toEqual(testbed.clock.now());
    expect(brief(ownerData.movements)).toEqual([
      ["zwrot", "Adam Nowak", "S-01"],
      ["wydanie", "Adam Nowak", "H-01 S-01"],
    ]);
    expect(ownerData.board.offBaseValue).toBe(3200);
    expect(ownerData.board.sites[0].tools).toEqual([expect.objectContaining({ code: "H-01", value: 3200 })]);
    for (const actorId of [z.nowakId, storekeeperId]) {
      const data = await testbed.registry.as(actorId).exportData({ locationId: z.ratajeId });
      expect(data.movements).toEqual(ownerData.movements);
      expect(JSON.stringify(data)).not.toMatch(/"(value|totalValue|offBaseValue|lostValue)"|3200/);
    }
  });

  it("firma B eksportuje tylko swoje: pustą bazę i żadnego ruchu firmy A", async () => {
    const z = await givenZawbudWithHistory();
    const budrex = await testbed.givenActiveCompany("Budrex", { baseName: "Magazyn Budrex" });

    const data = await testbed.registry.as(budrex.ownerId).exportData({ toolId: z.s01 });

    expect(data.movements).toEqual([]);
    expect(data.board).toMatchObject({ base: { name: "Magazyn Budrex", tools: [] }, sites: [], services: [], lost: [] });
    expect(JSON.stringify(await testbed.registry.as(budrex.ownerId).exportData())).not.toMatch(/Rataje|Nowak|S-01|Swarzędz/);
  });
});
