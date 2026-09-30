import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { type NewCompanyInput, withActor } from "./registry";
import { rowsOfCompany, setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();

const zawbud: NewCompanyInput = {
  name: "Zawbud",
  baseName: "Baza",
  owner: { email: "jan@zawbud.pl", fullName: "Jan Kowalski" },
  invoice: { name: "Zawbud Jan Kowalski", taxId: "778-123-45-63", address: "ul. Polna 3\n60-001 Poznań" },
  tier: "sredni",
  implementationTier: "sredni",
  paidUntil: "2026-12-31",
};

function jpeg() {
  return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(500).fill(1)])], { type: "image/jpeg" });
}

/** Firma z panelu z właścicielem po zmianie hasła, kierownikiem, budową, narzędziem, ruchem, zgłoszeniem, terminem i czatem. */
async function givenCompanyWithHistory(adminId: string) {
  const created = await testbed.registry.superAdmin(adminId).createCompany(zawbud);
  const owner = testbed.registry.as(created.ownerUserId);
  await owner.changePassword("Zawbud-haslo-1", testbed.signedInNow());
  const company = { companyId: created.companyId, ownerId: created.ownerUserId, temporaryPassword: "" };
  const managerId = await testbed.givenMember(company, "kierownik", "Adam Nowak");
  const { locationId: siteId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId });
  const category = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
  const { toolId } = await owner.addTool({ operationId: randomUUID(), code: "S-01", name: "Szlifierka", categoryId: category.id });
  const { base } = await owner.whereIsWhat();
  await owner.registerMovement({ operationId: randomUUID(), kind: "wydanie", fromLocationId: base.id, toLocationId: siteId, toolIds: [toolId], source: "checklista" });
  const { issueId } = await testbed.registry.as(managerId).fileIssue({ operationId: randomUUID(), kind: "inne", description: "Brakuje tarczy", photo: jpeg() });
  await owner.commentOnIssue({ operationId: randomUUID(), issueId, text: "Dokupimy" });
  const { deadlineId } = await owner.addDeadline({ toolId, kind: "przeglad", dueOn: "2026-06-01", cycleMonths: 12 });
  await owner.addDeadlineDocument({ operationId: randomUUID(), deadlineId, kind: "protokol", file: jpeg(), fileName: "protokol.jpg" });
  await owner.sendSupportMessage({ operationId: randomUUID(), text: "Zrzut ekranu", photo: jpeg() });
  return { ...company, managerId };
}

describe("usunięcie firmy przez super-admina", () => {
  it("firma w trybie tylko do odczytu znika w całości: dane, historia, pliki i konta, a w dzienniku zostaje wpis", async () => {
    const adminId = await testbed.givenSuperAdmin();
    const admin = testbed.registry.superAdmin(adminId);
    const company = await givenCompanyWithHistory(adminId);
    const budrex = await testbed.givenActiveCompany("Budrex");
    await admin.setManualReadOnly(company.companyId, true);
    expect(testbed.photos.photos.size).toBe(1);
    expect(testbed.chatPhotos.photos.size).toBe(1);
    expect(testbed.documents.photos.size).toBe(1);

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
