import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();
const DAY = 24 * 60 * 60 * 1000;

/**
 * Firma z kierownikiem Nowakiem, budową Rataje, serwisem Hilti i czterema narzędziami na bazie:
 * młot H-01 za 3200 zł, szlifierki S-01 za 450,50 zł i S-02 za 380 zł, agregat A-01 bez wartości.
 */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Swarzędz" });
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const owner = testbed.registry.as(zawbud.ownerId);
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
  const { locationId: hiltiId } = await owner.addService({ name: "Serwis Hilti" });
  const hammers = await owner.addCategory({ name: "Młoty", prefix: "H" });
  const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
  const generators = await owner.addCategory({ name: "Agregaty", prefix: "A" });
  const tool = async (code: string, name: string, categoryId: string, extra: { value?: number } = {}) =>
    (await owner.addTool({ operationId: randomUUID(), code, name, categoryId, ...extra })).toolId;
  const h01 = await tool("H-01", "Młot Hilti", hammers.id, { value: 3200 });
  const s01 = await tool("S-01", "Szlifierka kątowa", grinders.id, { value: 450.5 });
  const s02 = await tool("S-02", "Szlifierka mała", grinders.id, { value: 380 });
  const a01 = await tool("A-01", "Agregat", generators.id);
  const { base } = await owner.whereIsWhat();
  return { zawbud, owner, nowakId, ratajeId, hiltiId, baseId: base.id, h01, s01, s02, a01 };
}

type Zawbud = Awaited<ReturnType<typeof givenZawbud>>;

function issue(z: Zawbud, toolIds: string[]) {
  return testbed.registry.as(z.nowakId).registerMovement({
    operationId: randomUUID(),
    kind: "wydanie",
    fromLocationId: z.baseId,
    toLocationId: z.ratajeId,
    toolIds,
    source: "checklista",
  });
}

describe("wartości na tablicy", () => {
  it("właściciel widzi wartość każdego narzędzia, sumę przy każdej lokalizacji i łączną kwotę poza bazą", async () => {
    const z = await givenZawbud();
    await issue(z, [z.h01, z.s01, z.a01]);

    const board = await z.owner.whereIsWhat();

    expect(board.offBaseValue).toBe(3650.5);
    expect(board.base).toMatchObject({ totalValue: 380, tools: [{ code: "S-02", value: 380 }] });
    expect(board.sites).toEqual([
      expect.objectContaining({
        name: "Rataje",
        totalValue: 3650.5,
        tools: [
          expect.objectContaining({ code: "A-01", value: null }),
          expect.objectContaining({ code: "H-01", value: 3200 }),
          expect.objectContaining({ code: "S-01", value: 450.5 }),
        ],
      }),
    ]);
  });
});

function alarmsOn(board: { sites: { tools: { code: string; alarm: boolean }[] }[] }) {
  return board.sites.flatMap((site) => site.tools.filter((tool) => tool.alarm).map((tool) => tool.code));
}

describe("alarm: narzędzie na budowie dłużej niż próg", () => {
  it("przy progu firmy 30 dni narzędzie ma alarm dopiero 31. dnia na budowie; na bazie nigdy", async () => {
    const z = await givenZawbud();
    await issue(z, [z.h01]);

    testbed.clock.advance(30 * DAY);
    const before = await z.owner.whereIsWhat();
    expect(alarmsOn(before)).toEqual([]);
    expect(before.alarmCount).toBe(0);

    testbed.clock.advance(DAY);
    const board = await z.owner.whereIsWhat();
    expect(alarmsOn(board)).toEqual(["H-01"]);
    expect(board.alarmCount).toBe(1);
    expect(board.sites[0].tools[0]).toMatchObject({ code: "H-01", daysInPlace: 31, alarm: true });
    expect(board.base.tools.map((tool) => [tool.code, tool.daysInPlace, tool.alarm])).toEqual([
      ["A-01", 31, false],
      ["S-01", 31, false],
      ["S-02", 31, false],
    ]);
  });
});

describe("próg dni firmy", () => {
  it("po zmianie progu firmy na 14 dni alarm pojawia się 15. dnia na budowie", async () => {
    const z = await givenZawbud();
    await issue(z, [z.h01]);

    await z.owner.updateSettings({ alarmThresholdDays: 14 });

    testbed.clock.advance(14 * DAY);
    expect(alarmsOn(await z.owner.whereIsWhat())).toEqual([]);
    testbed.clock.advance(DAY);
    expect(alarmsOn(await z.owner.whereIsWhat())).toEqual(["H-01"]);
  });
});

describe("sekcje „w serwisie” i „zaginione”", () => {
  it("sprzęt w serwisie i zaginiony ma własne sekcje i nie wlicza się do kwoty poza bazą; wycofanego nie ma nigdzie", async () => {
    const z = await givenZawbud();
    await issue(z, [z.h01, z.s01]);
    testbed.clock.advance(2 * DAY);
    await z.owner.correctTool({ operationId: randomUUID(), toolId: z.s02, locationId: z.hiltiId, reason: "pojechała do naprawy" });
    await z.owner.markToolLost({ operationId: randomUUID(), toolId: z.h01, reason: "nikt nie wie, gdzie jest" });
    await z.owner.retireTool({ operationId: randomUUID(), toolId: z.a01, reason: "sprzedany" });
    testbed.clock.advance(3 * DAY);

    const board = await z.owner.whereIsWhat();

    expect(board.offBaseValue).toBe(450.5);
    expect(board.base.tools).toEqual([]);
    expect(board.sites[0].tools.map((tool) => tool.code)).toEqual(["S-01"]);
    expect(board.services).toEqual([
      {
        id: z.hiltiId,
        name: "Serwis Hilti",
        totalValue: 380,
        tools: [expect.objectContaining({ code: "S-02", daysInPlace: 3, alarm: false, value: 380 })],
      },
    ]);
    expect(board.lost).toEqual([
      {
        id: z.h01,
        code: "H-01",
        name: "Młot Hilti",
        daysLost: 3,
        lastLocation: { id: z.ratajeId, name: "Rataje" },
        responsible: "Adam Nowak",
        value: 3200,
      },
    ]);
    expect(board.lostValue).toBe(3200);
  });

  it("serwis bez sprzętu też jest na liście, z zerową sumą", async () => {
    const z = await givenZawbud();

    const board = await z.owner.whereIsWhat();

    expect(board.services).toEqual([{ id: z.hiltiId, name: "Serwis Hilti", totalValue: 0, tools: [] }]);
    expect(board.lost).toEqual([]);
    expect(board.lostValue).toBe(0);
  });
});

describe("wartości tylko dla właściciela", () => {
  it("kierownik i magazynier widzą tę samą tablicę z alarmami, ale bez żadnej kwoty", async () => {
    const z = await givenZawbud();
    const storekeeperId = await testbed.givenMember(z.zawbud, "magazynier", "Ewa Magazyn");
    await issue(z, [z.h01, z.s01]);
    await z.owner.correctTool({ operationId: randomUUID(), toolId: z.s02, locationId: z.hiltiId, reason: "naprawa" });
    await z.owner.markToolLost({ operationId: randomUUID(), toolId: z.s01, reason: "zginęła" });
    testbed.clock.advance(31 * DAY);
    const ownerBoard = await z.owner.whereIsWhat();

    for (const actorId of [z.nowakId, storekeeperId]) {
      const board = await testbed.registry.as(actorId).whereIsWhat();

      const json = JSON.stringify(board);
      expect(json).not.toMatch(/value/i);
      // Wartość S-01 z częścią dziesiętną: takiego napisu nie ma w żadnym identyfikatorze.
      expect(json).not.toContain("450.5");
      expect(alarmsOn(board)).toEqual(["H-01"]);
      expect(board.sites[0].tools.map((tool) => tool.code)).toEqual(["H-01"]);
      expect(board.services[0].tools.map((tool) => tool.code)).toEqual(["S-02"]);
      expect(board.lost.map((tool) => tool.code)).toEqual(["S-01"]);
      expect(stripValues(ownerBoard)).toEqual(board);
    }
  });
});

/** Tablica właściciela bez kluczy z kwotami, do porównania z tablicą innych ról. */
function stripValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripValues);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !["value", "totalValue", "offBaseValue", "lostValue"].includes(key))
        .map(([key, inner]) => [key, stripValues(inner)]),
    );
  }
  return value;
}
