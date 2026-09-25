import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withActor } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();

describe("dodawanie osoby do zespołu", () => {
  it("właściciel dodaje kierownika, a ten loguje się hasłem tymczasowym, które musi zmienić", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");

    const added = await testbed.registry
      .as(zawbud.ownerId)
      .addMember({ firstName: " Adam ", lastName: "Nowak", email: "Adam.Nowak@zawbud.pl", role: "kierownik" });
    const { userId, temporaryPassword } = added;

    expect(testbed.auth.passwordOf(userId)).toBe(temporaryPassword);
    expect(added).toEqual({ userId, fullName: "Adam Nowak", email: "adam.nowak@zawbud.pl", temporaryPassword });
    expect(await testbed.registry.as(userId).session()).toEqual({
      userId,
      fullName: "Adam Nowak",
      role: "kierownik",
      mustChangePassword: true,
      company: { id: zawbud.companyId, name: "Zawbud" },
    });
  });
});

describe("lista zespołu", () => {
  it("właściciel widzi siebie i dodane osoby z rolami, a nowa osoba wymaga zmiany hasła, dopóki go nie ustawi", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);
    const manager = await owner.addMember({ firstName: "Adam", lastName: "Nowak", email: "adam@zawbud.pl", role: "kierownik" });
    const storekeeper = await owner.addMember({ firstName: "Piotr", lastName: "Wiśniewski", email: "piotr@zawbud.pl", role: "magazynier" });

    await expect(testbed.registry.as(manager.userId).whereIsWhat()).rejects.toMatchObject({ code: "password_change_required" });
    await testbed.registry.as(manager.userId).changePassword("HasloAdama12", testbed.signedInNow());
    expect(testbed.auth.passwordOf(manager.userId)).toBe("HasloAdama12");

    expect(await owner.team()).toEqual([
      expect.objectContaining({ userId: zawbud.ownerId, role: "wlasciciel", fullName: "Właściciel Zawbud", active: true }),
      {
        userId: storekeeper.userId,
        fullName: "Piotr Wiśniewski",
        email: "piotr@zawbud.pl",
        role: "magazynier",
        active: true,
        mustChangePassword: true,
      },
      {
        userId: manager.userId,
        fullName: "Adam Nowak",
        email: "adam@zawbud.pl",
        role: "kierownik",
        active: true,
        mustChangePassword: false,
      },
    ]);
  });
});

describe("dane nowej osoby", () => {
  const valid = { firstName: "Adam", lastName: "Nowak", email: "adam@zawbud.pl", role: "kierownik" } as const;

  it("odrzuca osobę bez imienia, nazwiska, z błędnym e-mailem albo z rolą właściciela, nie zakładając kont", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);
    const accountsBefore = testbed.auth.accountCount();

    for (const input of [
      { ...valid, firstName: " " },
      { ...valid, lastName: "" },
      { ...valid, email: "adam@zawbud" },
      { ...valid, role: "wlasciciel" as never },
    ]) {
      await expect(owner.addMember(input)).rejects.toMatchObject({ code: "invalid_input" });
    }
    expect(testbed.auth.accountCount()).toBe(accountsBefore);
    expect(await owner.team()).toHaveLength(1);
  });

  it("odrzuca e-mail, który ma już konto, także w innej firmie", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    await testbed.givenActiveCompany("Budrex", { email: "adam@zawbud.pl" });

    await expect(testbed.registry.as(zawbud.ownerId).addMember(valid)).rejects.toMatchObject({ code: "email_taken" });
    expect(await testbed.registry.as(zawbud.ownerId).team()).toHaveLength(1);
  });
});

describe("tylko właściciel zarządza zespołem", () => {
  it("kierownik i magazynier nie widzą listy zespołu ani nie dodają osób", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const accountsBefore = testbed.auth.accountCount();

    for (const role of ["kierownik", "magazynier"] as const) {
      const member = testbed.registry.as(await testbed.givenMember(zawbud, role));
      await expect(member.team()).rejects.toMatchObject({ code: "forbidden" });
      await expect(
        member.addMember({ firstName: "Obcy", lastName: "Ktoś", email: `obcy-${role}@zawbud.pl`, role: "kierownik" }),
      ).rejects.toMatchObject({ code: "forbidden" });
    }
    expect(testbed.auth.accountCount()).toBe(accountsBefore + 2);
  });

  it("właściciel z niezmienionym hasłem tymczasowym nie dodaje osób", async () => {
    const zawbud = await testbed.givenCompany("Zawbud");

    await expect(
      testbed.registry.as(zawbud.ownerId).addMember({ firstName: "Adam", lastName: "Nowak", email: "adam@zawbud.pl", role: "kierownik" }),
    ).rejects.toMatchObject({ code: "password_change_required" });
  });
});

describe("nowe hasło tymczasowe od właściciela", () => {
  it("osoba loguje się nowym hasłem tymczasowym i znowu musi ustawić własne", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const managerId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
    const ownPassword = testbed.auth.passwordOf(managerId);

    const { temporaryPassword } = await testbed.registry.as(zawbud.ownerId).resetMemberPassword(managerId);

    expect(temporaryPassword).not.toBe(ownPassword);
    expect(temporaryPassword.length).toBeGreaterThanOrEqual(12);
    expect(testbed.auth.passwordOf(managerId)).toBe(temporaryPassword);
    expect(await testbed.registry.as(managerId).session()).toMatchObject({ mustChangePassword: true });
    await expect(testbed.registry.as(managerId).whereIsWhat()).rejects.toMatchObject({ code: "password_change_required" });

    await testbed.registry.as(managerId).changePassword("NoweHasloAdama3", testbed.signedInNow());
    expect(await testbed.registry.as(managerId).session()).toMatchObject({ mustChangePassword: false });
  });

  it("sesja zalogowana przed resetem (np. z zgubionego telefonu) nie ustawi hasła bez nowego hasła tymczasowego", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const managerId = await testbed.givenMember(zawbud, "kierownik");
    const lostPhoneSignedInAt = testbed.clock.now();
    testbed.clock.advance(60 * 60 * 1000);
    const { temporaryPassword } = await testbed.registry.as(zawbud.ownerId).resetMemberPassword(managerId);

    await expect(
      testbed.registry.as(managerId).changePassword("PrzejeteHaslo9", { signedInAt: lostPhoneSignedInAt }),
    ).rejects.toMatchObject({ code: "stale_session" });
    await expect(testbed.registry.as(managerId).whereIsWhat()).rejects.toMatchObject({ code: "password_change_required" });
    expect(testbed.auth.passwordOf(managerId)).toBe(temporaryPassword);

    testbed.clock.advance(5 * 60 * 1000);
    await testbed.registry.as(managerId).changePassword("NoweHasloAdama3", testbed.signedInNow());
    expect(testbed.auth.passwordOf(managerId)).toBe("NoweHasloAdama3");
  });
});

describe("nowe hasło z linku w e-mailu", () => {
  it("osoba, która otworzyła link resetu, ustawia nowe hasło, także zamiast hasła tymczasowego", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const { userId } = await testbed.registry
      .as(zawbud.ownerId)
      .addMember({ firstName: "Adam", lastName: "Nowak", email: "adam@zawbud.pl", role: "kierownik" });
    const recoveredAt = testbed.clock.now();
    testbed.clock.advance(10 * 60 * 1000);

    await testbed.registry.as(userId).setPasswordFromRecoveryLink("HasloZMaila12", { recoveredAt });

    expect(testbed.auth.passwordOf(userId)).toBe("HasloZMaila12");
    expect(await testbed.registry.as(userId).session()).toMatchObject({ mustChangePassword: false });
  });

  it("bez linku resetu albo po godzinie od jego otwarcia hasła nie da się ustawić", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const managerId = await testbed.givenMember(zawbud, "kierownik");
    const password = testbed.auth.passwordOf(managerId);
    const manager = testbed.registry.as(managerId);
    const recoveredAt = testbed.clock.now();
    testbed.clock.advance(61 * 60 * 1000);

    await expect(manager.setPasswordFromRecoveryLink("PrzejeteHaslo9", { recoveredAt: null })).rejects.toMatchObject({
      code: "recovery_expired",
    });
    await expect(manager.setPasswordFromRecoveryLink("PrzejeteHaslo9", { recoveredAt })).rejects.toMatchObject({
      code: "recovery_expired",
    });
    expect(testbed.auth.passwordOf(managerId)).toBe(password);
  });

  it("za krótkie hasło jest odrzucane, a dezaktywowana osoba nie ustawi hasła", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const managerId = await testbed.givenMember(zawbud, "kierownik");
    const recovered = { recoveredAt: testbed.clock.now() };

    await expect(testbed.registry.as(managerId).setPasswordFromRecoveryLink("krotkie", recovered)).rejects.toMatchObject({
      code: "password_too_short",
    });
    await testbed.registry.as(zawbud.ownerId).deactivateMember(managerId);
    await expect(testbed.registry.as(managerId).setPasswordFromRecoveryLink("DlugieHaslo12", recovered)).rejects.toMatchObject({
      code: "no_access",
    });
  });
});

describe("dezaktywacja konta", () => {
  it("dezaktywowana osoba nie loguje się ani nie ma dostępu do firmy, ale zostaje w zespole i w historii", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const storekeeperId = await testbed.givenMember(zawbud, "magazynier", "Piotr Wiśniewski");
    const storekeeper = testbed.registry.as(storekeeperId);
    const category = await testbed.registry.as(zawbud.ownerId).addCategory({ name: "Szlifierki", prefix: "S" });
    const { toolId } = await storekeeper.addTool({ operationId: randomUUID(), name: "Szlifierka", categoryId: category.id });

    await testbed.registry.as(zawbud.ownerId).deactivateMember(storekeeperId);

    expect(testbed.auth.isBlocked(storekeeperId)).toBe(true);
    expect(await storekeeper.session()).toBeNull();
    await expect(storekeeper.whereIsWhat()).rejects.toMatchObject({ code: "no_access" });
    await expect(storekeeper.toolCard(toolId)).rejects.toMatchObject({ code: "no_access" });

    const owner = testbed.registry.as(zawbud.ownerId);
    expect(await owner.team()).toContainEqual(
      expect.objectContaining({ userId: storekeeperId, fullName: "Piotr Wiśniewski", active: false }),
    );
    expect((await owner.toolCard(toolId))?.history).toEqual([expect.objectContaining({ author: "Piotr Wiśniewski" })]);
  });

  it("dezaktywowanej osobie nie da się wygenerować hasła ani dezaktywować jej ponownie", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const managerId = await testbed.givenMember(zawbud, "kierownik");
    const owner = testbed.registry.as(zawbud.ownerId);
    await owner.deactivateMember(managerId);
    const password = testbed.auth.passwordOf(managerId);

    await expect(owner.resetMemberPassword(managerId)).rejects.toMatchObject({ code: "forbidden" });
    await expect(owner.deactivateMember(managerId)).rejects.toMatchObject({ code: "forbidden" });
    expect(testbed.auth.passwordOf(managerId)).toBe(password);
  });
});

describe("uprawnienia do kont zespołu", () => {
  it("kierownik i magazynier nie resetują haseł ani nie dezaktywują kont", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const managerId = await testbed.givenMember(zawbud, "kierownik");
    const storekeeperId = await testbed.givenMember(zawbud, "magazynier");
    const managerPassword = testbed.auth.passwordOf(managerId);

    for (const [actorId, targetId] of [
      [managerId, storekeeperId],
      [storekeeperId, managerId],
      [storekeeperId, zawbud.ownerId],
    ]) {
      const actor = testbed.registry.as(actorId);
      await expect(actor.resetMemberPassword(targetId)).rejects.toMatchObject({ code: "forbidden" });
      await expect(actor.deactivateMember(targetId)).rejects.toMatchObject({ code: "forbidden" });
    }
    expect(testbed.auth.passwordOf(managerId)).toBe(managerPassword);
    expect(await testbed.registry.as(managerId).session()).toMatchObject({ mustChangePassword: false });
    expect(testbed.auth.isBlocked(zawbud.ownerId)).toBe(false);
  });

  it("właściciel nie resetuje hasła ani nie dezaktywuje własnego konta", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);

    await expect(owner.resetMemberPassword(zawbud.ownerId)).rejects.toMatchObject({ code: "forbidden" });
    await expect(owner.deactivateMember(zawbud.ownerId)).rejects.toMatchObject({ code: "forbidden" });
    expect(await owner.session()).toMatchObject({ mustChangePassword: false });
  });

  it("nieistniejąca osoba i zły identyfikator to „nie znaleziono”", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);

    for (const id of [randomUUID(), "nie-uuid"]) {
      await expect(owner.resetMemberPassword(id)).rejects.toMatchObject({ code: "not_found" });
      await expect(owner.deactivateMember(id)).rejects.toMatchObject({ code: "not_found" });
    }
  });
});

describe("izolacja firm w zespole", () => {
  it("właściciel innej firmy nie widzi osób Zawbudu ani nie zarządza ich kontami", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const budrex = await testbed.givenActiveCompany("Budrex");
    const managerId = await testbed.givenMember(zawbud, "kierownik");
    const password = testbed.auth.passwordOf(managerId);
    const stranger = testbed.registry.as(budrex.ownerId);

    expect((await stranger.team()).map((member) => member.userId)).toEqual([budrex.ownerId]);
    await expect(stranger.resetMemberPassword(managerId)).rejects.toMatchObject({ code: "not_found" });
    await expect(stranger.deactivateMember(managerId)).rejects.toMatchObject({ code: "not_found" });

    expect(testbed.auth.passwordOf(managerId)).toBe(password);
    expect(testbed.auth.isBlocked(managerId)).toBe(false);
    expect(await testbed.registry.as(managerId).session()).toMatchObject({ mustChangePassword: false });
  });

  it("bezpośrednio w bazie kierownik nie dopisze osoby, a właściciel nie przeniesie ani nie doda nikogo do cudzej firmy", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const budrex = await testbed.givenActiveCompany("Budrex");
    const managerId = await testbed.givenMember(zawbud, "kierownik");
    const budrexManagerId = await testbed.givenMember(budrex, "kierownik");
    const { userId: loose } = await testbed.auth.createUser({ email: "luzem@example.test", password: "DowolneHaslo1" });
    const insertAs = (actorId: string, companyId: string, role: string) =>
      withActor(testbed.db, actorId, (sql) =>
        sql(
          `insert into app.users (user_id, company_id, role, full_name, email, must_change_password, created_at)
           values ($1, $2, $3, 'Ktoś', 'luzem@example.test', true, now())`,
          [loose, companyId, role],
        ),
      );

    await expect(insertAs(managerId, zawbud.companyId, "kierownik")).rejects.toThrow();
    await expect(insertAs(zawbud.ownerId, budrex.companyId, "kierownik")).rejects.toThrow();
    await expect(insertAs(zawbud.ownerId, zawbud.companyId, "wlasciciel")).rejects.toThrow();

    const moved = await withActor(testbed.db, zawbud.ownerId, (sql) =>
      sql("update app.users set active = false, must_change_password = true where user_id = $1 returning user_id", [
        budrexManagerId,
      ]),
    );
    expect(moved).toEqual([]);
    await expect(
      withActor(testbed.db, zawbud.ownerId, (sql) =>
        sql("update app.users set company_id = $1 where user_id = $2", [budrex.companyId, managerId]),
      ),
    ).rejects.toThrow();
    expect(await testbed.registry.as(budrexManagerId).session()).toMatchObject({ mustChangePassword: false });
  });

  it("bezpośrednio w bazie właściciel nie zdejmie osobie wymogu zmiany hasła tymczasowego", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const { userId } = await testbed.registry
      .as(zawbud.ownerId)
      .addMember({ firstName: "Adam", lastName: "Nowak", email: "adam@zawbud.pl", role: "kierownik" });

    await expect(
      withActor(testbed.db, zawbud.ownerId, (sql) =>
        sql("update app.users set must_change_password = false where user_id = $1", [userId]),
      ),
    ).rejects.toThrow();
    expect(await testbed.registry.as(userId).session()).toMatchObject({ mustChangePassword: true });
  });
});
