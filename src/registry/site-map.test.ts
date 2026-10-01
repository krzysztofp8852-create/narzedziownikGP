import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withActor } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();

const RATAJE = { lat: 52.3925, lng: 16.9516 };
const WINOGRADY = { lat: 52.4302, lng: 16.9301 };
const FRANOWO = { lat: 52.4038, lng: 16.9861 };

async function givenOwner() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Franowo" });
  const managerId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  return { zawbud, managerId, owner: testbed.registry.as(zawbud.ownerId) };
}

describe("budowa na mapie", () => {
  it("budowa z adresem, który dostawca zna, stoi w miejscu tego adresu", async () => {
    const { owner, managerId } = await givenOwner();
    testbed.geocoder.knows("ul. Piłsudskiego 12, Poznań", RATAJE);

    const { locationId } = await owner.addSite({ name: "Rataje", address: " ul. Piłsudskiego 12, Poznań ", managerId });

    expect(await owner.siteMap()).toEqual([
      { id: locationId, kind: "budowa", name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", position: RATAJE },
    ]);
  });

  it("budowa z adresem, którego dostawca nie znalazł, jest na mapie bez położenia", async () => {
    const { owner, managerId } = await givenOwner();

    const { locationId } = await owner.addSite({ name: "Kórnik", address: "dz. nr 123/4, Kórnik", managerId });

    expect(await owner.siteMap()).toEqual([expect.objectContaining({ id: locationId, position: null })]);
  });

  it("gdy dostawca nie odpowiada, budowa i tak powstaje, tylko bez położenia", async () => {
    const { owner, managerId } = await givenOwner();
    testbed.geocoder.knows("ul. Piłsudskiego 12, Poznań", RATAJE);
    testbed.geocoder.failWith = new Error("timeout");

    const { locationId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", managerId });

    expect((await owner.whereIsWhat()).sites).toEqual([expect.objectContaining({ id: locationId })]);
    expect(await owner.siteMap()).toEqual([expect.objectContaining({ id: locationId, position: null })]);
  });

  it("zakończonej budowy nie ma na mapie, a jej adresu i pinezki nie da się już zmienić", async () => {
    const { owner, managerId } = await givenOwner();
    testbed.geocoder.knows("ul. Piłsudskiego 12, Poznań", RATAJE);
    const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", managerId });
    const { locationId: winogradyId } = await owner.addSite({ name: "Winogrady", address: "os. Wichrowe 3", managerId });

    await owner.closeSite(ratajeId);

    expect((await owner.siteMap()).map((pin) => pin.id)).toEqual([winogradyId]);
    await expect(owner.changeSiteAddress(ratajeId, "os. Wichrowe 3")).rejects.toMatchObject({ code: "site_finished" });
    await expect(owner.moveMapPin(ratajeId, WINOGRADY)).rejects.toMatchObject({ code: "site_finished" });
  });
});

describe("zmiana adresu budowy", () => {
  it("nowy adres przenosi pinezkę, a adres, którego nie ma, zostawia budowę bez położenia", async () => {
    const { owner, managerId } = await givenOwner();
    testbed.geocoder.knows("ul. Piłsudskiego 12, Poznań", RATAJE);
    testbed.geocoder.knows("os. Wichrowe 3, Poznań", WINOGRADY);
    const { locationId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", managerId });

    await owner.changeSiteAddress(locationId, " os. Wichrowe 3, Poznań ");

    expect(await owner.siteMap()).toEqual([expect.objectContaining({ address: "os. Wichrowe 3, Poznań", position: WINOGRADY })]);
    expect((await owner.whereIsWhat()).sites).toEqual([expect.objectContaining({ address: "os. Wichrowe 3, Poznań" })]);

    await owner.changeSiteAddress(locationId, "dz. nr 123/4, Kórnik");

    expect(await owner.siteMap()).toEqual([expect.objectContaining({ address: "dz. nr 123/4, Kórnik", position: null })]);
  });

  it("odrzuca pusty adres i budowę spoza firmy", async () => {
    const { owner, managerId } = await givenOwner();
    const budrex = await testbed.givenActiveCompany("Budrex");
    const strangerSite = await testbed.registry
      .as(budrex.ownerId)
      .addSite({ name: "Obca", address: "ul. Obca 1", managerId: budrex.ownerId });
    const { locationId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", managerId });

    await expect(owner.changeSiteAddress(locationId, " ")).rejects.toMatchObject({ code: "invalid_input" });
    for (const siteId of [strangerSite.locationId, randomUUID(), "nie-uuid"]) {
      await expect(owner.changeSiteAddress(siteId, "os. Wichrowe 3")).rejects.toMatchObject({ code: "not_found" });
    }
    expect(await owner.siteMap()).toEqual([expect.objectContaining({ address: "ul. Piłsudskiego 12, Poznań" })]);
  });
});

describe("ręczne położenie pinezki", () => {
  it("właściciel stawia pinezkę budowy bez położenia, a ta zostaje, dopóki adres się nie zmieni", async () => {
    const { owner, managerId } = await givenOwner();
    testbed.geocoder.knows("os. Wichrowe 3, Poznań", WINOGRADY);
    const { locationId } = await owner.addSite({ name: "Kórnik", address: "dz. nr 123/4, Kórnik", managerId });

    await owner.moveMapPin(locationId, { lat: 52.2471, lng: 17.0897 });
    // Ten sam adres (po obcięciu spacji) to nie zmiana: dostawca nie jest pytany, a pinezka zostaje.
    await owner.changeSiteAddress(locationId, " dz. nr 123/4, Kórnik ");

    expect(await owner.siteMap()).toEqual([expect.objectContaining({ position: { lat: 52.2471, lng: 17.0897 } })]);
    expect(testbed.geocoder.asked).toEqual(["dz. nr 123/4, Kórnik"]);

    await owner.changeSiteAddress(locationId, "os. Wichrowe 3, Poznań");

    expect(await owner.siteMap()).toEqual([expect.objectContaining({ position: WINOGRADY })]);
  });

  it("odrzuca punkt spoza mapy i pinezkę, której nie ma na mapie firmy", async () => {
    const { owner, managerId } = await givenOwner();
    const { locationId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", managerId });
    const { locationId: vehicleId } = await owner.addVehicle({ name: "Bus WX 12345", managerId });
    const { locationId: serviceId } = await owner.addService({ name: "Serwis Hilti" });
    const { base } = await owner.locations();

    for (const position of [{ lat: 91, lng: 16 }, { lat: 52, lng: -181 }, { lat: Number.NaN, lng: 16 }, { lat: "52", lng: 16 }]) {
      await expect(owner.moveMapPin(locationId, position as { lat: number; lng: number })).rejects.toMatchObject({
        code: "invalid_input",
      });
    }
    // Baza bez adresu nie jest na mapie, więc nie ma czego przesuwać.
    for (const id of [vehicleId, serviceId, base.id, randomUUID(), "nie-uuid"]) {
      await expect(owner.moveMapPin(id, RATAJE)).rejects.toMatchObject({ code: "not_found" });
    }
    expect(await owner.siteMap()).toEqual([expect.objectContaining({ id: locationId, position: null })]);
  });
});

describe("baza na mapie", () => {
  it("baza bez adresu nie jest na mapie; z adresem stoi w jego miejscu, przed budowami", async () => {
    const { owner, managerId } = await givenOwner();
    testbed.geocoder.knows("ul. Gołężycka 21, Poznań", FRANOWO);
    const { locationId: siteId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", managerId });
    const { base } = await owner.locations();
    expect((await owner.siteMap()).map((pin) => pin.id)).toEqual([siteId]);

    await owner.setBaseAddress(" ul. Gołężycka 21, Poznań ");

    expect(await owner.siteMap()).toEqual([
      { id: base.id, kind: "baza", name: "Magazyn Franowo", address: "ul. Gołężycka 21, Poznań", position: FRANOWO },
      expect.objectContaining({ id: siteId }),
    ]);
    expect((await owner.locations()).base.address).toBe("ul. Gołężycka 21, Poznań");
  });

  it("pinezkę bazy z adresem można przesunąć, a pusty adres zdejmuje bazę z mapy", async () => {
    const { owner } = await givenOwner();
    await owner.setBaseAddress("Franowo");
    const { base } = await owner.locations();

    await owner.moveMapPin(base.id, FRANOWO);
    expect(await owner.siteMap()).toEqual([expect.objectContaining({ id: base.id, position: FRANOWO })]);

    await owner.setBaseAddress(" ");

    expect(await owner.siteMap()).toEqual([]);
    expect((await owner.locations()).base.address).toBeNull();
  });
});

describe("kto co może na mapie", () => {
  it("kierownik, magazynier i pracownik widzą tę samą mapę, ale adresów i pinezek nie zmieniają", async () => {
    const { zawbud, owner, managerId } = await givenOwner();
    testbed.geocoder.knows("ul. Piłsudskiego 12, Poznań", RATAJE);
    const { locationId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", managerId });
    const map = await owner.siteMap();

    for (const memberId of [managerId, await testbed.givenMember(zawbud, "magazynier"), await testbed.givenMember(zawbud, "pracownik")]) {
      const member = testbed.registry.as(memberId);
      expect(await member.siteMap()).toEqual(map);
      await expect(member.changeSiteAddress(locationId, "os. Wichrowe 3")).rejects.toMatchObject({ code: "forbidden" });
      await expect(member.moveMapPin(locationId, WINOGRADY)).rejects.toMatchObject({ code: "forbidden" });
      await expect(member.setBaseAddress("Franowo")).rejects.toMatchObject({ code: "forbidden" });
    }
    expect(await owner.siteMap()).toEqual(map);
  });

  it("w firmie demo nikt nie pyta dostawcy geokodowania", async () => {
    const { zawbud, owner, managerId } = await givenOwner();
    await testbed.registry.system().activateDemoCompany(zawbud.companyId);
    testbed.geocoder.knows("ul. Piłsudskiego 12, Poznań", RATAJE);

    const { locationId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", managerId });
    await owner.changeSiteAddress(locationId, "os. Wichrowe 3, Poznań");
    await owner.setBaseAddress("Franowo");

    expect(testbed.geocoder.asked).toEqual([]);
  });
});

describe("baza danych pilnuje mapy także na skróty", () => {
  it("kierownik nie zmienia adresu ani pinezki bazy i budowy, także zamykając swoją budowę", async () => {
    const { owner, managerId } = await givenOwner();
    const { locationId: siteId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", managerId });
    await owner.setBaseAddress("Franowo");
    const { base } = await owner.locations();
    const asManager = (text: string, params: unknown[]) => withActor(testbed.db, managerId, (sql) => sql(text, params));
    // Swoją budowę kierownik widzi do zmiany, więc baza odmawia błędem; bazy nie widzi, więc nic się nie zmienia.
    const refused = (text: string, params: unknown[]) => asManager(text, params).catch(() => []);

    for (const id of [siteId, base.id]) {
      expect(await refused("update app.locations set address = 'Gdzie indziej' where id = $1 returning id", [id])).toEqual([]);
      expect(await refused("update app.locations set latitude = 1, longitude = 1 where id = $1 returning id", [id])).toEqual([]);
    }
    await expect(
      asManager(
        "update app.locations set status = 'zakonczona', finished_at = now(), finished_by = $2, address = 'Gdzie indziej' where id = $1",
        [siteId, managerId],
      ),
    ).rejects.toThrow();
    expect((await owner.siteMap()).map((pin) => pin.address)).toEqual(["Franowo", "ul. Piłsudskiego 12, Poznań"]);
  });

  it("pinezka jest tylko przy adresie i tylko w granicach mapy", async () => {
    const { zawbud, owner } = await givenOwner();
    const { base } = await owner.locations();
    const asOwner = (text: string, params: unknown[]) => withActor(testbed.db, zawbud.ownerId, (sql) => sql(text, params));

    await expect(asOwner("update app.locations set latitude = 52, longitude = 16 where id = $1", [base.id])).rejects.toThrow();
    await owner.setBaseAddress("Franowo");
    await expect(asOwner("update app.locations set latitude = 52 where id = $1", [base.id])).rejects.toThrow();
    await expect(asOwner("update app.locations set latitude = 'NaN', longitude = 16 where id = $1", [base.id])).rejects.toThrow();
    await expect(asOwner("update app.locations set address = ' ' where id = $1", [base.id])).rejects.toThrow();
  });
});

describe("położenie budów sprzed mapy", () => {
  it("jednorazowo geokoduje bazy i aktywne budowy bez położenia we wszystkich firmach poza demo", async () => {
    const { owner, managerId } = await givenOwner();
    const budrex = await testbed.givenActiveCompany("Budrex");
    const demo = await testbed.givenActiveCompany("DemoBud");
    await testbed.registry.system().activateDemoCompany(demo.companyId);
    // Budowy założone, zanim dostawca znał ich adresy (np. przed wdrożeniem mapy).
    const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", managerId });
    const { locationId: closedId } = await owner.addSite({ name: "Stara", address: "ul. Stara 1", managerId });
    await owner.closeSite(closedId);
    const { locationId: manualId } = await owner.addSite({ name: "Kórnik", address: "dz. nr 123/4, Kórnik", managerId });
    await owner.moveMapPin(manualId, { lat: 52.2471, lng: 17.0897 });
    await owner.setBaseAddress("ul. Gołężycka 21, Poznań");
    const { locationId: budrexId } = await testbed.registry
      .as(budrex.ownerId)
      .addSite({ name: "Winogrady", address: "os. Wichrowe 3, Poznań", managerId: budrex.ownerId });
    await testbed.registry.as(demo.ownerId).addSite({ name: "Demo", address: "ul. Demo 1", managerId: demo.ownerId });
    testbed.geocoder.clear();
    for (const [address, position] of [
      ["ul. Piłsudskiego 12, Poznań", RATAJE],
      ["ul. Stara 1", RATAJE],
      ["dz. nr 123/4, Kórnik", RATAJE],
      ["ul. Gołężycka 21, Poznań", FRANOWO],
      ["os. Wichrowe 3, Poznań", WINOGRADY],
      ["ul. Demo 1", RATAJE],
    ] as const) {
      testbed.geocoder.knows(address, position);
    }

    expect(await testbed.registry.system().geocodeUnplacedLocations()).toEqual({ placed: 3, notFound: 0 });

    expect(testbed.geocoder.asked.toSorted()).toEqual(["os. Wichrowe 3, Poznań", "ul. Gołężycka 21, Poznań", "ul. Piłsudskiego 12, Poznań"]);
    expect(await owner.siteMap()).toEqual([
      expect.objectContaining({ kind: "baza", position: FRANOWO }),
      expect.objectContaining({ id: manualId, position: { lat: 52.2471, lng: 17.0897 } }),
      expect.objectContaining({ id: ratajeId, position: RATAJE }),
    ]);
    expect(await testbed.registry.as(budrex.ownerId).siteMap()).toEqual([expect.objectContaining({ id: budrexId, position: WINOGRADY })]);
  });

  it("nieznany adres zostaje bez położenia, a gdy dostawca nie odpowiada, nic się nie zmienia i można powtórzyć", async () => {
    const { owner, managerId } = await givenOwner();
    await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", managerId });
    await owner.addSite({ name: "Kórnik", address: "dz. nr 123/4, Kórnik", managerId });
    testbed.geocoder.knows("ul. Piłsudskiego 12, Poznań", RATAJE);
    testbed.geocoder.failWith = new Error("timeout");

    expect(await testbed.registry.system().geocodeUnplacedLocations()).toEqual({ placed: 0, notFound: 0 });

    testbed.geocoder.failWith = null;
    expect(await testbed.registry.system().geocodeUnplacedLocations()).toEqual({ placed: 1, notFound: 1 });
    expect((await owner.siteMap()).map((pin) => [pin.name, pin.position])).toEqual([
      ["Kórnik", null],
      ["Rataje", RATAJE],
    ]);
  });
});
