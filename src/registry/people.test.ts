import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createRegistry, type TierId, withActor } from "./registry";
import { FakeAuthAdmin, FakeGeocoder, FixedClock, MemoryPhotoStore, RecordingNotifier } from "./testing/fakes";
import { setupRegistryTestbed, START } from "./testing/harness";
import { createPgliteDbBefore } from "./testing/pglite-db";

const testbed = setupRegistryTestbed();

const PEOPLE_MIGRATION = "20261103090000_people.sql";

/** Firma w panelu super-admina z danym pakietem; właściciel ma już własne hasło. */
async function givenCompanyWithPackage(tier: TierId) {
  const admin = testbed.registry.superAdmin(await testbed.givenSuperAdmin());
  const created = await admin.createCompany({
    name: "Zawbud",
    baseName: "Baza",
    owner: { email: "wlasciciel@zawbud.test", fullName: "Jan Zawadzki" },
    invoice: { name: "Zawbud sp. z o.o.", taxId: "7781234563", address: "ul. Polna 3, Poznań" },
    tier,
    paidUntil: "2026-12-31",
  });
  await testbed.registry.as(created.ownerUserId).changePassword("Zawbud-haslo-1", testbed.signedInNow());
  return { companyId: created.companyId, ownerId: created.ownerUserId, owner: testbed.registry.as(created.ownerUserId) };
}

/** Mały pakiet z właścicielem i czterema kierownikami: bez wolnego miejsca na osobę zapisującą ruchy. */
async function givenFullSmallPackage() {
  const zawbud = await givenCompanyWithPackage("maly");
  for (const name of ["adam", "beata", "cezary", "dorota"]) {
    await zawbud.owner.addMember({ firstName: name, lastName: "Nowak", email: `${name}@zawbud.pl`, role: "kierownik" });
  }
  return zawbud;
}

describe("kartoteka Ludzie po wdrożeniu modułu", () => {
  it("każde istniejące konto (także dezaktywowane) staje się osobą z tym kontem, a firmy się nie mieszają", async () => {
    const { db, migrate } = await createPgliteDbBefore(PEOPLE_MIGRATION);
    try {
      const auth = new FakeAuthAdmin(db);
      const clock = new FixedClock(START);
      const registry = createRegistry({
        db,
        clock,
        authAdmin: auth,
        notifier: new RecordingNotifier(),
        photos: new MemoryPhotoStore(),
        chatPhotos: new MemoryPhotoStore(),
        documents: new MemoryPhotoStore(),
        geocoder: new FakeGeocoder(),
      });
      // Firmy i konta tak, jak zostawiła je poprzednia wersja: wprost w bazie, bo dzisiejszy Rejestr pisze już osoby.
      const account = async (companyId: string, role: string, fullName: string, extra: { active?: boolean; username?: string } = {}) => {
        const { userId } = await auth.createUser({ email: `${randomUUID()}@firma.test`, password: "Haslo-konta-1" });
        await db.transaction((sql) =>
          sql(
            `insert into app.users (user_id, company_id, role, full_name, email, username, must_change_password, active, created_at)
             values ($1, $2, $3, $4, $5, $6, false, $7, now())`,
            [userId, companyId, role, fullName, extra.username ? null : `${userId}@firma.test`, extra.username ?? null, extra.active ?? true],
          ),
        );
        return userId;
      };
      const company = async (name: string) => {
        const [row] = await db.transaction((sql) => sql<{ id: string }>("insert into app.companies (name, created_at) values ($1, now()) returning id", [name]));
        await db.transaction((sql) => sql("insert into app.locations (company_id, kind, name, created_at) values ($1, 'baza', 'Baza', now())", [row.id]));
        await db.transaction((sql) => sql("insert into app.subscriptions (company_id, tier) values ($1, 'maly')", [row.id]));
        return row.id;
      };
      const zawbud = await company("Zawbud");
      const budrex = await company("Budrex");
      const ownerId = await account(zawbud, "wlasciciel", "Jan Zawadzki");
      const managerId = await account(zawbud, "kierownik", "Adam Nowak");
      const leftId = await account(zawbud, "magazynier", "Ewa Wiśniewska", { active: false });
      const workerId = await account(zawbud, "pracownik", "Piotr Mazur", { username: "pmazur" });
      await account(budrex, "wlasciciel", "Ola Budrex");

      await migrate();

      const people = await registry.as(ownerId).people();
      expect(people.map((person) => [person.fullName, person.active, person.account?.userId, person.account?.role])).toEqual([
        ["Adam Nowak", true, managerId, "kierownik"],
        ["Jan Zawadzki", true, ownerId, "wlasciciel"],
        ["Piotr Mazur", true, workerId, "pracownik"],
        ["Ewa Wiśniewska", false, leftId, "magazynier"],
      ]);
      expect(people.find((person) => person.account?.userId === workerId)).toMatchObject({ note: null, account: { username: "pmazur", email: null } });
    } finally {
      await db.close();
    }
  });
});

describe("osoba z kontem", () => {
  it("dodanie konta zapisuje osobę w kartotece z jej kontem i rolą", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);

    const added = await owner.addMember({ firstName: "Adam", lastName: "Nowak", email: "adam@zawbud.pl", role: "kierownik" });
    const worker = await owner.addMember({ firstName: "Piotr", lastName: "Mazur", email: "", username: "pmazur", role: "pracownik" });

    expect(await owner.people()).toEqual([
      {
        personId: expect.any(String),
        fullName: "Adam Nowak",
        note: null,
        active: true,
        account: { userId: added.userId, email: "adam@zawbud.pl", username: null, role: "kierownik", active: true, mustChangePassword: true },
      },
      {
        personId: expect.any(String),
        fullName: "Piotr Mazur",
        note: null,
        active: true,
        account: { userId: worker.userId, email: null, username: "pmazur", role: "pracownik", active: true, mustChangePassword: true },
      },
      expect.objectContaining({ fullName: "Właściciel Zawbud", account: expect.objectContaining({ userId: zawbud.ownerId, role: "wlasciciel" }) }),
    ]);
  });

  it("właściciel firmy założonej w panelu super-admina też jest w kartotece", async () => {
    const zawbud = await givenCompanyWithPackage("maly");

    expect(await zawbud.owner.people()).toEqual([
      expect.objectContaining({ fullName: "Jan Zawadzki", active: true, account: expect.objectContaining({ userId: zawbud.ownerId, role: "wlasciciel" }) }),
    ]);
  });
});

describe("osoba bez konta", () => {
  it("właściciel dopisuje osobę z notatką, a kartoteka pokazuje, że nie ma konta", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);

    const { personId } = await owner.addPerson({ fullName: "  Zbigniew Kaczmarek ", note: " Pomocnik w brygadzie Marka " });
    await owner.addPerson({ fullName: "Tadeusz Wróbel", note: "  " });

    const people = await owner.people();
    expect(people).toContainEqual({ personId, fullName: "Zbigniew Kaczmarek", note: "Pomocnik w brygadzie Marka", active: true, account: null });
    expect(people).toContainEqual(expect.objectContaining({ fullName: "Tadeusz Wróbel", note: null, account: null }));
    expect(people).toHaveLength(3);
  });

  it("odrzuca osobę bez imienia i nazwiska albo z za długą notatką", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);

    for (const input of [{ fullName: " ", note: null }, { fullName: "Zbigniew Kaczmarek", note: "x".repeat(501) }, { fullName: "x".repeat(101), note: null }]) {
      await expect(owner.addPerson(input)).rejects.toMatchObject({ code: "invalid_input" });
    }
    expect(await owner.people()).toHaveLength(1);
  });

  it("nie zajmuje miejsca w pakiecie: w pełnym małym pakiecie da się dopisać całą brygadę", async () => {
    const zawbud = await givenFullSmallPackage();

    for (const fullName of ["Zbigniew Kaczmarek", "Tadeusz Wróbel", "Grzegorz Pietrzak"]) await zawbud.owner.addPerson({ fullName, note: null });

    expect((await zawbud.owner.subscription()).recorders).toMatchObject({ recorderCount: 5, seatsLeft: 0 });
    expect(await zawbud.owner.people()).toHaveLength(8);
  });
});

describe("konto dla osoby z kartoteki", () => {
  it("osoba dostaje konto bez drugiego wpisu i loguje się jako ona, z nazwą z kartoteki", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);
    const { personId } = await owner.addPerson({ fullName: "Zbigniew Kaczmarek", note: "Pomocnik" });

    const added = await owner.addPersonAccount({ personId, email: "", username: "zkaczmarek", role: "pracownik" });

    expect(added).toEqual({ userId: expect.any(String), fullName: "Zbigniew Kaczmarek", email: null, username: "zkaczmarek", temporaryPassword: expect.any(String) });
    expect(testbed.auth.passwordOf(added.userId)).toBe(added.temporaryPassword);
    const people = await owner.people();
    expect(people).toHaveLength(2);
    expect(people).toContainEqual({
      personId,
      fullName: "Zbigniew Kaczmarek",
      note: "Pomocnik",
      active: true,
      account: { userId: added.userId, email: null, username: "zkaczmarek", role: "pracownik", active: true, mustChangePassword: true },
    });
    expect(await testbed.registry.as(added.userId).session()).toMatchObject({ fullName: "Zbigniew Kaczmarek", role: "pracownik" });
    expect(await owner.team()).toContainEqual(expect.objectContaining({ userId: added.userId, fullName: "Zbigniew Kaczmarek" }));
  });

  it("kierownik z kartoteki potrzebuje miejsca w pakiecie; bez niego osoba zostaje bez konta i nie powstaje konto logowania", async () => {
    const zawbud = await givenFullSmallPackage();
    const { personId } = await zawbud.owner.addPerson({ fullName: "Zbigniew Kaczmarek", note: null });
    const accounts = testbed.auth.accountCount();

    await expect(zawbud.owner.addPersonAccount({ personId, email: "zbyszek@zawbud.pl", role: "kierownik" })).rejects.toMatchObject({
      code: "recorder_limit",
    });

    expect(testbed.auth.accountCount()).toBe(accounts);
    expect(await zawbud.owner.people()).toContainEqual(expect.objectContaining({ personId, account: null }));
    await expect(zawbud.owner.addPersonAccount({ personId, email: "", username: "zkaczmarek", role: "pracownik" })).resolves.toMatchObject({
      fullName: "Zbigniew Kaczmarek",
    });
  });

  it("osoba, która ma już konto, albo nieaktywna, nie dostanie kolejnego; zła osoba to „nie znaleziono”", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);
    const { personId } = await owner.addPerson({ fullName: "Zbigniew Kaczmarek", note: null });
    await owner.addPersonAccount({ personId, email: "", username: "zkaczmarek", role: "pracownik" });
    const { personId: leftId } = await owner.addPerson({ fullName: "Tadeusz Wróbel", note: null });
    await owner.deactivatePerson(leftId);
    const accounts = testbed.auth.accountCount();

    for (const id of [personId, leftId]) {
      await expect(owner.addPersonAccount({ personId: id, email: "", username: "inny.login", role: "pracownik" })).rejects.toMatchObject({ code: "forbidden" });
    }
    for (const id of [randomUUID(), "nie-uuid"]) {
      await expect(owner.addPersonAccount({ personId: id, email: "", username: "inny.login", role: "pracownik" })).rejects.toMatchObject({ code: "not_found" });
    }
    const { personId: newcomerId } = await owner.addPerson({ fullName: "Grzegorz Pietrzak", note: null });
    await expect(owner.addPersonAccount({ personId: newcomerId, email: "zly@", role: "kierownik" })).rejects.toMatchObject({ code: "invalid_input" });
    expect(testbed.auth.accountCount()).toBe(accounts);
    expect(await owner.people()).toHaveLength(4);
  });
});

describe("zmiana danych osoby", () => {
  it("właściciel poprawia imię, nazwisko i notatkę; konto osoby nosi nowe imię i nazwisko", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);
    const managerId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
    const manager = (await owner.people()).find((person) => person.account?.userId === managerId)!;
    const { personId } = await owner.addPerson({ fullName: "Zbigniew Kaczmarek", note: "Pomocnik" });

    await owner.editPerson(manager.personId, { fullName: "Adam Nowak-Kowalski", note: "Kierownik Rataj" });
    await owner.editPerson(personId, { fullName: "Zbigniew Kaczmarek", note: null });

    const people = await owner.people();
    expect(people).toContainEqual(expect.objectContaining({ personId: manager.personId, fullName: "Adam Nowak-Kowalski", note: "Kierownik Rataj" }));
    expect(people).toContainEqual(expect.objectContaining({ personId, note: null }));
    expect(await testbed.registry.as(managerId).session()).toMatchObject({ fullName: "Adam Nowak-Kowalski" });
    await expect(owner.editPerson(personId, { fullName: "", note: null })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(owner.editPerson(randomUUID(), { fullName: "Ktoś", note: null })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("dezaktywacja osoby", () => {
  it("osoba bez konta znika z aktywnych, ale zostaje w kartotece", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);
    const { personId } = await owner.addPerson({ fullName: "Zbigniew Kaczmarek", note: null });

    await owner.deactivatePerson(personId);

    expect((await owner.people()).at(-1)).toMatchObject({ personId, active: false, account: null });
    await expect(owner.deactivatePerson(personId)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("dezaktywacja osoby z kontem blokuje jej konto, a dezaktywacja konta dezaktywuje osobę", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);
    const managerId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
    const storekeeperId = await testbed.givenMember(zawbud, "magazynier", "Ewa Wiśniewska");
    const personOf = async (userId: string) => (await owner.people()).find((person) => person.account?.userId === userId)!;

    await owner.deactivatePerson((await personOf(managerId)).personId);
    await owner.deactivateMember(storekeeperId);

    for (const userId of [managerId, storekeeperId]) {
      expect(testbed.auth.isBlocked(userId)).toBe(true);
      expect(await testbed.registry.as(userId).session()).toBeNull();
      expect(await personOf(userId)).toMatchObject({ active: false, account: { active: false } });
    }
  });

  it("właściciela nie da się dezaktywować, a w firmie demo nikogo z kontem", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);
    const managerId = await testbed.givenMember(zawbud, "kierownik");
    const personOf = async (userId: string) => (await owner.people()).find((person) => person.account?.userId === userId)!;

    await expect(owner.deactivatePerson((await personOf(zawbud.ownerId)).personId)).rejects.toMatchObject({ code: "forbidden" });

    await testbed.registry.system().activateDemoCompany(zawbud.companyId);
    await expect(owner.deactivatePerson((await personOf(managerId)).personId)).rejects.toMatchObject({ code: "demo_locked" });
    const { personId } = await owner.addPerson({ fullName: "Zbigniew Kaczmarek", note: null });
    await owner.deactivatePerson(personId);
    expect(testbed.auth.isBlocked(managerId)).toBe(false);
  });

  it("w firmie demo imienia i nazwiska konta roli nie zmieni nikt, bo widzą je wszyscy oglądający", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);
    const managerId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
    const { personId } = await owner.addPerson({ fullName: "Zbigniew Kaczmarek", note: null });
    await testbed.registry.system().activateDemoCompany(zawbud.companyId);
    const manager = (await owner.people()).find((person) => person.account?.userId === managerId)!;

    await expect(owner.editPerson(manager.personId, { fullName: "Ktoś Obcy", note: null })).rejects.toMatchObject({ code: "demo_locked" });
    await owner.editPerson(personId, { fullName: "Zbigniew Kaczmarek", note: "Pomocnik" });

    expect(await testbed.registry.as(managerId).session()).toMatchObject({ fullName: "Adam Nowak" });
    expect(await owner.people()).toContainEqual(expect.objectContaining({ personId, note: "Pomocnik" }));
  });
});

describe("kto prowadzi kartotekę", () => {
  it("kierownik, magazynier i pracownik nie widzą kartoteki ani jej nie zmieniają", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const { personId } = await testbed.registry.as(zawbud.ownerId).addPerson({ fullName: "Zbigniew Kaczmarek", note: null });

    for (const role of ["kierownik", "magazynier", "pracownik"] as const) {
      const member = testbed.registry.as(await testbed.givenMember(zawbud, role));
      await expect(member.people()).rejects.toMatchObject({ code: "forbidden" });
      await expect(member.addPerson({ fullName: "Obcy", note: null })).rejects.toMatchObject({ code: "forbidden" });
      await expect(member.editPerson(personId, { fullName: "Obcy", note: null })).rejects.toMatchObject({ code: "forbidden" });
      await expect(member.deactivatePerson(personId)).rejects.toMatchObject({ code: "forbidden" });
      await expect(member.addPersonAccount({ personId, email: "", username: `obcy.${role}`, role: "pracownik" })).rejects.toMatchObject({
        code: "forbidden",
      });
    }
    expect(await testbed.registry.as(zawbud.ownerId).people()).toContainEqual(expect.objectContaining({ personId, fullName: "Zbigniew Kaczmarek", active: true, account: null }));
  });

  it("w trybie tylko do odczytu kartotekę widać, ale nie da się jej zmienić", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);
    const { personId } = await owner.addPerson({ fullName: "Zbigniew Kaczmarek", note: null });
    await testbed.registry.superAdmin(await testbed.givenSuperAdmin()).setManualReadOnly(zawbud.companyId, true);

    await expect(owner.addPerson({ fullName: "Tadeusz Wróbel", note: null })).rejects.toMatchObject({ code: "read_only" });
    await expect(owner.editPerson(personId, { fullName: "Inny", note: null })).rejects.toMatchObject({ code: "read_only" });
    await expect(owner.deactivatePerson(personId)).rejects.toMatchObject({ code: "read_only" });
    await expect(owner.addPersonAccount({ personId, email: "", username: "zkaczmarek", role: "pracownik" })).rejects.toMatchObject({ code: "read_only" });
    expect(await owner.people()).toHaveLength(2);
  });
});

describe("izolacja firm w kartotece", () => {
  it("właściciel innej firmy nie widzi osób Zawbudu ani ich nie zmienia", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const budrex = await testbed.givenActiveCompany("Budrex");
    const { personId } = await testbed.registry.as(zawbud.ownerId).addPerson({ fullName: "Zbigniew Kaczmarek", note: null });
    const stranger = testbed.registry.as(budrex.ownerId);

    expect((await stranger.people()).map((person) => person.account?.userId)).toEqual([budrex.ownerId]);
    await expect(stranger.editPerson(personId, { fullName: "Przejęty", note: null })).rejects.toMatchObject({ code: "not_found" });
    await expect(stranger.deactivatePerson(personId)).rejects.toMatchObject({ code: "not_found" });
    await expect(stranger.addPersonAccount({ personId, email: "", username: "przejety", role: "pracownik" })).rejects.toMatchObject({ code: "not_found" });
    expect(await testbed.registry.as(zawbud.ownerId).people()).toContainEqual(expect.objectContaining({ personId, fullName: "Zbigniew Kaczmarek", active: true, account: null }));
  });

  it("bezpośrednio w bazie kierownik nie dopisze osoby, a właściciel nie podepnie konta z innej firmy ani nie przepnie konta", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const budrex = await testbed.givenActiveCompany("Budrex");
    const managerId = await testbed.givenMember(zawbud, "kierownik");
    const budrexManagerId = await testbed.givenMember(budrex, "kierownik");
    const { personId } = await testbed.registry.as(zawbud.ownerId).addPerson({ fullName: "Zbigniew Kaczmarek", note: null });
    const insertAs = (actorId: string, companyId: string, userId: string | null) =>
      withActor(testbed.db, actorId, (sql) =>
        sql("insert into app.people (company_id, full_name, user_id, created_at) values ($1, 'Ktoś', $2, now())", [companyId, userId]),
      );
    const linkAs = (actorId: string, userId: string) =>
      withActor(testbed.db, actorId, (sql) => sql("update app.people set user_id = $2 where id = $1", [personId, userId]));

    await expect(insertAs(managerId, zawbud.companyId, null)).rejects.toThrow();
    await expect(insertAs(zawbud.ownerId, budrex.companyId, null)).rejects.toThrow();
    await expect(insertAs(zawbud.ownerId, zawbud.companyId, budrexManagerId)).rejects.toThrow();
    await expect(linkAs(zawbud.ownerId, budrexManagerId)).rejects.toThrow();
    // Konto kierownika ma już swoją osobę, więc drugiej nie dostanie.
    await expect(linkAs(zawbud.ownerId, managerId)).rejects.toThrow();
    const { personId: managerPersonId } = (await testbed.registry.as(zawbud.ownerId).people()).find((person) => person.account?.userId === managerId)!;
    await expect(
      withActor(testbed.db, zawbud.ownerId, (sql) => sql("update app.people set user_id = null where id = $1", [managerPersonId])),
    ).rejects.toThrow();
    // Osoba z kontem jest aktywna razem z kontem: dezaktywuje się ją tylko z kontem (Rejestr), nigdy osobno.
    await expect(
      withActor(testbed.db, zawbud.ownerId, (sql) => sql("update app.people set active = false where id = $1", [managerPersonId])),
    ).rejects.toThrow();
    expect(await testbed.registry.as(managerId).session()).not.toBeNull();

    expect(await testbed.registry.as(zawbud.ownerId).people()).toContainEqual(expect.objectContaining({ personId, account: null }));
  });
});
