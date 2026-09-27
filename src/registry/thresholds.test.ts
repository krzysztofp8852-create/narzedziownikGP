import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RegisteredKind } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Firma z progiem 30 dni, kierownikami Nowakiem (Rataje) i Kowalskim (Winogrady) i szlifierkami
 * S-01, S-02, S-03 na bazie.
 */
async function givenZawbud(name = "Zawbud") {
  const zawbud = await testbed.givenActiveCompany(name, { baseName: "Magazyn" });
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const kowalskiId = await testbed.givenMember(zawbud, "kierownik", "Jan Kowalski");
  const owner = testbed.registry.as(zawbud.ownerId);
  await owner.updateSettings({ alarmThresholdDays: 30 });
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
  const { locationId: winogradyId } = await owner.addSite({ name: "Winogrady", address: "os. Wichrowe 3", managerId: kowalskiId });
  const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
  const add = async (code: string, toolName: string) =>
    (await owner.addTool({ operationId: randomUUID(), code, name: toolName, categoryId: grinders.id })).toolId;
  const s01 = await add("S-01", "Szlifierka kątowa");
  const s02 = await add("S-02", "Szlifierka mała");
  const s03 = await add("S-03", "Szlifierka duża");
  const { base } = await owner.whereIsWhat();
  return { zawbud, owner, nowakId, kowalskiId, ratajeId, winogradyId, baseId: base.id, s01, s02, s03 };
}

function move(actorId: string, kind: RegisteredKind, from: string, to: string, toolIds: string[]) {
  return testbed.registry
    .as(actorId)
    .registerMovement({ operationId: randomUUID(), kind, fromLocationId: from, toLocationId: to, toolIds, source: "checklista" });
}

async function bellOf(userId: string) {
  return (await testbed.registry.as(userId).bell()).entries.map((entry) => entry.notification);
}

describe("przekroczenie progu dni", () => {
  it("S-01 stoi na Rataje 31. dzień: Nowak dostaje jedno powiadomienie o S-01, właściciel jedno zbiorcze, i nikt nie dostaje ich drugi raz", async () => {
    const z = await givenZawbud();
    const issuedAt = testbed.clock.now();
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);

    // 30 dni i 23 godziny: jeszcze bez alarmu.
    testbed.clock.set(new Date(issuedAt.getTime() + 31 * DAY - HOUR));
    expect(await testbed.registry.system().notifyExceededThresholds()).toEqual({ tools: 0 });
    expect(await bellOf(z.nowakId)).toEqual([]);

    testbed.clock.set(new Date(issuedAt.getTime() + 31 * DAY + 6 * HOUR));
    expect(await testbed.registry.system().notifyExceededThresholds()).toEqual({ tools: 1 });

    const tool = { id: z.s01, code: "S-01", name: "Szlifierka kątowa" };
    const rataje = { id: z.ratajeId, name: "Rataje" };
    expect(await bellOf(z.nowakId)).toEqual([{ kind: "prog_przekroczony", tool, location: rataje, since: issuedAt, thresholdDays: 30 }]);
    expect(await bellOf(z.zawbud.ownerId)).toEqual([{ kind: "progi_przekroczone", thresholdDays: 30, tools: [{ ...tool, location: rataje }] }]);
    expect(await bellOf(z.kowalskiId)).toEqual([]);

    // Ponowne uruchomienie tego samego dnia i zadanie następnego dnia niczego nie powtarzają.
    expect(await testbed.registry.system().notifyExceededThresholds()).toEqual({ tools: 0 });
    testbed.clock.advance(DAY);
    expect(await testbed.registry.system().notifyExceededThresholds()).toEqual({ tools: 0 });
    expect(await bellOf(z.nowakId)).toHaveLength(1);
    expect(await bellOf(z.zawbud.ownerId)).toHaveLength(1);
  });
});

describe("przekroczenie progu: kto i o czym", () => {
  it("właściciel dostaje jedno zbiorcze o narzędziach z różnych budów, każdy kierownik o swoich, a inna firma o swoich", async () => {
    const z = await givenZawbud();
    const budrex = await givenZawbud("Budrex");
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01, z.s02]);
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s03]);
    await move(budrex.nowakId, "wydanie", budrex.baseId, budrex.ratajeId, [budrex.s01]);
    testbed.clock.advance(20 * DAY);
    await move(z.nowakId, "zwrot", z.ratajeId, z.baseId, [z.s02]);
    testbed.clock.advance(11 * DAY + HOUR);

    expect(await testbed.registry.system().notifyExceededThresholds()).toEqual({ tools: 3 });

    const codes = (userId: string) =>
      bellOf(userId).then((list) => list.map((n) => (n.kind === "progi_przekroczone" ? n.tools.map((tool) => tool.code) : n.kind === "prog_przekroczony" ? n.tool.code : n.kind)));
    expect(await codes(z.zawbud.ownerId)).toEqual([["S-01", "S-03"]]);
    expect(await codes(z.nowakId)).toEqual(["S-01"]);
    expect(await codes(z.kowalskiId)).toEqual(["S-03"]);
    expect(await codes(budrex.zawbud.ownerId)).toEqual([["S-01"]]);
    expect(await codes(budrex.nowakId)).toEqual(["S-01"]);
    // Dzwonek to jedyny kanał tych powiadomień; e-mail dostaje tylko zabrany sprzęt.
    expect(testbed.notifier.sent).toEqual([]);
  });

  it("sprzęt na bazie i w serwisie nie przekracza progu, a przeniesiony na inną budowę liczy się od nowa", async () => {
    const z = await givenZawbud();
    const { locationId: serviceId } = await z.owner.addService({ name: "Serwis Hilti" });
    await move(z.zawbud.ownerId, "do_serwisu", z.baseId, serviceId, [z.s02]);
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s01]);
    testbed.clock.advance(20 * DAY);
    await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01]);

    testbed.clock.advance(20 * DAY);
    expect(await testbed.registry.system().notifyExceededThresholds()).toEqual({ tools: 0 });

    testbed.clock.advance(11 * DAY + HOUR);
    expect(await testbed.registry.system().notifyExceededThresholds()).toEqual({ tools: 1 });
    expect(await bellOf(z.nowakId)).toEqual([expect.objectContaining({ kind: "prog_przekroczony", tool: expect.objectContaining({ code: "S-01" }) })]);
    // Kowalski ma tylko powiadomienie o zabranym sprzęcie.
    expect((await bellOf(z.kowalskiId)).map((n) => n.kind)).toEqual(["narzedzia_zabrane"]);
  });

  it("gdy kierownik budowy jest dezaktywowany, przekroczenie dostaje tylko właściciel w zbiorczym", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);
    await z.owner.deactivateMember(z.nowakId);
    testbed.clock.advance(31 * DAY + HOUR);

    expect(await testbed.registry.system().notifyExceededThresholds()).toEqual({ tools: 1 });
    expect(await bellOf(z.zawbud.ownerId)).toEqual([expect.objectContaining({ kind: "progi_przekroczone" })]);
  });

  it("obniżony próg: narzędzie, które przekroczyło go dawno, nie wywołuje powiadomienia, a świeże tak", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);
    testbed.clock.advance(15 * DAY);
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s02]);
    testbed.clock.advance(11 * DAY + HOUR);

    await z.owner.updateSettings({ alarmThresholdDays: 10 });

    expect(await testbed.registry.system().notifyExceededThresholds()).toEqual({ tools: 1 });
    expect((await bellOf(z.nowakId)).map((n) => n.kind === "prog_przekroczony" && [n.tool.code, n.thresholdDays])).toEqual([["S-02", 10]]);
  });
});
