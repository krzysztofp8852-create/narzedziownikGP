import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PhonePosition, PunchOutcome } from "./registry";
import { withActor } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

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
    await expect(z.owner.explainPunch({ punchId: flagged.id, note: null })).rejects.toMatchObject(readOnly);
    await expect(z.owner.renewPosterToken(z.ratajeId)).rejects.toMatchObject(readOnly);
    await expect(z.owner.setPunchRadius(z.ratajeId, 400)).rejects.toMatchObject(readOnly);
    expect(await presentAt(z.zawbud.ownerId, z.ratajeId)).toEqual(["Jan Mazur"]);
    expect((await z.owner.poster(z.ratajeId)).code).toBe(z.tokens.rataje);
  });
});

describe("baza danych", () => {
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
