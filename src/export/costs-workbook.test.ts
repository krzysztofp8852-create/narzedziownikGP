import { randomUUID } from "node:crypto";
import readXlsxFile from "read-excel-file/node";
import { describe, expect, it } from "vitest";
import { setupRegistryTestbed } from "@/registry/testing/harness";
import { costsFileName, costsWorkbook, costSummaryFileName, costSummaryWorkbook } from "./costs-workbook";

const testbed = setupRegistryTestbed();

/**
 * Zawbud 2 marca 2026: stawka firmy 1%, a na Rataje od 8:00 jadą młot H-01 za 2000 zł i przedłużacz E-03 bez
 * wartości. 5 marca właściciel podnosi stawkę do 2%, a 6 marca o 12:00 eksportuje marzec.
 */
async function givenRatajeCosts() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Swarzędz" });
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const owner = testbed.registry.as(zawbud.ownerId);
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
  await owner.addSite({ name: "Winogrady", address: "ul. Słowiańska 3", managerId: nowakId });
  await owner.addVehicle({ name: "Bus WX 12345", managerId: nowakId });
  const category = await owner.addCategory({ name: "Elektronarzędzia", prefix: "E" });
  const h01 = (await owner.addTool({ operationId: randomUUID(), code: "H-01", name: "Młot Hilti", categoryId: category.id, value: 2000 })).toolId;
  const e03 = (await owner.addTool({ operationId: randomUUID(), code: "E-03", name: "Przedłużacz bębnowy", categoryId: category.id })).toolId;
  await owner.setDailyRate({ kind: "firma" }, 1);
  const { base } = await owner.whereIsWhat();
  testbed.clock.set("2026-03-02T08:00:00+01:00");
  await owner.registerMovement({ operationId: randomUUID(), kind: "wydanie", fromLocationId: base.id, toLocationId: ratajeId, toolIds: [h01, e03], source: "checklista" });
  testbed.clock.set("2026-03-05T08:00:00+01:00");
  await owner.setDailyRate({ kind: "firma" }, 2);
  testbed.clock.set("2026-03-06T12:00:00+01:00");
  const costs = await owner.locationCosts(ratajeId, { from: "2026-03-01", to: "2026-03-31" });
  const summary = await owner.costSummary({ from: "2026-03-01", to: "2026-03-31" });
  if (costs.status !== "koszty" || summary.status !== "koszty") throw new Error("Brak kosztów");
  return { costs, summary };
}

describe("eksport kosztów sprzętu do Excela", () => {
  it("arkusz ma lokalizację i okres, wiersz na każdą stawkę narzędzia, dni bez stawki i sumę", async () => {
    const { costs } = await givenRatajeCosts();

    const [sheet] = await readXlsxFile(await costsWorkbook(costs));

    expect(sheet.sheet).toBe("Koszt sprzętu");
    expect(sheet.data).toEqual([
      ["Koszt sprzętu: Rataje", null, null, null, null],
      ["Okres: 1.03.2026 – 6.03.2026", null, null, null, null],
      ["Kod", "Nazwa", "Dni", "Stawka dzienna (zł)", "Kwota (zł)"],
      ["E-03", "Przedłużacz bębnowy", 5, "bez stawki", null],
      ["H-01", "Młot Hilti", 3, 20, 60],
      ["H-01", "Młot Hilti", 2, 40, 80],
      ["Razem", null, null, null, 140],
    ]);
    expect(costsFileName(costs)).toBe("koszt-sprzetu-2026-03-01-2026-03-06.xlsx");
  });

  it("zestawienie ma okres, wiersz na każdą budowę i pojazd z liczbą narzędzi i kwotą, i sumę", async () => {
    const { summary } = await givenRatajeCosts();

    const [sheet] = await readXlsxFile(await costSummaryWorkbook(summary));

    expect(sheet.sheet).toBe("Koszty sprzętu");
    expect(sheet.data).toEqual([
      ["Koszty sprzętu budów i pojazdów", null, null, null],
      ["Okres: 1.03.2026 – 6.03.2026", null, null, null],
      ["Rodzaj", "Nazwa", "Narzędzia", "Kwota (zł)"],
      ["Budowa", "Rataje", 2, 140],
      ["Budowa", "Winogrady", 0, 0],
      ["Pojazd", "Bus WX 12345", 0, 0],
      ["Razem", null, null, 140],
    ]);
    expect(costSummaryFileName(summary)).toBe("koszty-sprzetu-2026-03-01-2026-03-06.xlsx");
  });
});
