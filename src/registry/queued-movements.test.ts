import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RegisteredKind, RegisterMovementInput } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** Firma z bazą, kierownikiem Nowakiem (Rataje), magazynierką i szlifierkami S-01, S-02 na bazie. */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn" });
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const storekeeperId = await testbed.givenMember(zawbud, "magazynier", "Ewa Magazyn");
  const owner = testbed.registry.as(zawbud.ownerId);
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
  const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
  const s01 = (await owner.addTool({ operationId: randomUUID(), code: "S-01", name: "Szlifierka kątowa", categoryId: grinders.id })).toolId;
  const s02 = (await owner.addTool({ operationId: randomUUID(), code: "S-02", name: "Szlifierka mała", categoryId: grinders.id })).toolId;
  const { base } = await owner.whereIsWhat();
  return { zawbud, owner, nowakId, storekeeperId, ratajeId, baseId: base.id, s01, s02 };
}

/** Ruch zapisany w telefonie bez zasięgu `ago` temu, wysłany teraz z kolejki. */
function queued(actorId: string, input: Omit<RegisterMovementInput, "operationId" | "source" | "occurredAt"> & { operationId?: string }, ago: number) {
  return testbed.registry.as(actorId).registerQueuedMovement({
    operationId: randomUUID(),
    source: "checklista",
    occurredAt: new Date(testbed.clock.now().getTime() - ago),
    ...input,
  });
}

function move(actorId: string, kind: RegisteredKind, from: string, to: string, toolIds: string[]) {
  return testbed.registry
    .as(actorId)
    .registerMovement({ operationId: randomUUID(), kind, fromLocationId: from, toLocationId: to, toolIds, source: "checklista" });
}

describe("ruch z kolejki offline", () => {
  it("wydanie zapisane w piwnicy 2 godziny temu ma w historii czas z piwnicy, a „od X dni” liczy się od niego", async () => {
    const z = await givenZawbud();
    testbed.clock.advance(3 * HOUR);
    const offlineAt = new Date(testbed.clock.now().getTime() - 2 * HOUR);

    const result = await queued(z.nowakId, { kind: "wydanie", fromLocationId: z.baseId, toLocationId: z.ratajeId, toolIds: [z.s01] }, 2 * HOUR);

    expect(result).toMatchObject({ status: "registered", movement: { kind: "wydanie", occurredAt: offlineAt, recordedAt: testbed.clock.now() } });
    const card = (await z.owner.toolCard(z.s01))!;
    expect(card.location.name).toBe("Rataje");
    expect(card.history[0]).toMatchObject({ kind: "wydanie", occurredAt: offlineAt });
  });

  it("ponowne wysłanie zapisanego ruchu z kolejki zwraca ten sam ruch zamiast drugiego", async () => {
    const z = await givenZawbud();
    testbed.clock.advance(HOUR);
    const operationId = randomUUID();
    const input = { operationId, kind: "wydanie" as const, fromLocationId: z.baseId, toLocationId: z.ratajeId, toolIds: [z.s01] };

    const first = await queued(z.nowakId, input, 10 * MINUTE);
    testbed.clock.advance(MINUTE);
    const again = await queued(z.nowakId, input, 11 * MINUTE);

    expect(first.status).toBe("registered");
    expect(again).toEqual(first);
    expect((await z.owner.toolCard(z.s01))!.history.filter((entry) => entry.kind === "wydanie")).toHaveLength(1);
  });
});

describe("ruch z kolejki z telefonu z rozjechanym zegarem", () => {
  it("czas zdarzenia z przyszłości (zegar telefonu się spieszy) to chwila dotarcia na serwer, a nie odrzucenie", async () => {
    const z = await givenZawbud();
    testbed.clock.advance(HOUR);

    const result = await queued(z.nowakId, { kind: "wydanie", fromLocationId: z.baseId, toLocationId: z.ratajeId, toolIds: [z.s01] }, -2 * HOUR);

    expect(result).toMatchObject({ status: "registered", movement: { occurredAt: testbed.clock.now() } });
  });
});

describe("ruch z kolejki odrzucony: do wyjaśnienia", () => {
  it("magazynierka w międzyczasie wydała S-01 gdzie indziej: ruch Nowaka trafia na jego listę „Do wyjaśnienia” z powodem i do dzwonka", async () => {
    const z = await givenZawbud();
    const { locationId: winogradyId } = await z.owner.addSite({ name: "Winogrady", address: "os. Wichrowe 3", managerId: z.nowakId });
    testbed.clock.advance(HOUR);
    await move(z.storekeeperId, "wydanie", z.baseId, winogradyId, [z.s01]);
    testbed.clock.advance(HOUR);

    const result = await queued(
      z.nowakId,
      { kind: "wydanie", fromLocationId: z.baseId, toLocationId: z.ratajeId, toolIds: [z.s01, z.s02] },
      90 * MINUTE,
    );

    const conflict = {
      toolId: z.s01,
      code: "S-01",
      location: { id: winogradyId, name: "Winogrady" },
      state: "w_obiegu",
      movedBy: "Ewa Magazyn",
      movedAt: new Date(testbed.clock.now().getTime() - HOUR),
    };
    const rejection = {
      id: expect.any(String),
      operationId: expect.any(String),
      kind: "wydanie",
      from: { id: z.baseId, name: "Magazyn" },
      to: { id: z.ratajeId, name: "Rataje" },
      tools: [
        { id: z.s01, code: "S-01", name: "Szlifierka kątowa" },
        { id: z.s02, code: "S-02", name: "Szlifierka mała" },
      ],
      occurredAt: new Date(testbed.clock.now().getTime() - 90 * MINUTE),
      rejectedAt: testbed.clock.now(),
      reason: "movement_conflict",
      conflicts: [conflict],
    };
    expect(result).toEqual({ status: "rejected", rejection });
    expect((await z.owner.toolCard(z.s02))!.location.name).toBe("Magazyn");
    expect(await testbed.registry.as(z.nowakId).movementsToClarify()).toEqual([rejection]);
    expect(await testbed.registry.as(z.storekeeperId).movementsToClarify()).toEqual([]);

    const bell = await testbed.registry.as(z.nowakId).bell();
    expect(bell.entries.map((entry) => entry.notification)).toEqual([
      {
        kind: "ruch_odrzucony",
        rejectionId: rejection.id,
        movementKind: "wydanie",
        tools: rejection.tools,
        to: rejection.to,
        reason: "movement_conflict",
        occurredAt: rejection.occurredAt,
      },
    ]);
  });

  it("ponowne wysłanie odrzuconej operacji zwraca to samo odrzucenie, bez drugiego wpisu i powiadomienia", async () => {
    const z = await givenZawbud();
    await move(z.storekeeperId, "wydanie", z.baseId, z.ratajeId, [z.s01]);
    testbed.clock.advance(HOUR);
    const input = { operationId: randomUUID(), kind: "wydanie" as const, fromLocationId: z.baseId, toLocationId: z.ratajeId, toolIds: [z.s01] };

    const first = await queued(z.nowakId, input, 30 * MINUTE);
    // Narzędzie wróciło na bazę; odrzucona operacja i tak zostaje odrzucona.
    await move(z.storekeeperId, "zwrot", z.ratajeId, z.baseId, [z.s01]);
    const again = await queued(z.nowakId, input, 30 * MINUTE);

    expect(first.status).toBe("rejected");
    expect(again).toEqual(first);
    expect(await testbed.registry.as(z.nowakId).movementsToClarify()).toHaveLength(1);
    expect(await testbed.registry.as(z.nowakId).unreadNotificationCount()).toBe(1);
    expect((await z.owner.toolCard(z.s01))!.location.name).toBe("Magazyn");
  });

  it("budowa przekazana innemu kierownikowi albo zakończona w międzyczasie: odrzucenie z powodem braku uprawnień albo zakończonej budowy", async () => {
    const z = await givenZawbud();
    const kowalskiId = await testbed.givenMember(z.zawbud, "kierownik", "Jan Kowalski");
    const { locationId: lazarzId } = await z.owner.addSite({ name: "Łazarz", address: "ul. Głogowska 1", managerId: z.nowakId });
    await z.owner.changeSiteManager(z.ratajeId, kowalskiId);
    await z.owner.closeSite(lazarzId);

    const toRataje = await queued(z.nowakId, { kind: "wydanie", fromLocationId: z.baseId, toLocationId: z.ratajeId, toolIds: [z.s01] }, MINUTE);
    const toLazarz = await queued(z.nowakId, { kind: "wydanie", fromLocationId: z.baseId, toLocationId: lazarzId, toolIds: [z.s02] }, MINUTE);

    expect(toRataje).toMatchObject({ status: "rejected", rejection: { reason: "forbidden", conflicts: [] } });
    expect(toLazarz).toMatchObject({ status: "rejected", rejection: { reason: "site_finished", to: { name: "Łazarz" } } });
    expect((await testbed.registry.as(z.nowakId).movementsToClarify()).map((entry) => entry.reason)).toEqual(["site_finished", "forbidden"]);
  });

  it("gdy trzeba najpierw zmienić hasło tymczasowe, ruch zostaje w kolejce: nic nie jest odrzucone", async () => {
    const z = await givenZawbud();
    await z.owner.resetMemberPassword(z.nowakId);

    await expect(
      queued(z.nowakId, { kind: "wydanie", fromLocationId: z.baseId, toLocationId: z.ratajeId, toolIds: [z.s01] }, MINUTE),
    ).rejects.toMatchObject({ code: "password_change_required" });
    await testbed.registry.as(z.nowakId).changePassword("nowe-haslo-123", testbed.signedInNow());
    expect(await testbed.registry.as(z.nowakId).movementsToClarify()).toEqual([]);
  });

  it("Nowak oznacza ruch jako wyjaśniony: znika z jego listy", async () => {
    const z = await givenZawbud();
    await move(z.storekeeperId, "wydanie", z.baseId, z.ratajeId, [z.s01]);
    const result = await queued(z.nowakId, { kind: "wydanie", fromLocationId: z.baseId, toLocationId: z.ratajeId, toolIds: [z.s01] }, MINUTE);
    if (result.status !== "rejected") throw new Error("ruch miał być odrzucony");

    await testbed.registry.as(z.storekeeperId).resolveRejectedMovement(result.rejection.id);
    expect(await testbed.registry.as(z.nowakId).movementsToClarify()).toHaveLength(1);

    await testbed.registry.as(z.nowakId).resolveRejectedMovement(result.rejection.id);
    expect(await testbed.registry.as(z.nowakId).movementsToClarify()).toEqual([]);
  });
});
