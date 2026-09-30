import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ImplementationTierId, NewCompanyInput } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();

let counter = 0;

/** Firma założona w panelu super-admina z danym pakietem wdrożenia; właściciel ma już własne hasło. */
async function givenCompanyWithPackage(implementationTier: ImplementationTierId, name = "Zawbud") {
  counter += 1;
  const adminId = await testbed.givenSuperAdmin();
  const admin = testbed.registry.superAdmin(adminId);
  const input: NewCompanyInput = {
    name,
    baseName: "Baza",
    owner: { email: `wlasciciel${counter}@firma.test`, fullName: `Właściciel ${name}` },
    invoice: { name: `${name} sp. z o.o.`, taxId: "7781234563", address: "ul. Polna 3, Poznań" },
    tier: "maly",
    implementationTier,
    paidUntil: "2026-12-31",
  };
  const created = await admin.createCompany(input);
  await testbed.registry.as(created.ownerUserId).changePassword(`${name}-haslo-1`, testbed.signedInNow());
  return { companyId: created.companyId, ownerId: created.ownerUserId, admin, owner: testbed.registry.as(created.ownerUserId) };
}

const person = (role: "kierownik" | "magazynier") => {
  counter += 1;
  return { firstName: "Adam", lastName: `Nowak${counter}`, email: `osoba${counter}@firma.test`, role };
};

describe("limit osób zapisujących ruchy w pakiecie wdrożenia", () => {
  it("w małym pakiecie (do 2 osób) właściciel i jeden kierownik zajmują miejsca, a magazyniera już nie doda", async () => {
    const zawbud = await givenCompanyWithPackage("maly");
    await zawbud.owner.addMember(person("kierownik"));
    const accountsBefore = testbed.auth.accountCount();

    await expect(zawbud.owner.addMember(person("magazynier"))).rejects.toMatchObject({ code: "recorder_limit" });
    await expect(zawbud.owner.addMember(person("kierownik"))).rejects.toMatchObject({ code: "recorder_limit" });

    expect(testbed.auth.accountCount()).toBe(accountsBefore);
    expect((await zawbud.owner.team()).map((member) => member.role).sort()).toEqual(["kierownik", "wlasciciel"]);
  });

  it("pracownika da się dodać zawsze, bo nie zapisuje ruchów", async () => {
    const zawbud = await givenCompanyWithPackage("maly");
    await zawbud.owner.addMember(person("kierownik"));

    for (const username of ["jan.kowalski", "piotr.nowak", "anna.mazur"]) {
      await zawbud.owner.addMember({ firstName: "Jan", lastName: "Kowalski", email: "", username, role: "pracownik" });
    }

    expect((await zawbud.owner.team()).filter((member) => member.role === "pracownik")).toHaveLength(3);
  });
});

describe("liczenie osób zapisujących ruchy", () => {
  it("liczą się aktywni właściciele, kierownicy i magazynierzy tej firmy, a pracownicy, dezaktywowani i inne firmy nie", async () => {
    const zawbud = await givenCompanyWithPackage("sredni");
    const budrex = await givenCompanyWithPackage("sredni", "Budrex");
    await zawbud.owner.addMember(person("kierownik"));
    await zawbud.owner.addMember(person("magazynier"));
    const leaving = await zawbud.owner.addMember(person("kierownik"));
    await zawbud.owner.deactivateMember(leaving.userId);
    await zawbud.owner.addMember({ firstName: "Jan", lastName: "Kowalski", email: "", username: "jan.kowalski", role: "pracownik" });
    await budrex.owner.addMember(person("kierownik"));
    await givenSecondOwner(zawbud.companyId);

    expect((await zawbud.owner.subscription()).recorders).toEqual({
      implementationTier: { id: "sredni", name: "Średni", maxPeople: 6, price: 4000 },
      recorderCount: 4,
      seatsLeft: 2,
      upgrade: null,
    });
    expect(await zawbud.admin.company(zawbud.companyId)).toMatchObject({
      implementationTier: { id: "sredni", name: "Średni", maxPeople: 6, price: 4000 },
      recorderCount: 4,
    });
    expect((await budrex.owner.subscription()).recorders).toMatchObject({ recorderCount: 2, seatsLeft: 4 });
  });

  it("gdy miejsc nie ma, właściciel widzi najniższy pakiet z wolnym miejscem i dopłatę do niego", async () => {
    const zawbud = await givenCompanyWithPackage("maly");
    expect((await zawbud.owner.subscription()).recorders).toMatchObject({ recorderCount: 1, seatsLeft: 1, upgrade: null });

    await zawbud.owner.addMember(person("kierownik"));

    expect((await zawbud.owner.subscription()).recorders).toEqual({
      implementationTier: { id: "maly", name: "Mały", maxPeople: 2, price: 3000 },
      recorderCount: 2,
      seatsLeft: 0,
      upgrade: { implementationTier: { id: "sredni", name: "Średni", maxPeople: 6, price: 4000 }, surcharge: 1000 },
    });
  });

  it("dezaktywacja konta zwalnia miejsce", async () => {
    const zawbud = await givenCompanyWithPackage("maly");
    const manager = await zawbud.owner.addMember(person("kierownik"));

    await zawbud.owner.deactivateMember(manager.userId);

    await expect(zawbud.owner.addMember(person("magazynier"))).resolves.toMatchObject({ fullName: expect.any(String) });
  });
});

describe("zmiana pakietu wdrożenia", () => {
  it("wyższy pakiet od razu odblokowuje dodawanie, a duży nie ma limitu", async () => {
    const zawbud = await givenCompanyWithPackage("maly");
    await zawbud.owner.addMember(person("kierownik"));
    await expect(zawbud.owner.addMember(person("kierownik"))).rejects.toMatchObject({ code: "recorder_limit" });

    await zawbud.admin.changeImplementationTier(zawbud.companyId, "sredni");
    for (let added = 0; added < 4; added += 1) await zawbud.owner.addMember(person("kierownik"));
    await expect(zawbud.owner.addMember(person("magazynier"))).rejects.toMatchObject({ code: "recorder_limit" });

    await zawbud.admin.changeImplementationTier(zawbud.companyId, "duzy");
    await zawbud.owner.addMember(person("magazynier"));

    expect((await zawbud.owner.subscription()).recorders).toMatchObject({ recorderCount: 7, seatsLeft: null, upgrade: null });
    expect(await zawbud.admin.company(zawbud.companyId)).toMatchObject({ implementationTier: { id: "duzy" }, recorderCount: 7 });
  });

  it("po zmianie na niższy pakiet osoby zostają, ale nowych się nie doda, a propozycja mieści je wszystkie", async () => {
    const zawbud = await givenCompanyWithPackage("sredni");
    for (let added = 0; added < 3; added += 1) await zawbud.owner.addMember(person("kierownik"));

    await zawbud.admin.changeImplementationTier(zawbud.companyId, "maly");

    await expect(zawbud.owner.addMember(person("kierownik"))).rejects.toMatchObject({ code: "recorder_limit" });
    expect((await zawbud.owner.subscription()).recorders).toMatchObject({
      recorderCount: 4,
      seatsLeft: 0,
      upgrade: { implementationTier: { id: "sredni" }, surcharge: 1000 },
    });
  });

  it("odrzuca nieznany pakiet, a nieznaną firmę zgłasza jako nieznalezioną", async () => {
    const zawbud = await givenCompanyWithPackage("maly");

    await expect(zawbud.admin.changeImplementationTier(zawbud.companyId, "gigant" as ImplementationTierId)).rejects.toMatchObject({
      code: "invalid_input",
    });
    for (const unknown of [randomUUID(), "nie-uuid"]) {
      await expect(zawbud.admin.changeImplementationTier(unknown, "duzy")).rejects.toMatchObject({ code: "not_found" });
    }
    expect(await zawbud.admin.company(zawbud.companyId)).toMatchObject({ implementationTier: { id: "maly" } });
  });

  it("pakietu nie zmieni właściciel ani kierownik", async () => {
    const zawbud = await givenCompanyWithPackage("maly");
    const manager = await zawbud.owner.addMember(person("kierownik"));

    for (const userId of [zawbud.ownerId, manager.userId]) {
      await expect(testbed.registry.superAdmin(userId).changeImplementationTier(zawbud.companyId, "duzy")).rejects.toMatchObject({
        code: "forbidden",
      });
    }
    expect(await zawbud.admin.company(zawbud.companyId)).toMatchObject({ implementationTier: { id: "maly" } });
  });
});

describe("firmy bez limitu", () => {
  it("firma założona skryptem ma duży pakiet, bez limitu", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");

    for (let added = 0; added < 7; added += 1) await testbed.givenMember(zawbud, "kierownik");

    expect((await testbed.registry.as(zawbud.ownerId).subscription()).recorders).toMatchObject({
      implementationTier: { id: "duzy" },
      recorderCount: 8,
      seatsLeft: null,
    });
  });

  it("firma demo ma duży pakiet, nawet gdy wcześniej miała mniejszy", async () => {
    const zawbud = await givenCompanyWithPackage("maly");
    await zawbud.owner.addMember(person("kierownik"));

    await testbed.registry.system().activateDemoCompany(zawbud.companyId);

    await zawbud.owner.addMember(person("magazynier"));
    expect((await zawbud.owner.subscription()).recorders).toMatchObject({ implementationTier: { id: "duzy" }, seatsLeft: null });
  });
});

describe("pakiet przy zakładaniu firmy w panelu", () => {
  it("odrzuca nieznany pakiet, nie zakładając kont ani firm", async () => {
    const admin = testbed.registry.superAdmin(await testbed.givenSuperAdmin());
    const accounts = testbed.auth.accountCount();

    await expect(
      admin.createCompany({
        name: "Zawbud",
        baseName: "Baza",
        owner: { email: "jan@zawbud.pl", fullName: "Jan Kowalski" },
        invoice: { name: "Zawbud", taxId: "7781234563", address: "ul. Polna 3" },
        tier: "maly",
        implementationTier: "gigant" as ImplementationTierId,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });

    expect(testbed.auth.accountCount()).toBe(accounts);
    expect(await admin.companies()).toEqual([]);
  });
});

/** Drugi właściciel firmy; panel ani zespół go nie zakładają, więc wprost w bazie, jak zrobiłby to skrypt. */
async function givenSecondOwner(companyId: string) {
  const { userId } = await testbed.auth.createUser({ email: `drugi-wlasciciel-${randomUUID()}@firma.test`, password: "Haslo-drugie-1" });
  await testbed.db.transaction((sql) =>
    sql(
      `insert into app.users (user_id, company_id, role, full_name, email, must_change_password, created_at)
       values ($1, $2, 'wlasciciel', 'Drugi Właściciel', 'drugi@firma.test', false, now())`,
      [userId, companyId],
    ),
  );
}
