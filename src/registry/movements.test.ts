import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withActor } from "./registry";
import { type GivenCompany, setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();
const DAY = 24 * 60 * 60 * 1000;

/** Firma z bazą, kierownikiem Nowakiem, budową Rataje i szlifierkami S-01, S-02 na bazie. */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Swarzędz" });
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const owner = testbed.registry.as(zawbud.ownerId);
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
  const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
  const s01 = await givenTool(zawbud, grinders.id, "S-01", "Szlifierka kątowa");
  const s02 = await givenTool(zawbud, grinders.id, "S-02", "Szlifierka mała");
  const { base } = await owner.whereIsWhat();
  return { zawbud, owner, nowakId, ratajeId, baseId: base.id, grindersId: grinders.id, s01, s02 };
}

async function givenTool(company: GivenCompany, categoryId: string, code: string, name: string) {
  const { toolId } = await testbed.registry.as(company.ownerId).addTool({ operationId: randomUUID(), code, name, categoryId });
  return toolId;
}

describe("wydanie z bazy", () => {
  it("kierownik wydaje S-01 i S-02 na swoją budowę: są na Rataje od 0 dni, a w historii jest wydanie autorstwa Nowaka", async () => {
    const { owner, nowakId, ratajeId, baseId, s01, s02 } = await givenZawbud();
    testbed.clock.advance(2 * DAY);

    await testbed.registry.as(nowakId).registerMovement({
      operationId: randomUUID(),
      kind: "wydanie",
      fromLocationId: baseId,
      toLocationId: ratajeId,
      toolIds: [s01, s02],
      source: "checklista",
    });

    const board = await owner.whereIsWhat();
    expect(board.base.tools).toEqual([]);
    expect(board.sites).toEqual([
      expect.objectContaining({
        id: ratajeId,
        tools: [
          expect.objectContaining({ id: s01, code: "S-01", daysInPlace: 0 }),
          expect.objectContaining({ id: s02, code: "S-02", daysInPlace: 0 }),
        ],
      }),
    ]);
    expect((await owner.toolCard(s01))!.history[0]).toEqual({
      kind: "wydanie",
      source: "checklista",
      occurredAt: testbed.clock.now(),
      author: "Adam Nowak",
      from: "Magazyn Swarzędz",
      to: "Rataje",
    });
  });
});

type Zawbud = Awaited<ReturnType<typeof givenZawbud>>;

function issue(z: Zawbud, actorId: string, toolIds: string[], extra: { siteId?: string; operationId?: string } = {}) {
  return testbed.registry.as(actorId).registerMovement({
    operationId: extra.operationId ?? randomUUID(),
    kind: "wydanie",
    fromLocationId: z.baseId,
    toLocationId: extra.siteId ?? z.ratajeId,
    toolIds,
    source: "checklista",
  });
}

function giveBack(z: Zawbud, actorId: string, toolIds: string[], extra: { siteId?: string } = {}) {
  return testbed.registry.as(actorId).registerMovement({
    operationId: randomUUID(),
    kind: "zwrot",
    fromLocationId: extra.siteId ?? z.ratajeId,
    toLocationId: z.baseId,
    toolIds,
    source: "checklista",
  });
}

async function whereIs(z: Zawbud, toolId: string) {
  return (await z.owner.toolCard(toolId))!.location.name;
}

describe("zwrot na bazę", () => {
  it("kierownik zwraca S-01 ze swojej budowy: S-01 wraca na bazę, S-02 zostaje na Rataje", async () => {
    const z = await givenZawbud();
    await issue(z, z.nowakId, [z.s01, z.s02]);
    testbed.clock.advance(5 * DAY);

    const movement = await giveBack(z, z.nowakId, [z.s01]);

    expect(movement).toMatchObject({
      kind: "zwrot",
      source: "checklista",
      author: "Adam Nowak",
      from: { id: z.ratajeId, name: "Rataje" },
      to: { id: z.baseId, name: "Magazyn Swarzędz" },
      tools: [{ id: z.s01, code: "S-01", name: "Szlifierka kątowa" }],
      occurredAt: testbed.clock.now(),
      recordedAt: testbed.clock.now(),
    });
    const board = await z.owner.whereIsWhat();
    expect(board.base.tools.map((tool) => tool.code)).toEqual(["S-01"]);
    expect(board.sites[0].tools.map((tool) => tool.code)).toEqual(["S-02"]);
    expect((await z.owner.toolCard(z.s01))!.history.map((entry) => entry.kind)).toEqual(["zwrot", "wydanie", "przyjecie"]);
  });
});

describe("uprawnienia do ruchów", () => {
  it("kierownik nie wydaje na cudzą budowę i nie zwraca z cudzej; nic się nie zapisuje", async () => {
    const z = await givenZawbud();
    const kowalskiId = await testbed.givenMember(z.zawbud, "kierownik", "Jan Kowalski");
    const { locationId: winogradyId } = await z.owner.addSite({ name: "Winogrady", address: "os. Wichrowe 3", managerId: kowalskiId });
    await issue(z, kowalskiId, [z.s02], { siteId: winogradyId });

    await expect(issue(z, z.nowakId, [z.s01], { siteId: winogradyId })).rejects.toMatchObject({ code: "forbidden" });
    await expect(giveBack(z, z.nowakId, [z.s02], { siteId: winogradyId })).rejects.toMatchObject({ code: "forbidden" });

    expect(await whereIs(z, z.s01)).toBe("Magazyn Swarzędz");
    expect(await whereIs(z, z.s02)).toBe("Winogrady");
    expect(await z.owner.recentMovements()).toHaveLength(3);
  });

  it("magazynier i właściciel wydają na każdą budowę i zwracają z każdej", async () => {
    const z = await givenZawbud();
    const storekeeperId = await testbed.givenMember(z.zawbud, "magazynier", "Ewa Magazyn");

    await issue(z, storekeeperId, [z.s01]);
    await issue(z, z.zawbud.ownerId, [z.s02]);
    expect(await whereIs(z, z.s01)).toBe("Rataje");
    await giveBack(z, z.zawbud.ownerId, [z.s01]);
    await giveBack(z, storekeeperId, [z.s02]);

    expect((await z.owner.whereIsWhat()).base.tools.map((tool) => tool.code)).toEqual(["S-01", "S-02"]);
    expect((await z.owner.recentMovements({ limit: 4 })).map((movement) => movement.author)).toEqual([
      "Ewa Magazyn",
      "Właściciel Zawbud",
      "Właściciel Zawbud",
      "Ewa Magazyn",
    ]);
  });
});

describe("uprawnienia do ruchów w bazie", () => {
  it("kierownik nie zapisze wydania na cudzą budowę ani nie przesunie narzędzia nawet z pominięciem Rejestru", async () => {
    const z = await givenZawbud();
    const kowalskiId = await testbed.givenMember(z.zawbud, "kierownik", "Jan Kowalski");
    const { locationId: winogradyId } = await z.owner.addSite({ name: "Winogrady", address: "os. Wichrowe 3", managerId: kowalskiId });
    const insertMovement = (kind: string, from: string, to: string) =>
      withActor(testbed.db, z.nowakId, async (sql) => {
        const [movement] = await sql<{ id: string }>(
          `insert into app.movements (company_id, kind, source, from_location_id, to_location_id, author_id,
                                      occurred_at, recorded_at, client_operation_id)
           values ($1, $2, 'checklista', $3, $4, $5, now(), now(), gen_random_uuid()) returning id`,
          [z.zawbud.companyId, kind, from, to, z.nowakId],
        );
        await sql("insert into app.movement_tools (movement_id, tool_id, company_id) values ($1, $2, $3)", [
          movement.id,
          z.s01,
          z.zawbud.companyId,
        ]);
      });

    await expect(insertMovement("wydanie", z.baseId, winogradyId)).rejects.toThrow(/row-level security/);
    await expect(insertMovement("przyjecie", z.baseId, z.ratajeId)).rejects.toThrow(/row-level security/);
    // Własna budowa, ale S-01 nie jest na Rataje: zwrot „z Rataje” go nie przesunie.
    await expect(insertMovement("zwrot", z.ratajeId, z.baseId)).rejects.toThrow(/lokalizacji źródłowej/);
    await expect(
      withActor(testbed.db, z.nowakId, (sql) => sql("update app.tools set location_id = $2 where id = $1 returning id", [z.s01, z.ratajeId])),
    ).rejects.toThrow();

    expect(await whereIs(z, z.s01)).toBe("Magazyn Swarzędz");
  });
});

describe("idempotencja ruchu", () => {
  it("ponowne wysłanie z tym samym identyfikatorem operacji zwraca pierwotny ruch bez duplikatu, nawet gdy stan się zmienił", async () => {
    const z = await givenZawbud();
    const operationId = randomUUID();
    const first = await issue(z, z.nowakId, [z.s01], { operationId });
    testbed.clock.advance(DAY);
    await giveBack(z, z.nowakId, [z.s01]);

    const again = await issue(z, z.nowakId, [z.s01], { operationId });

    expect(again).toEqual(first);
    expect(await whereIs(z, z.s01)).toBe("Magazyn Swarzędz");
    expect((await z.owner.toolCard(z.s01))!.history.map((entry) => entry.kind)).toEqual(["zwrot", "wydanie", "przyjecie"]);
  });

  it("dwa równoczesne wysłania tej samej operacji dają jeden ruch", async () => {
    const z = await givenZawbud();
    const operationId = randomUUID();

    const [a, b] = await Promise.all([issue(z, z.nowakId, [z.s01, z.s02], { operationId }), issue(z, z.nowakId, [z.s01, z.s02], { operationId })]);

    expect(a).toEqual(b);
    expect((await z.owner.recentMovements()).filter((movement) => movement.kind === "wydanie")).toHaveLength(1);
  });

  it("ten sam identyfikator operacji w innej firmie to osobny ruch tamtej firmy", async () => {
    const z = await givenZawbud();
    const budrex = await testbed.givenActiveCompany("Budrex");
    const kaczmarekId = await testbed.givenMember(budrex, "kierownik", "Piotr Kaczmarek");
    const budrexOwner = testbed.registry.as(budrex.ownerId);
    const { locationId: siteId } = await budrexOwner.addSite({ name: "Łazarz", address: "ul. Głogowska 1", managerId: kaczmarekId });
    const hammers = await budrexOwner.addCategory({ name: "Młoty", prefix: "H" });
    const h01 = await givenTool(budrex, hammers.id, "H-01", "Młot");
    const { base } = await budrexOwner.whereIsWhat();
    const operationId = randomUUID();
    await issue(z, z.nowakId, [z.s01], { operationId });

    const budrexMovement = await testbed.registry.as(kaczmarekId).registerMovement({
      operationId,
      kind: "wydanie",
      fromLocationId: base.id,
      toLocationId: siteId,
      toolIds: [h01],
      source: "checklista",
    });

    expect(budrexMovement).toMatchObject({ author: "Piotr Kaczmarek", to: { name: "Łazarz" }, tools: [{ code: "H-01" }] });
    expect(await whereIs(z, z.s01)).toBe("Rataje");
  });
});

describe("niezgodna lokalizacja źródłowa", () => {
  it("gdy jedno z narzędzi ktoś już przeniósł, cały ruch jest odrzucony z informacją, gdzie jest i kto je przeniósł", async () => {
    const z = await givenZawbud();
    const kowalskiId = await testbed.givenMember(z.zawbud, "kierownik", "Jan Kowalski");
    const { locationId: winogradyId } = await z.owner.addSite({ name: "Winogrady", address: "os. Wichrowe 3", managerId: kowalskiId });
    testbed.clock.advance(DAY);
    const movedAt = testbed.clock.now();
    await issue(z, kowalskiId, [z.s02], { siteId: winogradyId });
    testbed.clock.advance(60 * 1000);

    const rejected = issue(z, z.nowakId, [z.s01, z.s02]);

    await expect(rejected).rejects.toMatchObject({
      code: "movement_conflict",
      conflicts: [
        {
          toolId: z.s02,
          code: "S-02",
          location: { id: winogradyId, name: "Winogrady" },
          state: "w_obiegu",
          movedBy: "Jan Kowalski",
          movedAt,
        },
      ],
    });
    expect(await whereIs(z, z.s01)).toBe("Magazyn Swarzędz");
    expect(await whereIs(z, z.s02)).toBe("Winogrady");
    expect(await z.owner.recentMovements()).toHaveLength(3);
  });

  it("ruch z kolejki, który zdarzył się przed ostatnim ruchem narzędzia, jest odrzucony", async () => {
    const z = await givenZawbud();
    await issue(z, z.nowakId, [z.s01]);
    testbed.clock.advance(DAY);
    await giveBack(z, z.nowakId, [z.s01]);
    testbed.clock.advance(DAY);

    await expect(
      z.owner.registerMovement({
        operationId: randomUUID(),
        kind: "wydanie",
        fromLocationId: z.baseId,
        toLocationId: z.ratajeId,
        toolIds: [z.s01],
        occurredAt: new Date(testbed.clock.now().getTime() - 1.5 * DAY),
        source: "checklista",
      }),
    ).rejects.toMatchObject({ code: "movement_conflict", conflicts: [expect.objectContaining({ code: "S-01", movedBy: "Adam Nowak" })] });
    expect(await whereIs(z, z.s01)).toBe("Magazyn Swarzędz");
  });
});

describe("od X dni", () => {
  it("liczy się od czasu zdarzenia ostatniego ruchu, także gdy ruch dotarł z opóźnieniem", async () => {
    const z = await givenZawbud();
    testbed.clock.advance(10 * DAY);
    await issue(z, z.nowakId, [z.s01]);
    const recordedAt = testbed.clock.now();
    const occurredAt = new Date(recordedAt.getTime() - 2 * DAY);
    const delayed = await z.owner.registerMovement({
      operationId: randomUUID(),
      kind: "wydanie",
      fromLocationId: z.baseId,
      toLocationId: z.ratajeId,
      toolIds: [z.s02],
      occurredAt,
      source: "checklista",
    });
    testbed.clock.advance(3 * DAY + 60 * 60 * 1000);

    const rataje = (await z.owner.whereIsWhat()).sites[0];
    expect(rataje.tools.map((tool) => [tool.code, tool.daysInPlace])).toEqual([
      ["S-01", 3],
      ["S-02", 5],
    ]);
    expect(delayed).toMatchObject({ occurredAt, recordedAt });
  });

  it("odrzuca czas zdarzenia z przyszłości", async () => {
    const z = await givenZawbud();

    await expect(
      z.owner.registerMovement({
        operationId: randomUUID(),
        kind: "wydanie",
        fromLocationId: z.baseId,
        toLocationId: z.ratajeId,
        toolIds: [z.s01],
        occurredAt: new Date(testbed.clock.now().getTime() + 60 * 60 * 1000),
        source: "checklista",
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("ostatnie ruchy", () => {
  it("lista ruchów firmy od najnowszego, z osobą, godziną, narzędziami i trasą; bez ruchów innej firmy", async () => {
    const z = await givenZawbud();
    const budrex = await testbed.givenActiveCompany("Budrex");
    const hammers = await testbed.registry.as(budrex.ownerId).addCategory({ name: "Młoty", prefix: "H" });
    await givenTool(budrex, hammers.id, "H-01", "Młot");
    testbed.clock.advance(60 * 60 * 1000);
    const issuedAt = testbed.clock.now();
    await issue(z, z.nowakId, [z.s02, z.s01]);
    testbed.clock.advance(60 * 60 * 1000);
    await giveBack(z, z.nowakId, [z.s02]);

    const recent = await testbed.registry.as(z.nowakId).recentMovements({ limit: 2 });

    expect(recent).toEqual([
      expect.objectContaining({ kind: "zwrot", author: "Adam Nowak", tools: [expect.objectContaining({ code: "S-02" })] }),
      {
        id: expect.any(String),
        kind: "wydanie",
        source: "checklista",
        occurredAt: issuedAt,
        recordedAt: issuedAt,
        author: "Adam Nowak",
        from: { id: z.baseId, name: "Magazyn Swarzędz" },
        to: { id: z.ratajeId, name: "Rataje" },
        tools: [
          { id: z.s01, code: "S-01", name: "Szlifierka kątowa" },
          { id: z.s02, code: "S-02", name: "Szlifierka mała" },
        ],
      },
    ]);
    expect((await z.owner.recentMovements()).map((movement) => movement.kind)).toEqual(["zwrot", "wydanie", "przyjecie", "przyjecie"]);
  });
});

describe("tablica dla kierownika", () => {
  it("kierownik widzi sprzęt całej firmy, także na cudzych budowach, ale bez wartości", async () => {
    const z = await givenZawbud();
    const kowalskiId = await testbed.givenMember(z.zawbud, "kierownik", "Jan Kowalski");
    const { locationId: winogradyId } = await z.owner.addSite({ name: "Winogrady", address: "os. Wichrowe 3", managerId: kowalskiId });
    await z.owner.editTool(z.s01, { value: 3200 });
    await issue(z, kowalskiId, [z.s01], { siteId: winogradyId });

    const board = await testbed.registry.as(z.nowakId).whereIsWhat();

    expect(board.sites.map((site) => [site.name, site.tools.map((tool) => tool.code)])).toEqual([
      ["Rataje", []],
      ["Winogrady", ["S-01"]],
    ]);
    expect(board.base.tools.map((tool) => tool.code)).toEqual(["S-02"]);
    const everything = JSON.stringify([board, await testbed.registry.as(z.nowakId).recentMovements()]);
    expect(everything).not.toMatch(/value|3200/i);
  });
});

describe("dane ruchu", () => {
  it("odrzuca pustą listę, nieznane i cudze narzędzia, zły kierunek i zakończoną budowę; nic się nie zapisuje", async () => {
    const z = await givenZawbud();
    const budrex = await testbed.givenActiveCompany("Budrex");
    const hammers = await testbed.registry.as(budrex.ownerId).addCategory({ name: "Młoty", prefix: "H" });
    const foreignTool = await givenTool(budrex, hammers.id, "H-01", "Młot");
    const { locationId: serviceId } = await z.owner.addService({ name: "Serwis Hilti" });
    const kowalskiId = await testbed.givenMember(z.zawbud, "kierownik");
    const { locationId: finishedId } = await z.owner.addSite({ name: "Stara", address: "ul. Stara 1", managerId: kowalskiId });
    await testbed.db.transaction((sql) => sql("update app.locations set status = 'zakonczona' where id = $1", [finishedId]));
    const register = (overrides: Partial<Parameters<ReturnType<typeof testbed.registry.as>["registerMovement"]>[0]>) =>
      z.owner.registerMovement({
        operationId: randomUUID(),
        kind: "wydanie",
        fromLocationId: z.baseId,
        toLocationId: z.ratajeId,
        toolIds: [z.s01],
        source: "checklista",
        ...overrides,
      });

    await expect(register({ toolIds: [] })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(register({ toolIds: ["nie-uuid"] })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(register({ operationId: "nie-uuid" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(register({ toolIds: [randomUUID()] })).rejects.toMatchObject({ code: "not_found" });
    await expect(register({ toolIds: [z.s01, foreignTool] })).rejects.toMatchObject({ code: "not_found" });
    await expect(register({ kind: "zwrot" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(register({ toLocationId: serviceId })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(register({ fromLocationId: z.ratajeId, toLocationId: z.ratajeId })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(register({ toLocationId: finishedId })).rejects.toMatchObject({ code: "site_finished" });
    await expect(register({ kind: "przyjecie" as never })).rejects.toMatchObject({ code: "invalid_input" });

    expect(await z.owner.recentMovements()).toHaveLength(2);
    expect(await whereIs(z, z.s01)).toBe("Magazyn Swarzędz");
  });

  it("to samo narzędzie podane dwa razy wydaje się raz", async () => {
    const z = await givenZawbud();

    const movement = await issue(z, z.nowakId, [z.s01, z.s01]);

    expect(movement.tools.map((tool) => tool.code)).toEqual(["S-01"]);
  });
});
