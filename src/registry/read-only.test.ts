import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RegisteredKind } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();

/**
 * Zawbud z abonamentem opłaconym do 31 marca (tryb tylko do odczytu od 15 kwietnia), kierownikiem Nowakiem
 * na Rataje, magazynierem i szlifierkami S-01, S-02 na bazie.
 */
async function givenZawbud({ paidUntil = "2026-03-31" }: { paidUntil?: string } = {}) {
  const zawbud = await testbed.givenActiveCompany("Zawbud");
  const adminId = await testbed.givenSuperAdmin();
  const admin = testbed.registry.superAdmin(adminId);
  await admin.changeTier(zawbud.companyId, "maly");
  await admin.setPaidUntil(zawbud.companyId, paidUntil);
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const storekeeperId = await testbed.givenMember(zawbud, "magazynier", "Ewa Wiśniewska");
  const owner = testbed.registry.as(zawbud.ownerId);
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
  const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
  const s01 = (await owner.addTool({ operationId: randomUUID(), code: "S-01", name: "Szlifierka kątowa", categoryId: grinders.id })).toolId;
  const s02 = (await owner.addTool({ operationId: randomUUID(), code: "S-02", name: "Szlifierka mała", categoryId: grinders.id })).toolId;
  const { base } = await owner.whereIsWhat();
  return { zawbud, admin, owner, nowakId, storekeeperId, ratajeId, grinders, baseId: base.id, s01, s02 };
}

type Zawbud = Awaited<ReturnType<typeof givenZawbud>>;

function move(actorId: string, kind: RegisteredKind, from: string, to: string, toolIds: string[], operationId = randomUUID()) {
  return testbed.registry.as(actorId).registerMovement({ operationId, kind, fromLocationId: from, toLocationId: to, toolIds, source: "checklista" });
}

function issueS01(z: Zawbud, actorId = z.nowakId) {
  return move(actorId, "wydanie", z.baseId, z.ratajeId, [z.s01]);
}

const readOnly = { code: "read_only" };

describe("granica 14 dni po „opłacone do”", () => {
  it("ostatniego dnia przed granicą kierownik wydaje sprzęt, a od północy 15 kwietnia (czas polski) już nie", async () => {
    const z = await givenZawbud();
    const nowak = testbed.registry.as(z.nowakId);

    testbed.clock.set("2026-04-14T23:59:00+02:00");
    expect((await nowak.session())!.company.readOnly).toBe(false);
    await issueS01(z);

    testbed.clock.set("2026-04-15T00:00:00+02:00");
    expect((await nowak.session())!.company.readOnly).toBe(true);
    await expect(move(z.nowakId, "zwrot", z.ratajeId, z.baseId, [z.s01])).rejects.toMatchObject(readOnly);
    await expect(move(z.storekeeperId, "wydanie", z.baseId, z.ratajeId, [z.s02])).rejects.toMatchObject(readOnly);
    expect((await z.owner.toolCard(z.s01))!.location.name).toBe("Rataje");
  });

  it("firma bez żadnej wpłaty (czeka na pierwszą) pracuje normalnie", async () => {
    const zawbud = await testbed.givenActiveCompany("Budrex");
    testbed.clock.set("2027-01-01T12:00:00+01:00");

    expect((await testbed.registry.as(zawbud.ownerId).session())!.company.readOnly).toBe(false);
    await testbed.registry.as(zawbud.ownerId).addCategory({ name: "Młoty", prefix: "H" });
  });
});

describe("tryb ręczny", () => {
  it("super-admin włącza tryb mimo opłaconego abonamentu, a po wyłączeniu firma znowu zapisuje", async () => {
    const z = await givenZawbud({ paidUntil: "2026-12-31" });

    await z.admin.setManualReadOnly(z.zawbud.companyId, true);
    expect((await z.owner.session())!.company.readOnly).toBe(true);
    await expect(issueS01(z)).rejects.toMatchObject(readOnly);

    await z.admin.setManualReadOnly(z.zawbud.companyId, false);
    expect((await z.owner.session())!.company.readOnly).toBe(false);
    await issueS01(z);
  });
});

describe("super-admin w trybie tylko do odczytu", () => {
  it("nie jest blokowany: zmienia próg i wpisuje „opłacone do”, po czym firma od razu zapisuje", async () => {
    const z = await givenZawbud();
    testbed.clock.set("2026-05-10T10:00:00+02:00");
    await expect(issueS01(z)).rejects.toMatchObject(readOnly);

    await z.admin.changeTier(z.zawbud.companyId, "sredni");
    await z.admin.setPaidUntil(z.zawbud.companyId, "2027-04-30");

    await issueS01(z);
    expect(await z.admin.company(z.zawbud.companyId)).toMatchObject({ status: "aktywna", tier: { id: "sredni" } });
  });
});

describe("polecenia i zapytania w trybie tylko do odczytu", () => {
  /**
   * Zawbud z historią sprzed trybu: wydanie S-01 Nowaka, zgłoszone narzędzie, odrzucony ruch z kolejki i nowy
   * magazynier z hasłem tymczasowym.
   */
  async function givenReadOnlyZawbud() {
    const z = await givenZawbud();
    const issued = await issueS01(z);
    const reported = await testbed.registry
      .as(z.nowakId)
      .reportTool({ operationId: randomUUID(), siteId: z.ratajeId, name: "Wiertarka", categoryId: z.grinders.id });
    const rejected = await testbed.registry.as(z.nowakId).registerQueuedMovement({
      operationId: randomUUID(),
      kind: "wydanie",
      fromLocationId: z.baseId,
      toLocationId: z.ratajeId,
      toolIds: [z.s01],
      source: "checklista",
    });
    if (rejected.status !== "rejected") throw new Error("Ruch z kolejki miał zostać odrzucony");
    const { userId: newcomerId } = await z.owner.addMember({ firstName: "Piotr", lastName: "Zieliński", email: "piotr@zawbud.test", role: "magazynier" });
    await z.admin.setManualReadOnly(z.zawbud.companyId, true);
    return { ...z, issued, reported, rejection: rejected.rejection, newcomerId };
  }

  it("każde polecenie zapisu użytkowników firmy kończy się błędem read_only i niczego nie zmienia", async () => {
    const z = await givenReadOnlyZawbud();
    const nowak = testbed.registry.as(z.nowakId);
    const boardBefore = await z.owner.whereIsWhat();
    const historyBefore = await z.owner.movementHistory();
    const settingsBefore = await z.owner.settings();
    const accounts = testbed.auth.accountCount();
    const nowakPassword = testbed.auth.passwordOf(z.nowakId);
    const op = () => randomUUID();

    const commands: [string, () => Promise<unknown>][] = [
      ["addCategory", () => z.owner.addCategory({ name: "Młoty", prefix: "H" })],
      ["addTool", () => z.owner.addTool({ operationId: op(), name: "Szlifierka", categoryId: z.grinders.id })],
      ["addTool (magazynier)", () => testbed.registry.as(z.storekeeperId).addTool({ operationId: op(), name: "Szlifierka", categoryId: z.grinders.id })],
      ["editTool", () => z.owner.editTool(z.s02, { name: "Inna nazwa" })],
      ["importTools", () => z.owner.importTools({ operationId: op(), rows: [{ name: "Szlifierka", category: "S" }] })],
      ["printStickers", () => z.owner.printStickers({ unlabeled: true }, async () => "pdf")],
      ["reportTool", () => nowak.reportTool({ operationId: op(), siteId: z.ratajeId, name: "Młot", categoryId: z.grinders.id })],
      ["acceptToolReport", () => z.owner.acceptToolReport({ toolId: z.reported.toolId, value: 500 })],
      ["rejectToolReport", () => z.owner.rejectToolReport({ operationId: op(), toolId: z.reported.toolId, comment: "to W-01" })],
      ["addMember", () => z.owner.addMember({ firstName: "Anna", lastName: "Mazur", email: "anna@zawbud.test", role: "kierownik" })],
      ["resetMemberPassword", () => z.owner.resetMemberPassword(z.nowakId)],
      ["deactivateMember", () => z.owner.deactivateMember(z.nowakId)],
      ["addSite", () => z.owner.addSite({ name: "Naramowice", address: "ul. Naramowicka 1", managerId: z.nowakId })],
      ["changeSiteManager", () => z.owner.changeSiteManager(z.ratajeId, z.nowakId)],
      ["addService", () => z.owner.addService({ name: "Serwis Hilti" })],
      ["closeSite", () => nowak.closeSite(z.ratajeId)],
      ["forceCloseSite", () => z.owner.forceCloseSite({ operationId: op(), siteId: z.ratajeId, reason: "koniec" })],
      ["registerMovement", () => move(z.nowakId, "zwrot", z.ratajeId, z.baseId, [z.s01])],
      ["undoMovement", () => nowak.undoMovement({ operationId: op(), movementId: z.issued.id })],
      ["correctTool", () => z.owner.correctTool({ operationId: op(), toolId: z.s02, locationId: z.ratajeId, reason: "jest na budowie" })],
      ["markToolLost", () => z.owner.markToolLost({ operationId: op(), toolId: z.s02, reason: "nie ma" })],
      ["retireTool", () => z.owner.retireTool({ operationId: op(), toolId: z.s02 })],
      ["resolveRejectedMovement", () => nowak.resolveRejectedMovement(z.rejection.id)],
      ["updateSettings", () => z.owner.updateSettings({ alarmThresholdDays: 21 })],
    ];
    for (const [name, command] of commands) {
      await expect(command(), name).rejects.toMatchObject(readOnly);
    }

    expect(await z.owner.whereIsWhat()).toEqual(boardBefore);
    expect(await z.owner.movementHistory()).toEqual(historyBefore);
    expect(await z.owner.settings()).toEqual(settingsBefore);
    expect(await nowak.movementsToClarify()).toHaveLength(1);
    expect(await z.owner.toolReports()).toHaveLength(1);
    expect(testbed.auth.accountCount()).toBe(accounts);
    expect(testbed.auth.passwordOf(z.nowakId)).toBe(nowakPassword);
    expect(testbed.auth.isBlocked(z.nowakId)).toBe(false);
  });

  it("tablica, karta, historia, eksport, raporty i inne zapytania działają", async () => {
    const z = await givenReadOnlyZawbud();
    const nowak = testbed.registry.as(z.nowakId);

    expect((await z.owner.whereIsWhat()).sites.map((site) => [site.name, site.tools.map((tool) => tool.code)])).toEqual([
      ["Rataje", ["S-01", "S-03"]],
    ]);
    expect((await nowak.toolCard(z.s01))!.location.name).toBe("Rataje");
    expect((await nowak.movementHistory()).movements).toHaveLength(4);
    expect((await z.owner.exportData()).movements).toHaveLength(4);
    await Promise.all([
      z.owner.historyFilterOptions(),
      z.owner.recentMovements(),
      z.owner.locations(),
      z.owner.team(),
      z.owner.settings(),
      z.owner.subscription(),
      z.owner.toolReports(),
      z.owner.stickerCandidates(),
      z.owner.finishedSites(),
      z.owner.weeklyReport(),
      nowak.fridayReport(),
      nowak.receivedReports(),
      z.owner.categories(),
      z.owner.suggestCode(z.grinders.id),
      z.owner.toolCatalog(),
      z.owner.toolList(),
      z.owner.previewToolImport([{ name: "Szlifierka", category: "S" }]),
      nowak.movementsToClarify(),
      nowak.bell(),
      nowak.unreadNotificationCount(),
    ]);
  });

  it("zmiana hasła tymczasowego, dzwonek i powiadomienia push działają, bo nie są danymi firmy", async () => {
    const z = await givenReadOnlyZawbud();
    const newcomer = testbed.registry.as(z.newcomerId);
    const nowak = testbed.registry.as(z.nowakId);

    await newcomer.changePassword("NoweHasloPiotra1", testbed.signedInNow());
    expect(testbed.auth.passwordOf(z.newcomerId)).toBe("NoweHasloPiotra1");
    expect(await newcomer.whereIsWhat()).toMatchObject({ sites: [{ name: "Rataje" }] });
    const [entry] = (await nowak.bell()).entries;
    expect(await nowak.markNotificationRead(entry.id)).toMatchObject({ read: true });
    await nowak.markAllNotificationsRead();
    const phone = { kind: "przegladarka" as const, endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`, keys: { p256dh: "klucz", auth: "sekret" } };
    await nowak.subscribeToPush(phone);
    await nowak.unsubscribeFromPush(phone);
  });

  it("ruch z kolejki offline czeka w telefonie (błąd do ponowienia), a nie trafia na listę „Do wyjaśnienia”; po wpłacie się zapisuje", async () => {
    const z = await givenReadOnlyZawbud();
    const nowak = testbed.registry.as(z.nowakId);
    const queued = {
      operationId: randomUUID(),
      kind: "zwrot" as const,
      fromLocationId: z.ratajeId,
      toLocationId: z.baseId,
      toolIds: [z.s01],
      source: "checklista" as const,
      occurredAt: testbed.clock.now(),
    };

    await expect(nowak.registerQueuedMovement(queued)).rejects.toMatchObject(readOnly);
    expect(await nowak.movementsToClarify()).toHaveLength(1);

    await z.admin.setManualReadOnly(z.zawbud.companyId, false);
    expect(await nowak.registerQueuedMovement(queued)).toMatchObject({ status: "registered" });
  });

  it("ponowne wysłanie operacji zapisanej przed przełączeniem zwraca jej wynik", async () => {
    const z = await givenZawbud();
    const operationId = randomUUID();
    const issued = await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01], operationId);
    await z.admin.setManualReadOnly(z.zawbud.companyId, true);

    expect(await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01], operationId)).toMatchObject({ id: issued.id });
  });
});

describe("dane firmy w trybie tylko do odczytu", () => {
  it("nigdy nie są kasowane automatycznie: po roku w trybie i wszystkich zadaniach harmonogramu wszystko zostaje", async () => {
    const z = await givenZawbud();
    await issueS01(z);
    const codes = async () => {
      const board = await z.owner.whereIsWhat();
      return [board.base.tools, ...board.sites.map((site) => site.tools)].map((tools) => tools.map((tool) => tool.code));
    };
    const before = await codes();
    const history = await z.owner.movementHistory();

    for (const at of ["2026-04-15T08:00:00+02:00", "2026-10-05T08:00:00+02:00", "2027-04-19T08:00:00+02:00"]) {
      testbed.clock.set(at);
      await testbed.registry.system().notifySubscriptionDeadlines();
      await testbed.registry.system().notifyExceededThresholds();
      await testbed.registry.system().sendDueReports();
    }

    expect(await codes()).toEqual(before);
    expect(before).toEqual([["S-02"], ["S-01"]]);
    expect((await z.owner.movementHistory()).movements).toEqual(history.movements);
    expect(await z.owner.team()).toHaveLength(3);
    expect(await z.admin.company(z.zawbud.companyId)).toMatchObject({ toolCount: 2, status: "tylko_do_odczytu" });
  });
});

describe("ostrzeżenia przed trybem tylko do odczytu", () => {
  const warningsAt = async (at: string) => {
    testbed.clock.set(at);
    return testbed.registry.system().notifySubscriptionDeadlines();
  };

  it("zadanie dzienne wysyła właścicielowi e-mail i wpis w dzwonku 7 dni i 1 dzień przed przełączeniem, każde raz", async () => {
    const z = await givenZawbud();
    testbed.notifier.clear();

    expect(await warningsAt("2026-04-07T07:00:00+02:00")).toEqual({ warned: 0, switched: 0 });
    expect(await warningsAt("2026-04-08T07:00:00+02:00")).toEqual({ warned: 1, switched: 0 });
    expect(await warningsAt("2026-04-08T19:00:00+02:00")).toEqual({ warned: 0, switched: 0 });
    expect(await warningsAt("2026-04-09T07:00:00+02:00")).toEqual({ warned: 0, switched: 0 });
    expect(await warningsAt("2026-04-14T07:00:00+02:00")).toEqual({ warned: 1, switched: 0 });
    expect(await warningsAt("2026-04-14T19:00:00+02:00")).toEqual({ warned: 0, switched: 0 });

    const warning = (daysLeft: number) => ({
      kind: "tylko_do_odczytu_wkrotce",
      paidUntil: "2026-03-31",
      readOnlyFrom: "2026-04-15",
      daysLeft,
    });
    expect(testbed.notifier.sent).toEqual([
      { ...warning(7), recipient: { userId: z.zawbud.ownerId, fullName: "Właściciel Zawbud", email: expect.any(String) } },
      { ...warning(1), recipient: { userId: z.zawbud.ownerId, fullName: "Właściciel Zawbud", email: expect.any(String) } },
    ]);
    expect((await z.owner.bell()).entries.map((entry) => entry.notification)).toEqual([warning(1), warning(7)]);
    expect((await testbed.registry.as(z.nowakId).bell()).entries).toEqual([]);
  });

  it("po przełączeniu właściciel ma w dzwonku wpis o trybie tylko do odczytu (bez e-maila), raz", async () => {
    const z = await givenZawbud();
    testbed.notifier.clear();

    expect(await warningsAt("2026-04-15T07:00:00+02:00")).toEqual({ warned: 0, switched: 1 });
    expect(await warningsAt("2026-04-16T07:00:00+02:00")).toEqual({ warned: 0, switched: 0 });

    expect(testbed.notifier.sent).toEqual([]);
    expect((await z.owner.bell()).entries.map((entry) => entry.notification)).toEqual([
      { kind: "tylko_do_odczytu", reason: "po_terminie", paidUntil: "2026-03-31", since: "2026-04-15" },
    ]);
  });

  it("zadanie spóźnione o dzień nie gubi ostrzeżenia, a firma od dawna w trybie nie dostaje wpisu z opóźnieniem", async () => {
    const late = await givenZawbud();
    const longAgo = await testbed.givenActiveCompany("Budrex");
    await late.admin.setPaidUntil(longAgo.companyId, "2025-12-31");

    expect(await warningsAt("2026-04-09T07:00:00+02:00")).toEqual({ warned: 1, switched: 0 });
    expect((await late.owner.bell()).entries.map((entry) => entry.notification)).toMatchObject([{ daysLeft: 6 }]);
    expect((await testbed.registry.as(longAgo.ownerId).bell()).entries).toEqual([]);
  });

  it("po wpłacie ostrzeżenia liczą się od nowej daty", async () => {
    const z = await givenZawbud();
    await warningsAt("2026-04-08T07:00:00+02:00");
    await z.admin.setPaidUntil(z.zawbud.companyId, "2026-04-30");
    testbed.notifier.clear();

    expect(await warningsAt("2026-04-14T07:00:00+02:00")).toEqual({ warned: 0, switched: 0 });
    expect(await warningsAt("2026-05-08T07:00:00+02:00")).toEqual({ warned: 1, switched: 0 });
    expect(testbed.notifier.sent).toMatchObject([{ readOnlyFrom: "2026-05-15", daysLeft: 7 }]);
  });

  it("przy ręcznym trybie nie ma ostrzeżeń, a właściciel dostaje wpis w dzwonku i push, gdy super-admin go włącza", async () => {
    const z = await givenZawbud();
    const phone = { kind: "przegladarka" as const, endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`, keys: { p256dh: "klucz", auth: "sekret" } };
    await z.owner.subscribeToPush(phone);
    testbed.clock.set("2026-04-01T10:00:00+02:00");

    await z.admin.setManualReadOnly(z.zawbud.companyId, true);
    await z.admin.setManualReadOnly(z.zawbud.companyId, true);

    const manual = { kind: "tylko_do_odczytu", reason: "reczny", paidUntil: "2026-03-31", since: "2026-04-01" };
    expect((await z.owner.bell()).entries.map((entry) => entry.notification)).toEqual([manual]);
    expect(testbed.notifier.pushed).toMatchObject([{ subscription: { endpoint: phone.endpoint }, message: { notification: manual } }]);
    expect(await warningsAt("2026-04-08T07:00:00+02:00")).toEqual({ warned: 0, switched: 0 });
    expect(await warningsAt("2026-04-15T07:00:00+02:00")).toEqual({ warned: 0, switched: 0 });
    expect(testbed.notifier.sent).toEqual([]);
  });
});

describe("wyłączenie trybu ręcznego po terminie płatności", () => {
  it("firma zostaje w trybie tylko do odczytu, a właściciel dostaje wpis, że teraz z powodu płatności", async () => {
    const z = await givenZawbud();
    testbed.clock.set("2026-04-01T10:00:00+02:00");
    await z.admin.setManualReadOnly(z.zawbud.companyId, true);
    testbed.clock.set("2026-05-04T10:00:00+02:00");

    await z.admin.setManualReadOnly(z.zawbud.companyId, false);

    expect((await z.owner.session())!.company.readOnly).toBe(true);
    expect((await z.owner.bell()).entries.map((entry) => entry.notification)).toEqual([
      { kind: "tylko_do_odczytu", reason: "po_terminie", paidUntil: "2026-03-31", since: "2026-04-15" },
      { kind: "tylko_do_odczytu", reason: "reczny", paidUntil: "2026-03-31", since: "2026-04-01" },
    ]);
  });

  it("wyłączenie przed terminem przywraca zapisy bez wpisu w dzwonku", async () => {
    const z = await givenZawbud({ paidUntil: "2026-12-31" });
    await z.admin.setManualReadOnly(z.zawbud.companyId, true);

    await z.admin.setManualReadOnly(z.zawbud.companyId, false);

    expect((await z.owner.bell()).entries).toHaveLength(1);
  });
});

const SMALL = { id: "maly", name: "Mały", maxPeople: 5, toolLimit: 150, implementationPrice: 3000, yearlyPrice: 400 };

describe("limit narzędzi w pakiecie", () => {
  /** Zawbud w pakiecie Mały (150 narzędzi) z 150 narzędziami z importu. */
  async function givenFullZawbud() {
    const z = await givenZawbud();
    const rows = Array.from({ length: 148 }, () => ({ name: "Młot", category: "S" }));
    const result = await z.owner.importTools({ operationId: randomUUID(), rows });
    expect(result).toEqual({ imported: 148, limitWarning: null });
    return z;
  }

  const overLimit = (toolCount: number, suggested = "sredni") => ({
    tier: SMALL,
    toolCount,
    suggestedTier: expect.objectContaining({ id: suggested }),
  });

  it("do limitu bez ostrzeżenia, a ponad limit polecenie się wykonuje i wynik ma ostrzeżenie z wyższym pakietem", async () => {
    const z = await givenFullZawbud();

    const added = await z.owner.addTool({ operationId: randomUUID(), name: "Szlifierka", categoryId: z.grinders.id });
    expect(added).toEqual({ toolId: expect.any(String), code: "S-151", limitWarning: overLimit(151) });
    expect((await z.owner.toolCard(added.toolId))!.location.name).toBe("Baza");

    const storekeeper = testbed.registry.as(z.storekeeperId);
    expect(await storekeeper.addTool({ operationId: randomUUID(), name: "Szlifierka", categoryId: z.grinders.id })).toMatchObject({
      limitWarning: overLimit(152),
    });
    expect(
      await testbed.registry.as(z.nowakId).reportTool({ operationId: randomUUID(), siteId: z.ratajeId, name: "Wiertarka", categoryId: z.grinders.id }),
    ).toMatchObject({ limitWarning: overLimit(153) });
    expect(await z.owner.importTools({ operationId: randomUUID(), rows: [{ name: "Młot", category: "S" }] })).toEqual({
      imported: 1,
      limitWarning: overLimit(154),
    });
  });

  it("wycofane narzędzia nie liczą się do limitu, a ponad 500 proponujemy duży pakiet", async () => {
    const z = await givenFullZawbud();
    await z.owner.retireTool({ operationId: randomUUID(), toolId: z.s01 });
    expect(await z.owner.addTool({ operationId: randomUUID(), name: "Szlifierka", categoryId: z.grinders.id })).toMatchObject({ limitWarning: null });

    const rows = Array.from({ length: 400 }, () => ({ name: "Młot", category: "S" }));
    expect(await z.owner.importTools({ operationId: randomUUID(), rows })).toMatchObject({ limitWarning: overLimit(550, "duzy") });
  });

  it("duży pakiet nie ma limitu narzędzi", async () => {
    const z = await givenFullZawbud();
    await z.admin.changeTier(z.zawbud.companyId, "duzy");

    expect(await z.owner.addTool({ operationId: randomUUID(), name: "Szlifierka", categoryId: z.grinders.id })).toMatchObject({ limitWarning: null });
  });
});

describe("abonament w ustawieniach właściciela", () => {
  it("właściciel widzi pakiet, limity, liczbę narzędzi i osób oraz „opłacone do”; kierownik i magazynier nie", async () => {
    const z = await givenZawbud();

    expect(await z.owner.subscription()).toEqual({
      tier: SMALL,
      toolCount: 2,
      paidUntil: "2026-03-31",
      readOnlyFrom: "2026-04-15",
      status: "aktywna",
      limitWarning: null,
      recorders: { tier: SMALL, recorderCount: 3, seatsLeft: 2, upgrade: null },
    });
    await expect(testbed.registry.as(z.nowakId).subscription()).rejects.toMatchObject({ code: "forbidden" });
    await expect(testbed.registry.as(z.storekeeperId).subscription()).rejects.toMatchObject({ code: "forbidden" });
  });

  it("po przekroczeniu limitu ustawienia pokazują ostrzeżenie z wyższym pakietem", async () => {
    const z = await givenZawbud();
    await z.owner.importTools({ operationId: randomUUID(), rows: Array.from({ length: 149 }, () => ({ name: "Młot", category: "S" })) });
    testbed.clock.set("2026-04-20T10:00:00+02:00");

    expect(await z.owner.subscription()).toMatchObject({
      toolCount: 151,
      status: "tylko_do_odczytu",
      limitWarning: { toolCount: 151, suggestedTier: { id: "sredni" } },
    });
  });
});
