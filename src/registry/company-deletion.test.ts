import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withActor } from "./registry";
import { givenCompanyWithHistory as givenHistory, zawbud } from "./testing/company-with-history";
import { rowsOfCompany, setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();
const givenCompanyWithHistory = (adminId: string) => givenHistory(testbed, adminId);

describe("usunięcie firmy przez super-admina", () => {
  it("firma w trybie tylko do odczytu znika w całości: dane, historia, pliki i konta, a w dzienniku zostaje wpis", async () => {
    const adminId = await testbed.givenSuperAdmin();
    const admin = testbed.registry.superAdmin(adminId);
    const company = await givenCompanyWithHistory(adminId);
    const budrex = await testbed.givenActiveCompany("Budrex");
    await admin.setManualReadOnly(company.companyId, true);
    expect(testbed.photos.photos.size).toBe(1);
    expect(testbed.chatPhotos.photos.size).toBe(1);
    expect(testbed.documents.photos.size).toBe(2);

    expect(await admin.deleteCompany(company.companyId, "  Zawbud ")).toEqual({ leftovers: 0 });

    expect(await rowsOfCompany(testbed.db, company.companyId)).toEqual([]);
    expect(
      await testbed.db.transaction((sql) => sql("select id from auth.users where id = any($1)", [[company.ownerId, company.managerId]])),
    ).toEqual([]);
    expect(testbed.photos.photos.size).toBe(0);
    expect(testbed.chatPhotos.photos.size).toBe(0);
    expect(testbed.documents.photos.size).toBe(0);
    expect(await testbed.registry.as(company.ownerId).session()).toBeNull();
    expect(await admin.company(company.companyId)).toBeNull();
    expect(await admin.supportThreads()).toEqual([]);
    expect(await testbed.db.transaction((sql) => sql("select * from app.company_deletions"))).toEqual([
      { company_id: company.companyId, name: "Zawbud", deleted_at: testbed.clock.now(), deleted_by: adminId },
    ]);
    // Inna firma zostaje bez zmian.
    expect((await admin.companies()).map((managed) => managed.name)).toEqual(["Budrex"]);
    expect(await testbed.registry.as(budrex.ownerId).session()).toMatchObject({ company: { id: budrex.companyId } });
  });

  it("plik, którego Storage nie usunął, wraca jako pozostałość, a dane i pozostałe pliki i konta i tak znikają", async () => {
    const adminId = await testbed.givenSuperAdmin();
    const admin = testbed.registry.superAdmin(adminId);
    const company = await givenCompanyWithHistory(adminId);
    await admin.setManualReadOnly(company.companyId, true);
    testbed.chatPhotos.removeFailWith = new Error("Storage nie odpowiada");

    expect(await admin.deleteCompany(company.companyId, "Zawbud")).toEqual({ leftovers: 1 });

    expect(await rowsOfCompany(testbed.db, company.companyId)).toEqual([]);
    expect(testbed.chatPhotos.photos.size).toBe(1);
    expect(testbed.photos.photos.size).toBe(0);
    expect(testbed.documents.photos.size).toBe(0);
    expect(await testbed.db.transaction((sql) => sql("select id from auth.users where id = $1", [company.ownerId]))).toEqual([]);
  });

  it("firmę po 14 dniach od „opłacone do” też da się usunąć, bo jest w trybie tylko do odczytu", async () => {
    const admin = testbed.registry.superAdmin(await testbed.givenSuperAdmin());
    const { companyId } = await admin.createCompany({ ...zawbud, paidUntil: "2026-02-01" });

    await admin.deleteCompany(companyId, "Zawbud");

    expect(await rowsOfCompany(testbed.db, companyId)).toEqual([]);
  });

  it("odmawia firmie poza trybem tylko do odczytu, złej nazwie, firmie demo i nieznanej firmie, a nic nie znika", async () => {
    const admin = testbed.registry.superAdmin(await testbed.givenSuperAdmin());
    const company = await givenCompanyWithHistory(await testbed.givenSuperAdmin());
    const accounts = testbed.auth.accountCount();

    await expect(admin.deleteCompany(company.companyId, "Zawbud")).rejects.toMatchObject({ code: "delete_requires_read_only" });
    await admin.setManualReadOnly(company.companyId, true);
    for (const confirmation of ["", "zawbud", "Zawbud sp. z o.o.", "Budrex"]) {
      await expect(admin.deleteCompany(company.companyId, confirmation)).rejects.toMatchObject({ code: "delete_confirmation" });
    }
    for (const companyId of [randomUUID(), "nie-uuid"]) {
      await expect(admin.deleteCompany(companyId, "Zawbud")).rejects.toMatchObject({ code: "not_found" });
    }
    const demo = await testbed.givenActiveCompany("DemoBud");
    await testbed.db.transaction((sql) => sql("update app.companies set demo_since = now() where id = $1", [demo.companyId]));
    await admin.setManualReadOnly(demo.companyId, true);
    await expect(admin.deleteCompany(demo.companyId, "DemoBud")).rejects.toMatchObject({ code: "demo_delete" });

    expect(await rowsOfCompany(testbed.db, company.companyId)).toContain("movements");
    expect(await rowsOfCompany(testbed.db, demo.companyId)).toContain("users");
    expect(testbed.auth.accountCount()).toBe(accounts + 1);
    expect(testbed.photos.photos.size).toBe(1);
    expect(await testbed.db.transaction((sql) => sql("select * from app.company_deletions"))).toEqual([]);
  });

  it("tylko super-admin: właściciel, kierownik, osoba bez firmy i nieznany użytkownik dostają odmowę", async () => {
    const company = await givenCompanyWithHistory(await testbed.givenSuperAdmin());
    await testbed.registry.superAdmin(await testbed.givenSuperAdmin()).setManualReadOnly(company.companyId, true);
    const { userId: strangerId } = await testbed.auth.createUser({ email: "obcy@example.test", password: "DowolneHaslo1" });

    for (const userId of [company.ownerId, company.managerId, strangerId, "nie-uuid"]) {
      await expect(testbed.registry.superAdmin(userId).deleteCompany(company.companyId, "Zawbud")).rejects.toMatchObject({ code: "forbidden" });
    }

    expect(await rowsOfCompany(testbed.db, company.companyId)).toContain("movements");
  });

  it("połączenie z bazą jako właściciel nie wpisze firmy do dziennika usunięć, więc historia dalej tylko się dopisuje", async () => {
    const company = await givenCompanyWithHistory(await testbed.givenSuperAdmin());
    const asOwner = (text: string, params?: unknown[]) => withActor(testbed.db, company.ownerId, (sql) => sql(text, params));

    await expect(
      asOwner("insert into app.company_deletions (company_id, name, deleted_at, deleted_by) values ($1, 'Zawbud', now(), $2)", [
        company.companyId,
        company.ownerId,
      ]),
    ).rejects.toThrow();
    expect(await asOwner("select * from app.company_deletions")).toEqual([]);
    await expect(testbed.db.transaction((sql) => sql("delete from app.movements where company_id = $1", [company.companyId]))).rejects.toThrow(
      /tylko się dopisuje/,
    );
  });
});

describe("sprzątanie firm z testów dymnych i e2e", () => {
  const testCompany = (name: string, email: string) => ({ ...zawbud, name, owner: { email, fullName: "Jan Testowy" } });

  it("usuwa w całości firmy testowe założone od podanej chwili, a starsze, demo i inne firmy zostają", async () => {
    const adminId = await testbed.givenSuperAdmin();
    const admin = testbed.registry.superAdmin(adminId);
    testbed.clock.set("2026-03-01T10:00:00Z");
    const { companyId: olderId } = await admin.createCompany(testCompany("Test dymny tablicy 2026-03-01T10:00", "stary@narzedziownik.test"));
    const runStart = new Date("2026-03-02T06:00:00Z");
    testbed.clock.set(runStart);
    const e2e = await givenHistory(testbed, adminId, testCompany("Test e2e sprzęt 1a2b3c4d", "e2e-owner@narzedziownik.test"));
    const { companyId: smokeId } = await admin.createCompany(testCompany("Test dymny", "smoke-owner@narzedziownik.test"));
    const { companyId: panelDeletionId } = await admin.createCompany(testCompany("Test usuwania 5e6f", "usuwanie@narzedziownik.test"));
    const { companyId: clientId } = await admin.createCompany(testCompany("Testbud", "biuro@testbud.pl"));
    const { companyId: demoId } = await admin.createCompany(testCompany("Test dymny demo", "demo@narzedziownik.test"));
    await testbed.db.transaction((sql) => sql("update app.companies set demo_since = now() where id = $1", [demoId]));

    const result = await testbed.registry.system().deleteTestCompanies(runStart);

    expect(result.deleted.sort()).toEqual(["Test dymny", "Test e2e sprzęt 1a2b3c4d", "Test usuwania 5e6f"]);
    expect(result.leftovers).toBe(0);
    for (const companyId of [e2e.companyId, smokeId, panelDeletionId]) expect(await rowsOfCompany(testbed.db, companyId)).toEqual([]);
    for (const companyId of [olderId, clientId, demoId]) expect(await rowsOfCompany(testbed.db, companyId)).toContain("users");
    expect(testbed.photos.photos.size + testbed.chatPhotos.photos.size + testbed.documents.photos.size).toBe(0);
    expect(await testbed.db.transaction((sql) => sql("select id from auth.users where id = any($1)", [[e2e.ownerId, e2e.managerId]]))).toEqual([]);
    // Firmy testowe to nie klienci: dziennik usuniętych firm zostaje pusty.
    expect(await testbed.db.transaction((sql) => sql("select * from app.company_deletions"))).toEqual([]);
  });
});
