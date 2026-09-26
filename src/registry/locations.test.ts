import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withActor } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();

describe("dodawanie budowy", () => {
  it("właściciel dodaje budowę z kierownikiem, a tablica pokazuje ją jako aktywną z adresem i kierownikiem", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Swarzędz" });
    const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
    const owner = testbed.registry.as(zawbud.ownerId);

    const { locationId } = await owner.addSite({ name: " Rataje ", address: " ul. Piłsudskiego 12, Poznań ", managerId: nowakId });

    expect((await owner.whereIsWhat()).sites).toEqual([
      {
        id: locationId,
        name: "Rataje",
        address: "ul. Piłsudskiego 12, Poznań",
        status: "aktywna",
        manager: { id: nowakId, fullName: "Adam Nowak", active: true },
        tools: [],
      },
    ]);
  });
});

describe("dane budowy", () => {
  it("odrzuca budowę bez nazwy albo bez adresu", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const managerId = await testbed.givenMember(zawbud, "kierownik");
    const owner = testbed.registry.as(zawbud.ownerId);

    for (const input of [
      { name: " ", address: "ul. Piłsudskiego 12", managerId },
      { name: "Rataje", address: "", managerId },
    ]) {
      await expect(owner.addSite(input)).rejects.toMatchObject({ code: "invalid_input" });
    }
    expect((await owner.whereIsWhat()).sites).toEqual([]);
  });
});

describe("kierownik budowy", () => {
  it("kierownikiem może być tylko aktywny kierownik z tej samej firmy; inaczej budowa nie powstaje", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const budrex = await testbed.givenActiveCompany("Budrex");
    const owner = testbed.registry.as(zawbud.ownerId);
    const storekeeperId = await testbed.givenMember(zawbud, "magazynier");
    const leftId = await testbed.givenMember(zawbud, "kierownik");
    await owner.deactivateMember(leftId);
    const strangerId = await testbed.givenMember(budrex, "kierownik");

    for (const managerId of [storekeeperId, zawbud.ownerId, leftId, strangerId, randomUUID(), "nie-uuid"]) {
      await expect(owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId })).rejects.toMatchObject({
        code: "invalid_manager",
      });
    }
    expect((await owner.whereIsWhat()).sites).toEqual([]);
  });
});

describe("kandydaci na kierownika budowy", () => {
  it("właściciel wybiera spośród aktywnych kierowników swojej firmy, według imienia i nazwiska", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const budrex = await testbed.givenActiveCompany("Budrex");
    const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
    const kowalskiId = await testbed.givenMember(zawbud, "kierownik", "Jan Kowalski");
    await testbed.givenMember(zawbud, "magazynier");
    await testbed.givenMember(budrex, "kierownik");
    const leftId = await testbed.givenMember(zawbud, "kierownik", "Ewa Adamska");
    const owner = testbed.registry.as(zawbud.ownerId);
    await owner.deactivateMember(leftId);

    expect(await owner.siteManagerCandidates()).toEqual([
      { id: nowakId, fullName: "Adam Nowak" },
      { id: kowalskiId, fullName: "Jan Kowalski" },
    ]);
    await expect(testbed.registry.as(nowakId).siteManagerCandidates()).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("zmiana kierownika budowy", () => {
  it("właściciel przekazuje budowę innemu kierownikowi, a tablica pokazuje nowego", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
    const kowalskiId = await testbed.givenMember(zawbud, "kierownik", "Jan Kowalski");
    const owner = testbed.registry.as(zawbud.ownerId);
    const { locationId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });

    await owner.changeSiteManager(locationId, kowalskiId);

    expect((await owner.whereIsWhat()).sites).toEqual([
      expect.objectContaining({ id: locationId, manager: { id: kowalskiId, fullName: "Jan Kowalski", active: true } }),
    ]);
  });

  it("nowym kierownikiem nie zostanie magazynier ani dezaktywowany kierownik; kierownik się nie zmienia", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
    const storekeeperId = await testbed.givenMember(zawbud, "magazynier");
    const leftId = await testbed.givenMember(zawbud, "kierownik");
    const owner = testbed.registry.as(zawbud.ownerId);
    await owner.deactivateMember(leftId);
    const { locationId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });

    for (const managerId of [storekeeperId, leftId, "nie-uuid"]) {
      await expect(owner.changeSiteManager(locationId, managerId)).rejects.toMatchObject({ code: "invalid_manager" });
    }
    expect((await owner.whereIsWhat()).sites).toEqual([expect.objectContaining({ manager: expect.objectContaining({ id: nowakId }) })]);
  });

  it("zakończonej budowie nie zmienia się kierownika, także bezpośrednio w bazie", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
    const kowalskiId = await testbed.givenMember(zawbud, "kierownik");
    const owner = testbed.registry.as(zawbud.ownerId);
    const { locationId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
    // Zamykanie budów przyjdzie osobnym poleceniem; tu kończymy budowę jako aktor systemowy.
    await testbed.db.transaction((sql) => sql("update app.locations set status = 'zakonczona' where id = $1", [locationId]));

    await expect(owner.changeSiteManager(locationId, kowalskiId)).rejects.toMatchObject({ code: "site_finished" });
    const changed = await withActor(testbed.db, zawbud.ownerId, (sql) =>
      sql("update app.locations set manager_id = $2 where id = $1 returning id", [locationId, kowalskiId]),
    );
    expect(changed).toEqual([]);
    expect((await owner.locations()).sites).toEqual([
      expect.objectContaining({ id: locationId, status: "zakonczona", manager: expect.objectContaining({ id: nowakId }) }),
    ]);
  });

  it("kierownika zmienia się tylko budowie: baza, serwis i nieznany identyfikator to „nie znaleziono”", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const nowakId = await testbed.givenMember(zawbud, "kierownik");
    const owner = testbed.registry.as(zawbud.ownerId);
    const { base } = await owner.whereIsWhat();
    const { locationId: serviceId } = await owner.addService({ name: "Serwis Hilti Poznań" });

    for (const id of [base.id, serviceId, randomUUID(), "nie-uuid"]) {
      await expect(owner.changeSiteManager(id, nowakId)).rejects.toMatchObject({ code: "not_found" });
    }
  });
});

describe("serwisy", () => {
  it("właściciel dodaje serwis, który widać na liście lokalizacji, ale nie jako budowę na tablicy", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
    const owner = testbed.registry.as(zawbud.ownerId);
    const { locationId: siteId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });

    const { locationId: serviceId } = await owner.addService({ name: " Serwis Hilti Poznań " });

    expect(await owner.locations()).toEqual({
      base: { id: expect.any(String), name: "Baza" },
      sites: [expect.objectContaining({ id: siteId, name: "Rataje", status: "aktywna" })],
      services: [{ id: serviceId, name: "Serwis Hilti Poznań" }],
    });
    expect((await owner.whereIsWhat()).sites.map((site) => site.id)).toEqual([siteId]);
  });

  it("odrzuca serwis bez nazwy", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);

    await expect(owner.addService({ name: "  " })).rejects.toMatchObject({ code: "invalid_input" });
    expect((await owner.locations()).services).toEqual([]);
  });
});

describe("tylko właściciel zarządza lokalizacjami", () => {
  it("kierownik i magazynier nie dodają budów ani serwisów i nie zmieniają kierownika", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
    const storekeeperId = await testbed.givenMember(zawbud, "magazynier");
    const owner = testbed.registry.as(zawbud.ownerId);
    const { locationId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });

    for (const actorId of [nowakId, storekeeperId]) {
      const actor = testbed.registry.as(actorId);
      await expect(actor.addSite({ name: "Winogrady", address: "os. Wichrowe 3", managerId: nowakId })).rejects.toMatchObject({
        code: "forbidden",
      });
      await expect(actor.addService({ name: "Serwis Makita" })).rejects.toMatchObject({ code: "forbidden" });
      await expect(actor.changeSiteManager(locationId, nowakId)).rejects.toMatchObject({ code: "forbidden" });
    }
    expect(await owner.locations()).toEqual({
      base: { id: expect.any(String), name: "Baza" },
      sites: [expect.objectContaining({ id: locationId })],
      services: [],
    });
  });

  it("kierownik i magazynier widzą aktywne budowy z kierownikiem na tablicy", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
    const storekeeperId = await testbed.givenMember(zawbud, "magazynier");
    await testbed.registry.as(zawbud.ownerId).addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });

    for (const actorId of [nowakId, storekeeperId]) {
      expect((await testbed.registry.as(actorId).whereIsWhat()).sites).toEqual([
        expect.objectContaining({ name: "Rataje", manager: { id: nowakId, fullName: "Adam Nowak", active: true } }),
      ]);
    }
  });

  it("bezpośrednio w bazie kierownik nie doda lokalizacji, a właściciel nie ominie zasad budowy", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const nowakId = await testbed.givenMember(zawbud, "kierownik");
    const storekeeperId = await testbed.givenMember(zawbud, "magazynier");
    const leftId = await testbed.givenMember(zawbud, "kierownik");
    await testbed.registry.as(zawbud.ownerId).deactivateMember(leftId);
    const insertAs = (actorId: string, kind: string, managerId: string | null, status: string | null = "aktywna") =>
      withActor(testbed.db, actorId, (sql) =>
        sql(
          `insert into app.locations (company_id, kind, name, address, manager_id, status, created_at)
           values ($1, $2, 'Na skróty', $3, $4, $5, now())`,
          [zawbud.companyId, kind, kind === "budowa" ? "ul. Krótka 1" : null, managerId, kind === "budowa" ? status : null],
        ),
      );

    await expect(insertAs(nowakId, "budowa", nowakId)).rejects.toThrow();
    await expect(insertAs(nowakId, "serwis", null)).rejects.toThrow();
    await expect(insertAs(zawbud.ownerId, "baza", null)).rejects.toThrow();
    await expect(insertAs(zawbud.ownerId, "budowa", storekeeperId)).rejects.toThrow();
    await expect(insertAs(zawbud.ownerId, "budowa", leftId)).rejects.toThrow();
    await expect(insertAs(zawbud.ownerId, "budowa", nowakId, "zakonczona")).rejects.toThrow();
    await expect(
      withActor(testbed.db, zawbud.ownerId, (sql) =>
        sql(
          `insert into app.locations (company_id, kind, name, manager_id, status, created_at)
           values ($1, 'budowa', 'Bez adresu', $2, 'aktywna', now())`,
          [zawbud.companyId, nowakId],
        ),
      ),
    ).rejects.toThrow();
    expect((await testbed.registry.as(zawbud.ownerId).locations()).sites).toEqual([]);
  });

  it("bezpośrednio w bazie właściciel nie przekaże budowy magazynierowi ani nie zmieni jej statusu", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
    const storekeeperId = await testbed.givenMember(zawbud, "magazynier");
    const { locationId } = await testbed.registry
      .as(zawbud.ownerId)
      .addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
    const updateAs = (set: string, params: unknown[]) =>
      withActor(testbed.db, zawbud.ownerId, (sql) => sql(`update app.locations set ${set} where id = $1`, [locationId, ...params]));

    await expect(updateAs("manager_id = $2", [storekeeperId])).rejects.toThrow();
    await expect(updateAs("status = 'zakonczona'", [])).rejects.toThrow();
    expect((await testbed.registry.as(zawbud.ownerId).whereIsWhat()).sites).toEqual([
      expect.objectContaining({ id: locationId, status: "aktywna", manager: expect.objectContaining({ id: nowakId }) }),
    ]);
  });
});

describe("izolacja firm w lokalizacjach", () => {
  it("właściciel innej firmy nie widzi budów i serwisów Zawbudu, nie zmienia ich kierownika ani nie bierze jego kierownika", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const budrex = await testbed.givenActiveCompany("Budrex");
    const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
    const budrexManagerId = await testbed.givenMember(budrex, "kierownik");
    const owner = testbed.registry.as(zawbud.ownerId);
    const { locationId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
    await owner.addService({ name: "Serwis Hilti Poznań" });
    const stranger = testbed.registry.as(budrex.ownerId);

    expect((await stranger.whereIsWhat()).sites).toEqual([]);
    const zawbudBase = (await owner.whereIsWhat()).base;
    expect(await stranger.locations()).toEqual({ base: { id: expect.not.stringMatching(zawbudBase.id), name: "Baza" }, sites: [], services: [] });
    await expect(stranger.changeSiteManager(locationId, budrexManagerId)).rejects.toMatchObject({ code: "not_found" });
    await expect(stranger.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId })).rejects.toMatchObject({
      code: "invalid_manager",
    });
    await expect(owner.changeSiteManager(locationId, budrexManagerId)).rejects.toMatchObject({ code: "invalid_manager" });
    expect((await owner.whereIsWhat()).sites).toEqual([expect.objectContaining({ manager: expect.objectContaining({ id: nowakId }) })]);
  });

  it("bezpośrednio w bazie właściciel nie doda lokalizacji innej firmie ani nie zmieni jej budowy", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const budrex = await testbed.givenActiveCompany("Budrex");
    const nowakId = await testbed.givenMember(zawbud, "kierownik");
    const budrexManagerId = await testbed.givenMember(budrex, "kierownik");
    const { locationId } = await testbed.registry
      .as(zawbud.ownerId)
      .addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });

    await expect(
      withActor(testbed.db, budrex.ownerId, (sql) =>
        sql("insert into app.locations (company_id, kind, name, created_at) values ($1, 'serwis', 'Obcy serwis', now())", [
          zawbud.companyId,
        ]),
      ),
    ).rejects.toThrow();
    const changed = await withActor(testbed.db, budrex.ownerId, (sql) =>
      sql("update app.locations set manager_id = $2 where id = $1 returning id", [locationId, budrexManagerId]),
    );
    expect(changed).toEqual([]);
    expect((await testbed.registry.as(zawbud.ownerId).locations()).services).toEqual([]);
  });
});

describe("dezaktywowany kierownik budowy", () => {
  it("budowa zostaje przy nim, a tablica pokazuje, że konto jest dezaktywowane, dopóki właściciel nie przekaże budowy", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
    const kowalskiId = await testbed.givenMember(zawbud, "kierownik", "Jan Kowalski");
    const owner = testbed.registry.as(zawbud.ownerId);
    const { locationId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });

    await owner.deactivateMember(nowakId);
    expect((await owner.whereIsWhat()).sites).toEqual([
      expect.objectContaining({ id: locationId, manager: { id: nowakId, fullName: "Adam Nowak", active: false } }),
    ]);

    await owner.changeSiteManager(locationId, kowalskiId);
    expect((await owner.whereIsWhat()).sites).toEqual([
      expect.objectContaining({ manager: { id: kowalskiId, fullName: "Jan Kowalski", active: true } }),
    ]);
  });
});
