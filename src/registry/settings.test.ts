import { describe, expect, it } from "vitest";
import { withActor } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();

describe("ustawienia firmy", () => {
  it("nowa firma ma próg alarmu 30 dni, a właściciel go zmienia", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);
    expect(await owner.settings()).toEqual({ alarmThresholdDays: 30 });

    await owner.updateSettings({ alarmThresholdDays: 45 });

    expect(await owner.settings()).toEqual({ alarmThresholdDays: 45 });
  });

  it("odrzuca próg spoza 1–365 dni i niecałkowity", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);

    for (const alarmThresholdDays of [0, -3, 2.5, 366, Number.NaN]) {
      await expect(owner.updateSettings({ alarmThresholdDays }), String(alarmThresholdDays)).rejects.toMatchObject({
        code: "invalid_input",
      });
    }
    expect(await owner.settings()).toEqual({ alarmThresholdDays: 30 });
  });

  it("kierownik i magazynier nie widzą ani nie zmieniają ustawień, a zmiana nie dotyka innej firmy", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const budrex = await testbed.givenActiveCompany("Budrex");
    for (const role of ["kierownik", "magazynier"] as const) {
      const member = testbed.registry.as(await testbed.givenMember(zawbud, role));
      await expect(member.settings()).rejects.toMatchObject({ code: "forbidden" });
      await expect(member.updateSettings({ alarmThresholdDays: 5 })).rejects.toMatchObject({ code: "forbidden" });
    }

    await testbed.registry.as(zawbud.ownerId).updateSettings({ alarmThresholdDays: 60 });

    expect(await testbed.registry.as(zawbud.ownerId).settings()).toEqual({ alarmThresholdDays: 60 });
    expect(await testbed.registry.as(budrex.ownerId).settings()).toEqual({ alarmThresholdDays: 30 });
  });

  it("połączenie z bazą jako magazynier nie zmienia progu firmy", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const storekeeperId = await testbed.givenMember(zawbud, "magazynier");

    await withActor(testbed.db, storekeeperId, (sql) => sql("update app.companies set alarm_threshold_days = 5"));

    expect(await testbed.registry.as(zawbud.ownerId).settings()).toEqual({ alarmThresholdDays: 30 });
  });
});
