import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();

const HOUR = 60 * 60 * 1000;
const RATAJE = { lat: 52.3925, lng: 16.9516 };
const WINOGRADY = { lat: 52.4302, lng: 16.9301 };
const FRANOWO = { lat: 52.4038, lng: 16.9861 };
const ON_SITE = (place: { lat: number; lng: number }) => ({ ...place, accuracy: 15 });

/**
 * Zawbud, marzec 2026: baza Franowo z adresem, budowa Rataje kierownika Nowaka i Winogrady kierownika Kowalskiego,
 * pracownik Jan Mazur i magazynier Ewa Wiśniewska.
 */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Baza Franowo" });
  const owner = testbed.registry.as(zawbud.ownerId);
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const kowalskiId = await testbed.givenMember(zawbud, "kierownik", "Piotr Kowalski");
  const janId = await testbed.givenMember(zawbud, "pracownik", "Jan Mazur");
  const ewaId = await testbed.givenMember(zawbud, "magazynier", "Ewa Wiśniewska");
  testbed.geocoder.knows("ul. Piłsudskiego 12, Poznań", RATAJE);
  testbed.geocoder.knows("os. Wichrowe 3, Poznań", WINOGRADY);
  testbed.geocoder.knows("ul. Gnieźnieńska 1, Poznań", FRANOWO);
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", managerId: nowakId });
  const { locationId: winogradyId } = await owner.addSite({ name: "Winogrady", address: "os. Wichrowe 3, Poznań", managerId: kowalskiId });
  await owner.setBaseAddress("ul. Gnieźnieńska 1, Poznań");
  const { base } = await owner.locations();
  const places = {
    rataje: { token: (await owner.poster(ratajeId)).code, position: ON_SITE(RATAJE) },
    winogrady: { token: (await owner.poster(winogradyId)).code, position: ON_SITE(WINOGRADY) },
    base: { token: (await owner.poster(base.id)).code, position: ON_SITE(FRANOWO) },
  };
  return { zawbud, owner, nowakId, kowalskiId, janId, ewaId, ratajeId, winogradyId, baseId: base.id, places };
}

type Zawbud = Awaited<ReturnType<typeof givenZawbud>>;
type Place = Zawbud["places"]["rataje"];

/** Skan plakatu przez aktora o godzinie `at` (czas polski); wyjście z tej samej budowy od razu potwierdzone. */
async function scan(actorId: string, place: Place, at: string) {
  testbed.clock.set(at);
  const registry = testbed.registry.as(actorId);
  const input = { operationId: randomUUID(), posterToken: place.token, position: place.position };
  const outcome = await registry.punch(input);
  if (outcome.action === "potwierdz_wyjscie") return registry.punch({ ...input, operationId: randomUUID(), confirmExit: true });
  return outcome;
}

describe("czas na budowie: zestawienie miesięczne", () => {
  it("suma osoby na budowie to czas od wejścia do wyjścia z każdego odbicia w miesiącu", async () => {
    const z = await givenZawbud();
    await scan(z.janId, z.places.rataje, "2026-03-02T07:00:00+01:00");
    await scan(z.janId, z.places.rataje, "2026-03-02T15:30:00+01:00");
    await scan(z.janId, z.places.rataje, "2026-03-03T07:00:00+01:00");
    await scan(z.janId, z.places.rataje, "2026-03-03T15:00:00+01:00");

    const summary = await z.owner.timeOnSiteSummary("2026-03");

    expect(summary).toEqual({
      month: "2026-03",
      places: [{ place: { id: z.ratajeId, kind: "budowa", name: "Rataje" }, timeMs: 16.5 * HOUR }],
      people: [{ person: { id: expect.any(String), fullName: "Jan Mazur" }, timeMs: 16.5 * HOUR, byPlace: [16.5 * HOUR], withoutExit: 0 }],
      timeMs: 16.5 * HOUR,
    });
  });

  it("odbicie „bez wyjścia” nie liczy się do sumy, dopóki kierownik nie uzupełni wyjścia", async () => {
    const z = await givenZawbud();
    await scan(z.janId, z.places.rataje, "2026-03-02T07:00:00+01:00");
    testbed.clock.set("2026-03-03T00:10:00+01:00");
    await testbed.registry.system().closeForgottenExits();

    expect((await z.owner.timeOnSiteSummary("2026-03")).people).toEqual([
      { person: { id: expect.any(String), fullName: "Jan Mazur" }, timeMs: 0, byPlace: [0], withoutExit: 1 },
    ]);

    const [forgotten] = await z.owner.punchesToClarify();
    await testbed.registry
      .as(z.nowakId)
      .correctPunch({ punchId: forgotten.id, leftAt: new Date("2026-03-02T15:00:00+01:00"), reason: "Wyszedł o 15, potwierdził brygadzista" });

    expect(await z.owner.timeOnSiteSummary("2026-03")).toMatchObject({
      places: [{ place: { name: "Rataje" }, timeMs: 8 * HOUR }],
      people: [{ person: { fullName: "Jan Mazur" }, timeMs: 8 * HOUR, byPlace: [8 * HOUR], withoutExit: 0 }],
      timeMs: 8 * HOUR,
    });
  });

  it("przejście daje osobne wpisy na obu budowach, a dojazd między wyjściem a wejściem nie liczy się nigdzie", async () => {
    const z = await givenZawbud();
    // 2 marca Jan przechodzi z Rataj na Winogrady jednym skanem.
    await scan(z.janId, z.places.rataje, "2026-03-02T07:00:00+01:00");
    await scan(z.janId, z.places.winogrady, "2026-03-02T11:00:00+01:00");
    await scan(z.janId, z.places.winogrady, "2026-03-02T15:00:00+01:00");
    // 3 marca odbija wyjście z Rataj o 10:00 i po godzinie jazdy wejście na Winogrady.
    await scan(z.janId, z.places.rataje, "2026-03-03T07:00:00+01:00");
    await scan(z.janId, z.places.rataje, "2026-03-03T10:00:00+01:00");
    await scan(z.janId, z.places.winogrady, "2026-03-03T11:00:00+01:00");
    await scan(z.janId, z.places.winogrady, "2026-03-03T15:00:00+01:00");

    expect(await z.owner.timeOnSiteSummary("2026-03")).toMatchObject({
      places: [
        { place: { name: "Rataje" }, timeMs: 7 * HOUR },
        { place: { name: "Winogrady" }, timeMs: 8 * HOUR },
      ],
      people: [{ person: { fullName: "Jan Mazur" }, timeMs: 15 * HOUR, byPlace: [7 * HOUR, 8 * HOUR] }],
      timeMs: 15 * HOUR,
    });
  });

  it("odbicie przez granicę miesiąca liczy się w każdym miesiącu tylko w swojej części, po czasie polskim", async () => {
    const z = await givenZawbud();
    await scan(z.janId, z.places.rataje, "2026-03-31T22:00:00+02:00");
    await scan(z.janId, z.places.rataje, "2026-04-01T06:00:00+02:00");

    expect((await z.owner.timeOnSiteSummary("2026-03")).timeMs).toBe(2 * HOUR);
    expect((await z.owner.timeOnSiteSummary("2026-04")).timeMs).toBe(6 * HOUR);
    expect((await z.owner.timeOnSiteSummary("2026-02")).people).toEqual([]);
  });

  it("zestawienie ma osoby po imieniu i nazwisku i miejsca po nazwie, a osoba bez konta odbita przez kierownika też ma czas", async () => {
    const z = await givenZawbud();
    const { personId: wojtekId } = await z.owner.addPerson({ fullName: "Wojciech Lis", note: "Bez telefonu" });
    testbed.clock.set("2026-03-02T07:00:00+01:00");
    const nowak = testbed.registry.as(z.nowakId);
    const brigade = () => ({ posterToken: z.places.rataje.token, position: z.places.rataje.position });
    await nowak.punchPeople({ ...brigade(), people: [{ personId: wojtekId, operationId: randomUUID() }] });
    await scan(z.ewaId, z.places.base, "2026-03-02T07:00:00+01:00");
    await scan(z.janId, z.places.winogrady, "2026-03-02T07:00:00+01:00");
    testbed.clock.set("2026-03-02T15:00:00+01:00");
    await nowak.punchPeople({ ...brigade(), people: [{ personId: wojtekId, operationId: randomUUID(), confirmExit: true }] });
    await scan(z.ewaId, z.places.base, "2026-03-02T15:00:00+01:00");
    await scan(z.janId, z.places.winogrady, "2026-03-02T16:00:00+01:00");

    const summary = await z.owner.timeOnSiteSummary("2026-03");

    expect(summary.places.map((entry) => entry.place.name)).toEqual(["Baza Franowo", "Rataje", "Winogrady"]);
    expect(summary.people.map((entry) => [entry.person.fullName, entry.byPlace])).toEqual([
      ["Ewa Wiśniewska", [8 * HOUR, 0, 0]],
      ["Jan Mazur", [0, 0, 9 * HOUR]],
      ["Wojciech Lis", [0, 8 * HOUR, 0]],
    ]);
    expect(summary.timeMs).toBe(25 * HOUR);
  });

  it("zły miesiąc to błąd", async () => {
    const z = await givenZawbud();

    await expect(z.owner.timeOnSiteSummary("2026-13")).rejects.toMatchObject({ code: "invalid_input" });
    await expect(z.owner.timeOnSiteSummary("marzec")).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("osoba odbita teraz nie ma jeszcze czasu w zestawieniu", async () => {
    const z = await givenZawbud();
    await scan(z.janId, z.places.rataje, "2026-03-02T07:00:00+01:00");
    testbed.clock.set("2026-03-02T12:00:00+01:00");

    expect(await z.owner.timeOnSiteSummary("2026-03")).toEqual({ month: "2026-03", places: [], people: [], timeMs: 0 });
  });
});

describe("czas na budowie: kto co widzi", () => {
  /** 2 marca: Jan na Ratajach Nowaka, Ewa na bazie, a Nowak sam 2 godziny na Winogradach Kowalskiego i 6 na Ratajach. */
  async function givenMarchDay() {
    const z = await givenZawbud();
    await scan(z.janId, z.places.rataje, "2026-03-02T07:00:00+01:00");
    await scan(z.ewaId, z.places.base, "2026-03-02T07:00:00+01:00");
    await scan(z.nowakId, z.places.winogrady, "2026-03-02T07:00:00+01:00");
    await scan(z.nowakId, z.places.rataje, "2026-03-02T09:00:00+01:00");
    await scan(z.janId, z.places.rataje, "2026-03-02T15:00:00+01:00");
    await scan(z.ewaId, z.places.base, "2026-03-02T15:00:00+01:00");
    await scan(z.nowakId, z.places.rataje, "2026-03-02T15:00:00+01:00");
    return z;
  }

  it("właściciel widzi wszystkie budowy i bazę", async () => {
    const z = await givenMarchDay();

    const summary = await z.owner.timeOnSiteSummary("2026-03");

    expect(summary.places.map((entry) => entry.place.name)).toEqual(["Baza Franowo", "Rataje", "Winogrady"]);
    expect(summary.timeMs).toBe(24 * HOUR);
  });

  it("kierownik widzi tylko budowy, których jest kierownikiem, także bez własnego czasu na cudzej budowie", async () => {
    const z = await givenMarchDay();

    const summary = await testbed.registry.as(z.nowakId).timeOnSiteSummary("2026-03");

    expect(summary).toMatchObject({
      places: [{ place: { name: "Rataje" }, timeMs: 14 * HOUR }],
      people: [
        { person: { fullName: "Adam Nowak" }, byPlace: [6 * HOUR] },
        { person: { fullName: "Jan Mazur" }, byPlace: [8 * HOUR] },
      ],
    });
    expect((await testbed.registry.as(z.kowalskiId).timeOnSiteSummary("2026-03")).people).toEqual([
      expect.objectContaining({ person: expect.objectContaining({ fullName: "Adam Nowak" }), timeMs: 2 * HOUR }),
    ]);
  });

  it("pracownik i magazynier nie mają zestawienia firmy", async () => {
    const z = await givenMarchDay();

    await expect(testbed.registry.as(z.janId).timeOnSiteSummary("2026-03")).rejects.toMatchObject({ code: "forbidden" });
    await expect(testbed.registry.as(z.ewaId).timeOnSiteSummary("2026-03")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("pracownik widzi własne odbicia i sumy w bieżącym i poprzednim miesiącu, bez starszych i bez cudzych", async () => {
    const z = await givenZawbud();
    await scan(z.janId, z.places.rataje, "2026-02-27T07:00:00+01:00");
    await scan(z.janId, z.places.rataje, "2026-02-27T15:00:00+01:00");
    await scan(z.janId, z.places.rataje, "2026-03-30T07:00:00+02:00");
    await scan(z.janId, z.places.winogrady, "2026-03-30T12:00:00+02:00");
    await scan(z.janId, z.places.winogrady, "2026-03-30T15:30:00+02:00");
    await scan(z.ewaId, z.places.base, "2026-04-01T07:00:00+02:00");
    await scan(z.ewaId, z.places.base, "2026-04-01T15:00:00+02:00");
    await scan(z.janId, z.places.rataje, "2026-04-01T07:00:00+02:00");
    await scan(z.janId, z.places.rataje, "2026-04-01T13:00:00+02:00");
    await scan(z.janId, z.places.rataje, "2026-04-02T07:00:00+02:00");
    testbed.clock.set("2026-04-02T09:00:00+02:00");

    const [april, march] = await testbed.registry.as(z.janId).ownTimeOnSite();

    expect(april).toMatchObject({
      month: "2026-04",
      timeMs: 6 * HOUR,
      places: [{ place: { name: "Rataje" }, timeMs: 6 * HOUR }],
      withoutExit: 0,
    });
    expect(april.punches.map((entry) => [entry.place.name, entry.enteredAt, entry.leftAt])).toEqual([
      ["Rataje", new Date("2026-04-02T07:00:00+02:00"), null],
      ["Rataje", new Date("2026-04-01T07:00:00+02:00"), new Date("2026-04-01T13:00:00+02:00")],
    ]);
    expect(march).toMatchObject({
      month: "2026-03",
      timeMs: 8.5 * HOUR,
      places: [
        { place: { name: "Rataje" }, timeMs: 5 * HOUR },
        { place: { name: "Winogrady" }, timeMs: 3.5 * HOUR },
      ],
    });
    expect(march.punches.map((entry) => entry.place.name)).toEqual(["Winogrady", "Rataje"]);
    expect((await testbed.registry.as(z.ewaId).ownTimeOnSite())[0]).toMatchObject({ month: "2026-04", timeMs: 8 * HOUR });
  });

  it("zestawienie i własny czas działają w trybie tylko do odczytu", async () => {
    const z = await givenMarchDay();
    testbed.clock.set("2026-05-15T12:00:00+02:00");
    const adminId = await testbed.givenSuperAdmin();
    await testbed.registry.superAdmin(adminId).setManualReadOnly(z.zawbud.companyId, true);
    expect((await z.owner.session())!.company.readOnly).toBe(true);

    expect((await z.owner.timeOnSiteSummary("2026-03")).timeMs).toBe(24 * HOUR);
    expect(await testbed.registry.as(z.janId).ownTimeOnSite()).toMatchObject([{ month: "2026-05" }, { month: "2026-04" }]);
  });
});
