import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { type NewCompanyInput, withActor } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";
import { createPgliteDbBefore } from "./testing/pglite-db";

const testbed = setupRegistryTestbed();

const zawbud: NewCompanyInput = {
  name: "Zawbud",
  baseName: "Baza",
  owner: { email: "jan@zawbud.pl", fullName: "Jan Kowalski" },
  invoice: { name: "Zawbud Jan Kowalski", taxId: "778-123-45-63", address: "ul. Polna 3\n60-001 Poznań" },
  tier: "sredni",
  paidUntil: "2026-03-31",
};

describe("zakładanie firmy w panelu super-admina", () => {
  it("firma ma bazę, abonament i właściciela, który loguje się hasłem tymczasowym i musi je zmienić", async () => {
    const admin = testbed.registry.superAdmin(await testbed.givenSuperAdmin());

    const created = await admin.createCompany(zawbud);

    expect(testbed.auth.passwordOf(created.ownerUserId)).toBe(created.temporaryPassword);
    expect(await testbed.registry.as(created.ownerUserId).session()).toEqual({
      userId: created.ownerUserId,
      fullName: "Jan Kowalski",
      role: "wlasciciel",
      mustChangePassword: true,
      idleLogoutMinutes: null,
      company: { id: created.companyId, name: "Zawbud", readOnly: false, demo: false, siteManagersSeeCosts: false },
    });
    expect(await admin.company(created.companyId)).toEqual({
      id: created.companyId,
      name: "Zawbud",
      invoice: { name: "Zawbud Jan Kowalski", taxId: "7781234563", address: "ul. Polna 3\n60-001 Poznań" },
      owner: { fullName: "Jan Kowalski", email: "jan@zawbud.pl" },
      tier: { id: "sredni", name: "Średni", maxPeople: 30, toolLimit: 500, implementationPrice: 6000, yearlyPrice: 800 },
      toolCount: 0,
      recorderCount: 1,
      paidUntil: "2026-03-31",
      readOnlyFrom: "2026-04-15",
      manualReadOnly: false,
      status: "aktywna",
      createdAt: testbed.clock.now(),
    });
  });
});

describe("dostęp do panelu super-admina", () => {
  it("właściciel, kierownik i osoba bez firmy nie są super-adminami i dostają odmowę, a konto nie powstaje", async () => {
    const budrex = await testbed.givenActiveCompany("Budrex");
    const managerId = await testbed.givenMember(budrex, "kierownik");
    const { userId: strangerId } = await testbed.auth.createUser({ email: "obcy@example.test", password: "DowolneHaslo1" });
    const accounts = testbed.auth.accountCount();

    for (const userId of [budrex.ownerId, managerId, strangerId]) {
      const actor = testbed.registry.superAdmin(userId);
      expect(await actor.isSuperAdmin()).toBe(false);
      await expect(actor.companies()).rejects.toMatchObject({ code: "forbidden" });
      await expect(actor.company(budrex.companyId)).rejects.toMatchObject({ code: "forbidden" });
      await expect(actor.createCompany(zawbud)).rejects.toMatchObject({ code: "forbidden" });
      await expect(actor.changeTier(budrex.companyId, "maly")).rejects.toMatchObject({ code: "forbidden" });
      await expect(actor.setPaidUntil(budrex.companyId, "2030-12-31")).rejects.toMatchObject({ code: "forbidden" });
      await expect(actor.setManualReadOnly(budrex.companyId, true)).rejects.toMatchObject({ code: "forbidden" });
    }

    expect(testbed.auth.accountCount()).toBe(accounts);
    const admin = testbed.registry.superAdmin(await testbed.givenSuperAdmin());
    expect(await admin.isSuperAdmin()).toBe(true);
    expect(await admin.company(budrex.companyId)).toMatchObject({ tier: { id: "duzy" }, paidUntil: null, manualReadOnly: false });
    expect((await admin.companies()).map((company) => company.name)).toEqual(["Budrex"]);
  });

  it("połączenie z bazą jako właściciel nie zmienia abonamentu ani nie zakłada firmy", async () => {
    const budrex = await testbed.givenActiveCompany("Budrex");
    await testbed.registry.superAdmin(await testbed.givenSuperAdmin()).createCompany(zawbud);
    const asOwner = <Row>(text: string, params?: unknown[]) => withActor(testbed.db, budrex.ownerId, (sql) => sql<Row>(text, params));

    // RLS nie pokazuje właścicielowi wiersza do zmiany, więc nic się nie zmienia.
    expect(await asOwner("update app.subscriptions set tier = 'maly', paid_until = '2030-12-31' returning company_id")).toEqual([]);
    await expect(asOwner("insert into app.companies (name, created_at) values ('Lewa', now())")).rejects.toThrow();
    await expect(asOwner("insert into app.subscriptions (company_id, tier) values ($1, 'duzy')", [budrex.companyId])).rejects.toThrow();
    // Abonament swojej firmy widzi, cudzych nie, a kierownik (NIP, adres, płatności) wcale.
    expect(await asOwner("select tier from app.subscriptions")).toEqual([{ tier: "duzy" }]);
    const managerId = await testbed.givenMember(budrex, "kierownik");
    expect(await withActor(testbed.db, managerId, (sql) => sql("select tier from app.subscriptions"))).toEqual([]);

    const admin = testbed.registry.superAdmin(await testbed.givenSuperAdmin());
    expect(await admin.company(budrex.companyId)).toMatchObject({ tier: { id: "duzy" }, paidUntil: null });
    expect(await admin.companies()).toHaveLength(2);
  });

  it("super-admin nie jest członkiem żadnej firmy: nie ma sesji ani tablicy", async () => {
    const adminId = await testbed.givenSuperAdmin();

    expect(await testbed.registry.as(adminId).session()).toBeNull();
    await expect(testbed.registry.as(adminId).whereIsWhat()).rejects.toMatchObject({ code: "no_access" });
  });
});

describe("dane przy zakładaniu firmy w panelu", () => {
  it("odrzuca zły NIP, brak danych do faktury, nieznany próg i zły dzień „opłacone do”, nie zakładając kont ani firm", async () => {
    const admin = testbed.registry.superAdmin(await testbed.givenSuperAdmin());
    const accounts = testbed.auth.accountCount();
    const invalid: NewCompanyInput[] = [
      { ...zawbud, invoice: { ...zawbud.invoice, taxId: "778-123-45-64" } },
      { ...zawbud, invoice: { ...zawbud.invoice, taxId: "123456789" } },
      { ...zawbud, invoice: { ...zawbud.invoice, name: " " } },
      { ...zawbud, invoice: { ...zawbud.invoice, address: "" } },
      { ...zawbud, tier: "gigant" as NewCompanyInput["tier"] },
      { ...zawbud, paidUntil: "2026-02-30" },
      { ...zawbud, name: "" },
      { ...zawbud, owner: { email: "jan", fullName: "Jan Kowalski" } },
    ];

    for (const input of invalid) {
      await expect(admin.createCompany(input), JSON.stringify(input)).rejects.toMatchObject({ code: "invalid_input" });
    }

    expect(testbed.auth.accountCount()).toBe(accounts);
    expect(await admin.companies()).toEqual([]);
  });

  it("odrzuca właściciela z e-mailem, który ma już konto, i nie zostawia firmy", async () => {
    await testbed.givenCompany("Budrex", { email: "jan@zawbud.pl" });
    const admin = testbed.registry.superAdmin(await testbed.givenSuperAdmin());

    await expect(admin.createCompany(zawbud)).rejects.toMatchObject({ code: "email_taken" });

    expect((await admin.companies()).map((company) => company.name)).toEqual(["Budrex"]);
  });

  it("bez „opłacone do” firma czeka na pierwszą wpłatę", async () => {
    const admin = testbed.registry.superAdmin(await testbed.givenSuperAdmin());

    const { companyId } = await admin.createCompany({ ...zawbud, paidUntil: null });

    expect(await admin.company(companyId)).toMatchObject({ paidUntil: null, readOnlyFrom: null, status: "czeka_na_wplate" });
  });
});

describe("lista firm", () => {
  it("firmy po nazwie, z pakietem i liczbą narzędzi bez wycofanych", async () => {
    const admin = testbed.registry.superAdmin(await testbed.givenSuperAdmin());
    const created = await admin.createCompany(zawbud);
    await testbed.registry.as(created.ownerUserId).changePassword("MojeNoweHaslo7", testbed.signedInNow());
    await testbed.givenActiveCompany("Budrex");
    const owner = testbed.registry.as(created.ownerUserId);
    const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
    const toolIds: string[] = [];
    for (const code of ["S-01", "S-02", "S-03"]) {
      toolIds.push((await owner.addTool({ operationId: randomUUID(), code, name: "Szlifierka", categoryId: grinders.id })).toolId);
    }
    await owner.retireTool({ operationId: randomUUID(), toolId: toolIds[0], reason: "sprzedana" });

    expect((await admin.companies()).map(({ name, tier, toolCount }) => ({ name, tier: tier.id, toolCount }))).toEqual([
      { name: "Budrex", tier: "duzy", toolCount: 0 },
      { name: "Zawbud", tier: "sredni", toolCount: 2 },
    ]);
  });
});

describe("abonament firmy", () => {
  it("po „opłacone do” firma jest po terminie, a dzień po 14 dniach przechodzi w tryb tylko do odczytu (czas polski)", async () => {
    const admin = testbed.registry.superAdmin(await testbed.givenSuperAdmin());
    const { companyId } = await admin.createCompany({ ...zawbud, paidUntil: "2026-03-31" });
    const statusAt = async (at: string) => {
      testbed.clock.set(at);
      return (await admin.company(companyId))!.status;
    };

    expect(await statusAt("2026-03-31T23:59:00+02:00")).toBe("aktywna");
    expect(await statusAt("2026-03-31T22:30:00Z")).toBe("po_terminie");
    expect(await statusAt("2026-04-14T23:59:00+02:00")).toBe("po_terminie");
    expect(await statusAt("2026-04-15T00:00:00+02:00")).toBe("tylko_do_odczytu");
  });

  it("wpis „opłacone do” po przelewie przywraca firmę, a pakiet zmienia się na inny", async () => {
    const admin = testbed.registry.superAdmin(await testbed.givenSuperAdmin());
    const { companyId } = await admin.createCompany({ ...zawbud, paidUntil: "2026-01-31" });
    expect(await admin.company(companyId)).toMatchObject({ status: "tylko_do_odczytu", readOnlyFrom: "2026-02-15" });

    await admin.setPaidUntil(companyId, "2026-04-30");
    await admin.changeTier(companyId, "duzy");

    expect(await admin.company(companyId)).toMatchObject({
      paidUntil: "2026-04-30",
      readOnlyFrom: "2026-05-15",
      status: "aktywna",
      tier: { id: "duzy", name: "Duży", maxPeople: null, toolLimit: null, implementationPrice: 12000, yearlyPrice: 2000 },
    });
  });

  it("ręczny tryb tylko do odczytu działa niezależnie od płatności i da się go wyłączyć", async () => {
    const admin = testbed.registry.superAdmin(await testbed.givenSuperAdmin());
    const { companyId } = await admin.createCompany({ ...zawbud, paidUntil: "2026-12-31" });

    await admin.setManualReadOnly(companyId, true);
    expect(await admin.company(companyId)).toMatchObject({ manualReadOnly: true, status: "tylko_do_odczytu" });

    await admin.setManualReadOnly(companyId, false);
    expect(await admin.company(companyId)).toMatchObject({ manualReadOnly: false, status: "aktywna" });
  });

  it("odrzuca nieznany próg i zły dzień, a nieznaną firmę zgłasza jako nieznalezioną", async () => {
    const admin = testbed.registry.superAdmin(await testbed.givenSuperAdmin());
    const { companyId } = await admin.createCompany(zawbud);

    await expect(admin.changeTier(companyId, "gigant" as NewCompanyInput["tier"])).rejects.toMatchObject({ code: "invalid_input" });
    await expect(admin.setPaidUntil(companyId, "31.03.2026")).rejects.toMatchObject({ code: "invalid_input" });
    for (const unknown of [randomUUID(), "nie-uuid"]) {
      await expect(admin.changeTier(unknown, "duzy")).rejects.toMatchObject({ code: "not_found" });
      await expect(admin.setPaidUntil(unknown, "2026-04-30")).rejects.toMatchObject({ code: "not_found" });
      await expect(admin.setManualReadOnly(unknown, true)).rejects.toMatchObject({ code: "not_found" });
      expect(await admin.company(unknown)).toBeNull();
    }
    expect(await admin.company(companyId)).toMatchObject({ tier: { id: "sredni" }, paidUntil: "2026-03-31" });
  });
});

describe("jeden pakiet zamiast progu i pakietu wdrożenia", () => {
  it("firma dostaje wyższy z dwóch dotychczasowych progów, a plan indywidualny to duży pakiet", async () => {
    const { db, migrate } = await createPgliteDbBefore("20261112090000_one_package.sql");
    try {
      const packages = [
        ["Alfa", "maly", "maly"],
        ["Beta", "maly", "sredni"],
        ["Gamma", "sredni", "maly"],
        ["Delta", "sredni", "duzy"],
        ["Epsilon", "duzy", "maly"],
        ["Zeta", "indywidualny", "maly"],
      ];
      for (const [name, tier, implementationTier] of packages) {
        await db.transaction(async (sql) => {
          const [company] = await sql<{ id: string }>("insert into app.companies (name, created_at) values ($1, now()) returning id", [name]);
          await sql("insert into app.subscriptions (company_id, tier, implementation_tier) values ($1, $2, $3)", [company.id, tier, implementationTier]);
        });
      }

      await migrate();

      const rows = await db.transaction((sql) =>
        sql<{ name: string; tier: string }>("select c.name, s.tier from app.subscriptions s join app.companies c on c.id = s.company_id order by c.created_at, c.name"),
      );
      expect(Object.fromEntries(rows.map((row) => [row.name, row.tier]))).toEqual({
        Alfa: "maly",
        Beta: "sredni",
        Gamma: "sredni",
        Delta: "duzy",
        Epsilon: "duzy",
        Zeta: "duzy",
      });
    } finally {
      await db.close();
    }
  });
});
