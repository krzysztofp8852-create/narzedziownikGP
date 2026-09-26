import { describe, expect, it } from "vitest";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();

describe("zakładanie firmy", () => {
  it("właściciel nowej firmy loguje się hasłem tymczasowym, które musi zmienić", async () => {
    const created = await testbed.registry.system().createCompany({
      name: "Zawbud",
      baseName: "Baza",
      owner: { email: "jan@zawbud.pl", fullName: "Jan Kowalski" },
    });

    expect(testbed.auth.passwordOf(created.ownerUserId)).toBe(created.temporaryPassword);
    expect(await testbed.registry.as(created.ownerUserId).session()).toEqual({
      userId: created.ownerUserId,
      fullName: "Jan Kowalski",
      role: "wlasciciel",
      mustChangePassword: true,
      company: { id: created.companyId, name: "Zawbud" },
    });
  });
});

describe("dane przy zakładaniu firmy", () => {
  const input = { name: "Budrex", baseName: "Magazyn", owner: { email: "anna@budrex.pl", fullName: "Anna Nowak" } };

  it("odrzuca firmę bez nazwy i właściciela bez e-maila, nie zakładając kont", async () => {
    await expect(testbed.registry.system().createCompany({ ...input, name: "  " })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      testbed.registry.system().createCompany({ ...input, owner: { email: "anna", fullName: "Anna Nowak" } }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(testbed.auth.accountCount()).toBe(0);
  });

  it("odrzuca właściciela z e-mailem, który ma już konto", async () => {
    await testbed.givenCompany("Zawbud", { email: "anna@budrex.pl" });

    await expect(testbed.registry.system().createCompany(input)).rejects.toMatchObject({ code: "email_taken" });
  });

  it("hasła tymczasowe są długie i za każdym razem inne", async () => {
    const first = await testbed.givenCompany("Zawbud");
    const second = await testbed.givenCompany("Budrex");

    expect(first.temporaryPassword.length).toBeGreaterThanOrEqual(12);
    expect(first.temporaryPassword).not.toBe(second.temporaryPassword);
  });
});

describe("zmiana hasła tymczasowego", () => {
  it("po zmianie hasła właściciel loguje się nowym hasłem i nie musi go już zmieniać", async () => {
    const { ownerId } = await testbed.givenCompany("Zawbud");

    await testbed.registry.as(ownerId).changePassword("MojeNoweHaslo7", testbed.signedInNow());

    expect(testbed.auth.passwordOf(ownerId)).toBe("MojeNoweHaslo7");
    expect(await testbed.registry.as(ownerId).session()).toMatchObject({ mustChangePassword: false });
  });

  it("hasło krótsze niż 8 znaków jest odrzucane, a hasło tymczasowe zostaje", async () => {
    const { ownerId, temporaryPassword } = await testbed.givenCompany("Zawbud");

    await expect(testbed.registry.as(ownerId).changePassword("krotkie", testbed.signedInNow())).rejects.toMatchObject({ code: "password_too_short" });

    expect(testbed.auth.passwordOf(ownerId)).toBe(temporaryPassword);
    expect(await testbed.registry.as(ownerId).session()).toMatchObject({ mustChangePassword: true });
  });

  it("po ustawieniu własnego hasła tej ścieżki nie da się użyć ponownie, np. ze skradzionej sesji", async () => {
    const { ownerId } = await testbed.givenCompany("Zawbud");
    await testbed.registry.as(ownerId).changePassword("MojeNoweHaslo7", testbed.signedInNow());

    await expect(testbed.registry.as(ownerId).changePassword("PrzejeteHaslo8", testbed.signedInNow())).rejects.toMatchObject({ code: "forbidden" });
    expect(testbed.auth.passwordOf(ownerId)).toBe("MojeNoweHaslo7");
  });
});

describe("tablica „Gdzie jest co”", () => {
  it("nowa firma ma na tablicy tylko swoją bazę, bez narzędzi i bez budów", async () => {
    const { ownerId } = await testbed.givenCompany("Zawbud");
    await testbed.registry.as(ownerId).changePassword("MojeNoweHaslo7", testbed.signedInNow());

    expect(await testbed.registry.as(ownerId).whereIsWhat()).toEqual({
      offBaseValue: 0,
      alarmCount: 0,
      base: { id: expect.any(String), name: "Baza", totalValue: 0, tools: [] },
      sites: [],
      services: [],
      lost: [],
      lostValue: 0,
    });
  });
});

describe("dostęp przed zmianą hasła i bez konta w firmie", () => {
  it("dopóki hasło tymczasowe nie zostało zmienione, Rejestr nie pokazuje tablicy", async () => {
    const { ownerId } = await testbed.givenCompany("Zawbud");

    await expect(testbed.registry.as(ownerId).whereIsWhat()).rejects.toMatchObject({ code: "password_change_required" });
  });

  it("osoba z kontem logowania, ale bez konta w żadnej firmie, nie ma sesji ani tablicy", async () => {
    const { userId } = await testbed.auth.createUser({ email: "obcy@example.test", password: "DowolneHaslo1" });

    expect(await testbed.registry.as(userId).session()).toBeNull();
    await expect(testbed.registry.as(userId).whereIsWhat()).rejects.toMatchObject({ code: "no_access" });
    await expect(testbed.registry.as(userId).changePassword("DowolneHaslo2", testbed.signedInNow())).rejects.toMatchObject({ code: "no_access" });
  });
});
