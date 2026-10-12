import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Db } from "./ports";
import { createRegistry, withActor } from "./registry";
import { givenCompanyWithHistory as givenHistory, jpeg } from "./testing/company-with-history";
import { FakeAuthAdmin, FakeGeocoder, FixedClock, MemoryPhotoStore, RecordingNotifier } from "./testing/fakes";
import { setupRegistryTestbed, START } from "./testing/harness";
import { createPgliteDbBefore } from "./testing/pglite-db";

const testbed = setupRegistryTestbed();

const ANONYMIZATION_MIGRATION = "20261115090000_person_anonymization.sql";

/**
 * Firma z historią, w której kierownik Adam Nowak zostawił wszystko, co osoba może zostawić: ruchy, zgłoszenie,
 * odbicia, uprawnienie z dokumentem, telefon w powiadomieniach push, czat z supportem ze zdjęciem, wpisy w dzienniku
 * zmian i swoje imię w dzwonku innej osoby.
 */
async function givenCompanyWithManagerTraces() {
  const adminId = await testbed.givenSuperAdmin();
  const company = await givenHistory(testbed, adminId);
  const owner = testbed.registry.as(company.ownerId);
  const manager = testbed.registry.as(company.managerId);
  const managerPerson = (await owner.people()).find((person) => person.account?.userId === company.managerId)!;
  const managerEmail = managerPerson.account!.email!;
  const otherManagerId = await testbed.givenMember(company, "kierownik", "Beata Wiśniewska");
  const { locationId: otherSiteId } = await owner.addSite({ name: "Junikowo", address: "ul. Grunwaldzka 1", managerId: otherManagerId });
  const category = (await owner.categories())[0];
  const { toolId: otherToolId } = await owner.addTool({ operationId: randomUUID(), code: "S-02", name: "Wiertarka", categoryId: category.id, value: 200 });
  const { base } = await owner.whereIsWhat();
  await owner.registerMovement({ operationId: randomUUID(), kind: "wydanie", fromLocationId: base.id, toLocationId: otherSiteId, toolIds: [otherToolId], source: "checklista" });
  // Adam zabiera wiertarkę z budowy Beaty: ona dostaje w dzwonku „zabrał Adam Nowak”.
  await manager.registerMovement({
    operationId: randomUUID(),
    kind: "przeniesienie",
    fromLocationId: otherSiteId,
    toLocationId: company.siteId,
    toolIds: [otherToolId],
    source: "checklista",
  });
  await owner.resetMemberPassword(company.managerId);
  await manager.changePassword("Nowe-haslo-Adama-1", testbed.signedInNow());
  const { qualificationId } = await owner.addQualification({ personId: managerPerson.personId, kind: "szkolenie_bhp", dueOn: "2026-09-01" });
  await owner.addQualificationDocument({ operationId: randomUUID(), qualificationId, file: jpeg(), fileName: "bhp-adam.jpg" });
  await manager.subscribeToPush({ kind: "aplikacja", token: `telefon-adama-${randomUUID()}` });
  await manager.sendSupportMessage({ operationId: randomUUID(), text: "Tu Adam Nowak, nie widzę budowy", photo: jpeg() });
  return { ...company, adminId, owner, managerPersonId: managerPerson.personId, managerEmail, otherManagerId };
}

/** Wszystkie wiersze schematu `app` i kont logowania jako jeden tekst: czy zostało gdzieś imię, e-mail albo login. */
async function everything(db: Db): Promise<string> {
  return db.transaction(async (sql) => {
    const tables = await sql<{ name: string }>("select format('%I.%I', schemaname, tablename) as name from pg_tables where schemaname = 'app'");
    const dump: unknown[] = [];
    for (const { name } of [...tables, { name: "auth.users" }]) dump.push(name, await sql(`select * from ${name}`));
    return JSON.stringify(dump);
  });
}

describe("anonimizacja osoby", () => {
  it("właściciel anonimizuje kierownika: dane osobowe, konto, uprawnienia, push i czat znikają, a historia pokazuje nazwę zastępczą", async () => {
    const company = await givenCompanyWithManagerTraces();
    const { owner } = company;
    expect(testbed.documents.photos.size).toBe(3);
    expect(testbed.chatPhotos.photos.size).toBe(2);

    expect(await owner.anonymizePerson(company.managerPersonId)).toEqual({ fullName: "Osoba zanonimizowana 1", leftovers: 0 });

    const anonymized = (await owner.people()).find((person) => person.personId === company.managerPersonId);
    expect(anonymized).toEqual({
      personId: company.managerPersonId,
      fullName: "Osoba zanonimizowana 1",
      note: null,
      active: false,
      anonymized: true,
      account: { userId: company.managerId, email: null, username: null, role: "kierownik", active: false, mustChangePassword: false },
    });
    // Konto logowania i wszystko, co należało tylko do tej osoby, znika.
    expect(await testbed.db.transaction((sql) => sql("select id from auth.users where id = $1", [company.managerId]))).toEqual([]);
    expect(await testbed.registry.as(company.managerId).session()).toBeNull();
    expect(await testbed.db.transaction((sql) => sql("select 1 from app.push_subscriptions where user_id = $1", [company.managerId]))).toEqual([]);
    expect((await owner.personQualifications(company.managerPersonId))?.qualifications).toEqual([]);
    expect(testbed.documents.photos.size).toBe(2);
    expect(testbed.chatPhotos.photos.size).toBe(1);
    const admin = testbed.registry.superAdmin(company.adminId);
    expect((await admin.supportThreads()).map((thread) => thread.user.fullName)).toEqual(["Jan Kowalski"]);
    // Ruchy, zgłoszenia i odbicia zostają z nazwą zastępczą.
    const { movements } = await owner.movementHistory();
    expect(new Set(movements.map((movement) => movement.author))).toEqual(new Set(["Osoba zanonimizowana 1", "Jan Kowalski"]));
    expect(movements[0].author).toBe("Osoba zanonimizowana 1");
    expect((await owner.issue(company.issueId))?.author).toBe("Osoba zanonimizowana 1");
    const onSite = await owner.peopleOnSite(company.siteId);
    expect([...onSite.present, ...onSite.history].map((punch) => punch.person.fullName)).toContain("Osoba zanonimizowana 1");
    // Dziennik zmian: wcześniejsze wpisy o tej osobie bez imienia i loginu, a na końcu sama anonimizacja.
    const log = await owner.changeLog();
    expect(log[0]).toMatchObject({ kind: "osoba_zanonimizowana", personName: "Osoba zanonimizowana 1", actorKind: "osoba", actorName: "Jan Kowalski" });
    expect(log.filter((entry) => entry.personName === "Osoba zanonimizowana 1").map((entry) => [entry.kind, entry.login])).toEqual([
      ["osoba_zanonimizowana", null],
      ["haslo_zresetowane", null],
      ["konto_zalozone", null],
    ]);
    // Imię, e-mail ani treść jego czatu nie zostały nigdzie w bazie, także w dzwonku Beaty.
    const rows = await everything(testbed.db);
    for (const trace of ["Adam Nowak", company.managerEmail, "nie widzę budowy"]) expect(rows).not.toContain(trace);
    const [taken] = (await testbed.registry.as(company.otherManagerId).bell()).entries;
    expect(taken.notification).toMatchObject({ kind: "narzedzia_zabrane", takenBy: "Osoba zanonimizowana 1" });
  });

  it("osoba bez konta, także już nieaktywna: znika jej imię, notatka i uprawnienia, a kolejna anonimizacja dostaje kolejny numer", async () => {
    const company = await givenCompanyWithManagerTraces();
    const { owner } = company;
    const { personId: helperId } = await owner.addPerson({ fullName: "Piotr Zieliński", note: "tel. 600 100 200" });
    await owner.deactivatePerson(company.personId);

    expect(await owner.anonymizePerson(company.managerPersonId)).toMatchObject({ fullName: "Osoba zanonimizowana 1" });
    expect(await owner.anonymizePerson(company.personId)).toMatchObject({ fullName: "Osoba zanonimizowana 2" });
    expect(await owner.anonymizePerson(helperId)).toMatchObject({ fullName: "Osoba zanonimizowana 3" });

    const people = await owner.people();
    expect(people.filter((person) => person.anonymized).map(({ fullName, note, active, account }) => ({ fullName, note, active, account }))).toEqual([
      { fullName: "Osoba zanonimizowana 1", note: null, active: false, account: expect.objectContaining({ active: false }) },
      { fullName: "Osoba zanonimizowana 2", note: null, active: false, account: null },
      { fullName: "Osoba zanonimizowana 3", note: null, active: false, account: null },
    ]);
    expect(testbed.documents.photos.size).toBe(1);
    expect((await owner.changeLog()).find((entry) => entry.kind === "osoba_dezaktywowana")?.personName).toBe("Osoba zanonimizowana 2");
    const rows = await everything(testbed.db);
    for (const trace of ["Zbigniew Kaczmarek", "Piotr Zieliński", "600 100 200"]) expect(rows).not.toContain(trace);
  });

  it("super-admin anonimizuje osobę w dowolnej firmie, także w trybie tylko do odczytu, a dziennik zapisuje GP Engineering", async () => {
    const company = await givenCompanyWithManagerTraces();
    const admin = testbed.registry.superAdmin(company.adminId);
    await admin.setManualReadOnly(company.companyId, true);
    expect((await admin.people(company.companyId)).map((person) => [person.fullName, person.login, person.anonymized])).toEqual([
      ["Adam Nowak", company.managerEmail, false],
      ["Beata Wiśniewska", expect.stringContaining("@"), false],
      ["Jan Kowalski", "jan@zawbud.pl", false],
      ["Zbigniew Kaczmarek", null, false],
    ]);

    expect(await admin.anonymizePerson(company.companyId, company.managerPersonId)).toEqual({ fullName: "Osoba zanonimizowana 1", leftovers: 0 });

    expect((await admin.people(company.companyId)).find((person) => person.personId === company.managerPersonId)).toMatchObject({
      fullName: "Osoba zanonimizowana 1",
      login: null,
      active: false,
      anonymized: true,
    });
    expect(await testbed.db.transaction((sql) => sql("select id from auth.users where id = $1", [company.managerId]))).toEqual([]);
    expect((await admin.changeLog(company.companyId))[0]).toMatchObject({ kind: "osoba_zanonimizowana", actorKind: "super_admin", actorName: null });
    // Osoba spoza wskazanej firmy to „nie znaleziono”.
    const budrex = await testbed.givenActiveCompany("Budrex");
    await expect(admin.anonymizePerson(budrex.companyId, company.personId)).rejects.toMatchObject({ code: "not_found" });
    await expect(admin.people(randomUUID())).resolves.toEqual([]);
  });

  it("plik, którego Storage nie usunął, wraca jako pozostałość, a osoba i tak jest zanonimizowana", async () => {
    const company = await givenCompanyWithManagerTraces();
    testbed.chatPhotos.removeFailWith = new Error("Storage nie odpowiada");

    expect(await company.owner.anonymizePerson(company.managerPersonId)).toEqual({ fullName: "Osoba zanonimizowana 1", leftovers: 1 });

    expect(await testbed.db.transaction((sql) => sql("select id from auth.users where id = $1", [company.managerId]))).toEqual([]);
    expect(await everything(testbed.db)).not.toContain("Adam Nowak");
  });

  it("usunięcie firmy po anonimizacji jej osoby usuwa wszystko bez pozostałości", async () => {
    const company = await givenCompanyWithManagerTraces();
    await company.owner.anonymizePerson(company.managerPersonId);
    const admin = testbed.registry.superAdmin(company.adminId);
    await admin.setManualReadOnly(company.companyId, true);

    expect(await admin.deleteCompany(company.companyId, "Zawbud")).toEqual({ leftovers: 0 });

    expect(await testbed.db.transaction((sql) => sql("select 1 from app.people where company_id = $1", [company.companyId]))).toEqual([]);
  });

  it("nie mogą jej wykonać kierownik, magazynier, pracownik, właściciel innej firmy ani nikt spoza panelu super-admina, a nic się nie zmienia", async () => {
    const company = await givenCompanyWithManagerTraces();
    const storekeeperId = await testbed.givenMember(company, "magazynier");
    const workerId = await testbed.givenMember(company, "pracownik");
    const budrex = await testbed.givenActiveCompany("Budrex");
    const before = await everything(testbed.db);

    for (const userId of [company.otherManagerId, storekeeperId, workerId]) {
      await expect(testbed.registry.as(userId).anonymizePerson(company.managerPersonId)).rejects.toMatchObject({ code: "forbidden" });
    }
    // Właściciel innej firmy nie widzi tej osoby.
    await expect(testbed.registry.as(budrex.ownerId).anonymizePerson(company.managerPersonId)).rejects.toMatchObject({ code: "not_found" });
    for (const userId of [company.ownerId, budrex.ownerId, company.managerId, "nie-uuid"]) {
      const asAdmin = testbed.registry.superAdmin(userId);
      await expect(asAdmin.anonymizePerson(company.companyId, company.managerPersonId)).rejects.toMatchObject({ code: "forbidden" });
      if (userId !== "nie-uuid") await expect(asAdmin.people(company.companyId)).rejects.toMatchObject({ code: "forbidden" });
    }

    expect(await everything(testbed.db)).toBe(before);
  });

  it("odmawia konta właściciela, osoby już zanonimizowanej, nieznanej osoby, firmy demo i właścicielowi w trybie tylko do odczytu", async () => {
    const company = await givenCompanyWithManagerTraces();
    const { owner } = company;
    const admin = testbed.registry.superAdmin(company.adminId);
    const ownerPerson = (await owner.people()).find((person) => person.account?.userId === company.ownerId)!;

    await expect(owner.anonymizePerson(ownerPerson.personId)).rejects.toMatchObject({ code: "forbidden" });
    await expect(admin.anonymizePerson(company.companyId, ownerPerson.personId)).rejects.toMatchObject({ code: "forbidden" });
    await owner.anonymizePerson(company.managerPersonId);
    await expect(owner.anonymizePerson(company.managerPersonId)).rejects.toMatchObject({ code: "forbidden" });
    for (const personId of [randomUUID(), "nie-uuid"]) {
      await expect(owner.anonymizePerson(personId)).rejects.toMatchObject({ code: "not_found" });
      await expect(admin.anonymizePerson(company.companyId, personId)).rejects.toMatchObject({ code: "not_found" });
    }
    await admin.setManualReadOnly(company.companyId, true);
    await expect(owner.anonymizePerson(company.personId)).rejects.toMatchObject({ code: "read_only" });

    const demo = await testbed.givenActiveCompany("DemoBud");
    const { personId: demoPersonId } = await testbed.registry.as(demo.ownerId).addPerson({ fullName: "Robotnik Demo", note: null });
    await testbed.db.transaction((sql) => sql("update app.companies set demo_since = now() where id = $1", [demo.companyId]));
    await expect(testbed.registry.as(demo.ownerId).anonymizePerson(demoPersonId)).rejects.toMatchObject({ code: "demo_locked" });
    await expect(admin.anonymizePerson(demo.companyId, demoPersonId)).rejects.toMatchObject({ code: "demo_locked" });

    expect((await owner.people()).find((person) => person.personId === company.personId)).toMatchObject({ fullName: "Zbigniew Kaczmarek", anonymized: false });
  });

  it("dziennik zmian dalej tylko się dopisuje: imię da się w nim zmienić tylko na nazwę zastępczą zanonimizowanej osoby", async () => {
    const company = await givenCompanyWithManagerTraces();
    const change = (set: string) => testbed.db.transaction((sql) => sql(`update app.change_log set ${set} where company_id = $1`, [company.companyId]));

    await expect(change("person_name = 'Ktoś inny'")).rejects.toThrow(/tylko się dopisuje/);
    await expect(change("login = null")).rejects.toThrow(/tylko się dopisuje/);
    await expect(change("actor_name = 'Osoba zanonimizowana 1'")).rejects.toThrow(/tylko się dopisuje/);
    await expect(testbed.db.transaction((sql) => sql("delete from app.change_log where company_id = $1", [company.companyId]))).rejects.toThrow(
      /tylko się dopisuje/,
    );
    await company.owner.anonymizePerson(company.managerPersonId);
    await expect(
      testbed.db.transaction((sql) => sql("update app.change_log set person_name = 'Adam Nowak' where person_name = 'Osoba zanonimizowana 1'")),
    ).rejects.toThrow(/tylko się dopisuje/);
    // Czat zanonimizowanej osoby zniknął, a cudzego dalej nie da się usunąć.
    await expect(testbed.db.transaction((sql) => sql("delete from app.support_messages"))).rejects.toThrow(/tylko się dopisuje/);
    // Właściciel bezpośrednio w bazie nie zmieni dziennika ani nie zanonimizuje osoby z pominięciem Rejestru.
    await expect(
      withActor(testbed.db, company.ownerId, (sql) => sql("update app.users set email = null where user_id = $1", [company.otherManagerId])),
    ).rejects.toThrow();
  });
});

describe("dziennik zmian po wdrożeniu anonimizacji", () => {
  it("dotychczasowe wpisy dostają osobę: po loginie konta albo po imieniu i nazwisku, gdy w firmie jest jedna taka osoba", async () => {
    const { db, migrate } = await createPgliteDbBefore(ANONYMIZATION_MIGRATION);
    try {
      const auth = new FakeAuthAdmin(db);
      const registry = createRegistry({
        db,
        clock: new FixedClock(START),
        authAdmin: auth,
        notifier: new RecordingNotifier(),
        photos: new MemoryPhotoStore(),
        chatPhotos: new MemoryPhotoStore(),
        documents: new MemoryPhotoStore(),
        geocoder: new FakeGeocoder(),
      });
      // Stan sprzed migracji wprost w bazie, bo dzisiejszy Rejestr zapisuje już osobę we wpisie.
      const [{ id: companyId }] = await db.transaction((sql) =>
        sql<{ id: string }>("insert into app.companies (name, created_at) values ('Zawbud', now()) returning id"),
      );
      const account = async (fullName: string, role: string, login: { email?: string; username?: string }) => {
        const { userId } = await auth.createUser({ email: login.email ?? `${randomUUID()}@pracownicy.test`, password: "Haslo-konta-1" });
        return db.transaction(async (sql) => {
          await sql(
            `insert into app.users (user_id, company_id, role, full_name, email, username, must_change_password, created_at)
             values ($1, $2, $3, $4, $5, $6, false, now())`,
            [userId, companyId, role, fullName, login.email ?? null, login.username ?? null],
          );
          const [{ id }] = await sql<{ id: string }>(
            "insert into app.people (company_id, full_name, user_id, created_at) values ($1, $2, $3, now()) returning id",
            [companyId, fullName, userId],
          );
          return id;
        });
      };
      const person = (fullName: string) =>
        db.transaction(async (sql) => {
          const [{ id }] = await sql<{ id: string }>("insert into app.people (company_id, full_name, created_at) values ($1, $2, now()) returning id", [
            companyId,
            fullName,
          ]);
          return id;
        });
      const ownerId = await account("Jan Kowalski", "wlasciciel", { email: "jan@zawbud.pl" });
      // Adam zmienił potem nazwisko: wpis o założeniu konta i tak trafi do niego po loginie.
      const adamId = await account("Adam Nowak-Wiśniewski", "kierownik", { email: "adam@zawbud.pl" });
      const workerId = await account("Piotr Zieliński", "pracownik", { username: "piotr.z" });
      const helperId = await person("Zbigniew Kaczmarek");
      await person("Jan Nowak");
      await person("Jan Nowak");
      const entry = (kind: string, personName: string, login: string | null = null) =>
        db.transaction((sql) =>
          sql("insert into app.change_log (company_id, at, actor_kind, kind, person_name, role, login) values ($1, now(), 'system', $2, $3, $4, $5)", [
            companyId,
            kind,
            personName,
            login ? "kierownik" : null,
            login,
          ]),
        );
      await entry("firma_zalozona", "Jan Kowalski", "jan@zawbud.pl");
      await entry("konto_zalozone", "Adam Nowak", "adam@zawbud.pl");
      await entry("konto_zalozone", "Piotr Zieliński", "piotr.z");
      await entry("haslo_zresetowane", "Piotr Zieliński");
      await entry("osoba_dezaktywowana", "Zbigniew Kaczmarek");
      await entry("osoba_dezaktywowana", "Jan Nowak");
      await entry("konto_dezaktywowane", "Ktoś, kogo już nie ma w kartotece");

      await migrate();

      const linked = await db.transaction((sql) =>
        sql<{ person_name: string; person_id: string | null }>("select person_name, person_id from app.change_log order by id"),
      );
      expect(linked.map((row) => [row.person_name, row.person_id])).toEqual([
        ["Jan Kowalski", ownerId],
        ["Adam Nowak", adamId],
        ["Piotr Zieliński", workerId],
        ["Piotr Zieliński", workerId],
        ["Zbigniew Kaczmarek", helperId],
        // Dwie osoby o tym imieniu i nazwisku: nie wiadomo, której dotyczy wpis.
        ["Jan Nowak", null],
        ["Ktoś, kogo już nie ma w kartotece", null],
      ]);
      // Po wdrożeniu anonimizacja Adama czyści też wpis sprzed zmiany nazwiska.
      const [{ user_id: ownerUserId }] = await db.transaction((sql) => sql<{ user_id: string }>("select user_id from app.people where id = $1", [ownerId]));
      await registry.as(ownerUserId).anonymizePerson(adamId);
      expect(await db.transaction((sql) => sql("select 1 from app.change_log where person_name like 'Adam%' or login like 'adam%'"))).toEqual([]);
    } finally {
      await db.close();
    }
  });
});
