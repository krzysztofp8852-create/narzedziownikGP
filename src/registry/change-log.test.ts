import { describe, expect, it, vi } from "vitest";
import { withActor } from "./registry";
import { zawbud as zawbudInput } from "./testing/company-with-history";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();

/** Firma po zmianie hasła właściciela, z jej dziennikiem zmian bez wpisu o założeniu firmy. */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud");
  const owner = testbed.registry.as(zawbud.ownerId);
  const changes = async () => (await owner.changeLog()).filter((entry) => entry.kind !== "firma_zalozona");
  return { ...zawbud, owner, changes };
}

describe("dziennik zmian: konta i osoby", () => {
  it("zapisuje założenie konta: kto, komu, z jaką rolą i loginem, bez hasła", async () => {
    const { owner, changes } = await givenZawbud();
    testbed.clock.advance(5 * 60_000);

    await owner.addMember({ firstName: "Adam", lastName: "Nowak", email: "adam@zawbud.pl", role: "kierownik" });
    const { personId } = await owner.addPerson({ fullName: "Zbigniew Kaczmarek", note: null });
    await owner.addPersonAccount({ personId, email: "", username: "zbyszek", role: "pracownik" });

    const entries = await changes();
    expect(entries).toEqual([
      expect.objectContaining({ kind: "konto_zalozone", personName: "Zbigniew Kaczmarek", role: "pracownik", login: "zbyszek" }),
      {
        id: expect.any(String),
        at: testbed.clock.now(),
        actorKind: "osoba",
        actorName: "Właściciel Zawbud",
        kind: "konto_zalozone",
        personName: "Adam Nowak",
        role: "kierownik",
        login: "adam@zawbud.pl",
        setting: null,
        oldValue: null,
        newValue: null,
      },
    ]);
  });

  it("zapisuje dezaktywację konta, osoby bez konta i nadanie hasła tymczasowego", async () => {
    const { owner, changes, ...zawbud } = await givenZawbud();
    const managerId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
    await testbed.givenMember(zawbud, "magazynier", "Piotr Wiśniewski");
    const { personId } = await owner.addPerson({ fullName: "Zbigniew Kaczmarek", note: null });
    const storekeeperPerson = (await owner.people()).find((person) => person.fullName === "Piotr Wiśniewski")!;

    await owner.resetMemberPassword(managerId);
    await owner.deactivateMember(managerId);
    await owner.deactivatePerson(storekeeperPerson.personId);
    await owner.deactivatePerson(personId);

    expect((await changes()).slice(0, 4).map(({ kind, personName, actorName }) => ({ kind, personName, actorName }))).toEqual([
      { kind: "osoba_dezaktywowana", personName: "Zbigniew Kaczmarek", actorName: "Właściciel Zawbud" },
      { kind: "konto_dezaktywowane", personName: "Piotr Wiśniewski", actorName: "Właściciel Zawbud" },
      { kind: "konto_dezaktywowane", personName: "Adam Nowak", actorName: "Właściciel Zawbud" },
      { kind: "haslo_zresetowane", personName: "Adam Nowak", actorName: "Właściciel Zawbud" },
    ]);
  });

  it("nieudane polecenie nie zostawia wpisu: zapis jest w transakcji polecenia", async () => {
    const { owner, changes, ...zawbud } = await givenZawbud();
    const managerId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
    const before = await changes();
    vi.spyOn(testbed.auth, "setPassword").mockRejectedValueOnce(new Error("Auth nie odpowiada"));

    await expect(owner.resetMemberPassword(managerId)).rejects.toThrow("Auth nie odpowiada");

    expect(await changes()).toEqual(before);
  });
});

describe("dziennik zmian: ustawienia firmy", () => {
  it("zapisuje każde zmienione ustawienie z poprzednią i nową wartością, a niezmienione pomija", async () => {
    const { owner, changes } = await givenZawbud();

    await owner.updateSettings({ alarmThresholdDays: 45 });
    await owner.updateSettings({ alarmThresholdDays: 45 });
    await owner.updateSettings({ issueVisibility: { siteManagers: false, storekeepers: true, storekeepersClose: true } });
    await owner.updateSettings({ siteManagersSeeCosts: true });

    expect((await changes()).map(({ kind, setting, oldValue, newValue }) => ({ kind, setting, oldValue, newValue }))).toEqual([
      { kind: "ustawienie_zmienione", setting: "koszty_kierownik", oldValue: "false", newValue: "true" },
      { kind: "ustawienie_zmienione", setting: "zgloszenia_magazynier_zamyka", oldValue: "false", newValue: "true" },
      { kind: "ustawienie_zmienione", setting: "zgloszenia_kierownik", oldValue: "true", newValue: "false" },
      { kind: "ustawienie_zmienione", setting: "prog_dni", oldValue: "30", newValue: "45" },
    ]);
  });
});

describe("dziennik zmian: założenie firmy", () => {
  it("super-admin zakłada firmę z właścicielem: wpis bez nazwiska super-admina, ale z jego rolą", async () => {
    const adminId = await testbed.givenSuperAdmin();
    const created = await testbed.registry.superAdmin(adminId).createCompany({ ...zawbudInput, name: "Budrex", owner: { email: "anna@budrex.pl", fullName: "Anna Lis" } });

    expect(await testbed.registry.superAdmin(adminId).changeLog(created.companyId)).toEqual([
      expect.objectContaining({
        actorKind: "super_admin",
        actorName: null,
        kind: "firma_zalozona",
        personName: "Anna Lis",
        role: "wlasciciel",
        login: "anna@budrex.pl",
      }),
    ]);
  });

  it("firma założona skryptem ma wpis od programu", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");

    expect(await testbed.registry.as(zawbud.ownerId).changeLog()).toEqual([
      expect.objectContaining({ actorKind: "system", actorName: null, kind: "firma_zalozona" }),
    ]);
  });
});

describe("kto widzi dziennik zmian", () => {
  it("widzi go tylko właściciel własnej firmy i super-admin", async () => {
    const { owner, ...zawbud } = await givenZawbud();
    const managerId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
    const budrex = await testbed.givenActiveCompany("Budrex");
    const adminId = await testbed.givenSuperAdmin();

    await expect(testbed.registry.as(managerId).changeLog()).rejects.toMatchObject({ code: "forbidden" });
    expect(await withActor(testbed.db, managerId, (sql) => sql("select * from app.change_log"))).toEqual([]);
    expect(await testbed.registry.as(budrex.ownerId).changeLog()).toHaveLength(1);
    expect(await testbed.registry.superAdmin(adminId).changeLog(zawbud.companyId)).toEqual(await owner.changeLog());
    await expect(testbed.registry.superAdmin(managerId).changeLog(zawbud.companyId)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("autora wpisu ustala baza z sesji, a wpis do cudzej firmy albo od kierownika odrzuca", async () => {
    const { owner, ...zawbud } = await givenZawbud();
    const managerId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
    const budrex = await testbed.givenActiveCompany("Budrex");
    const insert = (actorId: string, companyId: string) =>
      withActor(testbed.db, actorId, (sql) =>
        sql(
          `insert into app.change_log (company_id, at, actor_kind, actor_id, actor_name, kind, person_name)
           values ($1, now(), 'super_admin', $2, 'Ktoś inny', 'konto_dezaktywowane', 'Adam Nowak')`,
          [companyId, managerId],
        ),
      );

    await insert(zawbud.ownerId, zawbud.companyId);
    await expect(insert(budrex.ownerId, zawbud.companyId)).rejects.toThrow();
    await expect(insert(managerId, zawbud.companyId)).rejects.toThrow();

    expect((await owner.changeLog())[0]).toMatchObject({ actorKind: "osoba", actorName: "Właściciel Zawbud", kind: "konto_dezaktywowane" });
  });

  it("wpisy tylko się dopisują: nie da się ich zmienić ani usunąć", async () => {
    const zawbud = await givenZawbud();

    await expect(testbed.db.transaction((sql) => sql("update app.change_log set actor_name = 'Ktoś'"))).rejects.toThrow();
    await expect(testbed.db.transaction((sql) => sql("delete from app.change_log"))).rejects.toThrow();
    expect(await zawbud.owner.changeLog()).toHaveLength(1);
  });
});
