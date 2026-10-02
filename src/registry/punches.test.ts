import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PhonePosition, PunchOutcome } from "./registry";
import { withActor } from "./registry";
import { setupRegistryTestbed, START } from "./testing/harness";

const testbed = setupRegistryTestbed();

const RATAJE = { lat: 52.3925, lng: 16.9516 };
const WINOGRADY = { lat: 52.4302, lng: 16.9301 };
const FRANOWO = { lat: 52.4038, lng: 16.9861 };
const EARTH_RADIUS_M = 6_371_008.8;

/** Telefon `meters` na północ od punktu, z dokładnością GPS 15 m. */
function north(of: { lat: number; lng: number }, meters: number): PhonePosition {
  return { lat: of.lat + (meters / EARTH_RADIUS_M) * (180 / Math.PI), lng: of.lng, accuracy: 15 };
}

/**
 * Zawbud, 2 marca 2026: baza Franowo z adresem, budowa Rataje kierownika Nowaka, Winogrady kierownika Kowalskiego
 * i Kórnik (adresu nie znaleziono, więc bez położenia), pracownik Jan Mazur i magazynier Ewa Wiśniewska.
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
  const { locationId: kornikId } = await owner.addSite({ name: "Kórnik", address: "dz. nr 123/4, Kórnik", managerId: nowakId });
  await owner.setBaseAddress("ul. Gnieźnieńska 1, Poznań");
  const { base } = await owner.locations();
  const tokens = {
    rataje: (await owner.poster(ratajeId)).code,
    winogrady: (await owner.poster(winogradyId)).code,
    kornik: (await owner.poster(kornikId)).code,
    base: (await owner.poster(base.id)).code,
  };
  return { zawbud, owner, nowakId, kowalskiId, janId, ewaId, ratajeId, winogradyId, kornikId, baseId: base.id, tokens };
}

type Zawbud = Awaited<ReturnType<typeof givenZawbud>>;

function punch(actorId: string, posterToken: string, position: PhonePosition | null, options: { confirmExit?: boolean; operationId?: string } = {}) {
  return testbed.registry.as(actorId).punch({ operationId: options.operationId ?? randomUUID(), posterToken, position, confirmExit: options.confirmExit });
}

/** Imiona i nazwiska osób odbitych teraz w miejscu, tak jak widzi je aktor. */
async function presentAt(actorId: string, locationId: string) {
  return (await testbed.registry.as(actorId).peopleOnSite(locationId)).present.map((entry) => entry.person.fullName);
}

describe("wejście, wyjście i przejście", () => {
  it("pierwszy skan plakatu zapisuje wejście od razu, z wynikiem i odległością od budowy", async () => {
    const z = await givenZawbud();

    const outcome = await punch(z.janId, z.tokens.rataje, north(RATAJE, 120));

    expect(outcome).toMatchObject({
      action: "wejscie",
      punch: {
        person: { fullName: "Jan Mazur" },
        place: { id: z.ratajeId, kind: "budowa", name: "Rataje" },
        enteredAt: testbed.clock.now(),
        entry: { result: "na_budowie", distanceM: 120 },
        leftAt: null,
        toClarify: false,
      },
    });
    expect(await presentAt(z.zawbud.ownerId, z.ratajeId)).toEqual(["Jan Mazur"]);
  });

  it("strona przed zapisem wie, co zrobi skan: wejście, pytanie „Kończysz?” na tej samej budowie i przejście na innej", async () => {
    const z = await givenZawbud();
    const jan = testbed.registry.as(z.janId);

    expect(await jan.punchPreview(z.tokens.rataje)).toEqual({ place: { id: z.ratajeId, kind: "budowa", name: "Rataje" }, action: "wejscie", from: null });
    await punch(z.janId, z.tokens.rataje, north(RATAJE, 20));

    expect(await jan.punchPreview(z.tokens.rataje)).toMatchObject({ action: "wyjscie", from: null });
    expect(await jan.punchPreview(z.tokens.winogrady)).toMatchObject({
      place: { name: "Winogrady" },
      action: "przejscie",
      from: { id: z.ratajeId, name: "Rataje" },
    });
  });

  it("skan na tej samej budowie bez potwierdzenia niczego nie zapisuje, a z potwierdzeniem zapisuje wyjście", async () => {
    const z = await givenZawbud();
    await punch(z.janId, z.tokens.rataje, north(RATAJE, 20));
    testbed.clock.advance(8 * 60 * 60 * 1000);

    expect(await punch(z.janId, z.tokens.rataje, north(RATAJE, 30))).toEqual({
      action: "potwierdz_wyjscie",
      place: { id: z.ratajeId, kind: "budowa", name: "Rataje" },
    });
    expect(await presentAt(z.zawbud.ownerId, z.ratajeId)).toEqual(["Jan Mazur"]);

    const outcome = await punch(z.janId, z.tokens.rataje, north(RATAJE, 30), { confirmExit: true });

    expect(outcome).toMatchObject({
      action: "wyjscie",
      punch: { leftAt: testbed.clock.now(), exitVia: "wyjscie", exit: { result: "na_budowie", distanceM: 30 } },
    });
    expect(await presentAt(z.zawbud.ownerId, z.ratajeId)).toEqual([]);
    const { history } = await z.owner.peopleOnSite(z.ratajeId);
    expect(history).toEqual([expect.objectContaining({ person: { id: expect.any(String), fullName: "Jan Mazur" }, leftAt: testbed.clock.now() })]);
  });

  it("skan na innej budowie zapisuje w jednym kroku wyjście z tamtej i wejście na tę, bez pytania", async () => {
    const z = await givenZawbud();
    await punch(z.janId, z.tokens.rataje, north(RATAJE, 20));
    testbed.clock.advance(3 * 60 * 60 * 1000);

    const outcome = await punch(z.janId, z.tokens.winogrady, north(WINOGRADY, 40));

    expect(outcome).toMatchObject({
      action: "przejscie",
      left: { place: { name: "Rataje" }, leftAt: testbed.clock.now(), exitVia: "przejscie", exit: null },
      punch: { place: { name: "Winogrady" }, enteredAt: testbed.clock.now(), entry: { result: "na_budowie", distanceM: 40 } },
    });
    expect(await presentAt(z.zawbud.ownerId, z.ratajeId)).toEqual([]);
    expect(await presentAt(z.zawbud.ownerId, z.winogradyId)).toEqual(["Jan Mazur"]);
  });

  it("odbija się każdy z kontem: właściciel, kierownik i magazynier na bazie", async () => {
    const z = await givenZawbud();

    await punch(z.zawbud.ownerId, z.tokens.rataje, north(RATAJE, 10));
    await punch(z.nowakId, z.tokens.rataje, north(RATAJE, 10));
    await punch(z.ewaId, z.tokens.base, north(FRANOWO, 10));

    expect(await presentAt(z.zawbud.ownerId, z.ratajeId)).toEqual(["Adam Nowak", "Właściciel Zawbud"]);
    expect(await presentAt(z.zawbud.ownerId, z.baseId)).toEqual(["Ewa Wiśniewska"]);
  });

  it("ponowne wysłanie tej samej operacji zwraca pierwotne odbicie i niczego nie dubluje", async () => {
    const z = await givenZawbud();
    const operationId = randomUUID();
    const first = await punch(z.janId, z.tokens.rataje, north(RATAJE, 20), { operationId });
    testbed.clock.advance(60_000);

    const again = await punch(z.janId, z.tokens.rataje, north(RATAJE, 20), { operationId });

    expect(again).toEqual(first);
    expect((await z.owner.peopleOnSite(z.ratajeId)).history).toHaveLength(1);
  });
});

describe("sprawdzenie położenia", () => {
  it("granica promienia: 300 m od budowy to jeszcze na budowie, 301 m już poza, a większy promień obejmuje dalsze skany", async () => {
    const z = await givenZawbud();

    expect(await punch(z.janId, z.tokens.rataje, north(RATAJE, 300))).toMatchObject({ punch: { entry: { result: "na_budowie", distanceM: 300 } } });
    expect(await punch(z.nowakId, z.tokens.rataje, north(RATAJE, 301))).toMatchObject({ punch: { entry: { result: "poza_budowa", distanceM: 301 } } });

    await z.owner.setPunchRadius(z.ratajeId, 500);
    expect((await z.owner.peopleOnSite(z.ratajeId)).radiusM).toBe(500);
    expect(await punch(z.janId, z.tokens.rataje, north(RATAJE, 450), { confirmExit: true })).toMatchObject({
      action: "wyjscie",
      punch: { exit: { result: "na_budowie", distanceM: 450 } },
    });
  });

  it("zdjęcie plakatu z domu się odbija, ale z wynikiem „poza budową” i odległością", async () => {
    const z = await givenZawbud();

    expect(await punch(z.janId, z.tokens.rataje, north(RATAJE, 12_400))).toMatchObject({
      punch: { entry: { result: "poza_budowa", distanceM: 12_400 }, toClarify: true },
    });
  });

  it("telefon bez położenia to „brak położenia”, a budowa bez położenia „bez sprawdzenia”", async () => {
    const z = await givenZawbud();

    expect(await punch(z.janId, z.tokens.rataje, null)).toMatchObject({ punch: { entry: { result: "brak_polozenia", distanceM: null }, toClarify: true } });
    expect(await punch(z.nowakId, z.tokens.kornik, north(RATAJE, 10))).toMatchObject({
      punch: { entry: { result: "bez_sprawdzenia", distanceM: null }, toClarify: true },
    });
    expect((await z.owner.peopleOnSite(z.kornikId)).positioned).toBe(false);
  });

  it("współrzędnych telefonu nie ma w żadnym wyniku ani w bazie, jest tylko odległość", async () => {
    const z = await givenZawbud();
    const position = { lat: 52.398765, lng: 16.954321, accuracy: 23.5 };
    const outcomes: PunchOutcome[] = [
      await punch(z.janId, z.tokens.rataje, position),
      await punch(z.janId, z.tokens.winogrady, position),
      await punch(z.janId, z.tokens.winogrady, position, { confirmExit: true }),
    ];
    const seen = JSON.stringify([
      outcomes,
      await z.owner.peopleOnSite(z.ratajeId),
      await z.owner.peopleOnSite(z.winogradyId),
      await z.owner.punchesToClarify(),
      await testbed.registry.as(z.janId).punchPreview(z.tokens.rataje),
    ]);
    const stored = await testbed.db.transaction((sql) => sql("select * from app.punches"));

    for (const text of [seen, JSON.stringify(stored)]) {
      for (const coordinate of ["52.398", "16.954", "23.5"]) expect(text).not.toContain(coordinate);
    }
    expect(stored).toHaveLength(2);
  });

  it("w firmie demo odbicie nie sprawdza położenia: z dowolnego miejsca to „na budowie”", async () => {
    const z = await givenZawbud();
    await testbed.registry.system().activateDemoCompany(z.zawbud.companyId);

    expect(await punch(z.janId, z.tokens.rataje, north(RATAJE, 250_000))).toMatchObject({ punch: { entry: { result: "na_budowie", distanceM: null } } });
    expect(await punch(z.nowakId, z.tokens.kornik, null)).toMatchObject({ punch: { entry: { result: "na_budowie", distanceM: null } } });
  });

  it("zły zapis położenia z telefonu to błąd, a nie odbicie", async () => {
    const z = await givenZawbud();

    await expect(punch(z.janId, z.tokens.rataje, { lat: 95, lng: 16.9, accuracy: 10 })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(punch(z.janId, z.tokens.rataje, { lat: 52.3, lng: 16.9, accuracy: Number.NaN })).rejects.toMatchObject({ code: "invalid_input" });
    expect(await presentAt(z.zawbud.ownerId, z.ratajeId)).toEqual([]);
  });
});

describe("plakat budowy", () => {
  it("„Nowy kod” unieważnia stary plakat: stary kod nie działa, nowy tak", async () => {
    const z = await givenZawbud();
    const old = z.tokens.rataje;

    await testbed.registry.as(z.nowakId).renewPosterToken(z.ratajeId);
    const renewed = (await z.owner.poster(z.ratajeId)).code;

    expect(renewed).not.toBe(old);
    await expect(testbed.registry.as(z.janId).punchPreview(old)).rejects.toMatchObject({ code: "poster_invalid" });
    await expect(punch(z.janId, old, north(RATAJE, 10))).rejects.toMatchObject({ code: "poster_invalid" });
    expect(await punch(z.janId, renewed, north(RATAJE, 10))).toMatchObject({ action: "wejscie" });
  });

  it("kod z plakatu wpisany ręcznie działa bez względu na wielkość liter, myślnik i mylone znaki", async () => {
    const z = await givenZawbud();
    const code = z.tokens.rataje;
    const typed = `${code.slice(0, 5)}-${code.slice(5)}`.toLowerCase().replaceAll("0", "o").replaceAll("1", "l");

    expect(await punch(z.janId, typed, north(RATAJE, 10))).toMatchObject({ action: "wejscie", punch: { place: { name: "Rataje" } } });
  });

  it("plakat drukuje właściciel albo kierownik tej budowy; plakat bazy tylko właściciel i tylko bazy z adresem", async () => {
    const z = await givenZawbud();

    expect(await testbed.registry.as(z.nowakId).poster(z.ratajeId)).toEqual({
      companyName: "Zawbud",
      place: { id: z.ratajeId, kind: "budowa", name: "Rataje" },
      address: "ul. Piłsudskiego 12, Poznań",
      code: z.tokens.rataje,
    });
    await expect(testbed.registry.as(z.kowalskiId).poster(z.ratajeId)).rejects.toMatchObject({ code: "forbidden" });
    await expect(testbed.registry.as(z.janId).poster(z.ratajeId)).rejects.toMatchObject({ code: "forbidden" });
    await expect(testbed.registry.as(z.ewaId).poster(z.baseId)).rejects.toMatchObject({ code: "forbidden" });
    await expect(testbed.registry.as(z.janId).renewPosterToken(z.ratajeId)).rejects.toMatchObject({ code: "forbidden" });
    await expect(testbed.registry.as(z.kowalskiId).renewPosterToken(z.ratajeId)).rejects.toMatchObject({ code: "forbidden" });

    await z.owner.setBaseAddress("");
    await expect(z.owner.poster(z.baseId)).rejects.toMatchObject({ code: "poster_no_address" });
    await expect(punch(z.ewaId, z.tokens.base, north(FRANOWO, 10))).rejects.toMatchObject({ code: "poster_no_address" });
  });

  it("promień odbicia zmienia tylko właściciel, w granicach 50–5000 m", async () => {
    const z = await givenZawbud();

    expect((await z.owner.peopleOnSite(z.ratajeId)).radiusM).toBe(300);
    await expect(testbed.registry.as(z.nowakId).setPunchRadius(z.ratajeId, 500)).rejects.toMatchObject({ code: "forbidden" });
    await expect(z.owner.setPunchRadius(z.ratajeId, 20)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(z.owner.setPunchRadius(z.ratajeId, 10_000)).rejects.toMatchObject({ code: "invalid_input" });
    await z.owner.setPunchRadius(z.baseId, 150);
    expect((await z.owner.peopleOnSite(z.baseId)).radiusM).toBe(150);
  });

  it("na zakończonej budowie nikt się już nie odbije, a plakat innej firmy nie działa", async () => {
    const z = await givenZawbud();
    await z.owner.closeSite(z.ratajeId);
    const budrex = await testbed.givenActiveCompany("Budrex");

    await expect(punch(z.janId, z.tokens.rataje, north(RATAJE, 10))).rejects.toMatchObject({ code: "site_finished" });
    await expect(punch(budrex.ownerId, z.tokens.winogrady, north(WINOGRADY, 10))).rejects.toMatchObject({ code: "poster_invalid" });
  });
});

describe("widoczność odbić", () => {
  /** Jan na Rataje, Nowak (kierownik Rataje) na Winogradach, Ewa na bazie, Kowalski na Rataje. */
  async function givenPunches(z: Zawbud) {
    await punch(z.janId, z.tokens.rataje, north(RATAJE, 10));
    await punch(z.nowakId, z.tokens.winogrady, north(WINOGRADY, 10));
    await punch(z.ewaId, z.tokens.base, north(FRANOWO, 10));
    await punch(z.kowalskiId, z.tokens.rataje, north(RATAJE, 10));
  }

  it("właściciel widzi wszystkich na każdej budowie i bazie", async () => {
    const z = await givenZawbud();
    await givenPunches(z);

    expect(await presentAt(z.zawbud.ownerId, z.ratajeId)).toEqual(["Jan Mazur", "Piotr Kowalski"]);
    expect(await presentAt(z.zawbud.ownerId, z.winogradyId)).toEqual(["Adam Nowak"]);
    expect(await presentAt(z.zawbud.ownerId, z.baseId)).toEqual(["Ewa Wiśniewska"]);
  });

  it("kierownik widzi odbicia na swoich budowach i własne, a na cudzej budowie nikogo innego", async () => {
    const z = await givenZawbud();
    await givenPunches(z);

    expect(await presentAt(z.nowakId, z.ratajeId)).toEqual(["Jan Mazur", "Piotr Kowalski"]);
    expect(await presentAt(z.nowakId, z.winogradyId)).toEqual(["Adam Nowak"]);
    expect(await presentAt(z.kowalskiId, z.winogradyId)).toEqual(["Adam Nowak"]);
    expect(await presentAt(z.kowalskiId, z.ratajeId)).toEqual(["Piotr Kowalski"]);
    expect(await presentAt(z.nowakId, z.baseId)).toEqual([]);
  });

  it("pracownik i magazynier widzą tylko własne odbicia", async () => {
    const z = await givenZawbud();
    await givenPunches(z);

    expect(await presentAt(z.janId, z.ratajeId)).toEqual(["Jan Mazur"]);
    expect(await presentAt(z.janId, z.winogradyId)).toEqual([]);
    expect(await presentAt(z.ewaId, z.ratajeId)).toEqual([]);
    expect(await presentAt(z.ewaId, z.baseId)).toEqual(["Ewa Wiśniewska"]);
  });

  it("pojazdu, serwisu ani budowy innej firmy nie ma wśród miejsc z odbiciami", async () => {
    const z = await givenZawbud();
    const { locationId: busId } = await z.owner.addVehicle({ name: "Bus WX 12345", managerId: z.nowakId });
    const budrex = await testbed.givenActiveCompany("Budrex");

    await expect(z.owner.peopleOnSite(busId)).rejects.toMatchObject({ code: "not_found" });
    await expect(testbed.registry.as(budrex.ownerId).peopleOnSite(z.ratajeId)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("odbicia do wyjaśnienia", () => {
  /** Jan z domu na Rataje, Kowalski bez GPS na Rataje, Jan potem bez GPS przechodzi na Winogrady, Nowak w Kórniku. */
  async function givenFlagged(z: Zawbud) {
    await punch(z.janId, z.tokens.rataje, north(RATAJE, 8_000));
    await punch(z.kowalskiId, z.tokens.rataje, null);
    await punch(z.nowakId, z.tokens.kornik, north(RATAJE, 10));
    await punch(z.ewaId, z.tokens.base, north(FRANOWO, 10));
  }

  it("właściciel widzi wszystkie odbicia z wynikiem innym niż „na budowie”, a kierownik tylko na swoich budowach i bez własnych", async () => {
    const z = await givenZawbud();
    await givenFlagged(z);

    const forOwner = await z.owner.punchesToClarify();
    expect(forOwner.map((entry) => [entry.person.fullName, entry.place.name, entry.entry.result])).toEqual([
      ["Adam Nowak", "Kórnik", "bez_sprawdzenia"],
      ["Piotr Kowalski", "Rataje", "brak_polozenia"],
      ["Jan Mazur", "Rataje", "poza_budowa"],
    ]);
    expect((await testbed.registry.as(z.nowakId).punchesToClarify()).map((entry) => entry.person.fullName)).toEqual(["Piotr Kowalski", "Jan Mazur"]);
    expect(await testbed.registry.as(z.kowalskiId).punchesToClarify()).toEqual([]);
    await expect(testbed.registry.as(z.janId).punchesToClarify()).rejects.toMatchObject({ code: "forbidden" });
    await expect(testbed.registry.as(z.ewaId).punchesToClarify()).rejects.toMatchObject({ code: "forbidden" });
  });

  it("wyjście poza budową też trafia do wyjaśnienia", async () => {
    const z = await givenZawbud();
    await punch(z.janId, z.tokens.rataje, north(RATAJE, 10));
    await punch(z.janId, z.tokens.rataje, north(RATAJE, 2_000), { confirmExit: true });

    expect(await z.owner.punchesToClarify()).toEqual([
      expect.objectContaining({ entry: { result: "na_budowie", distanceM: 10 }, exit: { result: "poza_budowa", distanceM: 2_000 }, toClarify: true }),
    ]);
  });

  it("„wyjaśnione” z notatką zdejmuje odbicie z listy, a w historii zostaje, kto i co wyjaśnił", async () => {
    const z = await givenZawbud();
    await givenFlagged(z);
    const [, , janAway] = await z.owner.punchesToClarify();

    await testbed.registry.as(z.nowakId).explainPunch({ punchId: janAway.id, note: " Zapomniał odbić, był na budowie od 7:00 " });

    expect((await z.owner.punchesToClarify()).map((entry) => entry.person.fullName)).toEqual(["Adam Nowak", "Piotr Kowalski"]);
    const { history } = await z.owner.peopleOnSite(z.ratajeId);
    expect(history.find((entry) => entry.id === janAway.id)).toMatchObject({
      toClarify: false,
      explained: { at: testbed.clock.now(), byName: "Adam Nowak", note: "Zapomniał odbić, był na budowie od 7:00" },
    });
  });

  it("notatka jest opcjonalna, a wyjaśnione drugi raz niczego nie zmienia", async () => {
    const z = await givenZawbud();
    await givenFlagged(z);
    const [nowakInKornik] = await z.owner.punchesToClarify();

    await z.owner.explainPunch({ punchId: nowakInKornik.id, note: "" });
    await z.owner.explainPunch({ punchId: nowakInKornik.id, note: "Inna notatka" });

    const { history } = await z.owner.peopleOnSite(z.kornikId);
    expect(history[0].explained).toMatchObject({ byName: "Właściciel Zawbud", note: null });
  });

  it("kierownik nie wyjaśnia własnych ani cudzych odbić spoza swoich budów, pracownik żadnych, a odbicia „na budowie” nie ma czego wyjaśniać", async () => {
    const z = await givenZawbud();
    await givenFlagged(z);
    const [nowakInKornik, kowalskiOnRataje] = await z.owner.punchesToClarify();
    const [ewaAtBase] = (await z.owner.peopleOnSite(z.baseId)).present;

    await expect(testbed.registry.as(z.nowakId).explainPunch({ punchId: nowakInKornik.id, note: null })).rejects.toMatchObject({ code: "forbidden" });
    await expect(testbed.registry.as(z.kowalskiId).explainPunch({ punchId: kowalskiOnRataje.id, note: null })).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(testbed.registry.as(z.janId).explainPunch({ punchId: kowalskiOnRataje.id, note: null })).rejects.toMatchObject({ code: "forbidden" });
    await expect(z.owner.explainPunch({ punchId: ewaAtBase.id, note: null })).rejects.toMatchObject({ code: "forbidden" });
    await expect(z.owner.explainPunch({ punchId: randomUUID(), note: null })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("odbicie z kolejki offline", () => {
  const HOUR = 60 * 60 * 1000;

  /** Skan bez zasięgu `hoursAgo` godzin temu, wysłany teraz z kolejki telefonu. */
  function queuedPunch(
    actorId: string,
    posterToken: string,
    position: PhonePosition | null,
    options: { scannedAt: Date; confirmExit?: boolean; operationId?: string },
  ) {
    return testbed.registry.as(actorId).registerQueuedPunch({
      operationId: options.operationId ?? randomUUID(),
      posterToken,
      position,
      confirmExit: options.confirmExit,
      scannedAt: options.scannedAt,
    });
  }

  const hoursAgo = (hours: number) => new Date(testbed.clock.now().getTime() - hours * HOUR);

  it("skan bez zasięgu zapisuje wejście z prawdziwym czasem skanu i oznaczeniem „zapisane offline”", async () => {
    const z = await givenZawbud();
    const scannedAt = testbed.clock.now();
    testbed.clock.advance(3 * HOUR);

    const result = await queuedPunch(z.janId, z.tokens.rataje, north(RATAJE, 40), { scannedAt });

    expect(result).toMatchObject({
      status: "registered",
      outcome: { action: "wejscie", punch: { enteredAt: scannedAt, entry: { result: "na_budowie", distanceM: 40 }, entryOffline: true, exitOffline: false } },
    });
    expect(await presentAt(z.zawbud.ownerId, z.ratajeId)).toEqual(["Jan Mazur"]);
    const online = await punch(z.nowakId, z.tokens.rataje, north(RATAJE, 10));
    expect(online).toMatchObject({ punch: { entryOffline: false } });
  });

  it("cały dzień bez zasięgu: wejście, przejście i potwierdzone wyjście dochodzą po kolei, każde z czasem skanu", async () => {
    const z = await givenZawbud();
    const entry = testbed.clock.now();
    testbed.clock.advance(3 * HOUR);
    const transfer = testbed.clock.now();
    testbed.clock.advance(5 * HOUR);
    const exit = testbed.clock.now();
    testbed.clock.advance(HOUR);

    await queuedPunch(z.janId, z.tokens.rataje, north(RATAJE, 10), { scannedAt: entry });
    const moved = await queuedPunch(z.janId, z.tokens.winogrady, north(WINOGRADY, 10), { scannedAt: transfer });
    const left = await queuedPunch(z.janId, z.tokens.winogrady, north(WINOGRADY, 10), { scannedAt: exit, confirmExit: true });

    expect(moved).toMatchObject({
      status: "registered",
      outcome: {
        action: "przejscie",
        left: { place: { name: "Rataje" }, enteredAt: entry, leftAt: transfer, exitOffline: true },
        punch: { place: { name: "Winogrady" }, enteredAt: transfer, entryOffline: true },
      },
    });
    expect(left).toMatchObject({
      status: "registered",
      outcome: { action: "wyjscie", punch: { enteredAt: transfer, leftAt: exit, exit: { result: "na_budowie", distanceM: 10 }, exitOffline: true } },
    });
    expect(await presentAt(z.zawbud.ownerId, z.winogradyId)).toEqual([]);
  });

  it("ponowne wysłanie tej samej operacji (np. po zerwanym połączeniu) zwraca to samo odbicie i go nie dubluje", async () => {
    const z = await givenZawbud();
    const operationId = randomUUID();
    const scannedAt = testbed.clock.now();
    testbed.clock.advance(HOUR);
    const first = await queuedPunch(z.janId, z.tokens.rataje, north(RATAJE, 10), { scannedAt, operationId });
    testbed.clock.advance(HOUR);

    const again = await queuedPunch(z.janId, z.tokens.rataje, north(RATAJE, 10), { scannedAt, operationId });

    expect(again).toEqual(first);
    expect((await z.owner.peopleOnSite(z.ratajeId)).history).toHaveLength(1);
  });

  it("odbicie wysłane online, którego odpowiedź nie doszła, z kolejki zwraca się tak, jak je zapisano", async () => {
    const z = await givenZawbud();
    const operationId = randomUUID();
    const scannedAt = testbed.clock.now();
    const online = await punch(z.janId, z.tokens.rataje, north(RATAJE, 10), { operationId });
    testbed.clock.advance(HOUR);

    const queued = await queuedPunch(z.janId, z.tokens.rataje, north(RATAJE, 10), { scannedAt, operationId });

    expect(queued).toEqual({ status: "registered", outcome: online });
  });

  it("czas skanu z przyszłości (spieszący się zegar telefonu) to chwila dotarcia na serwer", async () => {
    const z = await givenZawbud();

    const result = await queuedPunch(z.janId, z.tokens.rataje, north(RATAJE, 10), { scannedAt: new Date(testbed.clock.now().getTime() + 2 * HOUR) });

    expect(result).toMatchObject({ outcome: { punch: { enteredAt: testbed.clock.now() } } });
  });

  it("skan sprzed odbicia zapisanego w międzyczasie nie zapisuje się, tylko trafia do wyjaśnienia z czasem skanu i wynikiem położenia", async () => {
    const z = await givenZawbud();
    const scannedAt = testbed.clock.now();
    testbed.clock.advance(HOUR);
    // Jan odbił się w międzyczasie z drugiego telefonu, który miał zasięg.
    await punch(z.janId, z.tokens.rataje, north(RATAJE, 10));
    testbed.clock.advance(HOUR);

    const result = await queuedPunch(z.janId, z.tokens.rataje, north(RATAJE, 5_000), { scannedAt });

    const conflict = {
      person: { fullName: "Jan Mazur" },
      place: { id: z.ratajeId, name: "Rataje" },
      scannedAt,
      receivedAt: testbed.clock.now(),
      confirmExit: false,
      check: { result: "poza_budowa", distanceM: 5_000 },
      reason: "pozniejsze_odbicie",
    };
    expect(result).toMatchObject({ status: "rejected", conflict });
    expect((await z.owner.peopleOnSite(z.ratajeId)).history).toHaveLength(1);
    expect(await z.owner.punchConflictsToClarify()).toMatchObject([conflict]);
    expect(await testbed.registry.as(z.nowakId).punchConflictsToClarify()).toMatchObject([conflict]);
    expect(await testbed.registry.as(z.kowalskiId).punchConflictsToClarify()).toEqual([]);

    testbed.clock.advance(HOUR);
    if (result.status !== "rejected") throw new Error("Skan powinien trafić do wyjaśnienia");
    const again = await queuedPunch(z.janId, z.tokens.rataje, north(RATAJE, 5_000), { scannedAt, operationId: result.conflict.operationId });
    expect(again).toEqual(result);
    expect(await z.owner.punchConflictsToClarify()).toHaveLength(1);
  });

  it("wyjście, które telefon potwierdził, a osoba nie jest tu odbita, i wejście tam, gdzie już jest odbita, trafiają do wyjaśnienia", async () => {
    const z = await givenZawbud();

    const exit = await queuedPunch(z.janId, z.tokens.rataje, north(RATAJE, 10), { scannedAt: testbed.clock.now(), confirmExit: true });
    await punch(z.ewaId, z.tokens.base, north(FRANOWO, 10));
    testbed.clock.advance(HOUR);
    const entry = await queuedPunch(z.ewaId, z.tokens.base, north(FRANOWO, 10), { scannedAt: testbed.clock.now() });

    expect(exit).toMatchObject({ status: "rejected", conflict: { reason: "nie_odbity_tu", confirmExit: true } });
    expect(entry).toMatchObject({ status: "rejected", conflict: { reason: "juz_odbity_tu", confirmExit: false } });
    expect(await presentAt(z.zawbud.ownerId, z.ratajeId)).toEqual([]);
    expect(await presentAt(z.zawbud.ownerId, z.baseId)).toEqual(["Ewa Wiśniewska"]);
  });

  it("stary kod po „Nowy kod” i budowa zakończona przed wysłaniem trafiają do wyjaśnienia; nieznany kod widzi tylko właściciel", async () => {
    const z = await givenZawbud();
    const scannedAt = testbed.clock.now();
    await z.owner.renewPosterToken(z.winogradyId);
    await z.owner.closeSite(z.ratajeId);
    testbed.clock.advance(HOUR);

    const renewed = await queuedPunch(z.janId, z.tokens.winogrady, north(WINOGRADY, 10), { scannedAt });
    const finished = await queuedPunch(z.janId, z.tokens.rataje, north(RATAJE, 10), { scannedAt });

    expect(renewed).toMatchObject({ status: "rejected", conflict: { reason: "kod_niewazny", place: null, check: null } });
    expect(finished).toMatchObject({ status: "rejected", conflict: { reason: "budowa_zakonczona", place: { name: "Rataje" } } });
    expect((await z.owner.punchConflictsToClarify()).map((conflict) => conflict.reason)).toEqual(["budowa_zakonczona", "kod_niewazny"]);
    expect((await testbed.registry.as(z.kowalskiId).punchConflictsToClarify()).map((conflict) => conflict.reason)).toEqual([]);
  });

  it("„wyjaśnione” z notatką zdejmuje konflikt z listy; kierownik nie wyjaśnia własnych, pracownik żadnych", async () => {
    const z = await givenZawbud();
    await queuedPunch(z.janId, z.tokens.rataje, null, { scannedAt: testbed.clock.now(), confirmExit: true });
    await queuedPunch(z.nowakId, z.tokens.rataje, null, { scannedAt: testbed.clock.now(), confirmExit: true });
    const [nowakOwn, jan] = await z.owner.punchConflictsToClarify();
    const nowak = testbed.registry.as(z.nowakId);

    expect((await nowak.punchConflictsToClarify()).map((conflict) => conflict.person.fullName)).toEqual(["Jan Mazur"]);
    await expect(nowak.explainPunchConflict({ conflictId: nowakOwn.id, note: null })).rejects.toMatchObject({ code: "forbidden" });
    await expect(testbed.registry.as(z.janId).punchConflictsToClarify()).rejects.toMatchObject({ code: "forbidden" });
    await expect(testbed.registry.as(z.janId).explainPunchConflict({ conflictId: jan.id, note: null })).rejects.toMatchObject({ code: "forbidden" });

    await nowak.explainPunchConflict({ conflictId: jan.id, note: "Był od 7:00, poprawię" });

    expect(await nowak.punchConflictsToClarify()).toEqual([]);
    expect((await z.owner.punchConflictsToClarify()).map((conflict) => conflict.person.fullName)).toEqual(["Adam Nowak"]);
  });

  it("w trybie tylko do odczytu odbicie z kolejki czeka w telefonie (błąd do ponowienia), a nie trafia do wyjaśnienia", async () => {
    const z = await givenZawbud();
    const admin = testbed.registry.superAdmin(await testbed.givenSuperAdmin());
    await admin.setManualReadOnly(z.zawbud.companyId, true);

    await expect(queuedPunch(z.janId, z.tokens.rataje, north(RATAJE, 10), { scannedAt: testbed.clock.now() })).rejects.toMatchObject({ code: "read_only" });
    expect(await z.owner.punchConflictsToClarify()).toEqual([]);
  });

  it("współrzędnych z kolejki nie ma w wyniku, odbiciu ani konflikcie w bazie", async () => {
    const z = await givenZawbud();
    const position = { lat: 52.398765, lng: 16.954321, accuracy: 23.5 };
    const scannedAt = testbed.clock.now();
    testbed.clock.advance(HOUR);
    const results = [
      await queuedPunch(z.janId, z.tokens.rataje, position, { scannedAt }),
      await queuedPunch(z.janId, z.tokens.winogrady, position, { scannedAt: hoursAgo(2) }),
    ];
    const stored = await testbed.db.transaction(async (sql) => [await sql("select * from app.punches"), await sql("select * from app.punch_conflicts")]);
    const text = JSON.stringify([results, stored, await z.owner.punchConflictsToClarify()]);

    for (const coordinate of ["52.398", "16.954", "23.5"]) expect(text).not.toContain(coordinate);
    expect(stored.map((rows) => rows.length)).toEqual([1, 1]);
  });
});

describe("odbicie osób z kartoteki przez kierownika", () => {
  const HOUR = 60 * 60 * 1000;

  /** Brygada bez kont w kartotece Zawbudu: Wojciech Lis, Marek Zając i nieaktywny już Tomasz Kruk. */
  async function givenCrew(z: Zawbud) {
    const { personId: wojtekId } = await z.owner.addPerson({ fullName: "Wojciech Lis", note: "Bez telefonu" });
    const { personId: marekId } = await z.owner.addPerson({ fullName: "Marek Zając", note: null });
    const { personId: tomaszId } = await z.owner.addPerson({ fullName: "Tomasz Kruk", note: null });
    await z.owner.deactivatePerson(tomaszId);
    const janPersonId = (await z.owner.people()).find((person) => person.account?.userId === z.janId)!.personId;
    return { wojtekId, marekId, tomaszId, janPersonId };
  }

  /** Aktor odbija osoby po skanie plakatu `posterToken`; każda osoba z własnym identyfikatorem operacji. */
  function punchPeople(
    actorId: string,
    posterToken: string,
    position: PhonePosition | null,
    people: { personId: string; operationId?: string; confirmExit?: boolean }[],
  ) {
    return testbed.registry.as(actorId).punchPeople({
      posterToken,
      position,
      people: people.map((person) => ({ ...person, operationId: person.operationId ?? randomUUID() })),
    });
  }

  /** Skan bez zasięgu, w którym aktor odbił osobę `personId`, wysłany teraz z kolejki telefonu. */
  function queuedPersonPunch(actorId: string, posterToken: string, personId: string, options: { scannedAt: Date; confirmExit?: boolean }) {
    return testbed.registry.as(actorId).registerQueuedPunch({ operationId: randomUUID(), posterToken, position: null, personId, ...options });
  }

  it("po skanie kierownik widzi „Odbij też…”: aktywne osoby z kartoteki bez siebie, z tym, co zrobi skan dla każdej", async () => {
    const z = await givenZawbud();
    const crew = await givenCrew(z);
    await punch(z.janId, z.tokens.winogrady, north(WINOGRADY, 10));
    await punchPeople(z.nowakId, z.tokens.rataje, north(RATAJE, 10), [{ personId: crew.wojtekId }]);

    const people = await testbed.registry.as(z.nowakId).punchPeoplePreview(z.tokens.rataje);

    expect(people.map((entry) => [entry.person.fullName, entry.action, entry.from?.name ?? null])).toEqual([
      ["Wojciech Lis", "wyjscie", null],
      ["Ewa Wiśniewska", "wejscie", null],
      ["Jan Mazur", "przejscie", "Winogrady"],
      ["Marek Zając", "wejscie", null],
      ["Piotr Kowalski", "wejscie", null],
      ["Właściciel Zawbud", "wejscie", null],
    ]);
    expect((await z.owner.punchPeoplePreview(z.tokens.rataje)).map((entry) => entry.person.fullName)).toContain("Adam Nowak");
  });

  it("kierownik odbija kilka osób naraz: każda ma wejście z wynikiem jego położenia i oznaczenie „odbił: X”", async () => {
    const z = await givenZawbud();
    const crew = await givenCrew(z);
    await punch(z.nowakId, z.tokens.rataje, north(RATAJE, 10));

    const outcomes = await punchPeople(z.nowakId, z.tokens.rataje, north(RATAJE, 450), [{ personId: crew.wojtekId }, { personId: crew.marekId }]);

    expect(outcomes).toMatchObject([
      { action: "wejscie", punch: { person: { fullName: "Wojciech Lis" }, entry: { result: "poza_budowa", distanceM: 450 }, entryPunchedByName: "Adam Nowak" } },
      { action: "wejscie", punch: { person: { fullName: "Marek Zając" }, entry: { result: "poza_budowa", distanceM: 450 }, entryPunchedByName: "Adam Nowak" } },
    ]);
    expect(await presentAt(z.zawbud.ownerId, z.ratajeId)).toEqual(["Adam Nowak", "Marek Zając", "Wojciech Lis"]);
    const [own] = (await z.owner.peopleOnSite(z.ratajeId)).present;
    expect(own).toMatchObject({ person: { fullName: "Adam Nowak" }, entryPunchedByName: null, exitPunchedByName: null });
  });

  it("wyjście tych osób kierownik odbija tak samo, a skan na innej budowie to ich przejście", async () => {
    const z = await givenZawbud();
    const crew = await givenCrew(z);
    await punchPeople(z.nowakId, z.tokens.rataje, north(RATAJE, 10), [{ personId: crew.wojtekId }, { personId: crew.marekId }]);
    testbed.clock.advance(4 * HOUR);

    const transfer = await punchPeople(z.nowakId, z.tokens.kornik, null, [{ personId: crew.marekId }]);
    testbed.clock.advance(4 * HOUR);
    const exit = await punchPeople(z.nowakId, z.tokens.rataje, north(RATAJE, 20), [{ personId: crew.wojtekId, confirmExit: true }]);

    expect(transfer).toMatchObject([
      {
        action: "przejscie",
        left: { person: { fullName: "Marek Zając" }, place: { name: "Rataje" }, exitVia: "przejscie", exitPunchedByName: "Adam Nowak" },
        punch: { place: { name: "Kórnik" }, entry: { result: "bez_sprawdzenia" }, entryPunchedByName: "Adam Nowak" },
      },
    ]);
    expect(exit).toMatchObject([
      {
        action: "wyjscie",
        punch: { person: { fullName: "Wojciech Lis" }, leftAt: testbed.clock.now(), exit: { result: "na_budowie", distanceM: 20 }, exitPunchedByName: "Adam Nowak" },
      },
    ]);
    expect(await presentAt(z.zawbud.ownerId, z.ratajeId)).toEqual([]);
    expect(await presentAt(z.zawbud.ownerId, z.kornikId)).toEqual(["Marek Zając"]);
  });

  it("wyjście bez potwierdzenia niczego nie zapisuje (np. ktoś odbił tę osobę tu w międzyczasie)", async () => {
    const z = await givenZawbud();
    const crew = await givenCrew(z);
    await punchPeople(z.nowakId, z.tokens.rataje, north(RATAJE, 10), [{ personId: crew.wojtekId }]);

    const outcomes = await punchPeople(z.zawbud.ownerId, z.tokens.rataje, north(RATAJE, 10), [{ personId: crew.wojtekId }, { personId: crew.marekId }]);

    expect(outcomes).toMatchObject([
      { action: "potwierdz_wyjscie", place: { name: "Rataje" } },
      { action: "wejscie", punch: { person: { fullName: "Marek Zając" }, entryPunchedByName: "Właściciel Zawbud" } },
    ]);
    expect(await presentAt(z.zawbud.ownerId, z.ratajeId)).toEqual(["Marek Zając", "Wojciech Lis"]);
  });

  it("wyjście z listy, która się zestarzała (ktoś w międzyczasie odbił tę osobę gdzie indziej), niczego nie zapisuje", async () => {
    const z = await givenZawbud();
    const crew = await givenCrew(z);
    await punchPeople(z.nowakId, z.tokens.rataje, north(RATAJE, 10), [{ personId: crew.wojtekId }]);
    await punchPeople(z.kowalskiId, z.tokens.winogrady, north(WINOGRADY, 10), [{ personId: crew.wojtekId }]);

    const outcomes = await punchPeople(z.nowakId, z.tokens.rataje, north(RATAJE, 10), [{ personId: crew.wojtekId, confirmExit: true }]);

    expect(outcomes).toEqual([{ action: "nie_odbity_tu", place: { id: z.ratajeId, kind: "budowa", name: "Rataje" } }]);
    expect(await presentAt(z.zawbud.ownerId, z.winogradyId)).toEqual(["Wojciech Lis"]);
  });

  it("kierownik przenosi osobę z budowy, której nie prowadzi, i widzi odbicia, które sam odbił, ale nie cudze stamtąd", async () => {
    const z = await givenZawbud();
    const crew = await givenCrew(z);
    await punchPeople(z.kowalskiId, z.tokens.winogrady, north(WINOGRADY, 10), [{ personId: crew.wojtekId }, { personId: crew.marekId }]);
    await punch(z.janId, z.tokens.winogrady, north(WINOGRADY, 10));
    testbed.clock.advance(2 * HOUR);

    const [outcome] = await punchPeople(z.nowakId, z.tokens.rataje, north(RATAJE, 10), [{ personId: crew.wojtekId }]);

    expect(outcome).toMatchObject({ action: "przejscie", left: { place: { name: "Winogrady" }, entryPunchedByName: "Piotr Kowalski", exitPunchedByName: "Adam Nowak" } });
    expect((await testbed.registry.as(z.nowakId).peopleOnSite(z.winogradyId)).history.map((entry) => entry.person.fullName)).toEqual(["Wojciech Lis"]);
    expect(await presentAt(z.nowakId, z.winogradyId)).toEqual([]);
    expect(await presentAt(z.kowalskiId, z.ratajeId)).toEqual([]);
    expect(await presentAt(z.zawbud.ownerId, z.winogradyId)).toEqual(["Jan Mazur", "Marek Zając"]);
  });

  it("odbija się też osobę z kontem, a ona sama potem odbija wyjście", async () => {
    const z = await givenZawbud();
    const crew = await givenCrew(z);
    await punchPeople(z.nowakId, z.tokens.rataje, north(RATAJE, 10), [{ personId: crew.janPersonId }]);

    const exit = await punch(z.janId, z.tokens.rataje, north(RATAJE, 10), { confirmExit: true });

    expect(exit).toMatchObject({ action: "wyjscie", punch: { entryPunchedByName: "Adam Nowak", exitPunchedByName: null } });
  });

  it("ponowne wysłanie zwraca pierwotne odbicia i niczego nie dubluje", async () => {
    const z = await givenZawbud();
    const crew = await givenCrew(z);
    const people = [
      { personId: crew.wojtekId, operationId: randomUUID() },
      { personId: crew.marekId, operationId: randomUUID() },
    ];
    const first = await punchPeople(z.nowakId, z.tokens.rataje, north(RATAJE, 10), people);
    testbed.clock.advance(60_000);

    const again = await punchPeople(z.nowakId, z.tokens.rataje, north(RATAJE, 10), people);

    expect(again).toEqual(first);
    expect((await z.owner.peopleOnSite(z.ratajeId)).history).toHaveLength(2);
  });

  it("pracownik i magazynier nie odbijają innych ani nie widzą listy „Odbij też…”", async () => {
    const z = await givenZawbud();
    const crew = await givenCrew(z);
    const forbidden = { code: "forbidden" };

    for (const actorId of [z.janId, z.ewaId]) {
      await expect(testbed.registry.as(actorId).punchPeoplePreview(z.tokens.rataje)).rejects.toMatchObject(forbidden);
      await expect(punchPeople(actorId, z.tokens.rataje, north(RATAJE, 10), [{ personId: crew.wojtekId }])).rejects.toMatchObject(forbidden);
      await expect(queuedPersonPunch(actorId, z.tokens.rataje, crew.wojtekId, { scannedAt: testbed.clock.now() })).rejects.toMatchObject(forbidden);
    }
    expect(await presentAt(z.zawbud.ownerId, z.ratajeId)).toEqual([]);
  });

  it("nie odbija nieaktywnej osoby, osoby innej firmy ani siebie przez listę", async () => {
    const z = await givenZawbud();
    const crew = await givenCrew(z);
    const budrex = await testbed.givenActiveCompany("Budrex");
    const { personId: budrexPersonId } = await testbed.registry.as(budrex.ownerId).addPerson({ fullName: "Obcy Robotnik", note: null });
    const nowakPersonId = (await z.owner.people()).find((person) => person.account?.userId === z.nowakId)!.personId;
    const position = north(RATAJE, 10);
    const attempt = (people: { personId: string }[]) => punchPeople(z.nowakId, z.tokens.rataje, position, people);

    await expect(attempt([{ personId: crew.tomaszId }])).rejects.toMatchObject({ code: "not_found" });
    await expect(attempt([{ personId: budrexPersonId }])).rejects.toMatchObject({ code: "not_found" });
    await expect(attempt([{ personId: nowakPersonId }])).rejects.toMatchObject({ code: "invalid_input" });
    await expect(attempt([{ personId: crew.wojtekId }, { personId: crew.wojtekId }])).rejects.toMatchObject({ code: "invalid_input" });
    await expect(attempt([])).rejects.toMatchObject({ code: "invalid_input" });
    expect(await presentAt(z.zawbud.ownerId, z.ratajeId)).toEqual([]);
  });

  it("z kolejki offline: odbicie osoby z czasem skanu, „zapisane offline” i „odbił: X”, a konflikt z oznaczeniem, kto odbijał", async () => {
    const z = await givenZawbud();
    const crew = await givenCrew(z);
    const scannedAt = new Date(testbed.clock.now().getTime() - HOUR);

    const entry = await queuedPersonPunch(z.nowakId, z.tokens.rataje, crew.wojtekId, { scannedAt });
    const conflict = await queuedPersonPunch(z.nowakId, z.tokens.rataje, crew.marekId, { scannedAt: testbed.clock.now(), confirmExit: true });

    expect(entry).toMatchObject({
      status: "registered",
      outcome: { action: "wejscie", punch: { person: { fullName: "Wojciech Lis" }, enteredAt: scannedAt, entryOffline: true, entryPunchedByName: "Adam Nowak" } },
    });
    expect(conflict).toMatchObject({ status: "rejected", conflict: { person: { fullName: "Marek Zając" }, reason: "nie_odbity_tu", punchedByName: "Adam Nowak" } });
    expect(await z.owner.punchConflictsToClarify()).toMatchObject([{ person: { fullName: "Marek Zając" }, punchedByName: "Adam Nowak" }]);
  });

  it("osoba, która przed wysłaniem kolejki przestała być aktywna, trafia do wyjaśnienia i nie blokuje kolejki kierownika", async () => {
    const z = await givenZawbud();
    const crew = await givenCrew(z);
    const scannedAt = testbed.clock.now();
    await z.owner.deactivatePerson(crew.wojtekId);
    testbed.clock.advance(HOUR);

    const result = await queuedPersonPunch(z.nowakId, z.tokens.rataje, crew.wojtekId, { scannedAt });

    expect(result).toMatchObject({ status: "rejected", conflict: { person: { fullName: "Wojciech Lis" }, reason: "osoba_nieaktywna", punchedByName: "Adam Nowak" } });
    expect(await presentAt(z.zawbud.ownerId, z.ratajeId)).toEqual([]);
  });

  it("odbicia i konflikty, które kierownik sam odbił, wyjaśnia właściciel, a nie on", async () => {
    const z = await givenZawbud();
    const crew = await givenCrew(z);
    const nowak = testbed.registry.as(z.nowakId);
    await punchPeople(z.nowakId, z.tokens.rataje, null, [{ personId: crew.wojtekId }]);
    await queuedPersonPunch(z.nowakId, z.tokens.rataje, crew.marekId, { scannedAt: testbed.clock.now(), confirmExit: true });
    const [flagged] = await z.owner.punchesToClarify();
    const [conflict] = await z.owner.punchConflictsToClarify();

    expect(flagged).toMatchObject({ person: { fullName: "Wojciech Lis" }, entry: { result: "brak_polozenia" } });
    expect(await nowak.punchesToClarify()).toEqual([]);
    expect(await nowak.punchConflictsToClarify()).toEqual([]);
    await expect(nowak.explainPunch({ punchId: flagged.id, note: null })).rejects.toMatchObject({ code: "forbidden" });
    await expect(nowak.explainPunchConflict({ conflictId: conflict.id, note: null })).rejects.toMatchObject({ code: "forbidden" });
    await z.owner.explainPunch({ punchId: flagged.id, note: "Brygada była na budowie" });
    expect(await z.owner.punchesToClarify()).toEqual([]);
  });
});

describe("zapomniane wyjście", () => {
  const HOUR = 60 * 60 * 1000;

  /** Brygada Nowaka bez kont: Wojciech Lis i Marek Zając. */
  async function givenCrew(z: Zawbud) {
    const { personId: wojtekId } = await z.owner.addPerson({ fullName: "Wojciech Lis", note: null });
    const { personId: marekId } = await z.owner.addPerson({ fullName: "Marek Zając", note: null });
    const janPersonId = (await z.owner.people()).find((person) => person.account?.userId === z.janId)!.personId;
    return { wojtekId, marekId, janPersonId };
  }

  function punchPeople(actorId: string, posterToken: string, personIds: string[]) {
    return testbed.registry.as(actorId).punchPeople({
      posterToken,
      position: north(RATAJE, 10),
      people: personIds.map((personId) => ({ personId, operationId: randomUUID() })),
    });
  }

  /** Przypomnienia o wyjściu w dzwonku użytkownika: kogo i gdzie, od najnowszego. */
  async function exitReminders(userId: string) {
    const { entries } = await testbed.registry.as(userId).bell();
    return entries
      .map((entry) => entry.notification)
      .flatMap((notification) =>
        notification.kind === "przypomnienie_wyjscia" ? [notification.punches.map((entry) => [entry.person.fullName, entry.place.name])] : [],
      );
  }

  async function onlyPunchAt(actorId: string, locationId: string) {
    const [entry] = (await testbed.registry.as(actorId).peopleOnSite(locationId)).history;
    return entry;
  }

  it("o 18:00 osoba nadal odbita dostaje przypomnienie w dzwonku i push, każde odbicie raz; kto wyszedł, nic", async () => {
    const z = await givenZawbud();
    const phone = { endpoint: `https://fcm.googleapis.com/fcm/send/jan-${randomUUID()}`, keys: { p256dh: "klucz", auth: "sekret" } };
    await testbed.registry.as(z.janId).subscribeToPush(phone);
    await punch(z.janId, z.tokens.rataje, north(RATAJE, 20));
    await punch(z.ewaId, z.tokens.base, north(FRANOWO, 10));
    testbed.clock.set("2026-03-02T15:00:00+01:00");
    await punch(z.ewaId, z.tokens.base, north(FRANOWO, 10), { confirmExit: true });

    testbed.clock.set("2026-03-02T17:55:00+01:00");
    expect(await testbed.registry.system().notifyForgottenExits()).toEqual({ punches: 0 });
    expect(await exitReminders(z.janId)).toEqual([]);

    testbed.clock.set("2026-03-02T18:05:00+01:00");
    expect(await testbed.registry.system().notifyForgottenExits()).toEqual({ punches: 1 });
    expect(await exitReminders(z.janId)).toEqual([[["Jan Mazur", "Rataje"]]]);
    const [entry] = (await testbed.registry.as(z.janId).bell()).entries;
    expect(entry.notification).toMatchObject({ kind: "przypomnienie_wyjscia", punches: [{ enteredAt: START, place: { id: z.ratajeId, kind: "budowa" } }] });
    expect(testbed.notifier.pushed).toEqual([
      { subscription: phone, message: { window: "dzwonek", notificationId: entry.id, notification: expect.objectContaining({ kind: "przypomnienie_wyjscia" }) } },
    ]);
    expect(await exitReminders(z.ewaId)).toEqual([]);
    expect(await exitReminders(z.zawbud.ownerId)).toEqual([]);

    testbed.clock.set("2026-03-02T19:00:00+01:00");
    expect(await testbed.registry.system().notifyForgottenExits()).toEqual({ punches: 0 });
    expect(await exitReminders(z.janId)).toHaveLength(1);
  });

  it("za osoby odbite przez kierownika przypomnienie dostaje kierownik, jedno razem z jego własnym", async () => {
    const z = await givenZawbud();
    const crew = await givenCrew(z);
    await punch(z.nowakId, z.tokens.rataje, north(RATAJE, 10));
    await punchPeople(z.nowakId, z.tokens.rataje, [crew.wojtekId, crew.marekId, crew.janPersonId]);
    await punch(z.kowalskiId, z.tokens.winogrady, north(WINOGRADY, 10));

    testbed.clock.set("2026-03-02T18:00:00+01:00");
    expect(await testbed.registry.system().notifyForgottenExits()).toEqual({ punches: 5 });

    expect(await exitReminders(z.nowakId)).toEqual([
      [
        ["Adam Nowak", "Rataje"],
        ["Jan Mazur", "Rataje"],
        ["Marek Zając", "Rataje"],
        ["Wojciech Lis", "Rataje"],
      ],
    ]);
    expect(await exitReminders(z.kowalskiId)).toEqual([[["Piotr Kowalski", "Winogrady"]]]);
    expect(await exitReminders(z.janId)).toEqual([]);
    expect(await exitReminders(z.zawbud.ownerId)).toEqual([]);
  });

  it("kto odbije się po przypomnieniu, dostaje własne przy następnym uruchomieniu zadania", async () => {
    const z = await givenZawbud();
    await punch(z.janId, z.tokens.rataje, north(RATAJE, 20));
    testbed.clock.set("2026-03-02T18:10:00+01:00");
    await testbed.registry.system().notifyForgottenExits();
    testbed.clock.set("2026-03-02T18:30:00+01:00");
    await punch(z.ewaId, z.tokens.base, north(FRANOWO, 10));

    testbed.clock.set("2026-03-02T19:10:00+01:00");
    expect(await testbed.registry.system().notifyForgottenExits()).toEqual({ punches: 1 });
    expect(await exitReminders(z.ewaId)).toEqual([[["Ewa Wiśniewska", "Baza Franowo"]]]);
    expect(await exitReminders(z.janId)).toHaveLength(1);
  });

  it("o północy otwarte odbicia zamykają się „bez wyjścia”: trafiają do wyjaśnienia i nie liczą się do czasu na budowie", async () => {
    const z = await givenZawbud();
    await punch(z.janId, z.tokens.rataje, north(RATAJE, 20));
    await punch(z.ewaId, z.tokens.base, north(FRANOWO, 10));
    testbed.clock.set("2026-03-02T15:00:00+01:00");
    await punch(z.ewaId, z.tokens.base, north(FRANOWO, 10), { confirmExit: true });

    testbed.clock.set("2026-03-02T23:50:00+01:00");
    expect(await testbed.registry.system().closeForgottenExits()).toEqual({ punches: 0 });
    expect(await presentAt(z.zawbud.ownerId, z.ratajeId)).toEqual(["Jan Mazur"]);

    testbed.clock.set("2026-03-03T00:20:00+01:00");
    expect(await testbed.registry.system().closeForgottenExits()).toEqual({ punches: 1 });

    expect(await presentAt(z.zawbud.ownerId, z.ratajeId)).toEqual([]);
    const closed = await onlyPunchAt(z.zawbud.ownerId, z.ratajeId);
    expect(closed).toMatchObject({
      leftAt: new Date("2026-03-03T00:00:00+01:00"),
      exitVia: "bez_wyjscia",
      exit: null,
      exitPunchedByName: null,
      toClarify: true,
      timeOnSiteMs: null,
    });
    expect(await onlyPunchAt(z.zawbud.ownerId, z.baseId)).toMatchObject({ exitVia: "wyjscie", timeOnSiteMs: 8 * HOUR, toClarify: false });
    expect((await z.owner.punchesToClarify()).map((entry) => entry.id)).toEqual([closed.id]);
    expect((await testbed.registry.as(z.nowakId).punchesToClarify()).map((entry) => entry.id)).toEqual([closed.id]);
    expect(await testbed.registry.system().closeForgottenExits()).toEqual({ punches: 0 });

    // Rano pierwszy skan to znowu wejście, a nie „Kończysz?”.
    testbed.clock.set("2026-03-03T07:00:00+01:00");
    expect(await punch(z.janId, z.tokens.rataje, north(RATAJE, 20))).toMatchObject({ action: "wejscie" });
  });

  it("północ liczy się czasem polskim także latem, a odbicie sprzed kilku dni zamyka się o północy dnia wejścia", async () => {
    const z = await givenZawbud();
    testbed.clock.set("2026-07-01T07:00:00+02:00");
    await testbed.registry.as(z.janId).registerQueuedPunch({
      operationId: randomUUID(),
      posterToken: z.tokens.rataje,
      position: north(RATAJE, 20),
      scannedAt: new Date("2026-06-29T22:30:00+02:00"),
    });
    await punch(z.ewaId, z.tokens.base, north(FRANOWO, 10));

    testbed.clock.set("2026-07-02T00:05:00+02:00");
    expect(await testbed.registry.system().closeForgottenExits()).toEqual({ punches: 2 });

    expect(await onlyPunchAt(z.zawbud.ownerId, z.ratajeId)).toMatchObject({ leftAt: new Date("2026-06-30T00:00:00+02:00"), exitVia: "bez_wyjscia" });
    expect(await onlyPunchAt(z.zawbud.ownerId, z.baseId)).toMatchObject({ leftAt: new Date("2026-07-02T00:00:00+02:00"), exitVia: "bez_wyjscia" });
  });

  it("za osobę odbitą przez kierownika, który już nie ma konta, przypomnienie dostaje osoba ze swoim kontem", async () => {
    const z = await givenZawbud();
    const crew = await givenCrew(z);
    await punchPeople(z.nowakId, z.tokens.rataje, [crew.wojtekId, crew.janPersonId]);
    await z.owner.deactivateMember(z.nowakId);

    testbed.clock.set("2026-03-02T18:00:00+01:00");
    expect(await testbed.registry.system().notifyForgottenExits()).toEqual({ punches: 2 });

    expect(await exitReminders(z.janId)).toEqual([[["Jan Mazur", "Rataje"]]]);
  });

  it("wyjście ze skanu offline sprzed północy, które dotrze po zamknięciu, czeka na wyjaśnienie obok odbicia „bez wyjścia”", async () => {
    const z = await givenZawbud();
    await punch(z.janId, z.tokens.rataje, north(RATAJE, 20));
    testbed.clock.set("2026-03-03T06:30:00+01:00");
    await testbed.registry.system().closeForgottenExits();

    const result = await testbed.registry.as(z.janId).registerQueuedPunch({
      operationId: randomUUID(),
      posterToken: z.tokens.rataje,
      position: north(RATAJE, 20),
      confirmExit: true,
      scannedAt: new Date("2026-03-02T15:30:00+01:00"),
    });

    expect(result).toMatchObject({ status: "rejected", conflict: { reason: "pozniejsze_odbicie", confirmExit: true } });
    expect((await z.owner.punchesToClarify()).map((entry) => entry.exitVia)).toEqual(["bez_wyjscia"]);
  });

  it("odbicie „bez wyjścia” wyjaśnione bez uzupełnienia znika z listy, ale dalej nie liczy się do czasu", async () => {
    const z = await givenZawbud();
    await punch(z.janId, z.tokens.rataje, north(RATAJE, 20));
    testbed.clock.set("2026-03-03T00:10:00+01:00");
    await testbed.registry.system().closeForgottenExits();
    const [closed] = await z.owner.punchesToClarify();

    await testbed.registry.as(z.nowakId).explainPunch({ punchId: closed.id, note: "Nie wiadomo, kiedy wyszedł" });

    expect(await z.owner.punchesToClarify()).toEqual([]);
    expect(await onlyPunchAt(z.zawbud.ownerId, z.ratajeId)).toMatchObject({ exitVia: "bez_wyjscia", timeOnSiteMs: null, toClarify: false });
  });
});

describe("poprawka odbicia", () => {
  const HOUR = 60 * 60 * 1000;
  const at = (time: string) => new Date(`2026-03-02T${time}:00+01:00`);

  function correct(actorId: string, punchId: string, field: "wejscie" | "wyjscie", time: Date, reason = "Zapomniał odbić") {
    const times = field === "wejscie" ? { enteredAt: time } : { leftAt: time };
    return testbed.registry.as(actorId).correctPunch({ punchId, ...times, reason });
  }

  /** Jan wchodzi na Rataje o 7:00 i nie odbija wyjścia, więc o północy odbicie zamyka się „bez wyjścia”. */
  async function givenForgottenExit(z: Zawbud) {
    await punch(z.janId, z.tokens.rataje, north(RATAJE, 20));
    testbed.clock.set("2026-03-03T08:00:00+01:00");
    await testbed.registry.system().closeForgottenExits();
    const [closed] = await z.owner.punchesToClarify();
    return closed;
  }

  it("kierownik budowy uzupełnia wyjście „bez wyjścia” z powodem: odbicie liczy się do czasu, znika z wyjaśnienia, a poprawka zostaje w historii", async () => {
    const z = await givenZawbud();
    const closed = await givenForgottenExit(z);

    const corrected = await correct(z.nowakId, closed.id, "wyjscie", at("15:30"), "Wyszedł o 15:30, potwierdził brygadzista");

    const expected = {
      id: closed.id,
      enteredAt: START,
      leftAt: at("15:30"),
      exitVia: "uzupelnione",
      toClarify: false,
      timeOnSiteMs: 8.5 * HOUR,
      corrections: [
        { field: "wyjscie", from: null, to: at("15:30"), reason: "Wyszedł o 15:30, potwierdził brygadzista", byName: "Adam Nowak", at: testbed.clock.now() },
      ],
    };
    expect(corrected).toMatchObject(expected);
    expect((await z.owner.peopleOnSite(z.ratajeId)).history).toEqual([expect.objectContaining(expected)]);
    expect((await testbed.registry.as(z.janId).peopleOnSite(z.ratajeId)).history).toEqual([expect.objectContaining(expected)]);
    expect(await z.owner.punchesToClarify()).toEqual([]);
  });

  it("właściciel poprawia godzinę wejścia i wyjścia: poprzednie godziny zostają w historii, po kolei", async () => {
    const z = await givenZawbud();
    testbed.clock.set(at("09:00"));
    await punch(z.janId, z.tokens.rataje, north(RATAJE, 20));
    testbed.clock.set(at("17:00"));
    const { punch: left } = (await punch(z.janId, z.tokens.rataje, north(RATAJE, 20), { confirmExit: true })) as { punch: { id: string } };
    testbed.clock.set("2026-03-03T08:00:00+01:00");

    await correct(z.zawbud.ownerId, left.id, "wejscie", at("07:00"), "Był od siódmej, telefon się rozładował");
    const corrected = await correct(z.zawbud.ownerId, left.id, "wyjscie", at("15:00"), "Odbił po powrocie z hurtowni");

    expect(corrected).toMatchObject({
      enteredAt: at("07:00"),
      leftAt: at("15:00"),
      exitVia: "wyjscie",
      exit: { result: "na_budowie" },
      timeOnSiteMs: 8 * HOUR,
      corrections: [
        { field: "wejscie", from: at("09:00"), to: at("07:00"), byName: "Właściciel Zawbud" },
        { field: "wyjscie", from: at("17:00"), to: at("15:00"), byName: "Właściciel Zawbud" },
      ],
    });
  });

  it("wejście i wyjście poprawione naraz zapisują się razem albo wcale, także gdy nowe wejście wypada po dawnym wyjściu", async () => {
    const z = await givenZawbud();
    await punch(z.janId, z.tokens.rataje, north(RATAJE, 20));
    testbed.clock.set(at("10:00"));
    const { punch: left } = (await punch(z.janId, z.tokens.rataje, north(RATAJE, 20), { confirmExit: true })) as { punch: { id: string } };
    testbed.clock.set(at("13:00"));
    await punch(z.janId, z.tokens.winogrady, north(WINOGRADY, 20));
    testbed.clock.set(at("20:00"));
    const owner = z.owner;

    // Zła para (wyjście z Rataj po wejściu na Winogrady) nie zostawia poprawionego wejścia.
    await expect(owner.correctPunch({ punchId: left.id, enteredAt: at("11:00"), leftAt: at("14:00"), reason: "Pomyłka" })).rejects.toMatchObject({
      code: "punch_overlap",
    });
    expect(await owner.peopleOnSite(z.ratajeId)).toMatchObject({ history: [{ enteredAt: START, leftAt: at("10:00"), corrections: [] }] });

    const corrected = await owner.correctPunch({ punchId: left.id, enteredAt: at("10:30"), leftAt: at("12:30"), reason: "Przyszedł po hurtowni" });
    expect(corrected).toMatchObject({
      enteredAt: at("10:30"),
      leftAt: at("12:30"),
      corrections: [
        { field: "wyjscie", from: at("10:00"), to: at("12:30") },
        { field: "wejscie", from: START, to: at("10:30") },
      ],
    });
    await expect(owner.correctPunch({ punchId: left.id, reason: "Nic" })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("uzupełnione wyjście odbitej teraz osoby zamyka jej odbicie, a ona może się znowu odbić", async () => {
    const z = await givenZawbud();
    await punch(z.janId, z.tokens.rataje, north(RATAJE, 20));
    testbed.clock.set(at("16:00"));

    const corrected = await correct(z.nowakId, (await onlyPresent(z)).id, "wyjscie", at("14:00"), "Pojechał do lekarza");

    expect(corrected).toMatchObject({ leftAt: at("14:00"), exitVia: "uzupelnione", timeOnSiteMs: 7 * HOUR });
    expect(await presentAt(z.zawbud.ownerId, z.ratajeId)).toEqual([]);
    testbed.clock.set("2026-03-02T18:00:00+01:00");
    expect(await testbed.registry.system().notifyForgottenExits()).toEqual({ punches: 0 });
    expect(await punch(z.janId, z.tokens.rataje, north(RATAJE, 20))).toMatchObject({ action: "wejscie" });
  });

  it("poprawka wymaga powodu, nie sięga w przyszłość, nie odwraca wejścia i wyjścia i nie nachodzi na inne odbicie tej osoby", async () => {
    const z = await givenZawbud();
    await punch(z.janId, z.tokens.rataje, north(RATAJE, 20));
    testbed.clock.set(at("12:00"));
    const transfer = await punch(z.janId, z.tokens.winogrady, north(WINOGRADY, 20));
    if (transfer.action !== "przejscie") throw new Error("Skan na Winogradach powinien być przejściem");
    testbed.clock.set(at("16:00"));
    const rataje = transfer.left.id;
    const winogrady = transfer.punch.id;

    await expect(correct(z.zawbud.ownerId, rataje, "wejscie", at("06:00"), "  ")).rejects.toMatchObject({ code: "reason_required" });
    await expect(correct(z.zawbud.ownerId, winogrady, "wyjscie", at("16:30"))).rejects.toMatchObject({ code: "invalid_input" });
    await expect(correct(z.zawbud.ownerId, rataje, "wejscie", at("12:30"))).rejects.toMatchObject({ code: "invalid_input" });
    await expect(correct(z.zawbud.ownerId, rataje, "wyjscie", at("06:30"))).rejects.toMatchObject({ code: "invalid_input" });
    await expect(correct(z.zawbud.ownerId, rataje, "wyjscie", at("12:15"))).rejects.toMatchObject({ code: "punch_overlap" });
    await expect(correct(z.zawbud.ownerId, winogrady, "wejscie", at("11:45"))).rejects.toMatchObject({ code: "punch_overlap" });
    await expect(correct(z.zawbud.ownerId, rataje, "wyjscie", at("12:00"))).rejects.toMatchObject({ code: "invalid_input" });
    await expect(correct(z.zawbud.ownerId, randomUUID(), "wyjscie", at("12:00"))).rejects.toMatchObject({ code: "not_found" });

    // Dojazd między budowami: wyjście z Rataj wcześniej niż wejście na Winogrady.
    expect(await correct(z.zawbud.ownerId, rataje, "wyjscie", at("11:30"), "Wyjechał przed 11:30")).toMatchObject({ timeOnSiteMs: 4.5 * HOUR });
    expect((await z.owner.peopleOnSite(z.winogradyId)).present.map((entry) => entry.corrections)).toEqual([[]]);
  });

  it("pracownik i magazynier nie poprawiają odbić, nawet własnych; kierownik nie poprawia własnych ani spoza swoich budów", async () => {
    const z = await givenZawbud();
    const { personId: wojtekId } = await z.owner.addPerson({ fullName: "Wojciech Lis", note: null });
    await punch(z.janId, z.tokens.rataje, north(RATAJE, 20));
    await punch(z.ewaId, z.tokens.base, north(FRANOWO, 20));
    await punch(z.nowakId, z.tokens.rataje, north(RATAJE, 20));
    await testbed.registry.as(z.nowakId).punchPeople({ posterToken: z.tokens.rataje, position: north(RATAJE, 10), people: [{ personId: wojtekId, operationId: randomUUID() }] });
    await punch(z.kowalskiId, z.tokens.winogrady, north(WINOGRADY, 20));
    testbed.clock.set(at("16:00"));
    const owner = z.owner;
    const byName = async (locationId: string, name: string) => (await owner.peopleOnSite(locationId)).present.find((entry) => entry.person.fullName === name)!;
    const jan = await byName(z.ratajeId, "Jan Mazur");
    const ewa = await byName(z.baseId, "Ewa Wiśniewska");
    const nowak = await byName(z.ratajeId, "Adam Nowak");
    const kowalski = await byName(z.winogradyId, "Piotr Kowalski");

    await expect(correct(z.janId, jan.id, "wyjscie", at("15:00"))).rejects.toMatchObject({ code: "forbidden" });
    await expect(correct(z.ewaId, ewa.id, "wyjscie", at("15:00"))).rejects.toMatchObject({ code: "forbidden" });
    await expect(correct(z.ewaId, jan.id, "wyjscie", at("15:00"))).rejects.toMatchObject({ code: "forbidden" });
    await expect(correct(z.nowakId, nowak.id, "wyjscie", at("15:00"))).rejects.toMatchObject({ code: "forbidden" });
    await expect(correct(z.nowakId, kowalski.id, "wyjscie", at("15:00"))).rejects.toMatchObject({ code: "not_found" });
    expect(await presentAt(z.zawbud.ownerId, z.ratajeId)).toEqual(["Adam Nowak", "Jan Mazur", "Wojciech Lis"]);

    // Strona wie, które odbicia aktor może poprawić.
    const correctable = async (actorId: string, locationId: string) =>
      (await testbed.registry.as(actorId).peopleOnSite(locationId)).present.map((entry) => [entry.person.fullName, entry.correctable]);
    expect(await correctable(z.nowakId, z.ratajeId)).toEqual([
      ["Adam Nowak", false],
      ["Jan Mazur", true],
      ["Wojciech Lis", true],
    ]);
    expect(await correctable(z.janId, z.ratajeId)).toEqual([["Jan Mazur", false]]);
    expect(await correctable(z.zawbud.ownerId, z.winogradyId)).toEqual([["Piotr Kowalski", true]]);
    await expect(correct(z.zawbud.ownerId, nowak.id, "wyjscie", at("15:00"), "Kierownik zapomniał")).resolves.toMatchObject({ exitVia: "uzupelnione" });
  });

  it("kierownik uzupełnia wyjście brygady, którą sam odbił: to o nich dostaje przypomnienie", async () => {
    const z = await givenZawbud();
    const { personId: wojtekId } = await z.owner.addPerson({ fullName: "Wojciech Lis", note: null });
    await testbed.registry.as(z.nowakId).punchPeople({ posterToken: z.tokens.rataje, position: north(RATAJE, 10), people: [{ personId: wojtekId, operationId: randomUUID() }] });
    testbed.clock.set("2026-03-03T07:30:00+01:00");
    await testbed.registry.system().closeForgottenExits();
    const [closed] = (await testbed.registry.as(z.nowakId).peopleOnSite(z.ratajeId)).history;

    expect(await correct(z.nowakId, closed.id, "wyjscie", at("15:00"), "Brygada skończyła o 15:00")).toMatchObject({
      exitVia: "uzupelnione",
      timeOnSiteMs: 8 * HOUR,
      corrections: [{ byName: "Adam Nowak" }],
    });
  });

  it("poprawka wejścia następnego dnia nie zatrzymuje się na północy, o której zamknęło się odbicie „bez wyjścia”", async () => {
    const z = await givenZawbud();
    await punch(z.janId, z.tokens.rataje, north(RATAJE, 20));
    testbed.clock.set("2026-03-03T06:00:00+01:00");
    await testbed.registry.system().closeForgottenExits();
    await punch(z.janId, z.tokens.winogrady, north(WINOGRADY, 20));
    testbed.clock.set("2026-03-03T08:00:00+01:00");
    const [nightShift] = (await z.owner.peopleOnSite(z.winogradyId)).present;

    expect(await correct(z.zawbud.ownerId, nightShift.id, "wejscie", new Date("2026-03-02T23:00:00+01:00"), "Nocna zmiana")).toMatchObject({
      enteredAt: new Date("2026-03-02T23:00:00+01:00"),
    });
  });

  async function onlyPresent(z: Zawbud) {
    const [entry] = (await z.owner.peopleOnSite(z.ratajeId)).present;
    return entry;
  }
});

describe("tryb tylko do odczytu", () => {
  it("blokuje odbicia, wyjaśnienia i nowy kod, a lista obecnych działa", async () => {
    const z = await givenZawbud();
    await punch(z.janId, z.tokens.rataje, null);
    const [flagged] = await z.owner.punchesToClarify();
    const admin = testbed.registry.superAdmin(await testbed.givenSuperAdmin());
    await admin.setManualReadOnly(z.zawbud.companyId, true);
    const readOnly = { code: "read_only" };

    await expect(punch(z.janId, z.tokens.rataje, north(RATAJE, 10), { confirmExit: true })).rejects.toMatchObject(readOnly);
    await expect(punch(z.nowakId, z.tokens.rataje, north(RATAJE, 10))).rejects.toMatchObject(readOnly);
    const { personId: janPersonId } = (await z.owner.people()).find((person) => person.fullName === "Jan Mazur")!;
    const crewPunch = { posterToken: z.tokens.rataje, position: north(RATAJE, 10), people: [{ personId: janPersonId, operationId: randomUUID(), confirmExit: true }] };
    await expect(testbed.registry.as(z.nowakId).punchPeople(crewPunch)).rejects.toMatchObject(readOnly);
    await expect(z.owner.explainPunch({ punchId: flagged.id, note: null })).rejects.toMatchObject(readOnly);
    await expect(
      z.owner.correctPunch({ punchId: flagged.id, enteredAt: new Date(testbed.clock.now().getTime() - 60_000), reason: "Był wcześniej" }),
    ).rejects.toMatchObject(readOnly);
    await expect(z.owner.renewPosterToken(z.ratajeId)).rejects.toMatchObject(readOnly);
    await expect(z.owner.setPunchRadius(z.ratajeId, 400)).rejects.toMatchObject(readOnly);
    expect(await presentAt(z.zawbud.ownerId, z.ratajeId)).toEqual(["Jan Mazur"]);
    expect((await z.owner.poster(z.ratajeId)).code).toBe(z.tokens.rataje);
  });
});

describe("baza danych", () => {
  it("pracownik i magazynier nie odbiją innej osoby, nie zamkną jej odbicia i nie poznają jej stanu, nawet z pominięciem Rejestru", async () => {
    const z = await givenZawbud();
    const { personId: wojtekId } = await z.owner.addPerson({ fullName: "Wojciech Lis", note: null });
    const { personId: marekId } = await z.owner.addPerson({ fullName: "Marek Zając", note: null });
    const [entered] = await testbed.registry.as(z.nowakId).punchPeople({
      posterToken: z.tokens.rataje,
      position: north(RATAJE, 10),
      people: [{ personId: wojtekId, operationId: randomUUID() }],
    });
    if (entered.action !== "wejscie") throw new Error("Kierownik powinien odbić wejście");

    for (const actorId of [z.janId, z.ewaId]) {
      // Marek nie jest nigdzie odbity, więc wejście zatrzymuje tylko polityka RLS, a nie jedno otwarte odbicie na osobę.
      await expect(
        withActor(testbed.db, actorId, (sql) =>
          sql(
            `insert into app.punches (company_id, person_id, location_id, punched_by, entered_at, entry_result, entry_operation_id)
             values ($1, $2, $3, $4, now(), 'na_budowie', gen_random_uuid())`,
            [z.zawbud.companyId, marekId, z.ratajeId, actorId],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
      const attempts = await withActor(testbed.db, actorId, async (sql) => ({
        closed: await sql("select app.close_punch_of($1, now(), 'wyjscie', 'na_budowie', null, gen_random_uuid(), false) as closed", [entered.punch.id]),
        state: await sql("select * from app.punch_state($1)", [wojtekId]),
      }));
      expect(attempts).toEqual({ closed: [{ closed: false }], state: [] });
    }
    expect(await presentAt(z.zawbud.ownerId, z.ratajeId)).toEqual(["Wojciech Lis"]);
  });

  it("kierownik nie wpisze, że odbicie odbił ktoś inny", async () => {
    const z = await givenZawbud();
    const { personId: wojtekId } = await z.owner.addPerson({ fullName: "Wojciech Lis", note: null });

    await expect(
      withActor(testbed.db, z.nowakId, (sql) =>
        sql(
          `insert into app.punches (company_id, person_id, location_id, punched_by, entered_at, entry_result, entry_operation_id)
           values ($1, $2, $3, $4, now(), 'na_budowie', gen_random_uuid())`,
          [z.zawbud.companyId, wojtekId, z.ratajeId, z.kowalskiId],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("pracownik nie wyjaśni ani nie dopisze konfliktu z kolejki offline z pominięciem Rejestru", async () => {
    const z = await givenZawbud();
    await testbed.registry.as(z.janId).registerQueuedPunch({
      operationId: randomUUID(),
      posterToken: z.tokens.rataje,
      position: null,
      confirmExit: true,
      scannedAt: testbed.clock.now(),
    });
    const [conflict] = await z.owner.punchConflictsToClarify();

    await expect(
      withActor(testbed.db, z.janId, (sql) =>
        sql("update app.punch_conflicts set explained_at = now(), explained_by = $2 where id = $1 returning id", [conflict.id, z.janId]).then(
          (rows) => {
            if (rows.length === 0) throw new Error("RLS nie przepuściło zmiany");
          },
        ),
      ),
    ).rejects.toThrow();
    const kowalskiPerson = (await z.owner.people()).find((person) => person.account?.userId === z.kowalskiId)!;
    await expect(
      withActor(testbed.db, z.janId, (sql) =>
        sql(
          `insert into app.punch_conflicts (company_id, person_id, location_id, punched_by, operation_id, scanned_at, received_at,
                                            confirm_exit, reason)
           values ($1, $2, $3, $4, gen_random_uuid(), now(), now(), false, 'juz_odbity_tu')`,
          [z.zawbud.companyId, kowalskiPerson.personId, z.ratajeId, z.janId],
        ),
      ),
    ).rejects.toThrow();
  });

  it("pracownik nie poprawi godzin własnego odbicia, a kierownik własnego, nawet z pominięciem Rejestru", async () => {
    const z = await givenZawbud();
    await punch(z.janId, z.tokens.rataje, north(RATAJE, 20));
    await punch(z.nowakId, z.tokens.rataje, north(RATAJE, 20));
    const present = (await z.owner.peopleOnSite(z.ratajeId)).present;
    const jan = present.find((entry) => entry.person.fullName === "Jan Mazur")!;
    const nowak = present.find((entry) => entry.person.fullName === "Adam Nowak")!;
    const earlier = new Date(testbed.clock.now().getTime() - 60 * 60 * 1000);

    for (const [actorId, punchId] of [
      [z.janId, jan.id],
      [z.nowakId, nowak.id],
    ]) {
      await expect(
        withActor(testbed.db, actorId, (sql) =>
          sql(
            `insert into app.punch_corrections (company_id, punch_id, field, to_at, reason, corrected_by, corrected_at)
             values ($1, $2, 'wejscie', $3, 'Byłem wcześniej', $4, now())`,
            [z.zawbud.companyId, punchId, earlier, actorId],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
      await expect(
        withActor(testbed.db, actorId, (sql) => sql("update app.punches set entered_at = $2 where id = $1", [punchId, earlier])),
      ).rejects.toThrow();
      // Przypomnienie o wyjściu zapisuje tylko zadanie harmonogramu.
      await expect(
        withActor(testbed.db, actorId, (sql) => sql("update app.punches set exit_reminded_at = now() where id = $1", [punchId])),
      ).rejects.toThrow();
      await expect(
        withActor(testbed.db, actorId, (sql) => sql("update app.punches set left_at = now(), exit_via = 'uzupelnione', exit_punched_by = $2 where id = $1", [punchId, actorId])),
      ).rejects.toThrow();
    }
    expect((await z.owner.peopleOnSite(z.ratajeId)).present.map((entry) => [entry.enteredAt, entry.leftAt])).toEqual([
      [START, null],
      [START, null],
    ]);
  });

  it("poprawka zapisuje w historii prawdziwą poprzednią godzinę, a nie tę podaną przez aktora", async () => {
    const z = await givenZawbud();
    await punch(z.janId, z.tokens.rataje, north(RATAJE, 20));
    const [jan] = (await z.owner.peopleOnSite(z.ratajeId)).present;
    const earlier = new Date(testbed.clock.now().getTime() - 60 * 60 * 1000);

    await withActor(testbed.db, z.nowakId, (sql) =>
      sql(
        `insert into app.punch_corrections (company_id, punch_id, field, from_at, to_at, reason, corrected_by, corrected_at)
         values ($1, $2, 'wejscie', '2020-01-01', $3, 'Był od szóstej', $4, now())`,
        [z.zawbud.companyId, jan.id, earlier, z.nowakId],
      ),
    );

    const [corrected] = (await z.owner.peopleOnSite(z.ratajeId)).present;
    expect(corrected).toMatchObject({ enteredAt: earlier, corrections: [{ field: "wejscie", from: START, to: earlier }] });
  });

  it("pracownik nie wpisze sobie wyjaśnienia ani cudzego odbicia, nawet z pominięciem Rejestru", async () => {
    const z = await givenZawbud();
    await punch(z.janId, z.tokens.rataje, null);
    const [flagged] = await z.owner.punchesToClarify();

    await expect(
      withActor(testbed.db, z.janId, (sql) =>
        sql("update app.punches set explained_at = now(), explained_by = $2 where id = $1", [flagged.id, z.janId]),
      ),
    ).rejects.toThrow();
    const kowalskiPerson = (await z.owner.people()).find((person) => person.account?.userId === z.kowalskiId)!;
    await expect(
      withActor(testbed.db, z.janId, (sql) =>
        sql(
          `insert into app.punches (company_id, person_id, location_id, punched_by, entered_at, entry_result, entry_operation_id)
           values ($1, $2, $3, $4, now(), 'na_budowie', gen_random_uuid())`,
          [z.zawbud.companyId, kowalskiPerson.personId, z.ratajeId, z.janId],
        ),
      ),
    ).rejects.toThrow();
  });
});
