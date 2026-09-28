import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { type RegisteredKind, withActor } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();
const DAY = 24 * 60 * 60 * 1000;

/**
 * Firma z bazą, kierownikami Nowakiem (budowa Rataje, bus WX 12345) i Kowalskim (bus WX 67890),
 * magazynierką i szlifierkami S-01, S-02 na bazie.
 */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Swarzędz" });
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const kowalskiId = await testbed.givenMember(zawbud, "kierownik", "Jan Kowalski");
  const storekeeperId = await testbed.givenMember(zawbud, "magazynier", "Ewa Magazyn");
  const owner = testbed.registry.as(zawbud.ownerId);
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
  const { locationId: nowakBusId } = await owner.addVehicle({ name: "Bus WX 12345", managerId: nowakId });
  const { locationId: kowalskiBusId } = await owner.addVehicle({ name: "Bus WX 67890", managerId: kowalskiId });
  const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
  const s01 = (await owner.addTool({ operationId: randomUUID(), code: "S-01", name: "Szlifierka kątowa", categoryId: grinders.id, value: 800 }))
    .toolId;
  const s02 = (await owner.addTool({ operationId: randomUUID(), code: "S-02", name: "Szlifierka mała", categoryId: grinders.id, value: 350 }))
    .toolId;
  const { base } = await owner.whereIsWhat();
  return { zawbud, owner, nowakId, kowalskiId, storekeeperId, ratajeId, nowakBusId, kowalskiBusId, baseId: base.id, s01, s02 };
}

type Zawbud = Awaited<ReturnType<typeof givenZawbud>>;

function move(actorId: string, kind: RegisteredKind, from: string, to: string, toolIds: string[]) {
  return testbed.registry
    .as(actorId)
    .registerMovement({ operationId: randomUUID(), kind, fromLocationId: from, toLocationId: to, toolIds, source: "checklista" });
}

async function whereIs(z: Zawbud, toolId: string) {
  return (await z.owner.toolCard(toolId))!.location;
}

describe("kto odpowiada za narzędzie", () => {
  it("karta narzędzia mówi, kto za nie teraz odpowiada: kierownik budowy albo pojazdu, a na bazie nikt", async () => {
    const z = await givenZawbud();
    const worker = testbed.registry.as(await testbed.givenMember(z.zawbud, "pracownik", "Marek Zieliński"));
    expect((await worker.toolCard(z.s01))!.responsible).toBeNull();

    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);
    await move(z.kowalskiId, "wydanie", z.baseId, z.kowalskiBusId, [z.s02]);

    expect((await worker.toolCard(z.s01))!.responsible).toEqual({ fullName: "Adam Nowak", active: true });
    expect((await worker.toolCard(z.s02))!.responsible).toEqual({ fullName: "Jan Kowalski", active: true });
  });
});

describe("dodawanie pojazdu", () => {
  it("właściciel dodaje pojazd z kierownikiem: jest aktywny, z alarmem wyłączonym, na liście lokalizacji i na tablicy", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
    const owner = testbed.registry.as(zawbud.ownerId);

    const { locationId } = await owner.addVehicle({ name: " Bus WX 12345 ", managerId: nowakId });

    const vehicle = {
      id: locationId,
      name: "Bus WX 12345",
      active: true,
      alarmEnabled: false,
      manager: { id: nowakId, fullName: "Adam Nowak", active: true },
    };
    expect((await owner.locations()).vehicles).toEqual([vehicle]);
    const board = await owner.whereIsWhat();
    expect(board.vehicles).toEqual([{ ...vehicle, totalValue: 0, tools: [] }]);
    expect(board.sites).toEqual([]);
  });

  it("odrzuca pojazd bez nazwy albo z kimś innym niż aktywny kierownik firmy", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const nowakId = await testbed.givenMember(zawbud, "kierownik");
    const storekeeperId = await testbed.givenMember(zawbud, "magazynier");
    const owner = testbed.registry.as(zawbud.ownerId);

    await expect(owner.addVehicle({ name: " ", managerId: nowakId })).rejects.toMatchObject({ code: "invalid_input" });
    for (const managerId of [storekeeperId, zawbud.ownerId, randomUUID(), "nie-uuid"]) {
      await expect(owner.addVehicle({ name: "Bus", managerId })).rejects.toMatchObject({ code: "invalid_manager" });
    }
    expect((await owner.locations()).vehicles).toEqual([]);
  });

  it("pojazd dodaje tylko właściciel, także bezpośrednio w bazie", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const nowakId = await testbed.givenMember(zawbud, "kierownik");
    const storekeeperId = await testbed.givenMember(zawbud, "magazynier");

    for (const actorId of [nowakId, storekeeperId]) {
      await expect(testbed.registry.as(actorId).addVehicle({ name: "Bus", managerId: nowakId })).rejects.toMatchObject({
        code: "forbidden",
      });
      await expect(
        withActor(testbed.db, actorId, (sql) =>
          sql(
            `insert into app.locations (company_id, kind, name, manager_id, active, alarm_enabled, created_at)
             values ($1, 'pojazd', 'Bus', $2, true, false, now())`,
            [zawbud.companyId, nowakId],
          ),
        ),
      ).rejects.toThrow();
    }
    expect((await testbed.registry.as(zawbud.ownerId).locations()).vehicles).toEqual([]);
  });
});

describe("kierownik pojazdu", () => {
  it("właściciel przekazuje pojazd innemu aktywnemu kierownikowi; magazynierowi nie", async () => {
    const z = await givenZawbud();

    await z.owner.changeVehicleManager(z.nowakBusId, z.kowalskiId);
    await expect(z.owner.changeVehicleManager(z.nowakBusId, z.storekeeperId)).rejects.toMatchObject({ code: "invalid_manager" });

    const bus = (await z.owner.whereIsWhat()).vehicles.find((vehicle) => vehicle.id === z.nowakBusId)!;
    expect(bus.manager).toEqual({ id: z.kowalskiId, fullName: "Jan Kowalski", active: true });
  });

  it("kierownika zmienia tylko właściciel i tylko pojazdowi: budowa i nieznany identyfikator to „nie znaleziono”", async () => {
    const z = await givenZawbud();

    await expect(testbed.registry.as(z.nowakId).changeVehicleManager(z.nowakBusId, z.kowalskiId)).rejects.toMatchObject({
      code: "forbidden",
    });
    for (const id of [z.ratajeId, z.baseId, randomUUID(), "nie-uuid"]) {
      await expect(z.owner.changeVehicleManager(id, z.kowalskiId)).rejects.toMatchObject({ code: "not_found" });
    }
    expect((await z.owner.locations()).sites[0].manager.id).toBe(z.nowakId);
  });
});

describe("ruchy z udziałem pojazdu", () => {
  it("baza → pojazd to wydanie, pojazd → budowa i pojazd → pojazd to przeniesienie, pojazd → baza to zwrot", async () => {
    const z = await givenZawbud();

    await move(z.nowakId, "wydanie", z.baseId, z.nowakBusId, [z.s01, z.s02]);
    expect(await whereIs(z, z.s01)).toMatchObject({ name: "Bus WX 12345", kind: "pojazd" });
    await move(z.nowakId, "przeniesienie", z.nowakBusId, z.ratajeId, [z.s01]);
    await move(z.nowakId, "przeniesienie", z.ratajeId, z.nowakBusId, [z.s01]);
    await move(z.kowalskiId, "przeniesienie", z.nowakBusId, z.kowalskiBusId, [z.s02]);
    await move(z.kowalskiId, "zwrot", z.kowalskiBusId, z.baseId, [z.s02]);

    expect((await z.owner.toolCard(z.s01))!.history.map((entry) => [entry.kind, entry.from, entry.to])).toEqual([
      ["przeniesienie", "Rataje", "Bus WX 12345"],
      ["przeniesienie", "Bus WX 12345", "Rataje"],
      ["wydanie", "Magazyn Swarzędz", "Bus WX 12345"],
      ["przyjecie", null, "Magazyn Swarzędz"],
    ]);
    expect(await whereIs(z, z.s02)).toMatchObject({ name: "Magazyn Swarzędz" });
  });

  it("inne drogi z pojazdem i na pojazd są odrzucone: wydanie na pojazd nie z bazy, zwrot z pojazdu nie na bazę", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.nowakBusId, [z.s01]);

    for (const [kind, from, to] of [
      ["wydanie", z.nowakBusId, z.kowalskiBusId],
      ["zwrot", z.nowakBusId, z.ratajeId],
      ["przeniesienie", z.baseId, z.nowakBusId],
      ["przeniesienie", z.nowakBusId, z.baseId],
    ] as const) {
      await expect(move(z.zawbud.ownerId, kind, from, to, [z.s01])).rejects.toMatchObject({ code: "invalid_input" });
    }
    expect(await whereIs(z, z.s01)).toMatchObject({ name: "Bus WX 12345" });
  });

  it("przeniesienie z pojazdu kierownika zawiadamia go, że ktoś zabrał sprzęt", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.nowakBusId, [z.s01]);
    testbed.notifier.clear();

    await move(z.kowalskiId, "przeniesienie", z.nowakBusId, z.kowalskiBusId, [z.s01]);

    expect(testbed.notifier.sent).toEqual([
      expect.objectContaining({
        kind: "narzedzia_zabrane",
        recipient: expect.objectContaining({ userId: z.nowakId }),
        from: { id: z.nowakBusId, name: "Bus WX 12345", kind: "pojazd" },
        to: { id: z.kowalskiBusId, name: "Bus WX 67890", kind: "pojazd" },
      }),
    ]);
  });

  it("ruch na pojazd można cofnąć jak ruch na budowę", async () => {
    const z = await givenZawbud();
    const issued = await move(z.nowakId, "wydanie", z.baseId, z.nowakBusId, [z.s01]);

    const [recent] = await testbed.registry.as(z.nowakId).recentMovements();
    expect(recent).toMatchObject({ id: issued.id, undoable: true });
    await testbed.registry.as(z.nowakId).undoMovement({ operationId: randomUUID(), movementId: issued.id });

    expect(await whereIs(z, z.s01)).toMatchObject({ name: "Magazyn Swarzędz" });
  });
});

describe("uprawnienia kierownika do pojazdu", () => {
  it("kierownik wydaje i zabiera sprzęt na swój pojazd, a zwraca ze swojego; cudzy pojazd jest dla niego zamknięty", async () => {
    const z = await givenZawbud();

    await expect(move(z.kowalskiId, "wydanie", z.baseId, z.nowakBusId, [z.s01])).rejects.toMatchObject({ code: "forbidden" });
    await move(z.nowakId, "wydanie", z.baseId, z.nowakBusId, [z.s01, z.s02]);
    await expect(move(z.kowalskiId, "zwrot", z.nowakBusId, z.baseId, [z.s01])).rejects.toMatchObject({ code: "forbidden" });
    await expect(move(z.nowakId, "przeniesienie", z.nowakBusId, z.kowalskiBusId, [z.s01])).rejects.toMatchObject({
      code: "forbidden",
    });
    await move(z.nowakId, "zwrot", z.nowakBusId, z.baseId, [z.s02]);
    await move(z.kowalskiId, "przeniesienie", z.nowakBusId, z.kowalskiBusId, [z.s01]);

    expect(await whereIs(z, z.s01)).toMatchObject({ name: "Bus WX 67890" });
    expect(await whereIs(z, z.s02)).toMatchObject({ name: "Magazyn Swarzędz" });
  });

  it("magazynier obsługuje każdy pojazd", async () => {
    const z = await givenZawbud();

    await move(z.storekeeperId, "wydanie", z.baseId, z.nowakBusId, [z.s01]);
    await move(z.storekeeperId, "przeniesienie", z.nowakBusId, z.kowalskiBusId, [z.s01]);
    await move(z.storekeeperId, "zwrot", z.kowalskiBusId, z.baseId, [z.s01]);

    expect(await whereIs(z, z.s01)).toMatchObject({ name: "Magazyn Swarzędz" });
  });

  it("kierownik nie wyda sprzętu na cudzy pojazd nawet z pominięciem Rejestru", async () => {
    const z = await givenZawbud();

    await expect(
      withActor(testbed.db, z.kowalskiId, (sql) =>
        sql(
          `insert into app.movements (company_id, kind, source, from_location_id, to_location_id, author_id,
                                      occurred_at, recorded_at, client_operation_id)
           values ($1, 'wydanie', 'checklista', $2, $3, $4, now(), now(), gen_random_uuid())`,
          [z.zawbud.companyId, z.baseId, z.nowakBusId, z.kowalskiId],
        ),
      ),
    ).rejects.toThrow();
  });

  it("po zmianie kierownika pojazdu uprawnienia przechodzą na nowego", async () => {
    const z = await givenZawbud();
    await z.owner.changeVehicleManager(z.nowakBusId, z.kowalskiId);

    await expect(move(z.nowakId, "wydanie", z.baseId, z.nowakBusId, [z.s01])).rejects.toMatchObject({ code: "forbidden" });
    await move(z.kowalskiId, "wydanie", z.baseId, z.nowakBusId, [z.s01]);

    expect(await whereIs(z, z.s01)).toMatchObject({ name: "Bus WX 12345" });
  });
});

describe("dezaktywacja pojazdu", () => {
  it("właściciel dezaktywuje pusty pojazd: znika z tablicy, a na liście lokalizacji jest jako nieaktywny", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.nowakBusId, [z.s01]);
    await move(z.nowakId, "zwrot", z.nowakBusId, z.baseId, [z.s01]);

    await z.owner.deactivateVehicle(z.nowakBusId);

    expect((await z.owner.whereIsWhat()).vehicles.map((vehicle) => vehicle.name)).toEqual(["Bus WX 67890"]);
    expect((await z.owner.locations()).vehicles.map((vehicle) => [vehicle.name, vehicle.active])).toEqual([
      ["Bus WX 67890", true],
      ["Bus WX 12345", false],
    ]);
    expect((await z.owner.toolCard(z.s01))!.history[0]).toMatchObject({ kind: "zwrot", from: "Bus WX 12345" });
  });

  it("pojazdu z narzędziami w obiegu nie da się dezaktywować, także bezpośrednio w bazie", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.nowakBusId, [z.s01]);

    await expect(z.owner.deactivateVehicle(z.nowakBusId)).rejects.toMatchObject({ code: "vehicle_not_empty" });
    await expect(
      withActor(testbed.db, z.zawbud.ownerId, (sql) => sql("update app.locations set active = false where id = $1", [z.nowakBusId])),
    ).rejects.toThrow();

    expect((await z.owner.locations()).vehicles.find((vehicle) => vehicle.id === z.nowakBusId)!.active).toBe(true);
  });

  it("zaginione narzędzie z pojazdu nie blokuje dezaktywacji", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.nowakBusId, [z.s01]);
    await z.owner.markToolLost({ operationId: randomUUID(), toolId: z.s01, reason: "Nie ma go w busie" });

    await z.owner.deactivateVehicle(z.nowakBusId);

    expect((await z.owner.locations()).vehicles.find((vehicle) => vehicle.id === z.nowakBusId)!.active).toBe(false);
  });

  it("dezaktywuje tylko właściciel, i tylko aktywny pojazd", async () => {
    const z = await givenZawbud();

    for (const actorId of [z.nowakId, z.storekeeperId]) {
      await expect(testbed.registry.as(actorId).deactivateVehicle(z.nowakBusId)).rejects.toMatchObject({ code: "forbidden" });
    }
    for (const id of [z.ratajeId, z.baseId, randomUUID()]) {
      await expect(z.owner.deactivateVehicle(id)).rejects.toMatchObject({ code: "not_found" });
    }
    await z.owner.deactivateVehicle(z.nowakBusId);
    await expect(z.owner.deactivateVehicle(z.nowakBusId)).rejects.toMatchObject({ code: "vehicle_inactive" });
    await expect(z.owner.changeVehicleManager(z.nowakBusId, z.kowalskiId)).rejects.toMatchObject({ code: "vehicle_inactive" });
  });

  it("nieaktywny pojazd nie przyjmie ruchu, cofnięcia ani korekty, także bezpośrednio w bazie", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.nowakBusId, [z.s01]);
    const returned = await move(z.nowakId, "zwrot", z.nowakBusId, z.baseId, [z.s01]);
    await z.owner.deactivateVehicle(z.nowakBusId);

    await expect(move(z.nowakId, "wydanie", z.baseId, z.nowakBusId, [z.s01])).rejects.toMatchObject({ code: "vehicle_inactive" });
    await expect(
      testbed.registry.as(z.nowakId).undoMovement({ operationId: randomUUID(), movementId: returned.id }),
    ).rejects.toMatchObject({ code: "vehicle_inactive" });
    expect((await testbed.registry.as(z.nowakId).recentMovements())[0]).toMatchObject({ id: returned.id, undoable: false });
    await expect(
      z.owner.correctTool({ operationId: randomUUID(), toolId: z.s01, locationId: z.nowakBusId, reason: "Jednak w busie" }),
    ).rejects.toMatchObject({ code: "vehicle_inactive" });
    await expect(
      withActor(testbed.db, z.zawbud.ownerId, async (sql) => {
        const [movement] = await sql<{ id: string }>(
          `insert into app.movements (company_id, kind, source, from_location_id, to_location_id, author_id,
                                      occurred_at, recorded_at, client_operation_id, reason, from_state, to_state)
           values ($1, 'korekta', 'panel', $2, $3, $4, now(), now(), gen_random_uuid(), 'wprost', 'w_obiegu', 'w_obiegu')
           returning id`,
          [z.zawbud.companyId, z.baseId, z.nowakBusId, z.zawbud.ownerId],
        );
        await sql("insert into app.movement_tools (movement_id, tool_id, company_id) values ($1, $2, $3)", [
          movement.id,
          z.s01,
          z.zawbud.companyId,
        ]);
      }),
    ).rejects.toThrow();

    expect(await whereIs(z, z.s01)).toMatchObject({ name: "Magazyn Swarzędz" });
  });
});

describe("pojazd na tablicy", () => {
  it("sprzęt na pojeździe jest poza bazą: wlicza się do sumy pojazdu i do kwoty poza bazą", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.nowakBusId, [z.s01]);
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s02]);

    const board = await z.owner.whereIsWhat();
    const bus = board.vehicles.find((vehicle) => vehicle.id === z.nowakBusId)!;
    expect(bus.tools.map((tool) => tool.code)).toEqual(["S-01"]);
    expect(bus.totalValue).toBe(800);
    expect(board.offBaseValue).toBe(1150);
    expect(board.base.tools).toEqual([]);
  });

  it("kierownik i magazynier widzą pojazdy bez kwot", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.nowakBusId, [z.s01]);

    for (const actorId of [z.nowakId, z.storekeeperId]) {
      const board = await testbed.registry.as(actorId).whereIsWhat();
      const bus = board.vehicles.find((vehicle) => vehicle.id === z.nowakBusId)!;
      expect(bus).not.toHaveProperty("totalValue");
      expect(bus.tools[0]).not.toHaveProperty("value");
      expect(board).not.toHaveProperty("offBaseValue");
    }
  });
});

describe("alarm na pojeździe", () => {
  it("domyślnie wyłączony: narzędzie na pojeździe po progu nie ma alarmu i nikt nie dostaje powiadomienia", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.nowakBusId, [z.s01]);
    testbed.clock.advance(31 * DAY);

    const board = await z.owner.whereIsWhat();
    expect(board.vehicles.find((vehicle) => vehicle.id === z.nowakBusId)!.tools[0].alarm).toBe(false);
    expect(board.alarmCount).toBe(0);
    expect(await testbed.registry.system().notifyExceededThresholds()).toEqual({ tools: 0 });
  });

  it("właściciel włącza alarm dla pojazdu: narzędzie po progu ma alarm, a kierownik pojazdu dostaje powiadomienie", async () => {
    const z = await givenZawbud();
    await z.owner.setVehicleAlarm(z.nowakBusId, true);
    await move(z.nowakId, "wydanie", z.baseId, z.nowakBusId, [z.s01]);
    await move(z.kowalskiId, "wydanie", z.baseId, z.kowalskiBusId, [z.s02]);
    testbed.clock.advance(31 * DAY);

    const board = await z.owner.whereIsWhat();
    expect(board.vehicles.map((vehicle) => [vehicle.name, vehicle.alarmEnabled, vehicle.tools.map((tool) => tool.alarm)])).toEqual([
      ["Bus WX 12345", true, [true]],
      ["Bus WX 67890", false, [false]],
    ]);
    expect(board.alarmCount).toBe(1);
    expect(await testbed.registry.system().notifyExceededThresholds()).toEqual({ tools: 1 });
    const nowakBell = await testbed.registry.as(z.nowakId).bell();
    expect(nowakBell.entries.map((entry) => entry.notification)).toEqual([
      expect.objectContaining({ kind: "prog_przekroczony", location: { id: z.nowakBusId, name: "Bus WX 12345", kind: "pojazd" } }),
    ]);
  });

  it("kierownik nie zmieni swojemu pojazdowi alarmu, kierownika ani statusu także bezpośrednio w bazie", async () => {
    const z = await givenZawbud();

    for (const change of ["alarm_enabled = true", `manager_id = '${z.kowalskiId}'`, "active = false"]) {
      await withActor(testbed.db, z.nowakId, (sql) => sql(`update app.locations set ${change} where id = $1`, [z.nowakBusId]));
    }

    expect((await z.owner.locations()).vehicles.find((vehicle) => vehicle.id === z.nowakBusId)).toMatchObject({
      active: true,
      alarmEnabled: false,
      manager: { id: z.nowakId },
    });
  });

  it("alarm włącza i wyłącza tylko właściciel", async () => {
    const z = await givenZawbud();

    await expect(testbed.registry.as(z.nowakId).setVehicleAlarm(z.nowakBusId, true)).rejects.toMatchObject({ code: "forbidden" });
    await z.owner.setVehicleAlarm(z.nowakBusId, true);
    await z.owner.setVehicleAlarm(z.nowakBusId, false);
    await expect(z.owner.setVehicleAlarm(z.ratajeId, true)).rejects.toMatchObject({ code: "not_found" });

    expect((await z.owner.locations()).vehicles.find((vehicle) => vehicle.id === z.nowakBusId)!.alarmEnabled).toBe(false);
  });
});

describe("izolacja firm w pojazdach", () => {
  it("właściciel innej firmy nie widzi pojazdów Zawbudu ani ich nie zmienia", async () => {
    const z = await givenZawbud();
    const budrex = await testbed.givenActiveCompany("Budrex");
    const other = testbed.registry.as(budrex.ownerId);

    expect((await other.locations()).vehicles).toEqual([]);
    await expect(other.deactivateVehicle(z.kowalskiBusId)).rejects.toMatchObject({ code: "not_found" });
    await expect(other.setVehicleAlarm(z.kowalskiBusId, true)).rejects.toMatchObject({ code: "not_found" });
  });
});
