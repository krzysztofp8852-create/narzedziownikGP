import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { NewCompanyInput, TierId } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();

let counter = 0;

const SMALL = { id: "maly", name: "Mały", maxPeople: 5, toolLimit: 150, implementationPrice: 3000, yearlyPrice: 400 };
const MEDIUM = { id: "sredni", name: "Średni", maxPeople: 30, toolLimit: 500, implementationPrice: 6000, yearlyPrice: 800 };

/** Firma założona w panelu super-admina z danym pakietem; właściciel ma już własne hasło. */
async function givenCompanyWithPackage(tier: TierId, name = "Zawbud") {
  counter += 1;
  const adminId = await testbed.givenSuperAdmin();
  const admin = testbed.registry.superAdmin(adminId);
  const input: NewCompanyInput = {
    name,
    baseName: "Baza",
    owner: { email: `wlasciciel${counter}@firma.test`, fullName: `Właściciel ${name}` },
    invoice: { name: `${name} sp. z o.o.`, taxId: "7781234563", address: "ul. Polna 3, Poznań" },
    tier,
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

/** Tylu kierowników dodanych przez właściciela. */
async function addManagers(company: Awaited<ReturnType<typeof givenCompanyWithPackage>>, count: number) {
  for (let added = 0; added < count; added += 1) await company.owner.addMember(person("kierownik"));
}

describe("limit osób zapisujących ruchy w pakiecie", () => {
  it("w małym pakiecie (do 5 osób) właściciel i czterech kierowników zajmują miejsca, a magazyniera już nie doda", async () => {
    const zawbud = await givenCompanyWithPackage("maly");
    await addManagers(zawbud, 4);
    const accountsBefore = testbed.auth.accountCount();

    await expect(zawbud.owner.addMember(person("magazynier"))).rejects.toMatchObject({ code: "recorder_limit" });
    await expect(zawbud.owner.addMember(person("kierownik"))).rejects.toMatchObject({ code: "recorder_limit" });

    expect(testbed.auth.accountCount()).toBe(accountsBefore);
    expect((await zawbud.owner.team()).filter((member) => member.role === "kierownik")).toHaveLength(4);
  });

  it("pracownika da się dodać zawsze, bo nie zapisuje ruchów", async () => {
    const zawbud = await givenCompanyWithPackage("maly");
    await addManagers(zawbud, 4);

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

    expect((await zawbud.owner.subscription()).recorders).toEqual({ tier: MEDIUM, recorderCount: 4, seatsLeft: 26, upgrade: null });
    expect(await zawbud.admin.company(zawbud.companyId)).toMatchObject({ tier: MEDIUM, recorderCount: 4 });
    expect((await budrex.owner.subscription()).recorders).toMatchObject({ recorderCount: 2, seatsLeft: 28 });
  });

  it("gdy miejsc nie ma, właściciel widzi najniższy pakiet z wolnym miejscem i dopłatę do wdrożenia", async () => {
    const zawbud = await givenCompanyWithPackage("maly");
    expect((await zawbud.owner.subscription()).recorders).toMatchObject({ recorderCount: 1, seatsLeft: 4, upgrade: null });

    await addManagers(zawbud, 4);

    expect((await zawbud.owner.subscription()).recorders).toEqual({
      tier: SMALL,
      recorderCount: 5,
      seatsLeft: 0,
      upgrade: { tier: MEDIUM, surcharge: 3000 },
    });
  });

  it("dezaktywacja konta zwalnia miejsce", async () => {
    const zawbud = await givenCompanyWithPackage("maly");
    await addManagers(zawbud, 3);
    const manager = await zawbud.owner.addMember(person("kierownik"));

    await zawbud.owner.deactivateMember(manager.userId);

    await expect(zawbud.owner.addMember(person("magazynier"))).resolves.toMatchObject({ fullName: expect.any(String) });
  });
});

describe("zmiana pakietu", () => {
  it("wyższy pakiet od razu odblokowuje dodawanie, a duży nie ma limitu", async () => {
    const zawbud = await givenCompanyWithPackage("maly");
    await addManagers(zawbud, 4);
    await expect(zawbud.owner.addMember(person("kierownik"))).rejects.toMatchObject({ code: "recorder_limit" });

    await zawbud.admin.changeTier(zawbud.companyId, "sredni");
    await addManagers(zawbud, 25);
    await expect(zawbud.owner.addMember(person("magazynier"))).rejects.toMatchObject({ code: "recorder_limit" });

    await zawbud.admin.changeTier(zawbud.companyId, "duzy");
    await zawbud.owner.addMember(person("magazynier"));

    expect((await zawbud.owner.subscription()).recorders).toMatchObject({ recorderCount: 31, seatsLeft: null, upgrade: null });
    expect(await zawbud.admin.company(zawbud.companyId)).toMatchObject({ tier: { id: "duzy" }, recorderCount: 31 });
  });

  it("po zmianie na niższy pakiet osoby zostają, ale nowych się nie doda, a propozycja mieści je wszystkie", async () => {
    const zawbud = await givenCompanyWithPackage("sredni");
    await addManagers(zawbud, 6);

    await zawbud.admin.changeTier(zawbud.companyId, "maly");

    await expect(zawbud.owner.addMember(person("kierownik"))).rejects.toMatchObject({ code: "recorder_limit" });
    expect((await zawbud.owner.subscription()).recorders).toMatchObject({
      recorderCount: 7,
      seatsLeft: 0,
      upgrade: { tier: { id: "sredni" }, surcharge: 3000 },
    });
  });

  it("odrzuca nieznany pakiet, a nieznaną firmę zgłasza jako nieznalezioną", async () => {
    const zawbud = await givenCompanyWithPackage("maly");

    await expect(zawbud.admin.changeTier(zawbud.companyId, "gigant" as TierId)).rejects.toMatchObject({ code: "invalid_input" });
    for (const unknown of [randomUUID(), "nie-uuid"]) {
      await expect(zawbud.admin.changeTier(unknown, "duzy")).rejects.toMatchObject({ code: "not_found" });
    }
    expect(await zawbud.admin.company(zawbud.companyId)).toMatchObject({ tier: { id: "maly" } });
  });

  it("pakietu nie zmieni właściciel ani kierownik", async () => {
    const zawbud = await givenCompanyWithPackage("maly");
    const manager = await zawbud.owner.addMember(person("kierownik"));

    for (const userId of [zawbud.ownerId, manager.userId]) {
      await expect(testbed.registry.superAdmin(userId).changeTier(zawbud.companyId, "duzy")).rejects.toMatchObject({ code: "forbidden" });
    }
    expect(await zawbud.admin.company(zawbud.companyId)).toMatchObject({ tier: { id: "maly" } });
  });
});

describe("firmy bez limitu", () => {
  it("firma założona skryptem ma duży pakiet, bez limitu", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");

    for (let added = 0; added < 7; added += 1) await testbed.givenMember(zawbud, "kierownik");

    expect((await testbed.registry.as(zawbud.ownerId).subscription()).recorders).toMatchObject({
      tier: { id: "duzy" },
      recorderCount: 8,
      seatsLeft: null,
    });
  });

  it("firma demo ma duży pakiet, nawet gdy wcześniej miała mniejszy", async () => {
    const zawbud = await givenCompanyWithPackage("maly");
    await addManagers(zawbud, 4);

    await testbed.registry.system().activateDemoCompany(zawbud.companyId);

    await zawbud.owner.addMember(person("magazynier"));
    expect((await zawbud.owner.subscription()).recorders).toMatchObject({ tier: { id: "duzy" }, seatsLeft: null });
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
        tier: "gigant" as TierId,
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
