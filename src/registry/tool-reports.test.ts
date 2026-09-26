import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withActor } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();
const DAY = 24 * 60 * 60 * 1000;

/**
 * Firma z kierownikami Nowakiem (budowa Rataje) i Kowalskim (budowa Winogrady), magazynierem,
 * kategoriami Wiertarki (W) i Szlifierki (S) oraz wiertarką W-01 na bazie.
 */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Swarzędz" });
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const kowalskiId = await testbed.givenMember(zawbud, "kierownik", "Jan Kowalski");
  const storekeeperId = await testbed.givenMember(zawbud, "magazynier", "Ewa Magazyn");
  const owner = testbed.registry.as(zawbud.ownerId);
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
  const { locationId: winogradyId } = await owner.addSite({ name: "Winogrady", address: "os. Wichrowe 3", managerId: kowalskiId });
  const drills = await owner.addCategory({ name: "Wiertarki", prefix: "W" });
  const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
  const { toolId: w01 } = await owner.addTool({ operationId: randomUUID(), name: "Wiertarka Bosch", categoryId: drills.id });
  const { base } = await owner.whereIsWhat();
  return { zawbud, owner, nowakId, kowalskiId, storekeeperId, ratajeId, winogradyId, baseId: base.id, drills, grinders, w01 };
}

type Zawbud = Awaited<ReturnType<typeof givenZawbud>>;

/** Nowak zgłasza wiertarkę Makita kupioną na Rataje. */
function reportMakita(z: Zawbud, overrides: { operationId?: string; siteId?: string; actorId?: string } = {}) {
  return testbed.registry.as(overrides.actorId ?? z.nowakId).reportTool({
    operationId: overrides.operationId ?? randomUUID(),
    siteId: overrides.siteId ?? z.ratajeId,
    name: "Wiertarka Makita",
    categoryId: z.drills.id,
  });
}

describe("zgłoszenie narzędzia", () => {
  it("kierownik zgłasza wiertarkę kupioną na Rataje: od razu jest na jego budowie jako zgłoszona, z przyjęciem jego autorstwa", async () => {
    const z = await givenZawbud();

    const { toolId, code } = await reportMakita(z);
    testbed.clock.advance(2 * DAY);

    expect(code).toBe("W-02");
    const board = await testbed.registry.as(z.nowakId).whereIsWhat();
    expect(board.sites.find((site) => site.id === z.ratajeId)!.tools).toEqual([
      { id: toolId, code: "W-02", name: "Wiertarka Makita", registration: "zgloszone", daysInPlace: 2, alarm: false },
    ]);
    const card = (await z.owner.toolCard(toolId))!;
    expect(card).toMatchObject({
      registration: "zgloszone",
      state: "w_obiegu",
      category: { id: z.drills.id, name: "Wiertarki" },
      location: { id: z.ratajeId, name: "Rataje", kind: "budowa" },
      value: null,
    });
    expect(card.history).toEqual([
      expect.objectContaining({ kind: "przyjecie", author: "Adam Nowak", from: null, to: "Rataje", occurredAt: new Date(testbed.clock.now().getTime() - 2 * DAY) }),
    ]);
  });

  it("ponowne wysłanie tego samego zgłoszenia nie tworzy drugiego narzędzia", async () => {
    const z = await givenZawbud();
    const operationId = randomUUID();

    const first = await reportMakita(z, { operationId });
    const again = await reportMakita(z, { operationId });

    expect(again).toEqual(first);
    expect((await z.owner.toolReports()).map((report) => report.id)).toEqual([first.toolId]);
  });

  it("zgłoszone narzędzie uczestniczy w ruchach: kierownik zwraca je na bazę, a magazynier wydaje na Winogrady", async () => {
    const z = await givenZawbud();
    const { toolId } = await reportMakita(z);

    await testbed.registry.as(z.nowakId).registerMovement({
      operationId: randomUUID(),
      kind: "zwrot",
      fromLocationId: z.ratajeId,
      toLocationId: z.baseId,
      toolIds: [toolId],
      source: "checklista",
    });
    await testbed.registry.as(z.storekeeperId).registerMovement({
      operationId: randomUUID(),
      kind: "wydanie",
      fromLocationId: z.baseId,
      toLocationId: z.winogradyId,
      toolIds: [toolId],
      source: "checklista",
    });

    const board = await z.owner.whereIsWhat();
    expect(board.sites.find((site) => site.id === z.winogradyId)!.tools).toEqual([
      expect.objectContaining({ id: toolId, registration: "zgloszone" }),
    ]);
    expect((await z.owner.toolReports())[0]).toMatchObject({ id: toolId, location: { id: z.winogradyId, name: "Winogrady" } });
  });

  it("nazwa jest obowiązkowa, a kategoria musi istnieć w firmie", async () => {
    const z = await givenZawbud();
    const nowak = testbed.registry.as(z.nowakId);
    const report = (name: string, categoryId: string) =>
      nowak.reportTool({ operationId: randomUUID(), siteId: z.ratajeId, name, categoryId });

    await expect(report("  ", z.drills.id)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(report("Wiertarka", randomUUID())).rejects.toMatchObject({ code: "invalid_input" });
    expect(await z.owner.toolReports()).toEqual([]);
  });
});

describe("lista zgłoszeń", () => {
  it("właściciel widzi zgłoszenia czekające na decyzję, od najstarszego, z tym, kto i kiedy zgłosił i gdzie narzędzie jest", async () => {
    const z = await givenZawbud();
    const { toolId: makita } = await reportMakita(z);
    testbed.clock.advance(DAY);
    const { toolId: dewalt } = await testbed.registry.as(z.kowalskiId).reportTool({
      operationId: randomUUID(),
      siteId: z.winogradyId,
      name: "Szlifierka DeWalt",
      categoryId: z.grinders.id,
    });

    expect(await z.owner.toolReports()).toEqual([
      {
        id: makita,
        code: "W-02",
        name: "Wiertarka Makita",
        category: { id: z.drills.id, name: "Wiertarki", prefix: "W" },
        reportedBy: "Adam Nowak",
        reportedAt: new Date(testbed.clock.now().getTime() - DAY),
        location: { id: z.ratajeId, name: "Rataje" },
      },
      {
        id: dewalt,
        code: "S-01",
        name: "Szlifierka DeWalt",
        category: { id: z.grinders.id, name: "Szlifierki", prefix: "S" },
        reportedBy: "Jan Kowalski",
        reportedAt: testbed.clock.now(),
        location: { id: z.winogradyId, name: "Winogrady" },
      },
    ]);
  });
});

describe("akceptacja zgłoszenia", () => {
  it("właściciel akceptuje zgłoszenie, uzupełniając kod i wartość: narzędzie jest zaakceptowane i znika z listy", async () => {
    const z = await givenZawbud();
    const { toolId } = await reportMakita(z);

    await z.owner.acceptToolReport({ toolId, code: "w-07", value: 459.99 });

    expect(await z.owner.toolCard(toolId)).toMatchObject({ code: "W-07", value: 459.99, registration: "zaakceptowane" });
    expect((await z.owner.whereIsWhat()).sites.find((site) => site.id === z.ratajeId)!.tools).toEqual([
      expect.objectContaining({ code: "W-07", registration: "zaakceptowane", value: 459.99 }),
    ]);
    expect(await z.owner.toolReports()).toEqual([]);
    expect((await z.owner.toolCard(toolId))!.history).toEqual([expect.objectContaining({ kind: "przyjecie", author: "Adam Nowak" })]);
  });

  it("przy akceptacji właściciel może zmienić kategorię; bez podanego kodu zostaje nadany przy zgłoszeniu", async () => {
    const z = await givenZawbud();
    const { toolId } = await reportMakita(z);

    await z.owner.acceptToolReport({ toolId, categoryId: z.grinders.id, value: 0 });

    expect(await z.owner.toolCard(toolId)).toMatchObject({ code: "W-02", category: { id: z.grinders.id }, value: 0 });
  });

  it("wartość jest obowiązkowa, a zajęty kod odrzuca akceptację bez zmian", async () => {
    const z = await givenZawbud();
    const { toolId } = await reportMakita(z);

    await expect(z.owner.acceptToolReport({ toolId, value: Number.NaN })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(z.owner.acceptToolReport({ toolId, code: "W-01", value: 100 })).rejects.toMatchObject({ code: "code_taken" });

    expect(await z.owner.toolCard(toolId)).toMatchObject({ code: "W-02", value: null, registration: "zgloszone" });
  });

  it("zaakceptować można tylko zgłoszenie, które czeka na decyzję", async () => {
    const z = await givenZawbud();
    const { toolId } = await reportMakita(z);
    await z.owner.acceptToolReport({ toolId, value: 450 });

    await expect(z.owner.acceptToolReport({ toolId, value: 500 })).rejects.toMatchObject({ code: "not_reported" });
    await expect(z.owner.acceptToolReport({ toolId: z.w01, value: 500 })).rejects.toMatchObject({ code: "not_reported" });
    expect(await z.owner.toolCard(toolId)).toMatchObject({ value: 450 });
  });
});

describe("odrzucenie zgłoszenia", () => {
  it("właściciel odrzuca zgłoszenie z komentarzem: narzędzie jest wycofane, a historia i karta zostają", async () => {
    const z = await givenZawbud();
    const { toolId } = await reportMakita(z);
    testbed.clock.advance(DAY);

    const rejection = await z.owner.rejectToolReport({ operationId: randomUUID(), toolId, comment: " To jest W-01 z bazy " });

    expect(rejection).toMatchObject({
      kind: "wycofanie",
      author: "Właściciel Zawbud",
      reason: "To jest W-01 z bazy",
      stateChange: { from: "w_obiegu", to: "wycofane" },
      tools: [{ id: toolId, code: "W-02" }],
    });
    expect(await z.owner.toolReports()).toEqual([]);
    expect((await z.owner.whereIsWhat()).sites.find((site) => site.id === z.ratajeId)!.tools).toEqual([]);
    const card = (await testbed.registry.as(z.nowakId).toolCard(toolId))!;
    expect(card).toMatchObject({ state: "wycofane", registration: "zgloszone" });
    expect(card.history.map((entry) => [entry.kind, entry.author, entry.reason])).toEqual([
      ["wycofanie", "Właściciel Zawbud", "To jest W-01 z bazy"],
      ["przyjecie", "Adam Nowak", null],
    ]);
  });

  it("komentarz jest obowiązkowy", async () => {
    const z = await givenZawbud();
    const { toolId } = await reportMakita(z);

    await expect(z.owner.rejectToolReport({ operationId: randomUUID(), toolId, comment: "  " })).rejects.toMatchObject({
      code: "reason_required",
    });
    expect(await z.owner.toolReports()).toHaveLength(1);
  });

  it("ponowne wysłanie odrzucenia zwraca to samo wycofanie", async () => {
    const z = await givenZawbud();
    const { toolId } = await reportMakita(z);
    const operationId = randomUUID();

    const first = await z.owner.rejectToolReport({ operationId, toolId, comment: "Duplikat" });
    const again = await z.owner.rejectToolReport({ operationId, toolId, comment: "Duplikat" });

    expect(again).toEqual(first);
  });

  it("odrzucić można tylko zgłoszenie, które czeka na decyzję", async () => {
    const z = await givenZawbud();
    const { toolId } = await reportMakita(z);
    await z.owner.acceptToolReport({ toolId, value: 450 });
    const reject = (id: string) => z.owner.rejectToolReport({ operationId: randomUUID(), toolId: id, comment: "Duplikat" });

    await expect(reject(toolId)).rejects.toMatchObject({ code: "not_reported" });
    await expect(reject(z.w01)).rejects.toMatchObject({ code: "not_reported" });
    expect(await z.owner.toolCard(toolId)).toMatchObject({ state: "w_obiegu" });
  });
});

describe("uprawnienia zgłoszeń", () => {
  it("kierownik zgłasza tylko na swoją budowę, nie na cudzą ani na bazę", async () => {
    const z = await givenZawbud();

    await expect(reportMakita(z, { siteId: z.winogradyId })).rejects.toMatchObject({ code: "forbidden" });
    await expect(reportMakita(z, { siteId: z.baseId })).rejects.toMatchObject({ code: "invalid_input" });
    expect(await z.owner.toolReports()).toEqual([]);
  });

  it("zgłasza tylko kierownik; właściciel i magazynier dodają narzędzia bezpośrednio", async () => {
    const z = await givenZawbud();

    await expect(reportMakita(z, { actorId: z.zawbud.ownerId })).rejects.toMatchObject({ code: "forbidden" });
    await expect(reportMakita(z, { actorId: z.storekeeperId })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("listę zgłoszeń, akceptację i odrzucenie ma tylko właściciel", async () => {
    const z = await givenZawbud();
    const { toolId } = await reportMakita(z);

    for (const actorId of [z.nowakId, z.storekeeperId]) {
      const actor = testbed.registry.as(actorId);
      await expect(actor.toolReports()).rejects.toMatchObject({ code: "forbidden" });
      await expect(actor.acceptToolReport({ toolId, value: 1 })).rejects.toMatchObject({ code: "forbidden" });
      await expect(actor.rejectToolReport({ operationId: randomUUID(), toolId, comment: "Nie" })).rejects.toMatchObject({
        code: "forbidden",
      });
    }
    expect(await z.owner.toolCard(toolId)).toMatchObject({ registration: "zgloszone", state: "w_obiegu" });
  });

  it("właściciel innej firmy nie widzi zgłoszenia i nie może o nim zdecydować", async () => {
    const z = await givenZawbud();
    const { toolId } = await reportMakita(z);
    const other = testbed.registry.as((await testbed.givenActiveCompany("Budrex")).ownerId);

    expect(await other.toolReports()).toEqual([]);
    await expect(other.acceptToolReport({ toolId, value: 1 })).rejects.toMatchObject({ code: "not_found" });
    await expect(other.rejectToolReport({ operationId: randomUUID(), toolId, comment: "Nie" })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("baza pilnuje tego samego z pominięciem Rejestru", async () => {
    const z = await givenZawbud();
    const { toolId } = await reportMakita(z);
    const insertTool = (actorId: string, locationId: string, registration: string) =>
      withActor(testbed.db, actorId, (sql) =>
        sql(
          `insert into app.tools (company_id, code, name, category_id, location_id, located_since, created_at, registration)
           values ($1, 'W-99', 'Wiertarka', $2, $3, now(), now(), $4)`,
          [z.zawbud.companyId, z.drills.id, locationId, registration],
        ),
      );
    const acceptDirectly = (actorId: string) =>
      withActor(testbed.db, actorId, (sql) => sql("update app.tools set registration = 'zaakceptowane' where id = $1", [toolId]));

    // Kierownik dopisuje do ewidencji tylko zgłoszone narzędzie na swojej budowie.
    await expect(insertTool(z.nowakId, z.ratajeId, "zaakceptowane")).rejects.toThrow(/row-level security/);
    await expect(insertTool(z.nowakId, z.winogradyId, "zgloszone")).rejects.toThrow(/row-level security/);
    await expect(insertTool(z.nowakId, z.baseId, "zgloszone")).rejects.toThrow(/row-level security/);
    // Przyjęcie na budowę dotyczy tylko narzędzia dopisanego w tej samej transakcji.
    await expect(
      withActor(testbed.db, z.nowakId, async (sql) => {
        const [movement] = await sql<{ id: string }>(
          `insert into app.movements (company_id, kind, source, to_location_id, author_id, occurred_at, recorded_at, client_operation_id)
           values ($1, 'przyjecie', 'panel', $2, $3, now(), now(), gen_random_uuid()) returning id`,
          [z.zawbud.companyId, z.ratajeId, z.nowakId],
        );
        await sql("insert into app.movement_tools (movement_id, tool_id, company_id) values ($1, $2, $3)", [movement.id, z.w01, z.zawbud.companyId]);
      }),
    ).rejects.toThrow(/przyjęci/i);
    // Akceptuje tylko właściciel.
    await expect(acceptDirectly(z.nowakId)).resolves.toEqual([]);
    await expect(acceptDirectly(z.storekeeperId)).rejects.toThrow(/właściciel/);
    expect(await z.owner.toolCard(toolId)).toMatchObject({ registration: "zgloszone" });
    expect((await z.owner.toolCard(z.w01))!.history).toHaveLength(1);
  });
});
