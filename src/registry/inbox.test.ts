import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { inboxList } from "./inbox";
import type { NotificationKind, PhonePosition, RegisteredKind, ToDoItem } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const RATAJE = { lat: 52.3925, lng: 16.9516 };
const WINOGRADY = { lat: 52.4302, lng: 16.9301 };
const AT_RATAJE: PhonePosition = { ...RATAJE, accuracy: 15 };
/** Telefon na Winogradach, kilka kilometrów od Rataj: odbicie „poza budową”. */
const AT_WINOGRADY: PhonePosition = { ...WINOGRADY, accuracy: 15 };

/**
 * Zawbud, poniedziałek 2 marca 2026, 7:00: budowa Rataje kierownika Nowaka, Winogrady kierownika Kowalskiego, magazynierka
 * Ewa, pracownik Jan, szlifierki S-01 i S-02 na bazie. Próg alarmu 10 dni.
 */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Swarzędz" });
  const ownerId = zawbud.ownerId;
  const owner = testbed.registry.as(ownerId);
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const kowalskiId = await testbed.givenMember(zawbud, "kierownik", "Piotr Kowalski");
  const ewaId = await testbed.givenMember(zawbud, "magazynier", "Ewa Wiśniewska");
  const janId = await testbed.givenMember(zawbud, "pracownik", "Jan Mazur");
  testbed.geocoder.knows("ul. Piłsudskiego 12, Poznań", RATAJE);
  testbed.geocoder.knows("os. Wichrowe 3, Poznań", WINOGRADY);
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", managerId: nowakId });
  const { locationId: winogradyId } = await owner.addSite({ name: "Winogrady", address: "os. Wichrowe 3, Poznań", managerId: kowalskiId });
  const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
  const s01 = (await owner.addTool({ operationId: randomUUID(), code: "S-01", name: "Szlifierka kątowa", categoryId: grinders.id })).toolId;
  const s02 = (await owner.addTool({ operationId: randomUUID(), code: "S-02", name: "Szlifierka mała", categoryId: grinders.id })).toolId;
  await owner.updateSettings({ alarmThresholdDays: 10 });
  const { base } = await owner.whereIsWhat();
  const personOf = async (userId: string) => (await owner.people()).find((person) => person.account?.userId === userId)!.personId;
  const posters = { rataje: (await owner.poster(ratajeId)).code };
  return { zawbud, owner, ownerId, nowakId, kowalskiId, ewaId, janId, ratajeId, winogradyId, baseId: base.id, grinders, s01, s02, personOf, posters };
}

type Zawbud = Awaited<ReturnType<typeof givenZawbud>>;

function move(actorId: string, kind: RegisteredKind, from: string, to: string, toolIds: string[]) {
  return testbed.registry.as(actorId).registerMovement({ operationId: randomUUID(), kind, fromLocationId: from, toLocationId: to, toolIds, source: "checklista" });
}

function punch(actorId: string, posterToken: string, position: PhonePosition | null, confirmExit = false) {
  return testbed.registry.as(actorId).punch({ operationId: randomUUID(), posterToken, position, confirmExit });
}

/** „Do zrobienia” osoby jako rodzaj i to, czego sprawa dotyczy. */
async function toDo(userId: string): Promise<string[]> {
  return (await testbed.registry.as(userId).inbox()).toDo.map(describeItem);
}

function describeItem(item: ToDoItem): string {
  switch (item.kind) {
    case "zgloszenie_narzedzia":
      return `${item.kind} ${item.report.code}`;
    case "zgloszenie":
      return `${item.kind} ${item.issue.description}`;
    case "ruch_odrzucony":
      return `${item.kind} ${item.rejection.tools.map((tool) => tool.code).join(",")}`;
    case "brak_wyjscia":
      return `${item.kind} ${item.punch.person.fullName}`;
    case "odbicie":
      return `${item.kind} ${item.punch.person.fullName}`;
    case "konflikt_odbicia":
      return `${item.kind} ${item.conflict.person.fullName}`;
    case "alarm":
      return `${item.kind} ${item.location.name} ${item.tools}`;
    case "termin":
      return `${item.kind} ${item.deadline.tool?.code ?? item.deadline.location.name} ${item.deadline.kind}`;
    case "uprawnienie":
      return `${item.kind} ${item.qualification.person.fullName} ${item.qualification.kind}`;
  }
}

async function everyone(z: Zawbud) {
  return {
    owner: await toDo(z.ownerId),
    nowak: await toDo(z.nowakId),
    kowalski: await toDo(z.kowalskiId),
    ewa: await toDo(z.ewaId),
    jan: await toDo(z.janId),
  };
}

const nothing = { owner: [], nowak: [], kowalski: [], ewa: [], jan: [] };

describe("skrzynka: przypisanie rodzajów powiadomień", () => {
  it("raporty, potwierdzenia i ostrzeżenia o abonamencie są w „Informacjach”, sprawy do załatwienia w „Do zrobienia”", () => {
    const lists = (kinds: NotificationKind[]) => Object.fromEntries(kinds.map((kind) => [kind, inboxList(kind)]));

    expect(
      lists([
        "narzedzia_zabrane",
        "raport_tygodniowy",
        "raport_piatkowy",
        "sprzet_wynajety",
        "tylko_do_odczytu_wkrotce",
        "tylko_do_odczytu",
        "prog_przekroczony",
        "progi_przekroczone",
        "ruch_odrzucony",
        "terminy",
        "uprawnienia",
        "przypomnienie_wyjscia",
      ]),
    ).toEqual({
      narzedzia_zabrane: "informacje",
      raport_tygodniowy: "informacje",
      raport_piatkowy: "informacje",
      sprzet_wynajety: "informacje",
      tylko_do_odczytu_wkrotce: "informacje",
      tylko_do_odczytu: "informacje",
      prog_przekroczony: "do_zrobienia",
      progi_przekroczone: "do_zrobienia",
      ruch_odrzucony: "do_zrobienia",
      terminy: "do_zrobienia",
      uprawnienia: "do_zrobienia",
      przypomnienie_wyjscia: "do_zrobienia",
    });
  });

  it("nowa firma: obie listy puste, licznik zero", async () => {
    const z = await givenZawbud();

    expect(await z.owner.inbox()).toEqual({ toDo: [], toDoCount: 0, info: [] });
    expect(await everyone(z)).toEqual(nothing);
  });
});

describe("skrzynka: zgłoszenia narzędzi do akceptacji", () => {
  it("narzędzie zgłoszone przez Nowaka czeka u właściciela, a po akceptacji znika", async () => {
    const z = await givenZawbud();
    const { toolId } = await testbed.registry.as(z.nowakId).reportTool({ operationId: randomUUID(), siteId: z.ratajeId, name: "Szlifierka Bosch", categoryId: z.grinders.id });

    expect(await everyone(z)).toEqual({ ...nothing, owner: ["zgloszenie_narzedzia S-03"] });
    expect((await z.owner.inbox()).toDoCount).toBe(1);

    await z.owner.acceptToolReport({ toolId, value: 450 });

    expect(await everyone(z)).toEqual(nothing);
  });
});

describe("skrzynka: usterki i braki", () => {
  it("usterka Jana: właściciel ma ją do załatwienia, kierownik budowy i magazynierka do przeczytania, a Jan odpowiedź", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);
    const jan = testbed.registry.as(z.janId);
    const { issueId } = await jan.fileIssue({ operationId: randomUUID(), kind: "uszkodzenie", description: "Pęknięta tarcza", toolId: z.s01 });

    expect(await everyone(z)).toEqual({
      ...nothing,
      owner: ["zgloszenie Pęknięta tarcza"],
      nowak: ["zgloszenie Pęknięta tarcza"],
      ewa: ["zgloszenie Pęknięta tarcza"],
    });

    // Kierownik i magazynierka nie zamkną zgłoszenia: po przeczytaniu nic na nich nie czeka. Właściciel zamyka.
    await testbed.registry.as(z.nowakId).markIssueRead(issueId);
    await testbed.registry.as(z.ewaId).markIssueRead(issueId);
    await z.owner.markIssueRead(issueId);
    expect(await everyone(z)).toEqual({ ...nothing, owner: ["zgloszenie Pęknięta tarcza"] });

    await z.owner.closeIssue({ operationId: randomUUID(), issueId, comment: "Nowa tarcza w magazynie", toolWorking: true });

    // Odpowiedź (zamknięcie) czeka na przeczytanie u autora i u tych, którzy zgłoszenie widzą.
    expect(await toDo(z.ownerId)).toEqual([]);
    expect(await toDo(z.janId)).toEqual(["zgloszenie Pęknięta tarcza"]);
    await jan.markIssueRead(issueId);
    expect(await toDo(z.janId)).toEqual([]);
  });

  it("magazynierka, której właściciel pozwolił zamykać, ma otwarte zgłoszenie do załatwienia aż do zamknięcia", async () => {
    const z = await givenZawbud();
    await z.owner.updateSettings({ issueVisibility: { siteManagers: false, storekeepers: true, storekeepersClose: true } });
    const ewa = testbed.registry.as(z.ewaId);
    const { issueId } = await testbed.registry
      .as(z.janId)
      .fileIssue({ operationId: randomUUID(), kind: "brak", description: "Brak przedłużacza", locationId: z.ratajeId });
    await ewa.markIssueRead(issueId);

    expect(await everyone(z)).toEqual({ ...nothing, owner: ["zgloszenie Brak przedłużacza"], ewa: ["zgloszenie Brak przedłużacza"] });

    await ewa.closeIssue({ operationId: randomUUID(), issueId, comment: "Przedłużacz wydany" });

    expect(await toDo(z.ewaId)).toEqual([]);
    expect(await toDo(z.ownerId)).toEqual(["zgloszenie Brak przedłużacza"]);
  });
});

describe("skrzynka: ruchy offline odrzucone przez serwer", () => {
  it("odrzucony ruch Ewy czeka tylko u niej i znika po „Wyjaśnione”", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);
    const ewa = testbed.registry.as(z.ewaId);
    const result = await ewa.registerQueuedMovement({
      operationId: randomUUID(),
      kind: "wydanie",
      fromLocationId: z.baseId,
      toLocationId: z.winogradyId,
      toolIds: [z.s01],
      source: "checklista",
      occurredAt: new Date(testbed.clock.now().getTime() - HOUR),
    });
    if (result.status !== "rejected") throw new Error("ruch miał być odrzucony");

    expect(await everyone(z)).toEqual({ ...nothing, ewa: ["ruch_odrzucony S-01"] });
    // Powiadomienie o odrzuconym ruchu nie jest osobną informacją: sprawa jest w „Do zrobienia”.
    expect((await ewa.inbox()).info).toEqual([]);

    await ewa.resolveRejectedMovement(result.rejection.id);

    expect(await everyone(z)).toEqual(nothing);
  });
});

describe("skrzynka: odbicia", () => {
  it("odbicie poza budową czeka u właściciela i kierownika tej budowy i znika po wyjaśnieniu", async () => {
    const z = await givenZawbud();
    const outcome = await punch(z.janId, z.posters.rataje, AT_WINOGRADY);
    if (outcome.action !== "wejscie") throw new Error("miało być wejście");

    expect(await everyone(z)).toEqual({ ...nothing, owner: ["odbicie Jan Mazur"], nowak: ["odbicie Jan Mazur"] });

    await testbed.registry.as(z.nowakId).explainPunch({ punchId: outcome.punch.id, note: "GPS w piwnicy" });

    expect(await everyone(z)).toEqual(nothing);
  });

  it("skan offline z zakończonej budowy czeka u właściciela i kierownika tej budowy i znika po wyjaśnieniu", async () => {
    const z = await givenZawbud();
    const scannedAt = testbed.clock.now();
    await z.owner.closeSite(z.ratajeId);
    testbed.clock.advance(HOUR);
    const result = await testbed.registry
      .as(z.janId)
      .registerQueuedPunch({ operationId: randomUUID(), posterToken: z.posters.rataje, position: AT_RATAJE, scannedAt });
    if (result.status !== "rejected") throw new Error("skan miał trafić do wyjaśnienia");

    expect(await everyone(z)).toEqual({ ...nothing, owner: ["konflikt_odbicia Jan Mazur"], nowak: ["konflikt_odbicia Jan Mazur"] });

    await z.owner.explainPunchConflict({ conflictId: result.conflict.id, note: "Budowa zamknięta rano" });

    expect(await everyone(z)).toEqual(nothing);
  });

  it("od 18:00 nieodbite wyjście czeka u tego, kto odbił wejście, a znika po odbiciu wyjścia", async () => {
    const z = await givenZawbud();
    await punch(z.janId, z.posters.rataje, AT_RATAJE);
    testbed.clock.advance(11 * HOUR);
    await testbed.registry.system().notifyForgottenExits();

    expect(await everyone(z)).toEqual({ ...nothing, jan: ["brak_wyjscia Jan Mazur"] });
    expect((await testbed.registry.as(z.janId).inbox()).info).toEqual([]);

    await punch(z.janId, z.posters.rataje, AT_RATAJE, true);

    expect(await everyone(z)).toEqual(nothing);
  });
});

describe("skrzynka: terminy", () => {
  it("przegląd szlifierki na Ratajach za 5 dni: właściciel, kierownik budowy i magazynierka; po wykonaniu znika", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);
    const { deadlineId } = await z.owner.addDeadline({ toolId: z.s01, kind: "przeglad", dueOn: "2026-03-07", cycleMonths: 6, note: "" });
    await z.owner.addDeadline({ toolId: z.s02, kind: "przeglad", dueOn: "2026-03-20", cycleMonths: 6, note: "" });

    expect(await everyone(z)).toEqual({
      ...nothing,
      owner: ["termin S-01 przeglad"],
      nowak: ["termin S-01 przeglad"],
      ewa: ["termin S-01 przeglad"],
    });
    expect((await z.owner.inbox()).toDo).toEqual([
      { kind: "termin", deadline: expect.objectContaining({ dueOn: "2026-03-07", overdue: false, location: expect.objectContaining({ id: z.ratajeId }) }) },
    ]);

    await testbed.registry.as(z.ewaId).completeDeadline({ operationId: randomUUID(), deadlineId, doneOn: "2026-03-02" });

    expect(await everyone(z)).toEqual(nothing);
  });

  it("termin po terminie jest oznaczony; OC pojazdu 20 dni przed ma właściciel i kierownik pojazdu, a magazynierka nie", async () => {
    const z = await givenZawbud();
    await z.owner.addDeadline({ toolId: z.s01, kind: "kalibracja", dueOn: "2026-02-20", cycleMonths: 12, note: "" });
    const { locationId: vanId } = await z.owner.addVehicle({ name: "Bus Ducato", managerId: z.kowalskiId });
    await z.owner.addDeadline({ vehicleId: vanId, kind: "oc", dueOn: "2026-03-22", cycleMonths: 12, note: "" });

    expect(await everyone(z)).toEqual({
      ...nothing,
      owner: ["termin S-01 kalibracja", "termin Bus Ducato oc"],
      kowalski: ["termin Bus Ducato oc"],
      ewa: ["termin S-01 kalibracja"],
    });
    expect((await z.owner.inbox()).toDo[0]).toMatchObject({ deadline: { overdue: true } });
  });
});

describe("skrzynka: alarmy", () => {
  it("narzędzie na Ratajach ponad próg dni: alarm u właściciela i Nowaka, po zwrocie na bazę znika", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01, z.s02]);
    testbed.clock.advance(12 * DAY);
    await testbed.registry.system().notifyExceededThresholds();

    expect(await everyone(z)).toEqual({ ...nothing, owner: ["alarm Rataje 2"], nowak: ["alarm Rataje 2"] });
    // Powiadomienia o progu są tylko w „Do zrobienia”, jako alarm budowy.
    expect((await z.owner.inbox()).info).toEqual([]);
    expect((await testbed.registry.as(z.nowakId).inbox()).toDoCount).toBe(1);
    expect(await testbed.registry.as(z.nowakId).toDoCount()).toBe(1);

    await move(z.nowakId, "zwrot", z.ratajeId, z.baseId, [z.s01, z.s02]);

    expect(await everyone(z)).toEqual(nothing);
  });
});

describe("skrzynka: uprawnienia", () => {
  it("badania Jana kończą się za 10 dni: ma je Jan i właściciel, a kierownik nie; po odnowieniu znikają", async () => {
    const z = await givenZawbud();
    const janPerson = await z.personOf(z.janId);
    const { qualificationId } = await z.owner.addQualification({ personId: janPerson, kind: "szkolenie_bhp", dueOn: "2026-03-12", cycleMonths: 12 });
    await z.owner.addQualification({ personId: await z.personOf(z.ewaId), kind: "szkolenie_bhp", dueOn: "2026-06-12", cycleMonths: 12 });

    expect(await everyone(z)).toEqual({ ...nothing, owner: ["uprawnienie Jan Mazur szkolenie_bhp"], jan: ["uprawnienie Jan Mazur szkolenie_bhp"] });

    await z.owner.completeQualification({ operationId: randomUUID(), qualificationId, doneOn: "2026-03-02" });

    expect(await everyone(z)).toEqual(nothing);
  });
});

describe("skrzynka: informacje i licznik", () => {
  it("zabrany sprzęt jest w „Informacjach” Kowalskiego i nie liczy się do licznika; przeczytany zostaje", async () => {
    const z = await givenZawbud();
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s01]);
    await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01]);
    const kowalski = testbed.registry.as(z.kowalskiId);

    const inbox = await kowalski.inbox();

    expect(inbox.toDo).toEqual([]);
    expect(inbox.toDoCount).toBe(0);
    expect(inbox.info).toEqual([
      { id: expect.any(String), createdAt: testbed.clock.now(), read: false, notification: expect.objectContaining({ kind: "narzedzia_zabrane" }) },
    ]);

    await kowalski.markNotificationRead(inbox.info[0].id);

    expect((await kowalski.inbox()).info).toEqual([expect.objectContaining({ read: true })]);
  });

  it("raporty są w „Informacjach”: tygodniowy u właściciela, piątkowy u właściciela i kierownika; licznik ich nie liczy", async () => {
    const z = await givenZawbud();
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);
    await testbed.registry.system().sendDueReports();
    testbed.clock.set(new Date("2026-03-06T16:05:00+01:00"));
    await testbed.registry.system().sendDueReports();
    const infoKinds = async (userId: string) => (await testbed.registry.as(userId).inbox()).info.map((entry) => entry.notification.kind);

    expect(await infoKinds(z.ownerId)).toEqual(["raport_piatkowy", "raport_tygodniowy"]);
    expect(await infoKinds(z.nowakId)).toEqual(["raport_piatkowy"]);
    expect(await infoKinds(z.kowalskiId)).toEqual([]);
    expect(await infoKinds(z.janId)).toEqual([]);
    expect((await z.owner.inbox()).toDoCount).toBe(0);
  });

  it("licznik liczy wszystkie sprawy „Do zrobienia”, w kolejności: ruchy, zgłoszenia narzędzi, zgłoszenia, odbicia, alarmy, terminy, uprawnienia", async () => {
    const z = await givenZawbud();
    await move(z.ownerId, "wydanie", z.baseId, z.ratajeId, [z.s01]);
    await z.owner.addDeadline({ toolId: z.s02, kind: "przeglad", dueOn: "2026-02-27", cycleMonths: 6, note: "" });
    await z.owner.addQualification({ personId: await z.personOf(z.janId), kind: "szkolenie_bhp", dueOn: "2026-03-12", cycleMonths: 12 });
    await testbed.registry.as(z.janId).fileIssue({ operationId: randomUUID(), kind: "inne", description: "Brak wody", locationId: z.ratajeId });
    await punch(z.janId, z.posters.rataje, AT_WINOGRADY);
    await testbed.registry.as(z.nowakId).reportTool({ operationId: randomUUID(), siteId: z.ratajeId, name: "Szlifierka Bosch", categoryId: z.grinders.id });
    testbed.clock.advance(12 * DAY);

    const inbox = await z.owner.inbox();

    expect(inbox.toDo.map(describeItem)).toEqual([
      "zgloszenie_narzedzia S-03",
      "zgloszenie Brak wody",
      "odbicie Jan Mazur",
      "alarm Rataje 2",
      "termin S-02 przeglad",
      "uprawnienie Jan Mazur szkolenie_bhp",
    ]);
    expect(inbox.toDoCount).toBe(6);
  });

  it("sprawy innej firmy nie trafiają do skrzynki", async () => {
    const z = await givenZawbud();
    await testbed.registry.as(z.janId).fileIssue({ operationId: randomUUID(), kind: "inne", description: "Brak wody", locationId: z.ratajeId });
    const budrex = await testbed.givenActiveCompany("Budrex");

    expect(await testbed.registry.as(budrex.ownerId).inbox()).toEqual({ toDo: [], toDoCount: 0, info: [] });
  });
});
