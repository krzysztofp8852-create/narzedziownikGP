import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AddRentedToolInput, RegisteredKind } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();

/**
 * Zawbud (dziś 2 marca 2026, 7:00): kierownik Nowak prowadzi Rataje i bus WX 12345, kierownik Kowalski Winogrady,
 * magazynier Wiśniewski, pracownik Zieliński. W kategorii Maszyny (M) jest już M-01 na bazie.
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
  const machines = await owner.addCategory({ name: "Maszyny", prefix: "M" });
  const m01 = (await owner.addTool({ operationId: randomUUID(), name: "Zagęszczarka", categoryId: machines.id, value: 8000 })).toolId;
  const { base } = await owner.whereIsWhat();
  return { zawbud, owner, ownerId, nowakId, kowalskiId, storekeeperId, workerId, ratajeId, winogradyId, busId, baseId: base.id, machines, m01 };
}

type Zawbud = Awaited<ReturnType<typeof givenZawbud>>;

/** Koparka z wypożyczalni Ramirent za 450 zł/dobę do 10 marca, na Rataje, przyjęta przez kierownika Nowaka. */
function excavator(z: Zawbud, changes: Partial<AddRentedToolInput> = {}): AddRentedToolInput {
  return {
    operationId: randomUUID(),
    locationId: z.ratajeId,
    name: "Minikoparka Kubota",
    categoryId: z.machines.id,
    rentalCompany: "Ramirent",
    dailyRate: 450,
    returnOn: "2026-03-10",
    ...changes,
  };
}

async function bellOf(userId: string) {
  return (await testbed.registry.as(userId).bell()).entries.map((entry) => entry.notification);
}

async function boardTool(userId: string, toolId: string) {
  const board = await testbed.registry.as(userId).whereIsWhat();
  return [board.base, ...board.sites, ...board.vehicles, ...board.services].flatMap((place) => place.tools).find((tool) => tool.id === toolId) ?? null;
}

function move(actorId: string, kind: RegisteredKind, from: string, to: string, toolIds: string[]) {
  return testbed.registry
    .as(actorId)
    .registerMovement({ operationId: randomUUID(), kind, fromLocationId: from, toLocationId: to, toolIds, source: "checklista" });
}

describe("przyjęcie sprzętu wynajętego", () => {
  it("kierownik dopisuje koparkę z wypożyczalni na swoją budowę od razu, z kolejnym kodem, a właściciel ma wpis w dzwonku", async () => {
    const z = await givenZawbud();
    const nowak = testbed.registry.as(z.nowakId);

    const added = await nowak.addRentedTool(excavator(z));

    expect(added).toEqual({ toolId: expect.any(String), code: "M-02" });
    const card = await nowak.toolCard(added.toolId);
    expect(card).toMatchObject({
      code: "M-02",
      name: "Minikoparka Kubota",
      state: "w_obiegu",
      registration: "zaakceptowane",
      location: { id: z.ratajeId, name: "Rataje", kind: "budowa" },
      rental: { rentedFrom: "Ramirent" },
    });
    expect(card!.deadlines).toMatchObject([{ kind: "zwrot", dueOn: "2026-03-10", cycleMonths: null }]);
    expect(card!.history).toMatchObject([{ kind: "przyjecie", author: "Adam Nowak", to: "Rataje" }]);
    expect(await boardTool(z.workerId, added.toolId)).toMatchObject({ code: "M-02", rented: true, returnOverdue: false });

    expect(await bellOf(z.ownerId)).toEqual([
      {
        kind: "sprzet_wynajety",
        tool: { id: added.toolId, code: "M-02", name: "Minikoparka Kubota" },
        location: { id: z.ratajeId, name: "Rataje", kind: "budowa" },
        rentalCompany: "Ramirent",
        returnOn: "2026-03-10",
        addedBy: "Adam Nowak",
      },
    ]);
    expect(await bellOf(z.nowakId)).toEqual([]);
  });

  it("ponowne wysłanie tej samej operacji zwraca to samo narzędzie i nie dubluje wpisu w dzwonku", async () => {
    const z = await givenZawbud();
    const input = excavator(z);
    const first = await testbed.registry.as(z.nowakId).addRentedTool(input);

    expect(await testbed.registry.as(z.nowakId).addRentedTool(input)).toEqual(first);
    expect(await bellOf(z.ownerId)).toHaveLength(1);
  });

  it("kierownik tylko na swojej budowie i pojeździe; magazynier i właściciel wszędzie, także na bazie; pracownik wcale", async () => {
    const z = await givenZawbud();
    const as = (userId: string) => testbed.registry.as(userId);

    await expect(as(z.nowakId).addRentedTool(excavator(z, { locationId: z.busId }))).resolves.toMatchObject({ code: "M-02" });
    await expect(as(z.nowakId).addRentedTool(excavator(z, { locationId: z.winogradyId }))).rejects.toMatchObject({ code: "forbidden" });
    await expect(as(z.nowakId).addRentedTool(excavator(z, { locationId: z.baseId }))).rejects.toMatchObject({ code: "forbidden" });
    await expect(as(z.workerId).addRentedTool(excavator(z))).rejects.toMatchObject({ code: "forbidden" });
    await expect(as(z.storekeeperId).addRentedTool(excavator(z, { locationId: z.baseId }))).resolves.toMatchObject({ code: "M-03" });
    await expect(as(z.storekeeperId).addRentedTool(excavator(z, { locationId: z.winogradyId }))).resolves.toMatchObject({ code: "M-04" });
    // Właściciel sam dopisuje i nie dostaje wpisu o własnym przyjęciu.
    await expect(as(z.ownerId).addRentedTool(excavator(z, { locationId: z.winogradyId, value: 120_000 }))).resolves.toMatchObject({ code: "M-05" });
    expect((await bellOf(z.ownerId)).map((n) => n.kind === "sprzet_wynajety" && n.tool.code).sort()).toEqual(["M-02", "M-03", "M-04"]);
  });

  it("wypożyczalnia, stawka dobowa w zł i termin zwrotu są wymagane; wartość podaje tylko właściciel", async () => {
    const z = await givenZawbud();
    const nowak = testbed.registry.as(z.nowakId);
    for (const changes of [
      { rentalCompany: "  " },
      { dailyRate: -1 },
      { dailyRate: 10.555 },
      { returnOn: "2026-02-30" },
      { name: "" },
      { categoryId: randomUUID() },
    ]) {
      await expect(nowak.addRentedTool(excavator(z, changes)), JSON.stringify(changes)).rejects.toMatchObject({ code: "invalid_input" });
    }
    await expect(nowak.addRentedTool(excavator(z, { value: 120_000 }))).rejects.toMatchObject({ code: "forbidden" });
  });

  it("na zakończoną budowę i nieaktywny pojazd sprzętu się nie przyjmuje, a do serwisu wcale", async () => {
    const z = await givenZawbud();
    const { locationId: serviceId } = await z.owner.addService({ name: "Serwis Hilti" });
    await z.owner.closeSite(z.winogradyId);

    await expect(z.owner.addRentedTool(excavator(z, { locationId: z.winogradyId }))).rejects.toMatchObject({ code: "site_finished" });
    await expect(z.owner.addRentedTool(excavator(z, { locationId: serviceId }))).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("sprzęt wynajęty nie liczy się do limitu narzędzi progu", async () => {
    const z = await givenZawbud();
    expect((await z.owner.subscription()).toolCount).toBe(1);

    await testbed.registry.as(z.nowakId).addRentedTool(excavator(z));

    expect((await z.owner.subscription()).toolCount).toBe(1);
  });

  it("naklejkę można wydrukować, ale wynajęte nie trafia do druku wszystkich nieoklejonych", async () => {
    const z = await givenZawbud();
    const { toolId } = await testbed.registry.as(z.nowakId).addRentedTool(excavator(z));

    expect((await z.owner.stickerCandidates()).map((candidate) => [candidate.code, candidate.rented])).toEqual([
      ["M-01", false],
      ["M-02", true],
    ]);
    expect(await z.owner.printStickers({ unlabeled: true }, async (batch) => batch.stickers.map((s) => s.code))).toEqual(["M-01"]);
    expect(await z.owner.printStickers({ toolIds: [toolId] }, async (batch) => batch.stickers.map((s) => s.code))).toEqual(["M-02"]);
  });
});

describe("zwrot do wypożyczalni", () => {
  it("wynajęte rusza się zwykłymi ruchami, a zwrot do wypożyczalni zdejmuje je z tablicy, wyszukiwania i terminów", async () => {
    const z = await givenZawbud();
    const nowak = testbed.registry.as(z.nowakId);
    const { toolId } = await nowak.addRentedTool(excavator(z));
    await move(z.nowakId, "przeniesienie", z.ratajeId, z.busId, [toolId]);
    testbed.clock.set("2026-03-04T10:00:00+01:00");

    const returned = await nowak.returnToRental({ operationId: randomUUID(), toolId });

    expect(returned).toMatchObject({
      kind: "zwrot_do_wypozyczalni",
      author: "Adam Nowak",
      from: { id: z.busId, name: "Bus WX 12345" },
      to: null,
      tools: [{ id: toolId, code: "M-02" }],
      stateChange: { from: "w_obiegu", to: "zwrocone" },
    });
    expect(await nowak.toolCard(toolId)).toMatchObject({ state: "zwrocone", location: { id: z.busId }, responsible: null });
    const [returnDeadline] = (await nowak.toolCard(toolId))!.deadlines;
    await expect(nowak.updateDeadline(returnDeadline.id, { dueOn: "2026-03-20" })).rejects.toMatchObject({ code: "invalid_tool_state" });
    expect(await boardTool(z.ownerId, toolId)).toBeNull();
    expect((await z.owner.toolCatalog()).map((tool) => tool.code)).toEqual(["M-01"]);
    expect(await z.owner.upcomingDeadlines()).toEqual([]);
    expect((await z.owner.movementHistory()).movements.map((m) => m.kind)).toEqual(["zwrot_do_wypozyczalni", "przeniesienie", "przyjecie", "przyjecie"]);
    await expect(move(z.nowakId, "przeniesienie", z.busId, z.ratajeId, [toolId])).rejects.toMatchObject({ code: "movement_conflict" });
  });

  it("zwrot zapisuje kierownik lokalizacji, w której sprzęt stoi, magazynier i właściciel; własny sprzęt do wypożyczalni nie wraca", async () => {
    const z = await givenZawbud();
    const as = (userId: string) => testbed.registry.as(userId);
    const first = (await as(z.nowakId).addRentedTool(excavator(z))).toolId;
    const second = (await as(z.nowakId).addRentedTool(excavator(z))).toolId;
    const atBase = (await as(z.storekeeperId).addRentedTool(excavator(z, { locationId: z.baseId }))).toolId;
    const giveBack = (userId: string, toolId: string) => as(userId).returnToRental({ operationId: randomUUID(), toolId });

    await expect(giveBack(z.kowalskiId, first)).rejects.toMatchObject({ code: "forbidden" });
    await expect(giveBack(z.workerId, first)).rejects.toMatchObject({ code: "forbidden" });
    await expect(giveBack(z.nowakId, atBase)).rejects.toMatchObject({ code: "forbidden" });
    await expect(giveBack(z.ownerId, z.m01)).rejects.toMatchObject({ code: "not_rented" });
    await expect(giveBack(z.nowakId, first)).resolves.toMatchObject({ kind: "zwrot_do_wypozyczalni" });
    await expect(giveBack(z.storekeeperId, atBase)).resolves.toMatchObject({ kind: "zwrot_do_wypozyczalni" });
    await expect(giveBack(z.ownerId, second)).resolves.toMatchObject({ kind: "zwrot_do_wypozyczalni" });
    await expect(giveBack(z.ownerId, second)).rejects.toMatchObject({ code: "invalid_tool_state" });
  });

  it("autor cofa zwrot w 15 minut i sprzęt wraca na tablicę tam, gdzie był; potem już nie", async () => {
    const z = await givenZawbud();
    const nowak = testbed.registry.as(z.nowakId);
    const { toolId } = await nowak.addRentedTool(excavator(z));
    const late = (await nowak.addRentedTool(excavator(z))).toolId;
    testbed.clock.set("2026-03-04T10:00:00+01:00");
    const returned = await nowak.returnToRental({ operationId: randomUUID(), toolId });
    const returnedLate = await nowak.returnToRental({ operationId: randomUUID(), toolId: late });

    expect((await nowak.recentMovements()).find((m) => m.id === returned.id)).toMatchObject({ undoable: true });
    testbed.clock.set("2026-03-04T10:14:00+01:00");
    const undone = await nowak.undoMovement({ operationId: randomUUID(), movementId: returned.id });

    expect(undone).toMatchObject({ kind: "cofniecie", undoes: returned.id, from: { id: z.ratajeId }, to: { id: z.ratajeId } });
    expect(await nowak.toolCard(toolId)).toMatchObject({ state: "w_obiegu", location: { id: z.ratajeId }, daysInPlace: 2 });
    expect(await boardTool(z.ownerId, toolId)).toMatchObject({ rented: true });
    testbed.clock.set("2026-03-04T10:16:00+01:00");
    await expect(nowak.undoMovement({ operationId: randomUUID(), movementId: returnedLate.id })).rejects.toMatchObject({ code: "undo_expired" });
  });
});

describe("koszt sprzętu wynajętego", () => {
  it("liczy się ze stawki wypożyczalni przed stawkami firmy i narzędzia, także po terminie zwrotu, aż do zwrotu", async () => {
    const z = await givenZawbud();
    await z.owner.setDailyRate({ kind: "firma" }, 1);
    const nowak = testbed.registry.as(z.nowakId);
    const { toolId } = await nowak.addRentedTool(excavator(z, { returnOn: "2026-03-03" }));
    await z.owner.setDailyRate({ kind: "narzedzie", toolId }, 99);
    // Termin zwrotu minął 3 marca, a koparka wraca do wypożyczalni dopiero 5 marca.
    testbed.clock.set("2026-03-05T12:00:00+01:00");
    await nowak.returnToRental({ operationId: randomUUID(), toolId });
    testbed.clock.set("2026-03-09T12:00:00+01:00");

    const costs = await z.owner.locationCosts(z.ratajeId);

    expect(costs).toMatchObject({
      status: "koszty",
      total: 1800,
      tools: [{ tool: { code: "M-02" }, days: 4, rates: [{ amount: 450, days: 4 }], amount: 1800 }],
    });
    expect((await z.owner.toolCard(toolId))?.dailyRate).toEqual({ source: "wypozyczalnia", amount: 450 });
  });

  it("stawkę wypożyczalni widzi ten, kto widzi koszty: kierownik dopiero za zgodą właściciela", async () => {
    const z = await givenZawbud();
    await z.owner.setDailyRate({ kind: "firma" }, 1);
    const nowak = testbed.registry.as(z.nowakId);
    const { toolId } = await nowak.addRentedTool(excavator(z));
    testbed.clock.set("2026-03-03T12:00:00+01:00");

    expect((await nowak.toolCard(toolId))?.rental).toEqual({ rentedFrom: "Ramirent", handledByViewer: true });
    await z.owner.updateSettings({ siteManagersSeeCosts: true });
    expect((await nowak.toolCard(toolId))?.rental).toEqual({ rentedFrom: "Ramirent", dailyRate: 450, handledByViewer: true });
    expect(await nowak.locationCosts(z.ratajeId)).toMatchObject({ total: 900 });
    expect((await testbed.registry.as(z.storekeeperId).toolCard(toolId))?.rental).toEqual({ rentedFrom: "Ramirent", handledByViewer: true });
    expect((await testbed.registry.as(z.kowalskiId).toolCard(toolId))?.rental).toEqual({ rentedFrom: "Ramirent", handledByViewer: false });
    expect((await z.owner.toolCard(toolId))?.rental).toEqual({ rentedFrom: "Ramirent", dailyRate: 450, handledByViewer: true });
  });
});

describe("termin zwrotu", () => {
  it("dzień przed terminem zwrotu i raz po nim przypomina właścicielowi i kierownikowi lokalizacji, w której stoi sprzęt", async () => {
    const z = await givenZawbud();
    const { toolId } = await testbed.registry.as(z.nowakId).addRentedTool(excavator(z));

    testbed.clock.set("2026-03-08T06:00:00Z");
    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 0 });
    testbed.clock.set("2026-03-09T06:00:00Z");
    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 1 });
    testbed.clock.set("2026-03-10T06:00:00Z");
    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 0 });
    testbed.clock.set("2026-03-11T06:00:00Z");
    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 1 });
    testbed.clock.set("2026-03-12T06:00:00Z");
    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 0 });

    const reminders = async (userId: string) =>
      (await bellOf(userId)).flatMap((n) => (n.kind === "terminy" ? n.deadlines.map((d) => [d.kind, d.tool?.id, d.overdue]) : []));
    expect(await reminders(z.ownerId)).toEqual([
      ["zwrot", toolId, true],
      ["zwrot", toolId, false],
    ]);
    expect(await reminders(z.nowakId)).toEqual(await reminders(z.ownerId));
    expect(await reminders(z.kowalskiId)).toEqual([]);
  });

  it("po terminie zwrotu tablica ma dopisek, a ruchy dalej działają", async () => {
    const z = await givenZawbud();
    const { toolId } = await testbed.registry.as(z.nowakId).addRentedTool(excavator(z));
    testbed.clock.set("2026-03-11T08:00:00+01:00");

    expect(await boardTool(z.workerId, toolId)).toMatchObject({ rented: true, returnOverdue: true });
    await expect(move(z.nowakId, "przeniesienie", z.ratajeId, z.busId, [toolId])).resolves.toMatchObject({ kind: "przeniesienie" });
  });

  it("przedłużenie: kierownik lokalizacji, magazynier albo właściciel zmienia termin zwrotu, a przypomnienie przychodzi przed nowym", async () => {
    const z = await givenZawbud();
    const nowak = testbed.registry.as(z.nowakId);
    const { toolId } = await nowak.addRentedTool(excavator(z));
    const [returnDeadline] = (await nowak.toolCard(toolId))!.deadlines;
    testbed.clock.set("2026-03-09T06:00:00Z");
    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 1 });

    await expect(testbed.registry.as(z.kowalskiId).updateDeadline(returnDeadline.id, { dueOn: "2026-03-20" })).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(testbed.registry.as(z.workerId).updateDeadline(returnDeadline.id, { dueOn: "2026-03-20" })).rejects.toMatchObject({
      code: "forbidden",
    });
    await nowak.updateDeadline(returnDeadline.id, { dueOn: "2026-03-17" });
    await testbed.registry.as(z.storekeeperId).updateDeadline(returnDeadline.id, { dueOn: "2026-03-20" });
    await expect(nowak.updateDeadline(returnDeadline.id, { cycleMonths: 1 })).rejects.toMatchObject({ code: "invalid_input" });

    expect((await nowak.toolCard(toolId))!.deadlines).toMatchObject([{ kind: "zwrot", dueOn: "2026-03-20" }]);
    testbed.clock.set("2026-03-11T06:00:00Z");
    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 0 });
    testbed.clock.set("2026-03-19T06:00:00Z");
    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 1 });
  });

  it("termin zwrotu powstaje tylko z przyjęciem wynajętego, nie wykonuje się go ani nie usuwa", async () => {
    const z = await givenZawbud();
    const { toolId } = await testbed.registry.as(z.nowakId).addRentedTool(excavator(z));
    const [returnDeadline] = (await z.owner.toolCard(toolId))!.deadlines;

    await expect(z.owner.addDeadline({ toolId: z.m01, kind: "zwrot", dueOn: "2026-03-10" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      z.owner.completeDeadline({ operationId: randomUUID(), deadlineId: returnDeadline.id, doneOn: "2026-03-02" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(z.owner.deleteDeadline(returnDeadline.id)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(z.owner.addDeadline({ toolId, kind: "przeglad", dueOn: "2026-03-31" })).resolves.toMatchObject({ deadlineId: expect.any(String) });
  });
});
