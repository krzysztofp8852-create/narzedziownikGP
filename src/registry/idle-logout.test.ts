import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withActor } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();

const MINUTE = 60_000;

/** Przeglądarka zalogowana w tej chwili zegara testu. */
function browserSignedInNow() {
  return { id: randomUUID(), signedInAt: testbed.clock.now() };
}

async function givenOwnerWithIdleLogout(minutes: number) {
  const zawbud = await testbed.givenActiveCompany("Zawbud");
  const owner = testbed.registry.as(zawbud.ownerId);
  await owner.updateSettings({ ownerIdleLogoutMinutes: minutes });
  return { zawbud, owner };
}

describe("wylogowanie właściciela po bezczynności", () => {
  it("nowa firma go nie ma: sesja właściciela nie wygasa", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);
    const browser = browserSignedInNow();

    expect(await owner.settings()).toMatchObject({ ownerIdleLogoutMinutes: null });
    expect(await owner.session()).toMatchObject({ idleLogoutMinutes: null });
    testbed.clock.advance(400 * 24 * 60 * MINUTE);
    expect(await owner.idleStatus(browser)).toEqual({ kind: "off" });
    expect(await owner.recordActivity(browser)).toEqual({ kind: "off" });
  });

  it("sesja bez aktywności liczy się od zalogowania i wygasa po ustawionym czasie", async () => {
    const { owner } = await givenOwnerWithIdleLogout(30);
    const browser = browserSignedInNow();

    expect(await owner.session()).toMatchObject({ idleLogoutMinutes: 30 });
    testbed.clock.advance(10 * MINUTE);
    expect(await owner.idleStatus(browser)).toEqual({ kind: "active", remainingMs: 20 * MINUTE });
    testbed.clock.advance(20 * MINUTE);
    expect(await owner.idleStatus(browser)).toEqual({ kind: "expired" });
  });

  it("aktywność odsuwa wylogowanie, a sprawdzenie stanu nie jest aktywnością", async () => {
    const { owner } = await givenOwnerWithIdleLogout(15);
    const browser = browserSignedInNow();

    testbed.clock.advance(10 * MINUTE);
    expect(await owner.recordActivity(browser)).toEqual({ kind: "active", remainingMs: 15 * MINUTE });
    testbed.clock.advance(10 * MINUTE);
    expect(await owner.idleStatus(browser)).toEqual({ kind: "active", remainingMs: 5 * MINUTE });
    testbed.clock.advance(5 * MINUTE);
    expect(await owner.idleStatus(browser)).toEqual({ kind: "expired" });
  });

  it("wygasłej sesji aktywność już nie przedłuża", async () => {
    const { owner } = await givenOwnerWithIdleLogout(15);
    const browser = browserSignedInNow();
    await owner.recordActivity(browser);

    testbed.clock.advance(16 * MINUTE);

    expect(await owner.recordActivity(browser)).toEqual({ kind: "expired" });
    expect(await owner.idleStatus(browser)).toEqual({ kind: "expired" });
  });

  it("każda przeglądarka liczy bezczynność osobno", async () => {
    const { owner } = await givenOwnerWithIdleLogout(30);
    const office = browserSignedInNow();
    const phone = browserSignedInNow();

    testbed.clock.advance(25 * MINUTE);
    await owner.recordActivity(phone);
    testbed.clock.advance(10 * MINUTE);

    expect(await owner.idleStatus(office)).toEqual({ kind: "expired" });
    expect(await owner.idleStatus(phone)).toEqual({ kind: "active", remainingMs: 20 * MINUTE });
  });

  it("sesje otwarte przed włączeniem liczą się od włączenia, więc zapis nikogo od razu nie wylogowuje", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);
    const office = browserSignedInNow();
    const phone = browserSignedInNow();
    testbed.clock.advance(30 * 24 * 60 * MINUTE);

    await owner.updateSettings({ ownerIdleLogoutMinutes: 30 });
    expect(await owner.idleStatus(office)).toEqual({ kind: "active", remainingMs: 30 * MINUTE });
    expect(await owner.recordActivity(phone)).toEqual({ kind: "active", remainingMs: 30 * MINUTE });

    testbed.clock.advance(30 * MINUTE);
    expect(await owner.idleStatus(office)).toEqual({ kind: "expired" });
  });

  it("zmiana czasu liczy od zmiany, a zapis bez zmiany niczego nie przedłuża", async () => {
    const { owner } = await givenOwnerWithIdleLogout(240);
    const browser = browserSignedInNow();
    testbed.clock.advance(20 * MINUTE);

    await owner.updateSettings({ ownerIdleLogoutMinutes: 15 });
    expect(await owner.idleStatus(browser)).toEqual({ kind: "active", remainingMs: 15 * MINUTE });
    testbed.clock.advance(10 * MINUTE);
    await owner.updateSettings({ ownerIdleLogoutMinutes: 15, alarmThresholdDays: 40 });
    expect(await owner.idleStatus(browser)).toEqual({ kind: "active", remainingMs: 5 * MINUTE });
  });

  it("dotyczy tylko właściciela: kierownik i magazynier mają dalej długą sesję", async () => {
    const { zawbud } = await givenOwnerWithIdleLogout(15);
    for (const role of ["kierownik", "magazynier", "pracownik"] as const) {
      const member = testbed.registry.as(await testbed.givenMember(zawbud, role));
      const browser = browserSignedInNow();
      testbed.clock.advance(60 * MINUTE);

      expect(await member.session(), role).toMatchObject({ idleLogoutMinutes: null });
      expect(await member.idleStatus(browser), role).toEqual({ kind: "off" });
      expect(await member.recordActivity(browser), role).toEqual({ kind: "off" });
    }
  });

  it("nie ma go w firmie demo, gdzie konto właściciela dzielą wszyscy oglądający", async () => {
    const { zawbud, owner } = await givenOwnerWithIdleLogout(15);
    await testbed.registry.system().activateDemoCompany(zawbud.companyId);
    const browser = browserSignedInNow();
    testbed.clock.advance(60 * MINUTE);

    expect(await owner.session()).toMatchObject({ idleLogoutMinutes: null });
    expect(await owner.idleStatus(browser)).toEqual({ kind: "off" });
  });

  it("działa w trybie tylko do odczytu", async () => {
    const { zawbud, owner } = await givenOwnerWithIdleLogout(30);
    const admin = testbed.registry.superAdmin(await testbed.givenSuperAdmin());
    await admin.setManualReadOnly(zawbud.companyId, true);
    const browser = browserSignedInNow();

    testbed.clock.advance(20 * MINUTE);
    expect(await owner.recordActivity(browser)).toEqual({ kind: "active", remainingMs: 30 * MINUTE });
  });

  it("aktywności innej osoby nie da się odczytać ani zapisać", async () => {
    const { zawbud, owner } = await givenOwnerWithIdleLogout(30);
    const browser = browserSignedInNow();
    await owner.recordActivity(browser);
    const managerId = await testbed.givenMember(zawbud, "kierownik");

    const seen = await withActor(testbed.db, managerId, (sql) => sql("select * from app.session_activity"));
    await withActor(testbed.db, managerId, (sql) => sql("update app.session_activity set last_active_at = now() + interval '1 year'"));

    expect(seen).toEqual([]);
    testbed.clock.advance(31 * MINUTE);
    expect(await owner.idleStatus(browser)).toEqual({ kind: "expired" });
  });

  it("przyjmuje tylko wyłączone, 15, 30, 60 albo 240 minut i zapisuje zmianę w dzienniku", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);

    for (const minutes of [0, 10, 45, 2.5, 241, Number.NaN]) {
      await expect(owner.updateSettings({ ownerIdleLogoutMinutes: minutes }), String(minutes)).rejects.toMatchObject({ code: "invalid_input" });
    }
    await owner.updateSettings({ ownerIdleLogoutMinutes: 60 });
    await owner.updateSettings({ ownerIdleLogoutMinutes: null });

    expect(await owner.settings()).toMatchObject({ ownerIdleLogoutMinutes: null });
    const changes = (await owner.changeLog()).filter((entry) => entry.setting === "wylogowanie_wlasciciela");
    expect(changes.map(({ oldValue, newValue }) => [oldValue, newValue])).toEqual([
      ["60", "wylaczone"],
      ["wylaczone", "60"],
    ]);
  });

  it("kierownik nie zmienia ustawienia", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const manager = testbed.registry.as(await testbed.givenMember(zawbud, "kierownik"));

    await expect(manager.updateSettings({ ownerIdleLogoutMinutes: 15 })).rejects.toMatchObject({ code: "forbidden" });
  });
});
