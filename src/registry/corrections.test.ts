import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withActor } from "./registry";
import { type GivenCompany, setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

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
  return { zawbud, owner, nowakId, ratajeId, baseId: base.id, s01, s02 };
}

type Zawbud = Awaited<ReturnType<typeof givenZawbud>>;

async function givenTool(company: GivenCompany, categoryId: string, code: string, name: string) {
  const { toolId } = await testbed.registry.as(company.ownerId).addTool({ operationId: randomUUID(), code, name, categoryId });
  return toolId;
}

function issue(z: Zawbud, actorId: string, toolIds: string[]) {
  return testbed.registry.as(actorId).registerMovement({
    operationId: randomUUID(),
    kind: "wydanie",
    fromLocationId: z.baseId,
    toLocationId: z.ratajeId,
    toolIds,
    source: "checklista",
  });
}

function undo(actorId: string, movementId: string, operationId = randomUUID()) {
  return testbed.registry.as(actorId).undoMovement({ operationId, movementId });
}

async function whereIs(z: Zawbud, toolId: string) {
  return (await z.owner.toolCard(toolId))!.location.name;
}

describe("cofnięcie", () => {
  it("kierownik cofa swoje wydanie: S-01 i S-02 wracają na bazę, a wydanie zostaje w historii jako cofnięte", async () => {
    const z = await givenZawbud();
    const issued = await issue(z, z.nowakId, [z.s01, z.s02]);
    testbed.clock.advance(5 * MINUTE);

    const reversal = await undo(z.nowakId, issued.id);

    expect(reversal).toMatchObject({
      kind: "cofniecie",
      author: "Adam Nowak",
      from: { id: z.ratajeId, name: "Rataje" },
      to: { id: z.baseId, name: "Magazyn Swarzędz" },
      tools: [{ code: "S-01" }, { code: "S-02" }],
      undoes: issued.id,
      occurredAt: testbed.clock.now(),
    });
    expect((await z.owner.whereIsWhat()).base.tools.map((tool) => tool.code)).toEqual(["S-01", "S-02"]);
    const history = (await z.owner.toolCard(z.s01))!.history;
    expect(history.map((entry) => [entry.kind, entry.undone])).toEqual([
      ["cofniecie", false],
      ["wydanie", true],
      ["przyjecie", false],
    ]);
    const recent = await z.owner.recentMovements();
    expect(recent.find((movement) => movement.id === issued.id)).toMatchObject({ undoneBy: reversal.id });
  });
});

function giveBack(z: Zawbud, actorId: string, toolIds: string[]) {
  return testbed.registry.as(actorId).registerMovement({
    operationId: randomUUID(),
    kind: "zwrot",
    fromLocationId: z.ratajeId,
    toLocationId: z.baseId,
    toolIds,
    source: "checklista",
  });
}

describe("okno cofnięcia", () => {
  it("cofnąć można do 15 minut od zapisu ruchu; później nie, i nic się nie zmienia", async () => {
    const z = await givenZawbud();
    const early = await issue(z, z.nowakId, [z.s01]);
    const late = await issue(z, z.nowakId, [z.s02]);
    testbed.clock.advance(15 * MINUTE);

    await undo(z.nowakId, early.id);
    testbed.clock.advance(1000);
    await expect(undo(z.nowakId, late.id)).rejects.toMatchObject({ code: "undo_expired" });

    expect(await whereIs(z, z.s01)).toBe("Magazyn Swarzędz");
    expect(await whereIs(z, z.s02)).toBe("Rataje");
  });

  it("liczy się czas zapisu, nie czas zdarzenia: ruch z kolejki offline można cofnąć zaraz po dotarciu", async () => {
    const z = await givenZawbud();
    testbed.clock.advance(DAY);
    const offline = await testbed.registry.as(z.nowakId).registerMovement({
      operationId: randomUUID(),
      kind: "wydanie",
      fromLocationId: z.baseId,
      toLocationId: z.ratajeId,
      toolIds: [z.s01],
      occurredAt: new Date(testbed.clock.now().getTime() - 3 * 60 * MINUTE),
      source: "checklista",
    });
    testbed.clock.advance(10 * MINUTE);

    await undo(z.nowakId, offline.id);

    expect(await whereIs(z, z.s01)).toBe("Magazyn Swarzędz");
  });
});

describe("kto może cofnąć", () => {
  it("tylko autor: właściciel, magazynier ani inny kierownik nie cofną ruchu Nowaka", async () => {
    const z = await givenZawbud();
    const storekeeperId = await testbed.givenMember(z.zawbud, "magazynier");
    const kowalskiId = await testbed.givenMember(z.zawbud, "kierownik", "Jan Kowalski");
    const issued = await issue(z, z.nowakId, [z.s01]);

    for (const actorId of [z.zawbud.ownerId, storekeeperId, kowalskiId]) {
      await expect(undo(actorId, issued.id)).rejects.toMatchObject({ code: "forbidden" });
    }

    expect(await whereIs(z, z.s01)).toBe("Rataje");
  });

  it("magazynier i właściciel cofają własne ruchy", async () => {
    const z = await givenZawbud();
    const storekeeperId = await testbed.givenMember(z.zawbud, "magazynier");
    const byStorekeeper = await issue(z, storekeeperId, [z.s01]);
    const byOwner = await issue(z, z.zawbud.ownerId, [z.s02]);

    await undo(storekeeperId, byStorekeeper.id);
    await undo(z.zawbud.ownerId, byOwner.id);

    expect((await z.owner.whereIsWhat()).base.tools.map((tool) => tool.code)).toEqual(["S-01", "S-02"]);
  });

  it("ruchu innej firmy nie widać", async () => {
    const z = await givenZawbud();
    const budrex = await testbed.givenActiveCompany("Budrex");
    const issued = await issue(z, z.nowakId, [z.s01]);

    await expect(undo(budrex.ownerId, issued.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(undo(z.nowakId, randomUUID())).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("blokada cofnięcia", () => {
  it("po późniejszym ruchu któregoś z narzędzi cofnąć się nie da, nawet w oknie 15 minut", async () => {
    const z = await givenZawbud();
    const issued = await issue(z, z.nowakId, [z.s01, z.s02]);
    testbed.clock.advance(MINUTE);
    await giveBack(z, z.nowakId, [z.s02]);

    await expect(undo(z.nowakId, issued.id)).rejects.toMatchObject({ code: "undo_blocked" });

    expect(await whereIs(z, z.s01)).toBe("Rataje");
    expect(await whereIs(z, z.s02)).toBe("Magazyn Swarzędz");
  });

  it("ruch cofa się raz; cofnięcia i przyjęcia nie da się cofnąć", async () => {
    const z = await givenZawbud();
    const issued = await issue(z, z.nowakId, [z.s01]);
    const reversal = await undo(z.nowakId, issued.id);
    const [intake] = (await z.owner.recentMovements()).filter((movement) => movement.kind === "przyjecie");

    await expect(undo(z.nowakId, issued.id)).rejects.toMatchObject({ code: "undo_blocked" });
    await expect(undo(z.nowakId, reversal.id)).rejects.toMatchObject({ code: "not_undoable" });
    await expect(undo(z.zawbud.ownerId, intake.id)).rejects.toMatchObject({ code: "not_undoable" });
    expect(await whereIs(z, z.s01)).toBe("Magazyn Swarzędz");
  });

  it("lista ostatnich ruchów mówi autorowi, co może jeszcze cofnąć", async () => {
    const z = await givenZawbud();
    const first = await issue(z, z.nowakId, [z.s01]);
    testbed.clock.advance(MINUTE);
    const second = await issue(z, z.nowakId, [z.s02]);
    testbed.clock.advance(MINUTE);
    await giveBack(z, z.nowakId, [z.s01]);
    const undoable = (recent: { id: string; undoable: boolean }[]) =>
      Object.fromEntries(recent.filter((m) => [first.id, second.id].includes(m.id)).map((m) => [m.id, m.undoable]));

    expect(undoable(await testbed.registry.as(z.nowakId).recentMovements())).toEqual({ [first.id]: false, [second.id]: true });
    expect(undoable(await z.owner.recentMovements())).toEqual({ [first.id]: false, [second.id]: false });
    testbed.clock.advance(14 * MINUTE + 1000);
    expect(undoable(await testbed.registry.as(z.nowakId).recentMovements())).toEqual({ [first.id]: false, [second.id]: false });
  });
});

describe("skutki cofnięcia", () => {
  it("cofnięte wydanie nie zeruje „od X dni” na bazie", async () => {
    const z = await givenZawbud();
    testbed.clock.advance(40 * DAY);
    const issued = await issue(z, z.nowakId, [z.s01]);
    testbed.clock.advance(5 * MINUTE);

    await undo(z.nowakId, issued.id);

    const board = await z.owner.whereIsWhat();
    expect(board.base.tools.find((tool) => tool.code === "S-01")).toMatchObject({ daysInPlace: 40 });
  });

  it("cofnięty zwrot przywraca narzędzie na budowę z jego „od X dni”", async () => {
    const z = await givenZawbud();
    await issue(z, z.nowakId, [z.s01]);
    testbed.clock.advance(12 * DAY);
    const returned = await giveBack(z, z.nowakId, [z.s01]);
    testbed.clock.advance(MINUTE);

    await undo(z.nowakId, returned.id);

    expect((await z.owner.whereIsWhat()).sites[0].tools).toEqual([expect.objectContaining({ code: "S-01", daysInPlace: 12 })]);
  });

  it("ponowne wysłanie cofnięcia z tym samym identyfikatorem operacji zwraca pierwotne cofnięcie", async () => {
    const z = await givenZawbud();
    const issued = await issue(z, z.nowakId, [z.s01]);
    const operationId = randomUUID();

    const [a, b] = await Promise.all([undo(z.nowakId, issued.id, operationId), undo(z.nowakId, issued.id, operationId)]);
    const again = await undo(z.nowakId, issued.id, operationId);

    expect(a).toEqual(b);
    expect(again).toEqual(a);
    expect((await z.owner.recentMovements()).filter((movement) => movement.kind === "cofniecie")).toHaveLength(1);
  });

  it("nie cofnie się zwrotu z budowy, która w międzyczasie została zakończona", async () => {
    const z = await givenZawbud();
    await issue(z, z.nowakId, [z.s01]);
    const returned = await giveBack(z, z.nowakId, [z.s01]);
    await testbed.db.transaction((sql) => sql("update app.locations set status = 'zakonczona' where id = $1", [z.ratajeId]));

    await expect(undo(z.nowakId, returned.id)).rejects.toMatchObject({ code: "site_finished" });
    expect(await whereIs(z, z.s01)).toBe("Magazyn Swarzędz");
  });
});

function correct(actorId: string, input: { toolId: string; locationId?: string; state?: "w_obiegu" | "zaginione" | "wycofane"; reason?: string }) {
  return testbed.registry.as(actorId).correctTool({ operationId: randomUUID(), reason: "", ...input });
}

describe("korekta", () => {
  it("właściciel ustawia, gdzie S-01 naprawdę jest; wydanie zostaje w historii, a obok korekta z powodem", async () => {
    const z = await givenZawbud();
    await issue(z, z.nowakId, [z.s01]);
    testbed.clock.advance(3 * DAY);

    const correction = await correct(z.zawbud.ownerId, { toolId: z.s01, locationId: z.baseId, reason: "Nie wyjechała, stoi w magazynie" });

    expect(correction).toMatchObject({
      kind: "korekta",
      author: "Właściciel Zawbud",
      from: { id: z.ratajeId, name: "Rataje" },
      to: { id: z.baseId, name: "Magazyn Swarzędz" },
      tools: [{ code: "S-01" }],
      reason: "Nie wyjechała, stoi w magazynie",
      stateChange: { from: "w_obiegu", to: "w_obiegu" },
    });
    const card = (await z.owner.toolCard(z.s01))!;
    expect(card).toMatchObject({ location: { name: "Magazyn Swarzędz" }, state: "w_obiegu", daysInPlace: 0 });
    expect(card.history.map((entry) => [entry.kind, entry.from, entry.to, entry.reason])).toEqual([
      ["korekta", "Rataje", "Magazyn Swarzędz", "Nie wyjechała, stoi w magazynie"],
      ["wydanie", "Magazyn Swarzędz", "Rataje", null],
      ["przyjecie", null, "Magazyn Swarzędz", null],
    ]);
  });

  it("korekta bez powodu jest odrzucona i nic nie zmienia", async () => {
    const z = await givenZawbud();
    await issue(z, z.nowakId, [z.s01]);

    await expect(correct(z.zawbud.ownerId, { toolId: z.s01, locationId: z.baseId })).rejects.toMatchObject({ code: "reason_required" });
    await expect(correct(z.zawbud.ownerId, { toolId: z.s01, locationId: z.baseId, reason: "   " })).rejects.toMatchObject({
      code: "reason_required",
    });

    expect(await whereIs(z, z.s01)).toBe("Rataje");
  });

  it("korektę robi tylko właściciel", async () => {
    const z = await givenZawbud();
    const storekeeperId = await testbed.givenMember(z.zawbud, "magazynier");
    await issue(z, z.nowakId, [z.s01]);

    for (const actorId of [z.nowakId, storekeeperId]) {
      await expect(correct(actorId, { toolId: z.s01, locationId: z.baseId, reason: "Pomyłka" })).rejects.toMatchObject({
        code: "forbidden",
      });
    }
    expect(await whereIs(z, z.s01)).toBe("Rataje");
  });

  it("odrzuca korektę, która niczego nie zmienia, cudze i nieznane narzędzie, obcą lokalizację i zakończoną budowę", async () => {
    const z = await givenZawbud();
    const budrex = await testbed.givenActiveCompany("Budrex");
    const hammers = await testbed.registry.as(budrex.ownerId).addCategory({ name: "Młoty", prefix: "H" });
    const foreignTool = await givenTool(budrex, hammers.id, "H-01", "Młot");
    const { base: foreignBase } = await testbed.registry.as(budrex.ownerId).whereIsWhat();
    const kowalskiId = await testbed.givenMember(z.zawbud, "kierownik");
    const { locationId: finishedId } = await z.owner.addSite({ name: "Stara", address: "ul. Stara 1", managerId: kowalskiId });
    await testbed.db.transaction((sql) => sql("update app.locations set status = 'zakonczona' where id = $1", [finishedId]));
    const reason = "Sprawdzone na miejscu";

    await expect(correct(z.zawbud.ownerId, { toolId: z.s01, locationId: z.baseId, reason })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(correct(z.zawbud.ownerId, { toolId: foreignTool, locationId: z.baseId, reason })).rejects.toMatchObject({ code: "not_found" });
    await expect(correct(z.zawbud.ownerId, { toolId: randomUUID(), locationId: z.baseId, reason })).rejects.toMatchObject({ code: "not_found" });
    await expect(correct(z.zawbud.ownerId, { toolId: z.s01, locationId: foreignBase.id, reason })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(correct(z.zawbud.ownerId, { toolId: z.s01, locationId: finishedId, reason })).rejects.toMatchObject({ code: "site_finished" });

    expect(await z.owner.recentMovements()).toHaveLength(2);
  });

  it("korekta może przenieść narzędzie na serwis i ponowiona zwraca ten sam ruch", async () => {
    const z = await givenZawbud();
    const { locationId: serviceId } = await z.owner.addService({ name: "Serwis Hilti" });
    const input = { operationId: randomUUID(), toolId: z.s01, locationId: serviceId, reason: "Oddana do naprawy bez wpisu" };

    const first = await z.owner.correctTool(input);
    const again = await z.owner.correctTool(input);

    expect(again).toEqual(first);
    expect(await whereIs(z, z.s01)).toBe("Serwis Hilti");
  });
});

function markLost(actorId: string, toolId: string, reason = "Nie ma go na budowie") {
  return testbed.registry.as(actorId).markToolLost({ operationId: randomUUID(), toolId, reason });
}

describe("zaginięcie", () => {
  it("S-01 zaginęło na Rataje: znika z tablicy, a karta pamięta datę, ostatnią lokalizację i kierownika Nowaka", async () => {
    const z = await givenZawbud();
    const kowalskiId = await testbed.givenMember(z.zawbud, "kierownik", "Jan Kowalski");
    await issue(z, z.nowakId, [z.s01, z.s02]);
    testbed.clock.advance(20 * DAY);
    const lostAt = testbed.clock.now();

    const movement = await markLost(z.zawbud.ownerId, z.s01, "Nikt nie wie, gdzie jest");
    await z.owner.changeSiteManager(z.ratajeId, kowalskiId);
    testbed.clock.advance(2 * DAY);

    expect(movement).toMatchObject({
      kind: "zaginiecie",
      from: { name: "Rataje" },
      to: null,
      reason: "Nikt nie wie, gdzie jest",
      stateChange: { from: "w_obiegu", to: "zaginione" },
    });
    expect((await z.owner.whereIsWhat()).sites[0].tools.map((tool) => tool.code)).toEqual(["S-02"]);
    expect(await testbed.registry.as(z.nowakId).toolCard(z.s01)).toMatchObject({
      state: "zaginione",
      lost: { since: lostAt, lastLocation: { id: z.ratajeId, name: "Rataje" }, responsible: "Adam Nowak", reason: "Nikt nie wie, gdzie jest" },
    });
    expect((await z.owner.toolCard(z.s02))!.lost).toBeNull();
  });

  it("narzędzie zaginione na bazie nie ma odpowiedzialnego kierownika", async () => {
    const z = await givenZawbud();

    await markLost(z.zawbud.ownerId, z.s01);

    expect((await z.owner.toolCard(z.s01))!.lost).toMatchObject({ lastLocation: { name: "Magazyn Swarzędz" }, responsible: null });
  });

  it("zaginionego narzędzia nie da się wydać ani zwrócić", async () => {
    const z = await givenZawbud();
    await issue(z, z.nowakId, [z.s02]);
    await markLost(z.zawbud.ownerId, z.s01);
    await markLost(z.zawbud.ownerId, z.s02);

    await expect(issue(z, z.nowakId, [z.s01])).rejects.toMatchObject({
      code: "movement_conflict",
      conflicts: [expect.objectContaining({ code: "S-01", state: "zaginione" })],
    });
    await expect(giveBack(z, z.nowakId, [z.s02])).rejects.toMatchObject({ code: "movement_conflict" });
  });

  it("tylko właściciel, z powodem, i tylko narzędzie w obiegu", async () => {
    const z = await givenZawbud();
    const storekeeperId = await testbed.givenMember(z.zawbud, "magazynier");

    await expect(markLost(z.nowakId, z.s01)).rejects.toMatchObject({ code: "forbidden" });
    await expect(markLost(storekeeperId, z.s01)).rejects.toMatchObject({ code: "forbidden" });
    await expect(markLost(z.zawbud.ownerId, z.s01, " ")).rejects.toMatchObject({ code: "reason_required" });
    await markLost(z.zawbud.ownerId, z.s01);
    await expect(markLost(z.zawbud.ownerId, z.s01)).rejects.toMatchObject({ code: "invalid_tool_state" });

    expect((await z.owner.recentMovements()).filter((movement) => movement.kind === "zaginiecie")).toHaveLength(1);
  });

  it("odnalezienie: korekta zaginionego S-01 na bazę przywraca je do obiegu, a zaginięcie zostaje w historii", async () => {
    const z = await givenZawbud();
    await issue(z, z.nowakId, [z.s01]);
    await markLost(z.zawbud.ownerId, z.s01);
    testbed.clock.advance(DAY);

    await correct(z.zawbud.ownerId, { toolId: z.s01, locationId: z.baseId, state: "w_obiegu", reason: "Znalazło się w kontenerze" });

    const card = (await z.owner.toolCard(z.s01))!;
    expect(card).toMatchObject({ state: "w_obiegu", lost: null, location: { name: "Magazyn Swarzędz" } });
    expect(card.history.map((entry) => [entry.kind, entry.stateChange])).toEqual([
      ["korekta", { from: "zaginione", to: "w_obiegu" }],
      ["zaginiecie", { from: "w_obiegu", to: "zaginione" }],
      ["wydanie", null],
      ["przyjecie", null],
    ]);
    expect((await z.owner.whereIsWhat()).base.tools.map((tool) => tool.code)).toEqual(["S-01", "S-02"]);
  });

  it("odnalezienie w tym samym miejscu: korekta samego stanu", async () => {
    const z = await givenZawbud();
    await issue(z, z.nowakId, [z.s01]);
    await markLost(z.zawbud.ownerId, z.s01);

    await correct(z.zawbud.ownerId, { toolId: z.s01, state: "w_obiegu", reason: "Leżało pod szalunkiem" });

    expect((await z.owner.whereIsWhat()).sites[0].tools.map((tool) => tool.code)).toEqual(["S-01"]);
  });
});

function retire(actorId: string, toolId: string, reason?: string) {
  return testbed.registry.as(actorId).retireTool({ operationId: randomUUID(), toolId, reason });
}

describe("wycofanie", () => {
  it("wycofane S-01 znika z tablicy, a jego karta i historia zostają", async () => {
    const z = await givenZawbud();
    await issue(z, z.nowakId, [z.s01]);
    testbed.clock.advance(DAY);

    const movement = await retire(z.zawbud.ownerId, z.s01, "Sprzedana");

    expect(movement).toMatchObject({ kind: "wycofanie", from: { name: "Rataje" }, to: null, reason: "Sprzedana" });
    const board = await z.owner.whereIsWhat();
    expect([...board.base.tools, ...board.sites.flatMap((site) => site.tools)].map((tool) => tool.code)).toEqual(["S-02"]);
    const card = (await testbed.registry.as(z.nowakId).toolCard(z.s01))!;
    expect(card.state).toBe("wycofane");
    expect(card.history.map((entry) => entry.kind)).toEqual(["wycofanie", "wydanie", "przyjecie"]);
    await expect(giveBack(z, z.nowakId, [z.s01])).rejects.toMatchObject({ code: "movement_conflict" });
  });

  it("powód jest opcjonalny; wycofać można też zaginione narzędzie, ale nie wycofane", async () => {
    const z = await givenZawbud();
    await markLost(z.zawbud.ownerId, z.s02);

    await retire(z.zawbud.ownerId, z.s01);
    await retire(z.zawbud.ownerId, z.s02, "Spisane ze stanu");

    await expect(retire(z.zawbud.ownerId, z.s01)).rejects.toMatchObject({ code: "invalid_tool_state" });
    expect((await z.owner.toolCard(z.s02))!).toMatchObject({ state: "wycofane", lost: null });
  });

  it("wycofuje tylko właściciel", async () => {
    const z = await givenZawbud();
    const storekeeperId = await testbed.givenMember(z.zawbud, "magazynier");

    await expect(retire(z.nowakId, z.s01)).rejects.toMatchObject({ code: "forbidden" });
    await expect(retire(storekeeperId, z.s01)).rejects.toMatchObject({ code: "forbidden" });
    expect((await z.owner.toolCard(z.s01))!.state).toBe("w_obiegu");
  });

  it("pomyłkowe wycofanie odwraca korekta", async () => {
    const z = await givenZawbud();
    await retire(z.zawbud.ownerId, z.s01);

    await correct(z.zawbud.ownerId, { toolId: z.s01, state: "w_obiegu", reason: "Wycofana przez pomyłkę" });

    expect((await z.owner.whereIsWhat()).base.tools.map((tool) => tool.code)).toEqual(["S-01", "S-02"]);
  });
});

describe("historia tylko się dopisuje", () => {
  it("Rejestr nie ma polecenia edycji ani usunięcia ruchu", async () => {
    const z = await givenZawbud();

    const commands = Object.keys(testbed.registry.as(z.zawbud.ownerId));

    expect(commands.filter((name) => /movement/i.test(name)).sort()).toEqual([
      "movementHistory",
      "recentMovements",
      "registerMovement",
      "undoMovement",
    ]);
  });

  it("nawet właściciel z pominięciem Rejestru nie zmieni ani nie usunie ruchu", async () => {
    const z = await givenZawbud();
    const issued = await issue(z, z.nowakId, [z.s01]);
    const asOwner = (text: string) => withActor(testbed.db, z.zawbud.ownerId, (sql) => sql(text, [issued.id]));

    await expect(asOwner("update app.movements set to_location_id = from_location_id where id = $1")).rejects.toThrow();
    await expect(asOwner("delete from app.movements where id = $1")).rejects.toThrow();
    await expect(asOwner("delete from app.movement_tools where movement_id = $1")).rejects.toThrow();
    await expect(
      testbed.db.transaction((sql) => sql("update app.movements set reason = 'poprawione' where id = $1", [issued.id])),
    ).rejects.toThrow(/tylko się dopisuje/);

    expect((await z.owner.recentMovements()).find((movement) => movement.id === issued.id)).toMatchObject({
      to: { name: "Rataje" },
      tools: [{ code: "S-01" }],
    });
  });
});

describe("uprawnienia w bazie", () => {
  /** Ruch zapisany z pominięciem Rejestru, jak zrobiłby to klient mówiący wprost do bazy. */
  function insertMovement(actorId: string, columns: Record<string, unknown>, toolId: string) {
    return withActor(testbed.db, actorId, async (sql) => {
      const names = Object.keys(columns);
      const [movement] = await sql<{ id: string }>(
        `insert into app.movements (${names.join(", ")}, source, occurred_at, recorded_at, client_operation_id)
         values (${names.map((_, i) => `$${i + 1}`).join(", ")}, 'panel', now(), now(), gen_random_uuid()) returning id`,
        Object.values(columns),
      );
      await sql("insert into app.movement_tools (movement_id, tool_id, company_id) values ($1, $2, $3)", [
        movement.id,
        toolId,
        columns.company_id,
      ]);
    });
  }

  it("kierownik nie cofnie cudzego ruchu ani nie zrobi korekty, zaginięcia czy wycofania", async () => {
    const z = await givenZawbud();
    const issued = await issue(z, z.zawbud.ownerId, [z.s01]);
    const common = { company_id: z.zawbud.companyId, author_id: z.nowakId };

    await expect(
      insertMovement(z.nowakId, { ...common, kind: "cofniecie", from_location_id: z.ratajeId, to_location_id: z.baseId, reverses_movement_id: issued.id }, z.s01),
    ).rejects.toThrow(/row-level security/);
    await expect(
      insertMovement(
        z.nowakId,
        { ...common, kind: "korekta", from_location_id: z.ratajeId, to_location_id: z.baseId, from_state: "w_obiegu", to_state: "w_obiegu", reason: "x" },
        z.s01,
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      insertMovement(z.nowakId, { ...common, kind: "zaginiecie", from_location_id: z.ratajeId, from_state: "w_obiegu", to_state: "zaginione", reason: "x" }, z.s01),
    ).rejects.toThrow(/row-level security/);
    await expect(
      insertMovement(z.nowakId, { ...common, kind: "wycofanie", from_location_id: z.ratajeId, from_state: "w_obiegu", to_state: "wycofane" }, z.s01),
    ).rejects.toThrow(/row-level security/);

    expect((await z.owner.toolCard(z.s01))!).toMatchObject({ state: "w_obiegu", location: { name: "Rataje" } });
  });

  it("własnego ruchu nie cofnie się w inną stronę ani po późniejszym ruchu, nawet z pominięciem Rejestru", async () => {
    const z = await givenZawbud();
    const issued = await issue(z, z.nowakId, [z.s01, z.s02]);
    await giveBack(z, z.nowakId, [z.s02]);
    const reversal = (from: string, to: string, toolId: string) =>
      insertMovement(
        z.nowakId,
        { company_id: z.zawbud.companyId, author_id: z.nowakId, kind: "cofniecie", from_location_id: from, to_location_id: to, reverses_movement_id: issued.id },
        toolId,
      );

    await expect(reversal(z.baseId, z.ratajeId, z.s01)).rejects.toThrow(/row-level security/);
    await expect(reversal(z.ratajeId, z.baseId, z.s02)).rejects.toThrow(/stanie sprzed ruchu/);
    await expect(reversal(z.ratajeId, z.baseId, z.s01)).rejects.toThrow(/stanie sprzed ruchu/);
    expect(await whereIs(z, z.s01)).toBe("Rataje");
  });

  it("zwrotu nie cofnie się na zakończoną budowę, nawet z pominięciem Rejestru", async () => {
    const z = await givenZawbud();
    await issue(z, z.nowakId, [z.s01]);
    const returned = await giveBack(z, z.nowakId, [z.s01]);
    await testbed.db.transaction((sql) => sql("update app.locations set status = 'zakonczona' where id = $1", [z.ratajeId]));

    await expect(
      insertMovement(
        z.nowakId,
        {
          company_id: z.zawbud.companyId,
          author_id: z.nowakId,
          kind: "cofniecie",
          from_location_id: z.baseId,
          to_location_id: z.ratajeId,
          reverses_movement_id: returned.id,
        },
        z.s01,
      ),
    ).rejects.toThrow(/row-level security/);
    expect(await whereIs(z, z.s01)).toBe("Magazyn Swarzędz");
  });

  it("cofnięcie z pominięciem Rejestru musi objąć wszystkie narzędzia ruchu", async () => {
    const z = await givenZawbud();
    const issued = await issue(z, z.nowakId, [z.s01, z.s02]);

    await expect(
      insertMovement(
        z.nowakId,
        {
          company_id: z.zawbud.companyId,
          author_id: z.nowakId,
          kind: "cofniecie",
          from_location_id: z.ratajeId,
          to_location_id: z.baseId,
          reverses_movement_id: issued.id,
        },
        z.s01,
      ),
    ).rejects.toThrow(/nie obejmuje wszystkich narzędzi/);

    expect(await whereIs(z, z.s01)).toBe("Rataje");
  });
});

describe("korekta samej lokalizacji", () => {
  it("bez podanego stanu stan zostaje: zaginione narzędzie po korekcie lokalizacji dalej jest zaginione", async () => {
    const z = await givenZawbud();
    await markLost(z.zawbud.ownerId, z.s01);

    const correction = await correct(z.zawbud.ownerId, { toolId: z.s01, locationId: z.ratajeId, reason: "Zginęło na Rataje, nie na bazie" });

    expect(correction.stateChange).toEqual({ from: "zaginione", to: "zaginione" });
    expect((await z.owner.toolCard(z.s01))!).toMatchObject({
      state: "zaginione",
      lost: { lastLocation: { name: "Rataje" }, responsible: "Adam Nowak", reason: "Zginęło na Rataje, nie na bazie" },
    });
  });
});

describe("równoległe cofnięcia", () => {
  it("dwa cofnięcia tego samego ruchu z różnych kart: jedno się udaje, drugie jest zablokowane", async () => {
    const z = await givenZawbud();
    const issued = await issue(z, z.nowakId, [z.s01]);

    const results = await Promise.allSettled([undo(z.nowakId, issued.id), undo(z.nowakId, issued.id)]);

    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "undo_blocked" } });
    expect(await whereIs(z, z.s01)).toBe("Magazyn Swarzędz");
  });

  it("lista nie proponuje cofnięcia zwrotu z zakończonej budowy", async () => {
    const z = await givenZawbud();
    await issue(z, z.nowakId, [z.s01]);
    const returned = await giveBack(z, z.nowakId, [z.s01]);
    await testbed.db.transaction((sql) => sql("update app.locations set status = 'zakonczona' where id = $1", [z.ratajeId]));

    const recent = await testbed.registry.as(z.nowakId).recentMovements();

    expect(recent.find((movement) => movement.id === returned.id)).toMatchObject({ undoable: false });
  });
});
