import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isRegistryError } from "./errors";
import type { Locale } from "@/i18n/locales";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();

describe("język interfejsu osoby (ADR 0047)", () => {
  it("nowe konto mówi po polsku, a zmiana języka dotyczy tylko osoby, która go zmieniła", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const workerId = await testbed.givenMember(zawbud, "pracownik", "Taras Bondar");
    const owner = testbed.registry.as(zawbud.ownerId);
    const worker = testbed.registry.as(workerId);
    expect(await worker.session()).toMatchObject({ locale: "pl" });

    await worker.setLocale("uk");

    expect(await worker.session()).toMatchObject({ locale: "uk" });
    expect(await owner.session()).toMatchObject({ locale: "pl" });
  });

  it("każdy z sześciu języków da się wybrać, a innego nie", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);
    for (const locale of ["uk", "ru", "en", "ka", "be", "pl"] as const) {
      await owner.setLocale(locale);
      expect(await owner.session()).toMatchObject({ locale });
    }
    const error = await owner.setLocale("de" as Locale).catch((caught: unknown) => caught);
    expect(isRegistryError(error) && error.code).toBe("invalid_input");
  });

  it("w demo konta są wspólne, więc język się nie zapisuje na koncie, a sesja mówi po polsku", async () => {
    const demo = await testbed.givenActiveCompany("DemoBud");
    await testbed.registry.system().activateDemoCompany(demo.companyId);
    const owner = testbed.registry.as(demo.ownerId);

    const error = await owner.setLocale("en").catch((caught: unknown) => caught);

    expect(isRegistryError(error) && error.code).toBe("forbidden");
    expect(await owner.session()).toMatchObject({ locale: "pl" });
  });

  it("e-mail i push idą w języku adresata, a nie osoby, której ruch je wywołał", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
    const kowalskiId = await testbed.givenMember(zawbud, "kierownik", "Mykoła Kowalenko");
    const owner = testbed.registry.as(zawbud.ownerId);
    const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
    const { locationId: winogradyId } = await owner.addSite({ name: "Winogrady", address: "os. Wichrowe 3", managerId: kowalskiId });
    const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
    const s01 = (await owner.addTool({ operationId: randomUUID(), code: "S-01", name: "Szlifierka kątowa", categoryId: grinders.id })).toolId;
    const { base } = await owner.whereIsWhat();
    const move = (actorId: string, from: string, to: string, kind: "wydanie" | "przeniesienie") =>
      testbed.registry.as(actorId).registerMovement({ operationId: randomUUID(), kind, fromLocationId: from, toLocationId: to, toolIds: [s01], source: "checklista" });
    await testbed.registry.as(kowalskiId).setLocale("uk");
    await testbed.registry.as(nowakId).setLocale("en");
    await testbed.registry.as(kowalskiId).subscribeToPush({ kind: "aplikacja", token: `telefon:${randomUUID()}` });
    await move(kowalskiId, base.id, winogradyId, "wydanie");
    testbed.notifier.clear();

    await move(nowakId, winogradyId, ratajeId, "przeniesienie");

    expect(testbed.notifier.pushed).toHaveLength(1);
    expect(testbed.notifier.pushLocales).toEqual(["uk"]);
    expect(testbed.notifier.sent.map((email) => email.recipient.userId)).toEqual([kowalskiId]);
    expect(testbed.notifier.emailLocales).toEqual(["uk"]);
  });
});
