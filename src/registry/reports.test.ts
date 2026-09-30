import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { NotificationContent, RegisteredKind } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Poniedziałek 2 marca 2026, 7:00 czasu polskiego (CET). */
const MONDAY_7 = new Date("2026-03-02T07:00:00+01:00");

/**
 * Firma z progiem 30 dni, kierownikami Nowakiem (Rataje) i Kowalskim (Winogrady), magazynierem
 * i szlifierkami S-01 za 450,50 zł, S-02 za 380 zł i S-03 za 1200 zł na bazie.
 */
async function givenZawbud(name = "Zawbud") {
  const zawbud = await testbed.givenActiveCompany(name, { baseName: "Magazyn" });
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const kowalskiId = await testbed.givenMember(zawbud, "kierownik", "Jan Kowalski");
  const storekeeperId = await testbed.givenMember(zawbud, "magazynier", "Ewa Magazyn");
  const owner = testbed.registry.as(zawbud.ownerId);
  await owner.updateSettings({ alarmThresholdDays: 30 });
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
  const { locationId: winogradyId } = await owner.addSite({ name: "Winogrady", address: "os. Wichrowe 3", managerId: kowalskiId });
  const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
  const add = async (code: string, toolName: string, value: number) =>
    (await owner.addTool({ operationId: randomUUID(), code, name: toolName, categoryId: grinders.id, value })).toolId;
  const s01 = await add("S-01", "Szlifierka kątowa", 450.5);
  const s02 = await add("S-02", "Szlifierka mała", 380);
  const s03 = await add("S-03", "Szlifierka duża", 1200);
  const { base } = await owner.whereIsWhat();
  return { zawbud, owner, nowakId, kowalskiId, storekeeperId, ratajeId, winogradyId, baseId: base.id, grinders, s01, s02, s03 };
}

function move(actorId: string, kind: RegisteredKind, from: string, to: string, toolIds: string[]) {
  return testbed.registry
    .as(actorId)
    .registerMovement({ operationId: randomUUID(), kind, fromLocationId: from, toLocationId: to, toolIds, source: "checklista" });
}

async function bellOf(userId: string): Promise<NotificationContent[]> {
  return (await testbed.registry.as(userId).bell()).entries.map((entry) => entry.notification);
}

function sendDueReports() {
  return testbed.registry.system().sendDueReports();
}

describe("raport tygodniowy: kiedy i do kogo", () => {
  it("w poniedziałek o 7:00 każdy właściciel dostaje raport do dzwonka i e-mailem; wcześniej i drugi raz nic", async () => {
    const z = await givenZawbud();
    testbed.clock.set(new Date(MONDAY_7.getTime() - MINUTE));
    expect(await sendDueReports()).toEqual({ weekly: 0, friday: 0 });

    testbed.clock.set(new Date(MONDAY_7.getTime() + 20 * MINUTE));
    expect(await sendDueReports()).toEqual({ weekly: 1, friday: 0 });
    expect(await sendDueReports()).toEqual({ weekly: 0, friday: 0 });

    expect(await bellOf(z.zawbud.ownerId)).toEqual([
      { kind: "raport_tygodniowy", report: expect.objectContaining({ kind: "tygodniowy", day: "2026-03-02" }) },
    ]);
    expect(testbed.notifier.sent).toEqual([
      expect.objectContaining({ kind: "raport_tygodniowy", recipient: expect.objectContaining({ userId: z.zawbud.ownerId }) }),
    ]);
    expect(await bellOf(z.nowakId)).toEqual([]);
    expect(await bellOf(z.storekeeperId)).toEqual([]);
  });
});

describe("raport tygodniowy: zawartość", () => {
  it("narzędzia ponad progiem (gdzie, od ilu dni, kierownik), zaginione, kwota poza bazą, zgłoszenia i najdłużej nieużywane", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);
    testbed.clock.advance(25 * DAY);
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s02]);
    testbed.clock.advance(DAY);
    await z.owner.markToolLost({ operationId: randomUUID(), toolId: z.s02, reason: "nie ma go na placu" });
    testbed.clock.advance(4 * DAY);
    const reported = await testbed.registry
      .as(z.nowakId)
      .reportTool({ operationId: randomUUID(), siteId: z.ratajeId, name: "Wiertarka Makita", categoryId: z.grinders.id });

    // Poniedziałek 6 kwietnia, 7:30 czasu letniego.
    testbed.clock.set("2026-04-06T07:30:00+02:00");
    expect(await sendDueReports()).toEqual({ weekly: 1, friday: 0 });

    const expected = {
      kind: "tygodniowy",
      day: "2026-04-06",
      thresholdDays: 30,
      overThreshold: [
        { id: z.s01, code: "S-01", name: "Szlifierka kątowa", location: { id: z.ratajeId, name: "Rataje" }, days: 34, manager: "Adam Nowak" },
      ],
      lost: [
        { id: z.s02, code: "S-02", name: "Szlifierka mała", days: 8, lastLocation: { id: z.winogradyId, name: "Winogrady" }, responsible: "Jan Kowalski" },
      ],
      offBaseValue: 450.5,
      previousOffBaseValue: null,
      offBaseChange: null,
      toolReports: [
        { id: reported.toolId, code: "S-04", name: "Wiertarka Makita", location: { id: z.ratajeId, name: "Rataje" }, reportedBy: "Adam Nowak", daysWaiting: 4 },
      ],
      longestUnused: [{ id: z.s03, code: "S-03", name: "Szlifierka duża", days: 34 }],
      deadlines: [],
    };
    expect(await bellOf(z.zawbud.ownerId)).toEqual([{ kind: "raport_tygodniowy", report: expected }]);
    expect(await z.owner.sentReport("tygodniowy", "2026-04-06")).toEqual(expected);
    expect(await z.owner.weeklyReport()).toEqual(expected);
  });

  it("najdłużej nieużywane to najwyżej pięć narzędzi z bazy, od najdłużej stojącego", async () => {
    const z = await givenZawbud();
    const add = async (code: string) => (await z.owner.addTool({ operationId: randomUUID(), code, name: `Szlifierka ${code}`, categoryId: z.grinders.id })).toolId;
    testbed.clock.advance(DAY);
    for (const code of ["S-04", "S-05", "S-06", "S-07"]) await add(code);
    testbed.clock.advance(DAY);
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s02]);
    await move(z.nowakId, "zwrot", z.ratajeId, z.baseId, [z.s02]);

    const report = await z.owner.weeklyReport();
    expect(report.longestUnused.map((tool) => [tool.code, tool.days])).toEqual([
      ["S-01", 2],
      ["S-03", 2],
      ["S-04", 1],
      ["S-05", 1],
      ["S-06", 1],
    ]);
  });

  it("raport tygodniowy czyta tylko właściciel", async () => {
    const z = await givenZawbud();
    await expect(testbed.registry.as(z.nowakId).weeklyReport()).rejects.toMatchObject({ code: "forbidden" });
    await expect(testbed.registry.as(z.storekeeperId).weeklyReport()).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("raport tygodniowy: kwota poza bazą tydzień do tygodnia", () => {
  it("porównuje z raportem z poprzedniego poniedziałku; po tygodniu bez raportu nie ma z czym porównać", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);
    testbed.clock.set("2026-03-02T07:10:00+01:00");
    await sendDueReports();

    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s03]);
    await move(z.nowakId, "zwrot", z.ratajeId, z.baseId, [z.s01]);
    testbed.clock.set("2026-03-09T07:05:00+01:00");
    await sendDueReports();

    // 16 marca zadanie nie zadziałało.
    testbed.clock.set("2026-03-23T07:05:00+01:00");
    await sendDueReports();

    const reports = (await bellOf(z.zawbud.ownerId)).flatMap((n) => (n.kind === "raport_tygodniowy" ? [n.report] : [])).reverse();
    expect(reports.map((report) => [report.day, report.offBaseValue, report.previousOffBaseValue, report.offBaseChange])).toEqual([
      ["2026-03-02", 450.5, null, null],
      ["2026-03-09", 1200, 450.5, 749.5],
      ["2026-03-23", 1200, null, null],
    ]);
  });
});

describe("raport tygodniowy: zmiana czasu", () => {
  it("zadanie o 5:00 i 6:00 UTC: zimą raport idzie o 6:00 UTC (7:00 w Polsce), latem o 5:00 UTC", async () => {
    const z = await givenZawbud();
    // Zima: 5:30 UTC to 6:30 w Polsce.
    testbed.clock.set("2026-03-23T05:30:00Z");
    expect(await sendDueReports()).toEqual({ weekly: 0, friday: 0 });
    testbed.clock.set("2026-03-23T06:30:00Z");
    expect(await sendDueReports()).toEqual({ weekly: 1, friday: 0 });

    // Lato (od 29 marca): 5:30 UTC to 7:30 w Polsce, a zadanie o 6:00 UTC niczego nie powtarza.
    testbed.clock.set("2026-03-30T05:30:00Z");
    expect(await sendDueReports()).toEqual({ weekly: 1, friday: 0 });
    testbed.clock.set("2026-03-30T06:30:00Z");
    expect(await sendDueReports()).toEqual({ weekly: 0, friday: 0 });

    // Niedziela wieczorem w UTC to już poniedziałek w Polsce, ale przed 7:00.
    testbed.clock.set("2026-04-05T23:30:00Z");
    expect(await sendDueReports()).toEqual({ weekly: 0, friday: 0 });

    expect((await bellOf(z.zawbud.ownerId)).map((n) => n.kind === "raport_tygodniowy" && n.report.day)).toEqual(["2026-03-30", "2026-03-23"]);
  });
});

describe("raport: push z linkiem", () => {
  it("właściciel z włączonymi powiadomieniami dostaje push z wpisem raportu w dzwonku", async () => {
    const z = await givenZawbud();
    const phone = { endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`, keys: { p256dh: "klucz", auth: "sekret" } };
    await z.owner.subscribeToPush(phone);
    testbed.clock.set("2026-03-02T07:10:00+01:00");
    await sendDueReports();

    const [entry] = (await z.owner.bell()).entries;
    expect(testbed.notifier.pushed).toEqual([
      { subscription: phone, message: { window: "dzwonek", notificationId: entry.id, notification: entry.notification } },
    ]);
  });

  it("gdy e-mail nie wyjdzie, raport i tak jest w dzwonku, a ponowne zadanie go nie dubluje", async () => {
    const z = await givenZawbud();
    testbed.notifier.failWith = new Error("Resend nie działa");
    testbed.clock.set("2026-03-02T07:10:00+01:00");
    expect(await sendDueReports()).toEqual({ weekly: 1, friday: 0 });
    testbed.notifier.failWith = null;
    expect(await sendDueReports()).toEqual({ weekly: 0, friday: 0 });
    expect(await bellOf(z.zawbud.ownerId)).toHaveLength(1);
    expect(testbed.notifier.sent).toEqual([]);
  });
});

describe("raport piątkowy", () => {
  /** Nowak ma S-01 na Rataje, Kowalski S-02 na Winogradach, S-03 jest w serwisie, a Wiśniewski ma pustą budowę. */
  async function givenFriday() {
    const z = await givenZawbud();
    const wisniewskiId = await testbed.givenMember(z.zawbud, "kierownik", "Piotr Wiśniewski");
    await z.owner.addSite({ name: "Naramowice", address: "ul. Naramowicka 1", managerId: wisniewskiId });
    const { locationId: serviceId } = await z.owner.addService({ name: "Serwis Hilti" });
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s02]);
    await move(z.zawbud.ownerId, "do_serwisu", z.baseId, serviceId, [z.s03]);
    return { ...z, wisniewskiId };
  }

  const rataje = (z: Awaited<ReturnType<typeof givenZawbud>>) => ({
    id: z.ratajeId,
    name: "Rataje",
    kind: "budowa",
    manager: { id: z.nowakId, fullName: "Adam Nowak" },
    tools: [{ id: z.s01, code: "S-01", name: "Szlifierka kątowa", days: 4 }],
  });
  const winogrady = (z: Awaited<ReturnType<typeof givenZawbud>>) => ({
    id: z.winogradyId,
    name: "Winogrady",
    kind: "budowa",
    manager: { id: z.kowalskiId, fullName: "Jan Kowalski" },
    tools: [{ id: z.s02, code: "S-02", name: "Szlifierka mała", days: 4 }],
  });

  it("w piątek o 16:00 właściciel dostaje całą firmę (dzwonek i e-mail), a każdy kierownik tylko swoje budowy (bez e-maila)", async () => {
    const z = await givenFriday();
    testbed.clock.set("2026-03-06T15:59:00+01:00");
    expect(await sendDueReports()).toEqual({ weekly: 0, friday: 0 });
    testbed.clock.set("2026-03-06T16:10:00+01:00");
    expect(await sendDueReports()).toEqual({ weekly: 0, friday: 1 });
    expect(await sendDueReports()).toEqual({ weekly: 0, friday: 0 });

    const report = (locations: unknown[]) => ({ kind: "raport_piatkowy", report: { kind: "piatkowy", day: "2026-03-06", locations } });
    expect(await bellOf(z.zawbud.ownerId)).toEqual([report([rataje(z), winogrady(z)])]);
    expect(await bellOf(z.nowakId)).toEqual([report([rataje(z)])]);
    expect(await bellOf(z.kowalskiId)).toEqual([report([winogrady(z)])]);
    expect(await bellOf(z.wisniewskiId)).toEqual([]);
    expect(await bellOf(z.storekeeperId)).toEqual([]);
    expect(testbed.notifier.sent.map((n) => [n.kind, n.recipient.userId])).toEqual([["raport_piatkowy", z.zawbud.ownerId]]);
    expect(await testbed.registry.as(z.nowakId).sentReport("piatkowy", "2026-03-06")).toEqual(report([rataje(z)]).report);
  });

  it("właściciel, który sam prowadzi budowę, dostaje tylko raport całej firmy, bez osobnego raportu kierownika", async () => {
    const z = await givenFriday();
    await z.owner.changeSiteManager(z.winogradyId, z.zawbud.ownerId);
    testbed.clock.set("2026-03-06T16:10:00+01:00");
    expect(await sendDueReports()).toEqual({ weekly: 0, friday: 1 });

    const ownerAsManager = { id: z.zawbud.ownerId, fullName: "Właściciel Zawbud" };
    expect(await bellOf(z.zawbud.ownerId)).toEqual([
      { kind: "raport_piatkowy", report: { kind: "piatkowy", day: "2026-03-06", locations: [rataje(z), { ...winogrady(z), manager: ownerAsManager }] } },
    ]);
    expect(await bellOf(z.kowalskiId)).toEqual([]);
    expect(testbed.notifier.sent.map((n) => [n.kind, n.recipient.userId])).toEqual([["raport_piatkowy", z.zawbud.ownerId]]);
  });

  it("zapytanie w danej chwili: właściciel widzi całą firmę, kierownik swoje budowy, magazynier nic", async () => {
    const z = await givenFriday();
    testbed.clock.advance(4 * DAY);
    expect((await z.owner.fridayReport()).locations).toEqual([rataje(z), winogrady(z)]);
    expect((await testbed.registry.as(z.kowalskiId).fridayReport()).locations).toEqual([winogrady(z)]);
    expect((await testbed.registry.as(z.wisniewskiId).fridayReport()).locations).toEqual([]);
    await expect(testbed.registry.as(z.storekeeperId).fridayReport()).rejects.toMatchObject({ code: "forbidden" });
  });

  it("latem raport idzie o 14:00 UTC (16:00 w Polsce), a gdy cały sprzęt jest na bazie, nikt nic nie dostaje", async () => {
    const z = await givenZawbud();
    testbed.clock.set("2026-04-03T13:30:00Z");
    expect(await sendDueReports()).toEqual({ weekly: 0, friday: 0 });
    testbed.clock.set("2026-04-03T14:30:00Z");
    expect(await sendDueReports()).toEqual({ weekly: 0, friday: 0 });
    expect(await bellOf(z.zawbud.ownerId)).toEqual([]);

    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);
    testbed.clock.set("2026-04-10T14:30:00Z");
    expect(await sendDueReports()).toEqual({ weekly: 0, friday: 1 });
    expect(await bellOf(z.nowakId)).toEqual([expect.objectContaining({ kind: "raport_piatkowy" })]);
  });
});
