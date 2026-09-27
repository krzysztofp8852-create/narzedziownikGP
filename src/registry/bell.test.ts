import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { type RegisteredKind, withActor } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();
const DAY = 24 * 60 * 60 * 1000;

/** Firma z bazą, kierownikami Nowakiem (Rataje) i Kowalskim (Winogrady) i szlifierkami S-01, S-02 na bazie. */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Swarzędz" });
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const kowalskiId = await testbed.givenMember(zawbud, "kierownik", "Jan Kowalski");
  const owner = testbed.registry.as(zawbud.ownerId);
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
  const { locationId: winogradyId } = await owner.addSite({ name: "Winogrady", address: "os. Wichrowe 3", managerId: kowalskiId });
  const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
  const s01 = (await owner.addTool({ operationId: randomUUID(), code: "S-01", name: "Szlifierka kątowa", categoryId: grinders.id })).toolId;
  const s02 = (await owner.addTool({ operationId: randomUUID(), code: "S-02", name: "Szlifierka mała", categoryId: grinders.id })).toolId;
  const { base } = await owner.whereIsWhat();
  return { zawbud, owner, nowakId, kowalskiId, ratajeId, winogradyId, baseId: base.id, s01, s02 };
}

function move(actorId: string, kind: RegisteredKind, from: string, to: string, toolIds: string[], operationId = randomUUID()) {
  return testbed.registry.as(actorId).registerMovement({ operationId, kind, fromLocationId: from, toLocationId: to, toolIds, source: "checklista" });
}

describe("dzwonek: zabrany sprzęt", () => {
  it("Nowak zabiera S-01 z Winogrady: w dzwonku Kowalskiego jest nieprzeczytane powiadomienie, a u Nowaka nic", async () => {
    const z = await givenZawbud();
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s01, z.s02]);
    testbed.clock.advance(3 * DAY);

    const movement = await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01]);

    const bell = await testbed.registry.as(z.kowalskiId).bell();
    expect(bell.unread).toBe(1);
    expect(bell.entries).toEqual([
      {
        id: expect.any(String),
        createdAt: testbed.clock.now(),
        read: false,
        notification: {
          kind: "narzedzia_zabrane",
          movementId: movement.id,
          takenBy: "Adam Nowak",
          from: { id: z.winogradyId, name: "Winogrady" },
          to: { id: z.ratajeId, name: "Rataje" },
          tools: [{ id: z.s01, code: "S-01", name: "Szlifierka kątowa" }],
          occurredAt: testbed.clock.now(),
        },
      },
    ]);
    expect(await testbed.registry.as(z.nowakId).bell()).toEqual({ unread: 0, entries: [] });
    expect(await testbed.registry.as(z.zawbud.ownerId).bell()).toEqual({ unread: 0, entries: [] });
  });
});

describe("dzwonek: przeczytane", () => {
  async function givenTwoTakenNotifications() {
    const z = await givenZawbud();
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s01, z.s02]);
    await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01]);
    testbed.clock.advance(60_000);
    await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s02]);
    return z;
  }

  it("Kowalski oznacza jedno powiadomienie jako przeczytane: licznik spada, a powiadomienie zostaje w historii", async () => {
    const z = await givenTwoTakenNotifications();
    const kowalski = testbed.registry.as(z.kowalskiId);
    const [newest, older] = (await kowalski.bell()).entries;
    expect(newest.notification).toMatchObject({ tools: [{ code: "S-02" }] });

    const read = await kowalski.markNotificationRead(older.id);

    expect(read).toMatchObject({ id: older.id, read: true, notification: { tools: [{ code: "S-01" }] } });
    expect(await kowalski.unreadNotificationCount()).toBe(1);
    expect((await kowalski.bell()).entries.map((entry) => [entry.id, entry.read])).toEqual([
      [newest.id, false],
      [older.id, true],
    ]);
  });

  it("„oznacz wszystkie” czyści licznik; cudzego powiadomienia nikt nie oznaczy ani nie zobaczy", async () => {
    const z = await givenTwoTakenNotifications();
    const kowalski = testbed.registry.as(z.kowalskiId);
    const [entry] = (await kowalski.bell()).entries;

    expect(await testbed.registry.as(z.nowakId).markNotificationRead(entry.id)).toBeNull();
    expect(await testbed.registry.as(z.zawbud.ownerId).markNotificationRead(entry.id)).toBeNull();
    expect(await kowalski.unreadNotificationCount()).toBe(2);

    await kowalski.markAllNotificationsRead();

    expect(await kowalski.unreadNotificationCount()).toBe(0);
    expect((await kowalski.bell()).entries.every((bellEntry) => bellEntry.read)).toBe(true);
  });

  it("ponowienie operacji przeniesienia nie dubluje powiadomienia w dzwonku", async () => {
    const z = await givenZawbud();
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s01]);
    const operationId = randomUUID();

    await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01], operationId);
    await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01], operationId);

    expect((await testbed.registry.as(z.kowalskiId).bell()).entries).toHaveLength(1);
  });
});

describe("dzwonek: izolacja", () => {
  it("użytkownik nie dopisze powiadomienia osobie z innej firmy nawet z pominięciem Rejestru", async () => {
    const z = await givenZawbud();
    const budrex = await testbed.givenActiveCompany("Budrex");

    await expect(
      withActor(testbed.db, z.nowakId, (sql) =>
        sql("select app.deliver_notification($1, 'narzedzia_zabrane', '{}', null, now())", [budrex.ownerId]),
      ),
    ).rejects.toThrow(/foreign key/);
    expect(await testbed.registry.as(budrex.ownerId).unreadNotificationCount()).toBe(0);
  });
});
