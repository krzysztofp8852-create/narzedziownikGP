import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { type RegisteredKind, withActor } from "./registry";
import { type GivenCompany, setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();
const DAY = 24 * 60 * 60 * 1000;

/** Firma z bazą, kierownikami Nowakiem (Rataje) i Kowalskim (Winogrady) oraz szlifierkami S-01, S-02 na bazie. */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Swarzędz" });
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const kowalskiId = await testbed.givenMember(zawbud, "kierownik", "Jan Kowalski");
  const owner = testbed.registry.as(zawbud.ownerId);
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
  const { locationId: winogradyId } = await owner.addSite({ name: "Winogrady", address: "os. Wichrowe 3", managerId: kowalskiId });
  const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
  const s01 = await givenTool(zawbud, grinders.id, "S-01", "Szlifierka kątowa");
  const s02 = await givenTool(zawbud, grinders.id, "S-02", "Szlifierka mała");
  const { base } = await owner.whereIsWhat();
  return { zawbud, owner, nowakId, kowalskiId, ratajeId, winogradyId, baseId: base.id, grinders, s01, s02 };
}

type Zawbud = Awaited<ReturnType<typeof givenZawbud>>;

async function givenTool(company: GivenCompany, categoryId: string, code: string, name: string) {
  const { toolId } = await testbed.registry.as(company.ownerId).addTool({ operationId: randomUUID(), code, name, categoryId });
  return toolId;
}

function move(actorId: string, kind: RegisteredKind, fromLocationId: string, toLocationId: string, toolIds: string[]) {
  return testbed.registry.as(actorId).registerMovement({ operationId: randomUUID(), kind, fromLocationId, toLocationId, toolIds, source: "checklista" });
}

function close(actorId: string, siteId: string) {
  return testbed.registry.as(actorId).closeSite(siteId);
}

function forceClose(actorId: string, siteId: string, reason: string, operationId = randomUUID()) {
  return testbed.registry.as(actorId).forceCloseSite({ operationId, siteId, reason });
}

async function activeSiteIds(z: Zawbud) {
  return (await z.owner.whereIsWhat()).sites.map((site) => site.id);
}

describe("zamknięcie budowy", () => {
  it("kierownik zamyka swoją pustą budowę: znika z tablicy, jest wśród zakończonych, a jej historia zostaje", async () => {
    const z = await givenZawbud();
    const issued = await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);
    const returned = await move(z.nowakId, "zwrot", z.ratajeId, z.baseId, [z.s01]);
    testbed.clock.advance(2 * DAY);

    await close(z.nowakId, z.ratajeId);

    expect(await activeSiteIds(z)).toEqual([z.winogradyId]);
    expect(await testbed.registry.as(z.nowakId).finishedSites()).toEqual([
      {
        id: z.ratajeId,
        name: "Rataje",
        address: "ul. Piłsudskiego 12",
        status: "zakonczona",
        manager: { id: z.nowakId, fullName: "Adam Nowak", active: true },
        finishedAt: testbed.clock.now(),
        finishedBy: "Adam Nowak",
      },
    ]);
    expect((await z.owner.locations()).sites).toEqual([
      expect.objectContaining({ id: z.winogradyId, status: "aktywna" }),
      expect.objectContaining({ id: z.ratajeId, status: "zakonczona" }),
    ]);
    const history = await z.owner.movementHistory({ locationId: z.ratajeId });
    expect(history.movements.map((movement) => movement.id)).toEqual([returned.id, issued.id]);
  });

  it("zakończone budowy są od ostatnio zamkniętej", async () => {
    const z = await givenZawbud();

    await close(z.zawbud.ownerId, z.ratajeId);
    testbed.clock.advance(DAY);
    await close(z.zawbud.ownerId, z.winogradyId);

    expect((await z.owner.finishedSites()).map((site) => [site.name, site.finishedBy])).toEqual([
      ["Winogrady", "Właściciel Zawbud"],
      ["Rataje", "Właściciel Zawbud"],
    ]);
  });

  it("budowy z narzędziami w obiegu nie da się zamknąć, dopóki każde nie wróci na bazę albo nie zostanie przeniesione", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01, z.s02]);

    await expect(close(z.nowakId, z.ratajeId)).rejects.toMatchObject({ code: "site_not_empty" });
    await move(z.nowakId, "zwrot", z.ratajeId, z.baseId, [z.s01]);
    await expect(close(z.zawbud.ownerId, z.ratajeId)).rejects.toMatchObject({ code: "site_not_empty" });
    await move(z.kowalskiId, "przeniesienie", z.ratajeId, z.winogradyId, [z.s02]);

    await close(z.nowakId, z.ratajeId);
    expect(await activeSiteIds(z)).toEqual([z.winogradyId]);
  });

  it("zaginione i wycofane narzędzia nie blokują zamknięcia", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01, z.s02]);
    await z.owner.markToolLost({ operationId: randomUUID(), toolId: z.s01, reason: "Nie ma go na budowie" });
    await z.owner.retireTool({ operationId: randomUUID(), toolId: z.s02 });

    await close(z.nowakId, z.ratajeId);

    expect(await activeSiteIds(z)).toEqual([z.winogradyId]);
  });

  it("kierownik zamyka tylko swoją budowę, magazynier żadnej, a właściciel każdą", async () => {
    const z = await givenZawbud();
    const storekeeperId = await testbed.givenMember(z.zawbud, "magazynier");

    await expect(close(z.kowalskiId, z.ratajeId)).rejects.toMatchObject({ code: "forbidden" });
    await expect(close(storekeeperId, z.ratajeId)).rejects.toMatchObject({ code: "forbidden" });
    expect(await activeSiteIds(z)).toEqual([z.ratajeId, z.winogradyId]);

    await close(z.zawbud.ownerId, z.winogradyId);
    expect(await activeSiteIds(z)).toEqual([z.ratajeId]);
  });

  it("zamyka się tylko aktywną budowę tej firmy: baza, serwis, cudza i nieznana budowa to „nie znaleziono”", async () => {
    const z = await givenZawbud();
    const budrex = await testbed.givenActiveCompany("Budrex");
    const { locationId: serviceId } = await z.owner.addService({ name: "Serwis Hilti" });

    for (const id of [z.baseId, serviceId, randomUUID(), "nie-uuid"]) {
      await expect(close(z.zawbud.ownerId, id)).rejects.toMatchObject({ code: "not_found" });
    }
    await expect(close(budrex.ownerId, z.ratajeId)).rejects.toMatchObject({ code: "not_found" });

    await close(z.nowakId, z.ratajeId);
    await expect(close(z.nowakId, z.ratajeId)).rejects.toMatchObject({ code: "site_finished" });
    await expect(forceClose(z.zawbud.ownerId, z.ratajeId, "Koniec")).rejects.toMatchObject({ code: "site_finished" });
  });
});

describe("wymuszone zamknięcie", () => {
  it("właściciel zamyka budowę z powodem: pozostałe narzędzia są zaginione z ostatnią lokalizacją i kierownikiem budowy", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01, z.s02]);
    testbed.clock.advance(3 * DAY);

    const lost = await forceClose(z.zawbud.ownerId, z.ratajeId, " Inwestor przejął plac, sprzętu nie ma ");

    expect(lost).toMatchObject({
      kind: "zaginiecie",
      author: "Właściciel Zawbud",
      from: { id: z.ratajeId, name: "Rataje" },
      to: null,
      tools: [{ code: "S-01" }, { code: "S-02" }],
      reason: "Inwestor przejął plac, sprzętu nie ma",
      stateChange: { from: "w_obiegu", to: "zaginione" },
      occurredAt: testbed.clock.now(),
    });
    const board = await z.owner.whereIsWhat();
    expect(board.sites.map((site) => site.id)).toEqual([z.winogradyId]);
    expect(board.lost.map((tool) => [tool.code, tool.lastLocation.name, tool.responsible, tool.daysLost])).toEqual([
      ["S-01", "Rataje", "Adam Nowak", 0],
      ["S-02", "Rataje", "Adam Nowak", 0],
    ]);
    expect((await z.owner.toolCard(z.s01))!).toMatchObject({
      state: "zaginione",
      lost: { lastLocation: { name: "Rataje" }, responsible: "Adam Nowak", reason: "Inwestor przejął plac, sprzętu nie ma" },
    });
    expect(await z.owner.finishedSites()).toEqual([expect.objectContaining({ id: z.ratajeId, finishedBy: "Właściciel Zawbud" })]);
  });

  it("odpowiedzialny zostaje kierownik budowy, także dezaktywowany", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);
    await z.owner.deactivateMember(z.nowakId);

    await forceClose(z.zawbud.ownerId, z.ratajeId, "Kierownik odszedł, sprzętu brak");

    expect((await z.owner.whereIsWhat()).lost).toEqual([expect.objectContaining({ code: "S-01", responsible: "Adam Nowak" })]);
  });

  it("wymusza tylko właściciel i tylko z powodem; bez tego budowa i narzędzia zostają", async () => {
    const z = await givenZawbud();
    const storekeeperId = await testbed.givenMember(z.zawbud, "magazynier");
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);

    await expect(forceClose(z.nowakId, z.ratajeId, "Koniec budowy")).rejects.toMatchObject({ code: "forbidden" });
    await expect(forceClose(storekeeperId, z.ratajeId, "Koniec budowy")).rejects.toMatchObject({ code: "forbidden" });
    await expect(forceClose(z.zawbud.ownerId, z.ratajeId, "   ")).rejects.toMatchObject({ code: "reason_required" });

    const board = await z.owner.whereIsWhat();
    expect(board.sites.find((site) => site.id === z.ratajeId)?.tools.map((tool) => tool.code)).toEqual(["S-01"]);
    expect(board.lost).toEqual([]);
  });

  it("ponowione tą samą operacją zwraca ten sam ruch zaginięcia", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);
    const operationId = randomUUID();

    const first = await forceClose(z.zawbud.ownerId, z.ratajeId, "Koniec budowy", operationId);
    const again = await forceClose(z.zawbud.ownerId, z.ratajeId, "Koniec budowy", operationId);

    expect(again).toEqual(first);
    expect((await z.owner.movementHistory({ locationId: z.ratajeId })).movements.map((m) => m.kind)).toEqual(["zaginiecie", "wydanie"]);
  });

  it("gdy na budowie nic już nie zostało, po prostu ją zamyka", async () => {
    const z = await givenZawbud();

    expect(await forceClose(z.zawbud.ownerId, z.ratajeId, "Koniec budowy")).toBeNull();

    expect(await activeSiteIds(z)).toEqual([z.winogradyId]);
    expect(await z.owner.movementHistory({ locationId: z.ratajeId })).toEqual({ movements: [], hasMore: false });
  });
});

describe("zakończona budowa", () => {
  it("nie przyjmie ruchu: wydania, przeniesienia, cofnięcia zwrotu, korekty ani zgłoszenia narzędzia", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);
    const returned = await move(z.nowakId, "zwrot", z.ratajeId, z.baseId, [z.s01]);
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s02]);
    await close(z.nowakId, z.ratajeId);

    await expect(move(z.zawbud.ownerId, "wydanie", z.baseId, z.ratajeId, [z.s01])).rejects.toMatchObject({ code: "site_finished" });
    await expect(move(z.zawbud.ownerId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s02])).rejects.toMatchObject({
      code: "site_finished",
    });
    await expect(testbed.registry.as(z.nowakId).undoMovement({ operationId: randomUUID(), movementId: returned.id })).rejects.toMatchObject({
      code: "site_finished",
    });
    await expect(
      z.owner.correctTool({ operationId: randomUUID(), toolId: z.s01, locationId: z.ratajeId, reason: "Jednak tam stoi" }),
    ).rejects.toMatchObject({ code: "site_finished" });
    await expect(
      testbed.registry.as(z.nowakId).reportTool({ operationId: randomUUID(), siteId: z.ratajeId, name: "Szlifierka", categoryId: z.grinders.id }),
    ).rejects.toMatchObject({ code: "site_finished" });

    const board = await z.owner.whereIsWhat();
    expect(board.base.tools.map((tool) => tool.code)).toEqual(["S-01"]);
    expect(board.sites.map((site) => [site.name, site.tools.map((tool) => tool.code)])).toEqual([["Winogrady", ["S-02"]]]);
  });

  it("zaginione narzędzie z zakończonej budowy odnajduje się korektą poza nią, nie z powrotem w obiegu na niej", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);
    await forceClose(z.zawbud.ownerId, z.ratajeId, "Koniec budowy");

    await expect(
      z.owner.correctTool({ operationId: randomUUID(), toolId: z.s01, state: "w_obiegu", reason: "Znalazło się na placu" }),
    ).rejects.toMatchObject({ code: "site_finished" });
    await z.owner.correctTool({ operationId: randomUUID(), toolId: z.s01, locationId: z.baseId, state: "w_obiegu", reason: "Przywiezione" });

    expect((await z.owner.whereIsWhat()).base.tools.map((tool) => tool.code)).toEqual(["S-01", "S-02"]);
  });
});

describe("zamykanie z pominięciem Rejestru", () => {
  const finish = (actorId: string, siteId: string, finishedBy = actorId) =>
    withActor(testbed.db, actorId, (sql) =>
      sql("update app.locations set status = 'zakonczona', finished_at = now(), finished_by = $2 where id = $1 returning id", [
        siteId,
        finishedBy,
      ]),
    );

  it("budowy z narzędziami w obiegu nie zamknie nikt, także właściciel", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);

    await expect(finish(z.nowakId, z.ratajeId)).rejects.toThrow(/narzędzia w obiegu/);
    await expect(finish(z.zawbud.ownerId, z.ratajeId)).rejects.toThrow(/narzędzia w obiegu/);
    expect(await activeSiteIds(z)).toEqual([z.ratajeId, z.winogradyId]);
  });

  it("kierownik nie zamknie cudzej budowy, magazynier żadnej, nikt nie zamknie jej cudzym nazwiskiem ani nie zmieni kierownika przy zamknięciu", async () => {
    const z = await givenZawbud();
    const storekeeperId = await testbed.givenMember(z.zawbud, "magazynier");

    expect(await finish(z.kowalskiId, z.ratajeId)).toEqual([]);
    expect(await finish(storekeeperId, z.ratajeId)).toEqual([]);
    await expect(finish(z.zawbud.ownerId, z.ratajeId, z.nowakId)).rejects.toThrow(/row-level security/);
    await expect(
      withActor(testbed.db, z.nowakId, (sql) =>
        sql("update app.locations set status = 'zakonczona', finished_at = now(), finished_by = $2, manager_id = $3 where id = $1", [
          z.ratajeId,
          z.nowakId,
          z.kowalskiId,
        ]),
      ),
    ).rejects.toThrow(/kierownika/);
    await expect(
      withActor(testbed.db, z.nowakId, (sql) => sql("update app.locations set manager_id = $2 where id = $1", [z.ratajeId, z.kowalskiId])),
    ).rejects.toThrow(/row-level security/);
    await expect(withActor(testbed.db, z.zawbud.ownerId, (sql) => sql("update app.locations set status = 'zakonczona' where id = $1", [z.ratajeId]))).rejects.toThrow();
    expect(await activeSiteIds(z)).toEqual([z.ratajeId, z.winogradyId]);
  });

  it("zakończonej budowy nie da się otworzyć ponownie", async () => {
    const z = await givenZawbud();
    await close(z.nowakId, z.ratajeId);

    const reopened = await withActor(testbed.db, z.zawbud.ownerId, (sql) =>
      sql("update app.locations set status = 'aktywna', finished_at = null, finished_by = null where id = $1 returning id", [z.ratajeId]),
    );

    expect(reopened).toEqual([]);
    expect(await activeSiteIds(z)).toEqual([z.winogradyId]);
  });

  it("żadne narzędzie w obiegu nie trafi na zakończoną budowę, także korektą wpisaną wprost w bazie", async () => {
    const z = await givenZawbud();
    await close(z.nowakId, z.ratajeId);

    await expect(
      withActor(testbed.db, z.zawbud.ownerId, async (sql) => {
        const [movement] = await sql<{ id: string }>(
          `insert into app.movements (company_id, kind, source, from_location_id, to_location_id, author_id, occurred_at,
                                      recorded_at, client_operation_id, reason, from_state, to_state)
           values ($1, 'korekta', 'panel', $2, $3, $4, now(), now(), gen_random_uuid(), 'Na skróty', 'w_obiegu', 'w_obiegu')
           returning id`,
          [z.zawbud.companyId, z.baseId, z.ratajeId, z.zawbud.ownerId],
        );
        await sql("insert into app.movement_tools (movement_id, tool_id, company_id) values ($1, $2, $3)", [movement.id, z.s01, z.zawbud.companyId]);
      }),
    ).rejects.toThrow(/zakończonej budowie/);
    expect((await z.owner.whereIsWhat()).base.tools.map((tool) => tool.code)).toEqual(["S-01", "S-02"]);
  });
});
