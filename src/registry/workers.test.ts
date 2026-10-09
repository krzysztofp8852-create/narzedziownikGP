import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withActor } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();

const jan = { firstName: " Jan ", lastName: "Kowalski", email: "", username: " Jan.Kowalski ", role: "pracownik" } as const;

/** Adres konta, na które logowanie tym loginem i hasłem wpuszcza (jak formularz logowania), albo null. */
async function signIn(login: string, password: string) {
  for (const email of await testbed.registry.system().signInEmails(login)) {
    const userId = testbed.auth.signIn(email, password);
    if (userId) return userId;
  }
  return null;
}

/**
 * Firma z kierownikiem Nowakiem (budowa Rataje, bus WX 12345), pracownikiem Janem (z własnym hasłem) i młotem H-01 za 3200 zł
 * na Ratajach.
 */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud");
  const owner = testbed.registry.as(zawbud.ownerId);
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const workerId = await testbed.givenMember(zawbud, "pracownik", "Jan Kowalski");
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
  const { locationId: nowakBusId } = await owner.addVehicle({ name: "Bus WX 12345", managerId: nowakId });
  const hammers = await owner.addCategory({ name: "Młoty", prefix: "H" });
  const { toolId: h01 } = await owner.addTool({ operationId: randomUUID(), code: "H-01", name: "Młot Hilti", categoryId: hammers.id, value: 3200 });
  const { base } = await owner.whereIsWhat();
  await testbed.registry
    .as(nowakId)
    .registerMovement({ operationId: randomUUID(), kind: "wydanie", fromLocationId: base.id, toLocationId: ratajeId, toolIds: [h01], source: "checklista" });
  return { zawbud, owner, nowakId, workerId, ratajeId, nowakBusId, baseId: base.id, h01, hammersId: hammers.id };
}

describe("dodawanie pracownika", () => {
  it("właściciel dodaje pracownika z nazwą użytkownika bez e-maila, a ten loguje się nią i hasłem tymczasowym, które musi zmienić", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");

    const added = await testbed.registry.as(zawbud.ownerId).addMember(jan);
    const { userId, temporaryPassword } = added;

    expect(added).toEqual({ userId, fullName: "Jan Kowalski", email: null, username: "jan.kowalski", temporaryPassword });
    expect(await signIn("jan.kowalski", temporaryPassword)).toBe(userId);
    expect(await signIn(" JAN.Kowalski ", temporaryPassword)).toBe(userId);
    expect(await testbed.registry.as(userId).session()).toEqual({
      userId,
      fullName: "Jan Kowalski",
      role: "pracownik",
      mustChangePassword: true,
      idleLogoutMinutes: null,
      company: { id: zawbud.companyId, name: "Zawbud", readOnly: false, demo: false, siteManagersSeeCosts: false },
    });
    await expect(testbed.registry.as(userId).whereIsWhat()).rejects.toMatchObject({ code: "password_change_required" });

    await testbed.registry.as(userId).changePassword("HasloJana123", testbed.signedInNow());

    expect(await signIn("jan.kowalski", "HasloJana123")).toBe(userId);
    expect(await signIn("jan.kowalski", temporaryPassword)).toBeNull();
    expect(await testbed.registry.as(userId).session()).toMatchObject({ mustChangePassword: false });
  });

  it("konto logowania pracownika bez e-maila ma techniczny adres, którego nie widać w zespole", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);
    const { userId } = await owner.addMember(jan);
    const { userId: other } = await owner.addMember({ ...jan, firstName: "Anna", username: "anna" });

    const address = testbed.auth.emailOf(userId)!;
    expect(address).toMatch(/@/);
    expect(address).not.toContain("jan.kowalski");
    expect(testbed.auth.emailOf(other)).not.toBe(address);
    expect(JSON.stringify(await owner.team())).not.toContain(address);
  });

  it("pracownik z e-mailem loguje się i nazwą użytkownika, i e-mailem", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");

    const added = await testbed.registry.as(zawbud.ownerId).addMember({ ...jan, email: " Jan@Zawbud.pl " });

    expect(added).toMatchObject({ email: "jan@zawbud.pl", username: "jan.kowalski" });
    expect(await signIn("jan.kowalski", added.temporaryPassword)).toBe(added.userId);
    expect(await signIn("JAN@zawbud.pl", added.temporaryPassword)).toBe(added.userId);
  });

  it("ta sama nazwa użytkownika w dwóch firmach: każde hasło wpuszcza na własne konto", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const budrex = await testbed.givenActiveCompany("Budrex");
    const inZawbud = await testbed.registry.as(zawbud.ownerId).addMember(jan);
    const inBudrex = await testbed.registry.as(budrex.ownerId).addMember(jan);

    expect(await signIn("jan.kowalski", inZawbud.temporaryPassword)).toBe(inZawbud.userId);
    expect(await signIn("jan.kowalski", inBudrex.temporaryPassword)).toBe(inBudrex.userId);
    expect(await signIn("jan.kowalski", "zle-haslo-123")).toBeNull();
    expect(await testbed.registry.system().signInEmails("nieznany")).toEqual([]);
  });

  it("nazwa użytkownika jest unikalna w firmie", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);
    await owner.addMember(jan);
    const accountsBefore = testbed.auth.accountCount();

    await expect(owner.addMember({ ...jan, firstName: "Janusz", username: "JAN.KOWALSKI" })).rejects.toMatchObject({ code: "username_taken" });

    expect(testbed.auth.accountCount()).toBe(accountsBefore);
    expect(await owner.team()).toHaveLength(2);
  });

  it("odrzuca pracownika bez nazwy użytkownika, z błędną nazwą albo e-mailem i nazwę użytkownika u innych ról, nie zakładając kont", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);
    const accountsBefore = testbed.auth.accountCount();

    for (const input of [
      { ...jan, username: " " },
      { ...jan, username: "jan kowalski" },
      { ...jan, username: "jan@zawbud" },
      { ...jan, username: "j" },
      { ...jan, username: "j".repeat(33) },
      { ...jan, username: ".jan" },
      { ...jan, email: "jan@zawbud" },
      { ...jan, role: "kierownik" as const, email: "jan@zawbud.pl" },
    ]) {
      await expect(owner.addMember(input)).rejects.toMatchObject({ code: "invalid_input" });
    }
    expect(testbed.auth.accountCount()).toBe(accountsBefore);
  });

  it("bezpośrednio w bazie pracownik musi mieć nazwę użytkownika, a kierownik e-mail", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const { userId: loose } = await testbed.auth.createUser({ email: "luzem@example.test", password: "DowolneHaslo1" });
    const insert = (role: string, email: string | null, username: string | null) =>
      withActor(testbed.db, zawbud.ownerId, (sql) =>
        sql(
          `insert into app.users (user_id, company_id, role, full_name, email, username, must_change_password, created_at)
           values ($1, $2, $3, 'Ktoś', $4, $5, true, now())`,
          [loose, zawbud.companyId, role, email, username],
        ),
      );

    await expect(insert("pracownik", null, null)).rejects.toThrow();
    await expect(insert("kierownik", null, null)).rejects.toThrow();
    await expect(insert("kierownik", "luzem@example.test", "ktos")).rejects.toThrow();
  });
});

describe("pracownik w zespole", () => {
  it("panel „Zespół” pokazuje pracownika z nazwą użytkownika obok kierowników", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);
    const manager = await owner.addMember({ firstName: "Adam", lastName: "Nowak", email: "adam@zawbud.pl", role: "kierownik" });
    const worker = await owner.addMember(jan);

    expect(await owner.team()).toEqual([
      expect.objectContaining({ userId: zawbud.ownerId, role: "wlasciciel", username: null }),
      {
        userId: manager.userId,
        fullName: "Adam Nowak",
        email: "adam@zawbud.pl",
        username: null,
        role: "kierownik",
        active: true,
        mustChangePassword: true,
      },
      {
        userId: worker.userId,
        fullName: "Jan Kowalski",
        email: null,
        username: "jan.kowalski",
        role: "pracownik",
        active: true,
        mustChangePassword: true,
      },
    ]);
  });

  it("właściciel daje pracownikowi nowe hasło tymczasowe, a pracownik znowu musi ustawić własne", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const workerId = await testbed.givenMember(zawbud, "pracownik", "Jan Kowalski");
    const ownPassword = testbed.auth.passwordOf(workerId)!;

    const { temporaryPassword } = await testbed.registry.as(zawbud.ownerId).resetMemberPassword(workerId);

    const [username] = (await testbed.registry.as(zawbud.ownerId).team()).filter((m) => m.userId === workerId).map((m) => m.username!);
    expect(await signIn(username, ownPassword)).toBeNull();
    expect(await signIn(username, temporaryPassword)).toBe(workerId);
    await expect(testbed.registry.as(workerId).whereIsWhat()).rejects.toMatchObject({ code: "password_change_required" });
  });

  it("dezaktywowany pracownik nie loguje się ani nie ma dostępu do firmy", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const { userId, temporaryPassword } = await testbed.registry.as(zawbud.ownerId).addMember(jan);

    await testbed.registry.as(zawbud.ownerId).deactivateMember(userId);

    expect(testbed.auth.isBlocked(userId)).toBe(true);
    expect(await signIn("jan.kowalski", temporaryPassword)).toBeNull();
    expect(await testbed.registry.as(userId).session()).toBeNull();
    expect(await testbed.registry.as(zawbud.ownerId).team()).toContainEqual(expect.objectContaining({ userId, active: false }));
  });

  it("pracownik nie zarządza zespołem", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const workerId = await testbed.givenMember(zawbud, "pracownik");
    const worker = testbed.registry.as(workerId);

    await expect(worker.team()).rejects.toMatchObject({ code: "forbidden" });
    await expect(worker.addMember({ ...jan, username: "obcy" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(worker.resetMemberPassword(zawbud.ownerId)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("pracownika nie da się przypisać do budowy ani pojazdu", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const workerId = await testbed.givenMember(zawbud, "pracownik");
    const owner = testbed.registry.as(zawbud.ownerId);

    expect((await owner.siteManagerCandidates()).map((candidate) => candidate.id)).toEqual([zawbud.ownerId]);
    await expect(owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: workerId })).rejects.toMatchObject({
      code: "invalid_manager",
    });
    await expect(owner.addVehicle({ name: "Bus WX 12345", managerId: workerId })).rejects.toMatchObject({ code: "invalid_manager" });
  });

  it("konta pracowników nie wliczają się do limitu progu abonamentu", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    for (let i = 0; i < 3; i += 1) await testbed.givenMember(zawbud, "pracownik");
    const owner = testbed.registry.as(zawbud.ownerId);
    const category = await owner.addCategory({ name: "Młoty", prefix: "H" });

    const { limitWarning } = await owner.addTool({ operationId: randomUUID(), name: "Młot", categoryId: category.id });

    expect(limitWarning).toBeNull();
    expect(await owner.subscription()).toMatchObject({ toolCount: 1 });
  });
});

describe("co widzi pracownik", () => {
  it("widzi „Gdzie jest co” i kartę narzędzia bez żadnej kwoty", async () => {
    const z = await givenZawbud();
    const worker = testbed.registry.as(z.workerId);

    const board = await worker.whereIsWhat();
    expect(board.sites).toEqual([expect.objectContaining({ name: "Rataje", tools: [expect.objectContaining({ code: "H-01" })] })]);
    expect(JSON.stringify(board)).not.toMatch(/value|(?<![\w-])3200(?![\w-])/i);

    const card = await worker.toolCard(z.h01);
    expect(card).toMatchObject({ code: "H-01", location: { id: z.ratajeId } });
    expect(card).not.toHaveProperty("value");
    expect(JSON.stringify(card)).not.toContain("3200");
  });

  it("Rejestr odrzuca ruchy pracownika i nic się nie rusza", async () => {
    const z = await givenZawbud();
    const worker = testbed.registry.as(z.workerId);
    const { locationId: hiltiId } = await z.owner.addService({ name: "Serwis Hilti" });
    const { toolId: h02 } = await z.owner.addTool({ operationId: randomUUID(), code: "H-02", name: "Młot mały", categoryId: z.hammersId });
    const move = (kind: "wydanie" | "zwrot" | "przeniesienie" | "do_serwisu" | "z_serwisu", from: string, to: string, toolId: string) =>
      worker.registerMovement({ operationId: randomUUID(), kind, fromLocationId: from, toLocationId: to, toolIds: [toolId], source: "checklista" });

    // Po kolei: każda próba to osobna transakcja, a odrzucenie czeka na swoje `expect`.
    for (const attempt of [
      () => move("wydanie", z.baseId, z.ratajeId, h02),
      () => move("zwrot", z.ratajeId, z.baseId, z.h01),
      () => move("do_serwisu", z.ratajeId, hiltiId, z.h01),
      () => move("do_serwisu", z.baseId, hiltiId, h02),
      () => move("przeniesienie", z.ratajeId, z.nowakBusId, z.h01),
    ]) {
      await expect(attempt()).rejects.toMatchObject({ code: "forbidden" });
    }
    await z.owner.correctTool({ operationId: randomUUID(), toolId: h02, locationId: hiltiId, reason: "naprawa" });
    await expect(move("z_serwisu", hiltiId, z.baseId, h02)).rejects.toMatchObject({ code: "forbidden" });
    await expect(worker.closeSite(z.ratajeId)).rejects.toMatchObject({ code: "forbidden" });
    await expect(worker.addTool({ operationId: randomUUID(), name: "Młot", categoryId: z.hammersId })).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      worker.reportTool({ operationId: randomUUID(), siteId: z.ratajeId, name: "Młot", categoryId: z.hammersId }),
    ).rejects.toMatchObject({ code: "forbidden" });

    expect((await z.owner.toolCard(z.h01))!.location.id).toBe(z.ratajeId);
    expect((await z.owner.toolCard(h02))!.location.id).toBe(hiltiId);
  });

  it("bezpośrednio w bazie pracownik nie zapisze ruchu, choć kierownik ten sam zapisze", async () => {
    const z = await givenZawbud();
    const insertReturn = (actorId: string) =>
      withActor(testbed.db, actorId, (sql) =>
        sql(
          `insert into app.movements (company_id, kind, from_location_id, to_location_id, author_id, source, occurred_at,
                                      recorded_at, client_operation_id)
           values ($1, 'zwrot', $2, $3, $4, 'checklista', now(), now(), $5)`,
          [z.zawbud.companyId, z.ratajeId, z.baseId, actorId, randomUUID()],
        ),
      );

    await expect(insertReturn(z.workerId)).rejects.toThrow(/row-level security/);
    await expect(insertReturn(z.nowakId)).resolves.toEqual([]);
  });
});
