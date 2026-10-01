import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createRegistry, withActor } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();

const noFirstSteps = [
  { id: "kierownik", done: false },
  { id: "budowa", done: false },
  { id: "narzedzia", done: false },
  { id: "naklejki", done: false },
];

describe("samouczek po pierwszym logowaniu", () => {
  it("właściciel po zmianie hasła tymczasowego ma nowy samouczek z pierwszymi krokami", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");

    expect(await testbed.registry.as(zawbud.ownerId).tutorial()).toEqual({ role: "wlasciciel", closed: null, firstSteps: noFirstSteps });
  });

  it("kierownik i magazynier mają nowy samouczek zapisu ruchu, bez listy pierwszych kroków", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    for (const role of ["kierownik", "magazynier"] as const) {
      const memberId = await testbed.givenMember(zawbud, role);

      expect(await testbed.registry.as(memberId).tutorial()).toEqual({ role, closed: null, firstSteps: [] });
    }
  });

  it("pracownik i firma demo nie mają samouczka", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const workerId = await testbed.givenMember(zawbud, "pracownik");
    expect(await testbed.registry.as(workerId).tutorial()).toBeNull();
    await expect(testbed.registry.as(workerId).closeTutorial("pominiety")).rejects.toMatchObject({ code: "forbidden" });

    // Demo ma własny przewodnik po tablicy, a konto roli dzielą wszyscy oglądający.
    const demo = await testbed.givenActiveCompany("DemoBud");
    await testbed.registry.system().activateDemoCompany(demo.companyId);
    expect(await testbed.registry.as(demo.ownerId).tutorial()).toBeNull();
  });

  it("przed zmianą hasła tymczasowego samouczka jeszcze nie ma", async () => {
    const zawbud = await testbed.givenCompany("Zawbud");

    await expect(testbed.registry.as(zawbud.ownerId).tutorial()).rejects.toMatchObject({ code: "password_change_required" });
  });
});

describe("pominięcie i ukończenie samouczka", () => {
  it("pominięty samouczek jest zapamiętany na serwerze tylko dla tej osoby", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const managerId = await testbed.givenMember(zawbud, "kierownik");

    await testbed.registry.as(managerId).closeTutorial("pominiety");

    // Nowy Rejestr na tej samej bazie: stan nie siedzi w pamięci procesu ani przeglądarki.
    const fresh = createRegistry({
      db: testbed.db,
      clock: testbed.clock,
      authAdmin: testbed.auth,
      notifier: testbed.notifier,
      photos: testbed.photos,
      chatPhotos: testbed.chatPhotos,
      documents: testbed.documents,
      geocoder: testbed.geocoder,
    });
    expect(await fresh.as(managerId).tutorial()).toMatchObject({ closed: "pominiety" });
    expect(await fresh.as(zawbud.ownerId).tutorial()).toMatchObject({ closed: null });
  });

  it("samouczek otwarty ponownie po pominięciu można ukończyć", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const storekeeper = testbed.registry.as(await testbed.givenMember(zawbud, "magazynier"));
    await storekeeper.closeTutorial("pominiety");

    await storekeeper.closeTutorial("ukonczony");

    expect(await storekeeper.tutorial()).toMatchObject({ closed: "ukonczony" });
  });

  it("odrzuca nieznany wynik", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);

    await expect(owner.closeTutorial("koniec" as never)).rejects.toMatchObject({ code: "invalid_input" });
    expect(await owner.tutorial()).toMatchObject({ closed: null });
  });

  it("działa także w trybie tylko do odczytu", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const admin = testbed.registry.superAdmin(await testbed.givenSuperAdmin());
    await admin.setManualReadOnly(zawbud.companyId, true);
    const owner = testbed.registry.as(zawbud.ownerId);

    await owner.closeTutorial("ukonczony");

    expect(await owner.tutorial()).toMatchObject({ closed: "ukonczony" });
  });

  it("nie zapisuje żadnych ruchów ani narzędzi", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);
    const before = await owner.whereIsWhat();

    await owner.tutorial();
    await owner.closeTutorial("ukonczony");

    expect(await owner.whereIsWhat()).toEqual(before);
    expect((await owner.movementHistory()).movements).toEqual([]);
  });

  it("połączenie z bazą nie zmieni samouczka innej osoby", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const managerId = await testbed.givenMember(zawbud, "kierownik");

    await withActor(testbed.db, managerId, (sql) => sql("update app.users set tutorial = 'pominiety' where user_id = $1", [zawbud.ownerId]));
    // Właściciel może zmieniać konta zespołu tylko przy haśle tymczasowym albo dezaktywacji.
    await expect(
      withActor(testbed.db, zawbud.ownerId, (sql) => sql("update app.users set tutorial = 'pominiety' where user_id = $1", [managerId])),
    ).rejects.toThrow();

    expect(await testbed.registry.as(zawbud.ownerId).tutorial()).toMatchObject({ closed: null });
    expect(await testbed.registry.as(managerId).tutorial()).toMatchObject({ closed: null });
  });
});

describe("pierwsze kroki właściciela", () => {
  it("odhaczają się same, gdy w firmie jest kierownik, budowa, narzędzie i wydrukowana naklejka", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const budrex = await testbed.givenActiveCompany("Budrex");
    const owner = testbed.registry.as(zawbud.ownerId);
    const steps = async () => Object.fromEntries((await owner.tutorial())!.firstSteps.map((step) => [step.id, step.done]));

    const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
    expect(await steps()).toEqual({ kierownik: true, budowa: false, narzedzia: false, naklejki: false });

    await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
    expect(await steps()).toEqual({ kierownik: true, budowa: true, narzedzia: false, naklejki: false });

    const category = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
    const { toolId } = await owner.addTool({ operationId: randomUUID(), code: "S-01", name: "Szlifierka kątowa", categoryId: category.id });
    expect(await steps()).toEqual({ kierownik: true, budowa: true, narzedzia: true, naklejki: false });

    await owner.printStickers({ toolIds: [toolId] }, async (batch) => batch);
    expect(await steps()).toEqual({ kierownik: true, budowa: true, narzedzia: true, naklejki: true });

    // Postęp to stan tej firmy, nie innej.
    expect(await testbed.registry.as(budrex.ownerId).tutorial()).toMatchObject({ firstSteps: noFirstSteps });
  });

  it("właściciel, który sam prowadzi budowę, ma krok kierownika odhaczony bez zakładania konta kierownika", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);
    const steps = async () => Object.fromEntries((await owner.tutorial())!.firstSteps.map((step) => [step.id, step.done]));

    await owner.addVehicle({ name: "Bus WPI 4K21", managerId: zawbud.ownerId });
    expect(await steps()).toEqual({ kierownik: true, budowa: false, narzedzia: false, naklejki: false });

    await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: zawbud.ownerId });
    expect(await steps()).toEqual({ kierownik: true, budowa: true, narzedzia: false, naklejki: false });
  });

  it("magazynier nie odhacza kroku „dodaj kierownika”", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    await testbed.givenMember(zawbud, "magazynier");

    expect(await testbed.registry.as(zawbud.ownerId).tutorial()).toMatchObject({ firstSteps: noFirstSteps });
  });
});
