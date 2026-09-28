import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { type RegisteredKind, withActor } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();
const DAY = 24 * 60 * 60 * 1000;

/**
 * Firma z bazą, kierownikami Nowakiem (Rataje) i Kowalskim (Winogrady), serwisem Hilti
 * i szlifierkami S-01, S-02 na bazie.
 */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Swarzędz" });
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const kowalskiId = await testbed.givenMember(zawbud, "kierownik", "Jan Kowalski");
  const owner = testbed.registry.as(zawbud.ownerId);
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
  const { locationId: winogradyId } = await owner.addSite({ name: "Winogrady", address: "os. Wichrowe 3", managerId: kowalskiId });
  const { locationId: serviceId } = await owner.addService({ name: "Serwis Hilti" });
  const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
  const s01 = (await owner.addTool({ operationId: randomUUID(), code: "S-01", name: "Szlifierka kątowa", categoryId: grinders.id })).toolId;
  const s02 = (await owner.addTool({ operationId: randomUUID(), code: "S-02", name: "Szlifierka mała", categoryId: grinders.id })).toolId;
  const { base } = await owner.whereIsWhat();
  return { zawbud, owner, nowakId, kowalskiId, ratajeId, winogradyId, serviceId, baseId: base.id, s01, s02 };
}

type Zawbud = Awaited<ReturnType<typeof givenZawbud>>;

function move(actorId: string, kind: RegisteredKind, from: string, to: string, toolIds: string[], operationId = randomUUID()) {
  return testbed.registry.as(actorId).registerMovement({ operationId, kind, fromLocationId: from, toLocationId: to, toolIds, source: "checklista" });
}

/** S-01 i S-02 wydane na Winogrady Kowalskiego. */
async function givenOnWinogrady(z: Zawbud) {
  await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s01, z.s02]);
  testbed.clock.advance(3 * DAY);
  testbed.notifier.clear();
}

async function whereIs(z: Zawbud, toolId: string) {
  return (await z.owner.toolCard(toolId))!.location.name;
}

describe("przeniesienie", () => {
  it("Nowak zabiera S-01 z Winogrady na Rataje: S-01 jest na Rataje od 0 dni, a Kowalski dostaje powiadomienie", async () => {
    const z = await givenZawbud();
    await givenOnWinogrady(z);

    const movement = await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01]);

    const board = await z.owner.whereIsWhat();
    expect(board.sites.map((site) => [site.name, site.tools.map((tool) => [tool.code, tool.daysInPlace])])).toEqual([
      ["Rataje", [["S-01", 0]]],
      ["Winogrady", [["S-02", 3]]],
    ]);
    expect((await z.owner.toolCard(z.s01))!.history[0]).toMatchObject({
      kind: "przeniesienie",
      author: "Adam Nowak",
      from: "Winogrady",
      to: "Rataje",
    });
    const notification = {
      kind: "narzedzia_zabrane",
      recipient: { userId: z.kowalskiId, fullName: "Jan Kowalski", email: expect.stringMatching(/^kierownik\d+@/) },
      movementId: movement.id,
      takenBy: "Adam Nowak",
      from: { id: z.winogradyId, name: "Winogrady", kind: "budowa" },
      to: { id: z.ratajeId, name: "Rataje", kind: "budowa" },
      tools: [{ id: z.s01, code: "S-01", name: "Szlifierka kątowa" }],
      occurredAt: testbed.clock.now(),
    };
    expect(movement).toMatchObject({ kind: "przeniesienie", notifications: [notification] });
    expect(testbed.notifier.sent).toEqual([notification]);
  });
});

describe("uprawnienia do przeniesienia", () => {
  it("kierownik nie przeniesie sprzętu na cudzą budowę, nawet ze swojej; nic się nie zapisuje i nikt nie dostaje powiadomienia", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);
    testbed.notifier.clear();

    await expect(move(z.nowakId, "przeniesienie", z.ratajeId, z.winogradyId, [z.s01])).rejects.toMatchObject({ code: "forbidden" });

    expect(await whereIs(z, z.s01)).toBe("Rataje");
    expect(testbed.notifier.sent).toEqual([]);
  });

  it("magazynier przenosi między dowolnymi budowami, a powiadomienie dostaje kierownik budowy, z której sprzęt zabrano", async () => {
    const z = await givenZawbud();
    const storekeeperId = await testbed.givenMember(z.zawbud, "magazynier", "Ewa Magazyn");
    await givenOnWinogrady(z);

    await move(storekeeperId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01, z.s02]);

    expect(await whereIs(z, z.s02)).toBe("Rataje");
    expect(testbed.notifier.sent).toEqual([
      expect.objectContaining({ recipient: expect.objectContaining({ fullName: "Jan Kowalski" }), takenBy: "Ewa Magazyn" }),
    ]);
    const [taken] = testbed.notifier.sent;
    expect(taken.kind === "narzedzia_zabrane" && taken.tools.map((tool) => tool.code)).toEqual(["S-01", "S-02"]);
  });

  it("kierownik nie zapisze przeniesienia na cudzą budowę nawet z pominięciem Rejestru", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);

    await expect(
      withActor(testbed.db, z.nowakId, async (sql) => {
        const [movement] = await sql<{ id: string }>(
          `insert into app.movements (company_id, kind, source, from_location_id, to_location_id, author_id,
                                      occurred_at, recorded_at, client_operation_id)
           values ($1, 'przeniesienie', 'checklista', $2, $3, $4, now(), now(), gen_random_uuid()) returning id`,
          [z.zawbud.companyId, z.ratajeId, z.winogradyId, z.nowakId],
        );
        await sql("insert into app.movement_tools (movement_id, tool_id, company_id) values ($1, $2, $3)", [
          movement.id,
          z.s01,
          z.zawbud.companyId,
        ]);
      }),
    ).rejects.toThrow(/row-level security/);
    expect(await whereIs(z, z.s01)).toBe("Rataje");
  });
});

describe("powiadomienie o zabranym sprzęcie", () => {
  it("kierownik przenoszący między swoimi budowami nie dostaje powiadomienia", async () => {
    const z = await givenZawbud();
    const { locationId: lazarzId } = await z.owner.addSite({ name: "Łazarz", address: "ul. Głogowska 1", managerId: z.nowakId });
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);

    const movement = await move(z.nowakId, "przeniesienie", z.ratajeId, lazarzId, [z.s01]);

    expect(await whereIs(z, z.s01)).toBe("Łazarz");
    expect(movement.notifications).toEqual([]);
    expect(testbed.notifier.sent).toEqual([]);
  });

  it("ponowne wysłanie tej samej operacji zwraca to samo powiadomienie, ale nie wysyła go drugi raz", async () => {
    const z = await givenZawbud();
    await givenOnWinogrady(z);
    const operationId = randomUUID();

    const first = await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01], operationId);
    const again = await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01], operationId);

    expect(again).toEqual(first);
    expect(testbed.notifier.sent).toHaveLength(1);
  });

  it("gdy wysyłka się nie uda, przeniesienie i tak jest zapisane", async () => {
    const z = await givenZawbud();
    await givenOnWinogrady(z);
    testbed.notifier.failWith = new Error("Dostawca e-maili nie odpowiada");

    const movement = await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01]);

    expect(movement.notifications).toHaveLength(1);
    expect(await whereIs(z, z.s01)).toBe("Rataje");
  });

  it("dezaktywowany kierownik budowy źródłowej nie dostaje powiadomienia", async () => {
    const z = await givenZawbud();
    await givenOnWinogrady(z);
    await z.owner.deactivateMember(z.kowalskiId);

    const movement = await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01]);

    expect(movement.notifications).toEqual([]);
    expect(testbed.notifier.sent).toEqual([]);
  });

  it("wydanie z bazy nie wysyła powiadomień", async () => {
    const z = await givenZawbud();

    const movement = await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);

    expect(movement.notifications).toEqual([]);
    expect(testbed.notifier.sent).toEqual([]);
  });
});

describe("dane przeniesienia", () => {
  it("odrzuca przeniesienie na zakończoną budowę, na tę samą budowę, na bazę i z bazy", async () => {
    const z = await givenZawbud();
    await givenOnWinogrady(z);
    const { locationId: finishedId } = await z.owner.addSite({ name: "Stara", address: "ul. Stara 1", managerId: z.nowakId });
    await z.owner.closeSite(finishedId);

    await expect(move(z.nowakId, "przeniesienie", z.winogradyId, finishedId, [z.s01])).rejects.toMatchObject({ code: "site_finished" });
    await expect(move(z.kowalskiId, "przeniesienie", z.winogradyId, z.winogradyId, [z.s01])).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(move(z.zawbud.ownerId, "przeniesienie", z.winogradyId, z.baseId, [z.s01])).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(move(z.nowakId, "przeniesienie", z.baseId, z.ratajeId, [z.s01])).rejects.toMatchObject({ code: "invalid_input" });

    expect(await whereIs(z, z.s01)).toBe("Winogrady");
    expect(testbed.notifier.sent).toEqual([]);
  });

  it("gdy narzędzia nie ma już na budowie źródłowej, całe przeniesienie jest odrzucone", async () => {
    const z = await givenZawbud();
    await givenOnWinogrady(z);
    await move(z.kowalskiId, "zwrot", z.winogradyId, z.baseId, [z.s02]);

    await expect(move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01, z.s02])).rejects.toMatchObject({
      code: "movement_conflict",
      conflicts: [expect.objectContaining({ code: "S-02", location: { id: z.baseId, name: "Magazyn Swarzędz" }, movedBy: "Jan Kowalski" })],
    });
    expect(await whereIs(z, z.s01)).toBe("Winogrady");
    expect(testbed.notifier.sent).toEqual([]);
  });

  it("autor cofa przeniesienie w ciągu 15 minut: sprzęt wraca na budowę źródłową z dawnym „od X dni”", async () => {
    const z = await givenZawbud();
    await givenOnWinogrady(z);
    const movement = await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01]);
    testbed.clock.advance(5 * 60 * 1000);

    await testbed.registry.as(z.nowakId).undoMovement({ operationId: randomUUID(), movementId: movement.id });

    const winogrady = (await z.owner.whereIsWhat()).sites.find((site) => site.id === z.winogradyId)!;
    expect(winogrady.tools.map((tool) => [tool.code, tool.daysInPlace])).toEqual([
      ["S-01", 3],
      ["S-02", 3],
    ]);
  });
});

describe("serwis", () => {
  it("kierownik wysyła S-01 ze swojej budowy do serwisu: tablica pokazuje je w serwisie, a nie poza bazą", async () => {
    const z = await givenZawbud();
    await z.owner.editTool(z.s01, { value: 3200 });
    await z.owner.editTool(z.s02, { value: 800 });
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01, z.s02]);
    testbed.clock.advance(DAY);

    const movement = await move(z.nowakId, "do_serwisu", z.ratajeId, z.serviceId, [z.s01]);

    expect(movement).toMatchObject({ kind: "do_serwisu", from: { name: "Rataje" }, to: { name: "Serwis Hilti" }, notifications: [] });
    const board = await z.owner.whereIsWhat();
    expect(board.services).toEqual([
      expect.objectContaining({ name: "Serwis Hilti", totalValue: 3200, tools: [expect.objectContaining({ code: "S-01", daysInPlace: 0 })] }),
    ]);
    expect(board.sites.find((site) => site.id === z.ratajeId)!.tools.map((tool) => tool.code)).toEqual(["S-02"]);
    expect(board.offBaseValue).toBe(800);
  });

  it("magazynier przyjmuje S-01 z serwisu na bazę", async () => {
    const z = await givenZawbud();
    const storekeeperId = await testbed.givenMember(z.zawbud, "magazynier", "Ewa Magazyn");
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);
    await move(z.nowakId, "do_serwisu", z.ratajeId, z.serviceId, [z.s01]);
    testbed.clock.advance(7 * DAY);

    await move(storekeeperId, "z_serwisu", z.serviceId, z.baseId, [z.s01]);

    const board = await z.owner.whereIsWhat();
    expect(board.base.tools.map((tool) => [tool.code, tool.daysInPlace])).toEqual([
      ["S-01", 0],
      ["S-02", 7],
    ]);
    expect(board.services[0].tools).toEqual([]);
    expect((await z.owner.toolCard(z.s01))!.history.map((entry) => entry.kind)).toEqual(["z_serwisu", "do_serwisu", "wydanie", "przyjecie"]);
  });

  it("właściciel i magazynier wysyłają do serwisu także z bazy i z cudzej budowy", async () => {
    const z = await givenZawbud();
    const storekeeperId = await testbed.givenMember(z.zawbud, "magazynier", "Ewa Magazyn");
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s02]);

    await move(z.zawbud.ownerId, "do_serwisu", z.baseId, z.serviceId, [z.s01]);
    await move(storekeeperId, "do_serwisu", z.winogradyId, z.serviceId, [z.s02]);

    expect((await z.owner.whereIsWhat()).services[0].tools.map((tool) => tool.code)).toEqual(["S-01", "S-02"]);
  });

  it("kierownik nie wysyła do serwisu z cudzej budowy ani z bazy i nie przyjmuje z serwisu", async () => {
    const z = await givenZawbud();
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s02]);
    await move(z.zawbud.ownerId, "do_serwisu", z.baseId, z.serviceId, [z.s01]);

    await expect(move(z.nowakId, "do_serwisu", z.winogradyId, z.serviceId, [z.s02])).rejects.toMatchObject({ code: "forbidden" });
    await expect(move(z.nowakId, "do_serwisu", z.baseId, z.serviceId, [z.s02])).rejects.toMatchObject({ code: "forbidden" });
    await expect(move(z.nowakId, "z_serwisu", z.serviceId, z.baseId, [z.s01])).rejects.toMatchObject({ code: "forbidden" });

    expect(await whereIs(z, z.s01)).toBe("Serwis Hilti");
    expect(await whereIs(z, z.s02)).toBe("Winogrady");
  });

  it("kierownik nie przyjmie sprzętu z serwisu nawet z pominięciem Rejestru", async () => {
    const z = await givenZawbud();
    await move(z.zawbud.ownerId, "do_serwisu", z.baseId, z.serviceId, [z.s01]);

    await expect(
      withActor(testbed.db, z.nowakId, (sql) =>
        sql(
          `insert into app.movements (company_id, kind, source, from_location_id, to_location_id, author_id,
                                      occurred_at, recorded_at, client_operation_id)
           values ($1, 'z_serwisu', 'checklista', $2, $3, $4, now(), now(), gen_random_uuid())`,
          [z.zawbud.companyId, z.serviceId, z.baseId, z.nowakId],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("odrzuca serwis jako cel innego ruchu i ruchy serwisowe w złą stronę", async () => {
    const z = await givenZawbud();
    const { locationId: otherServiceId } = await z.owner.addService({ name: "Serwis Makita" });
    await move(z.zawbud.ownerId, "do_serwisu", z.baseId, z.serviceId, [z.s01]);

    await expect(move(z.zawbud.ownerId, "z_serwisu", z.serviceId, z.ratajeId, [z.s01])).rejects.toMatchObject({ code: "invalid_input" });
    await expect(move(z.zawbud.ownerId, "do_serwisu", z.serviceId, otherServiceId, [z.s01])).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(move(z.zawbud.ownerId, "do_serwisu", z.baseId, z.ratajeId, [z.s02])).rejects.toMatchObject({ code: "invalid_input" });
    await expect(move(z.zawbud.ownerId, "przeniesienie", z.serviceId, z.ratajeId, [z.s01])).rejects.toMatchObject({
      code: "invalid_input",
    });

    expect(await whereIs(z, z.s01)).toBe("Serwis Hilti");
  });
});
