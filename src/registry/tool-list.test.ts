import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RegisteredKind } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();

/**
 * Zawbud (dziś 2 marca 2026, 7:00): kierownik Nowak prowadzi Rataje i bus, kierownik Kowalski Winogrady, magazynier
 * Wiśniewski, pracownik Zieliński. Szlifierki S-01 i S-02, młotowiertarka H-01 (Hilti TE 30) i H-10 na bazie.
 */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Swarzędz" });
  const ownerId = zawbud.ownerId;
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const kowalskiId = await testbed.givenMember(zawbud, "kierownik", "Jan Kowalski");
  const storekeeperId = await testbed.givenMember(zawbud, "magazynier", "Piotr Wiśniewski");
  const workerId = await testbed.givenMember(zawbud, "pracownik", "Marek Zieliński");
  const owner = testbed.registry.as(ownerId);
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
  const { locationId: winogradyId } = await owner.addSite({ name: "Winogrady", address: "ul. Słowiańska 3", managerId: kowalskiId });
  const { locationId: busId } = await owner.addVehicle({ name: "Bus WX 12345", managerId: nowakId });
  const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
  const hammers = await owner.addCategory({ name: "Młotowiertarki", prefix: "H" });
  const add = async (name: string, categoryId: string, extra: { code?: string; brand?: string; model?: string; value?: number } = {}) =>
    (await owner.addTool({ operationId: randomUUID(), name, categoryId, ...extra })).toolId;
  const s01 = await add("Szlifierka kątowa", grinders.id, { value: 450 });
  const s02 = await add("Szlifierka kątowa", grinders.id);
  const h10 = await add("Młotowiertarka", hammers.id, { code: "H-10", value: 1200 });
  const h01 = await add("Młotowiertarka", hammers.id, { code: "H-01", brand: "Hilti", model: "TE 30", value: 3200.5 });
  const { base } = await owner.whereIsWhat();
  return { owner, ownerId, nowakId, kowalskiId, storekeeperId, workerId, ratajeId, winogradyId, busId, baseId: base.id, s01, s02, h01, h10 };
}

function move(actorId: string, kind: RegisteredKind, from: string, to: string, toolIds: string[]) {
  return testbed.registry
    .as(actorId)
    .registerMovement({ operationId: randomUUID(), kind, fromLocationId: from, toLocationId: to, toolIds, source: "checklista" });
}

describe("lista narzędzi firmy", () => {
  it("pokazuje każde narzędzie po kodzie z kategorią, marką, miejscem, dniami w nim i kierownikiem, który za nie odpowiada", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.h01]);
    await move(z.nowakId, "wydanie", z.baseId, z.busId, [z.s02]);
    testbed.clock.set("2026-03-07T09:00:00+01:00");

    const tools = await testbed.registry.as(z.workerId).toolList();

    expect(tools.map((tool) => tool.code)).toEqual(["H-01", "H-10", "S-01", "S-02"]);
    expect(tools[0]).toEqual({
      id: z.h01,
      code: "H-01",
      name: "Młotowiertarka",
      category: "Młotowiertarki",
      brand: "Hilti",
      model: "TE 30",
      state: "w_obiegu",
      registration: "zaakceptowane",
      location: { id: z.ratajeId, name: "Rataje", kind: "budowa" },
      daysInPlace: 5,
      responsible: "Adam Nowak",
      damaged: false,
      rented: false,
    });
    expect(tools[1]).toMatchObject({ code: "H-10", location: { name: "Magazyn Swarzędz", kind: "baza" }, responsible: null, brand: null });
    expect(tools[3]).toMatchObject({ code: "S-02", location: { name: "Bus WX 12345", kind: "pojazd" }, responsible: "Adam Nowak" });
  });

  it("ma też zaginione, wycofane i zwrócone do wypożyczalni: gdzie były ostatnio i od ilu dni są w tym stanie", async () => {
    const z = await givenZawbud();
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s01]);
    testbed.clock.set("2026-03-03T08:00:00+01:00");
    await z.owner.markToolLost({ operationId: randomUUID(), toolId: z.s01, reason: "nie ma go na budowie" });
    await z.owner.retireTool({ operationId: randomUUID(), toolId: z.h10, reason: "sprzedana" });
    const rented = await testbed.registry.as(z.nowakId).addRentedTool({
      operationId: randomUUID(),
      locationId: z.ratajeId,
      name: "Minikoparka Kubota",
      categoryId: (await z.owner.categories()).find((category) => category.name === "Szlifierki")!.id,
      rentalCompany: "Ramirent",
      dailyRate: 450,
      returnOn: "2026-03-10",
    });
    await testbed.registry.as(z.nowakId).returnToRental({ operationId: randomUUID(), toolId: rented.toolId });
    testbed.clock.set("2026-03-06T08:00:00+01:00");

    const tools = await testbed.registry.as(z.workerId).toolList();

    expect(tools.find((tool) => tool.id === z.s01)).toMatchObject({
      state: "zaginione",
      location: { name: "Winogrady", kind: "budowa" },
      daysInPlace: 3,
      responsible: "Jan Kowalski",
    });
    expect(tools.find((tool) => tool.id === z.h10)).toMatchObject({
      state: "wycofane",
      location: { name: "Magazyn Swarzędz" },
      daysInPlace: 3,
      responsible: null,
    });
    expect(tools.find((tool) => tool.id === rented.toolId)).toMatchObject({ state: "zwrocone", rented: true, responsible: null });
  });

  it("pokazuje zgłoszone przez kierownika, czekające na akceptację, i uszkodzone", async () => {
    const z = await givenZawbud();
    const nowak = testbed.registry.as(z.nowakId);
    const categoryId = (await z.owner.categories())[0].id;
    const reported = await nowak.reportTool({ operationId: randomUUID(), siteId: z.ratajeId, name: "Poziomica laserowa", categoryId });
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s02]);
    await nowak.fileIssue({ operationId: randomUUID(), kind: "uszkodzenie", toolId: z.s02, description: "pęknięta osłona" });

    const tools = await z.owner.toolList();

    expect(tools.find((tool) => tool.id === reported.toolId)).toMatchObject({ registration: "zgloszone", state: "w_obiegu" });
    expect(tools.find((tool) => tool.id === z.s02)).toMatchObject({ damaged: true });
  });

  it("wartość w zł widzi tylko właściciel; innym klucz nie przychodzi", async () => {
    const z = await givenZawbud();

    const values = (await z.owner.toolList()).map((tool) => [tool.code, tool.value]);
    expect(values).toEqual([
      ["H-01", 3200.5],
      ["H-10", 1200],
      ["S-01", 450],
      ["S-02", null],
    ]);
    for (const userId of [z.nowakId, z.storekeeperId, z.workerId]) {
      for (const tool of await testbed.registry.as(userId).toolList()) expect(tool).not.toHaveProperty("value");
    }
  });

  it("kodów z numerami nie sortuje jak tekstu: H-2 jest przed H-10", async () => {
    const z = await givenZawbud();
    const hammers = (await z.owner.categories()).find((category) => category.name === "Młotowiertarki")!;
    await z.owner.addTool({ operationId: randomUUID(), name: "Młotowiertarka", categoryId: hammers.id, code: "H-2" });

    expect((await z.owner.toolList()).map((tool) => tool.code)).toEqual(["H-01", "H-2", "H-10", "S-01", "S-02"]);
  });

  it("nie pokazuje sprzętu innej firmy", async () => {
    const z = await givenZawbud();
    const other = await testbed.givenActiveCompany("Budex");
    const otherOwner = testbed.registry.as(other.ownerId);
    const category = await otherOwner.addCategory({ name: "Szlifierki", prefix: "S" });
    await otherOwner.addTool({ operationId: randomUUID(), name: "Szlifierka Budeksu", categoryId: category.id });

    expect((await z.owner.toolList()).map((tool) => tool.name)).not.toContain("Szlifierka Budeksu");
    expect((await otherOwner.toolList()).map((tool) => tool.name)).toEqual(["Szlifierka Budeksu"]);
  });
});
