import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { type RegisteredKind, withActor } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();

/**
 * Zawbud 2 marca 2026 o 7:00 z kierownikiem Nowakiem (budowy Rataje i Winogrady, bus WX 12345), magazynierką,
 * pracownikiem, serwisem Hilti i sprzętem na bazie: młot E-01 za 2000 zł, szlifierka E-02 za 500 zł, przedłużacz
 * E-03 bez wartości (Elektronarzędzia) i niwelator P-01 za 3000 zł (Pomiarowe).
 */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Swarzędz" });
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const storekeeperId = await testbed.givenMember(zawbud, "magazynier", "Ewa Magazyn");
  const workerId = await testbed.givenMember(zawbud, "pracownik", "Marek Zieliński");
  const owner = testbed.registry.as(zawbud.ownerId);
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
  const { locationId: winogradyId } = await owner.addSite({ name: "Winogrady", address: "ul. Słowiańska 3", managerId: nowakId });
  const { locationId: busId } = await owner.addVehicle({ name: "Bus WX 12345", managerId: nowakId });
  const { locationId: hiltiId } = await owner.addService({ name: "Serwis Hilti" });
  const electric = await owner.addCategory({ name: "Elektronarzędzia", prefix: "E" });
  const measuring = await owner.addCategory({ name: "Pomiarowe", prefix: "P" });
  const tool = async (code: string, name: string, categoryId: string, value?: number) =>
    (await owner.addTool({ operationId: randomUUID(), code, name, categoryId, value })).toolId;
  const e01 = await tool("E-01", "Młot Hilti", electric.id, 2000);
  const e02 = await tool("E-02", "Szlifierka kątowa", electric.id, 500);
  const e03 = await tool("E-03", "Przedłużacz bębnowy", electric.id);
  const p01 = await tool("P-01", "Niwelator laserowy", measuring.id, 3000);
  const { base } = await owner.whereIsWhat();
  return {
    zawbud,
    owner,
    nowakId,
    storekeeperId,
    workerId,
    ratajeId,
    winogradyId,
    busId,
    hiltiId,
    baseId: base.id,
    electric,
    measuring,
    e01,
    e02,
    e03,
    p01,
  };
}

type Zawbud = Awaited<ReturnType<typeof givenZawbud>>;

/** Ruch właściciela (rusza sprzęt wszystkich lokalizacji) o podanej chwili czasu polskiego. */
async function move(z: Zawbud, at: string, kind: RegisteredKind, from: string, to: string, toolIds: string[], actorId = z.zawbud.ownerId) {
  testbed.clock.set(at);
  return testbed.registry
    .as(actorId)
    .registerMovement({ operationId: randomUUID(), kind, fromLocationId: from, toLocationId: to, toolIds, source: "checklista" });
}

/** Dni i kwota każdego narzędzia w kosztach lokalizacji, po kodzie. */
async function costsOf(z: Zawbud, locationId: string, period?: { from: string; to: string }) {
  const costs = await z.owner.locationCosts(locationId, period);
  if (costs.status !== "koszty") throw new Error(`Brak kosztów: ${costs.status}`);
  return costs;
}

async function daysOf(z: Zawbud, locationId: string) {
  const costs = await costsOf(z, locationId);
  return Object.fromEntries(costs.tools.map((row) => [row.tool.code, row.days]));
}

describe("dzień startu kosztów", () => {
  it("przed pierwszym ustawieniem stawek koszty mają stan „brak stawki”, a karta narzędzia nie ma stawki", async () => {
    const z = await givenZawbud();
    await move(z, "2026-03-02T08:00:00+01:00", "wydanie", z.baseId, z.ratajeId, [z.e01]);
    testbed.clock.set("2026-03-05T12:00:00+01:00");

    expect(await z.owner.locationCosts(z.ratajeId)).toEqual({ status: "brak_stawki" });
    expect(await z.owner.dailyRates()).toEqual({ costStartDay: null, companyPercent: null, categories: [] });
    expect((await z.owner.toolCard(z.e01))!.dailyRate).toBeNull();
  });

  it("stawka ustawiona pierwszy raz liczy się wstecz przez całą historię ruchów", async () => {
    const z = await givenZawbud();
    await move(z, "2026-03-02T08:00:00+01:00", "wydanie", z.baseId, z.ratajeId, [z.e01]);
    testbed.clock.set("2026-03-10T08:00:00+01:00");

    await z.owner.setDailyRate({ kind: "firma" }, 1);

    expect(await z.owner.dailyRates()).toEqual({ costStartDay: "2026-03-10", companyPercent: 1, categories: [] });
    expect(await z.owner.locationCosts(z.ratajeId)).toEqual({
      status: "koszty",
      location: { id: z.ratajeId, name: "Rataje", kind: "budowa" },
      period: { from: "2026-03-02", to: "2026-03-10" },
      total: 180,
      tools: [{ tool: { id: z.e01, code: "E-01", name: "Młot Hilti" }, days: 9, rates: [{ amount: 20, days: 9 }], daysWithoutRate: 0, amount: 180 }],
    });
  });

  it("wartość zapisana w dniu startu też liczy się wstecz, a wcześniejsze zmiany wartości ustępują ostatniej", async () => {
    const z = await givenZawbud();
    await move(z, "2026-03-02T08:00:00+01:00", "wydanie", z.baseId, z.ratajeId, [z.e01]);
    testbed.clock.set("2026-03-05T08:00:00+01:00");
    await z.owner.editTool(z.e01, { value: 1500 });
    testbed.clock.set("2026-03-10T08:00:00+01:00");
    await z.owner.setDailyRate({ kind: "firma" }, 1);
    testbed.clock.set("2026-03-10T15:00:00+01:00");

    await z.owner.editTool(z.e01, { value: 2500 });

    const costs = await costsOf(z, z.ratajeId);
    expect(costs.tools[0]).toMatchObject({ days: 9, rates: [{ amount: 25, days: 9 }], amount: 225 });
  });

  it("dniem startu jest pierwsza stawka firmy: kwota narzędzia i stawka kategorii sprzed niej też liczą się wstecz", async () => {
    const z = await givenZawbud();
    await move(z, "2026-03-02T08:00:00+01:00", "wydanie", z.baseId, z.ratajeId, [z.e01, z.e02, z.p01]);
    testbed.clock.set("2026-03-03T08:00:00+01:00");
    await z.owner.setDailyRate({ kind: "narzedzie", toolId: z.e01 }, null);
    await z.owner.setDailyRate({ kind: "narzedzie", toolId: z.e02 }, 15);
    await z.owner.setDailyRate({ kind: "kategoria", categoryId: z.measuring.id }, 2);
    testbed.clock.set("2026-03-05T08:00:00+01:00");

    expect(await z.owner.locationCosts(z.ratajeId)).toEqual({ status: "brak_stawki" });
    expect((await z.owner.toolCard(z.e02))!.dailyRate).toBeNull();

    testbed.clock.set("2026-03-06T08:00:00+01:00");
    await z.owner.setDailyRate({ kind: "firma" }, 1);

    expect(await z.owner.dailyRates()).toMatchObject({ costStartDay: "2026-03-06" });
    expect((await costsOf(z, z.ratajeId)).tools.map((row) => [row.tool.code, row.rates])).toEqual([
      ["E-01", [{ amount: 20, days: 5 }]],
      ["E-02", [{ amount: 15, days: 5 }]],
      ["P-01", [{ amount: 60, days: 5 }]],
    ]);
  });

  it("późniejsza zmiana stawki i wartości działa od dnia zmiany, więc zamknięte dni się nie zmieniają", async () => {
    const z = await givenZawbud();
    await move(z, "2026-03-02T08:00:00+01:00", "wydanie", z.baseId, z.ratajeId, [z.e01]);
    testbed.clock.set("2026-03-10T08:00:00+01:00");
    await z.owner.setDailyRate({ kind: "firma" }, 1);
    testbed.clock.set("2026-03-15T12:00:00+01:00");
    await z.owner.setDailyRate({ kind: "firma" }, 2);
    testbed.clock.set("2026-03-20T09:00:00+01:00");
    await z.owner.editTool(z.e01, { value: 3000 });
    testbed.clock.set("2026-03-22T10:00:00+01:00");

    const costs = await costsOf(z, z.ratajeId);

    expect(costs.tools[0]).toMatchObject({
      days: 21,
      rates: [
        { amount: 20, days: 13 },
        { amount: 40, days: 5 },
        { amount: 60, days: 3 },
      ],
      amount: 640,
    });
    expect(costs.total).toBe(640);
    expect(await z.owner.dailyRates()).toMatchObject({ costStartDay: "2026-03-10", companyPercent: 2 });
  });
});

describe("pierwszeństwo stawek", () => {
  it("kwota narzędzia przed procentem kategorii, a ten przed procentem firmy; karta mówi, skąd jest stawka", async () => {
    const z = await givenZawbud();
    await move(z, "2026-03-02T08:00:00+01:00", "wydanie", z.baseId, z.ratajeId, [z.e01, z.e02, z.e03, z.p01]);
    testbed.clock.set("2026-03-04T08:00:00+01:00");

    await z.owner.setDailyRate({ kind: "firma" }, 1);
    await z.owner.setDailyRate({ kind: "kategoria", categoryId: z.measuring.id }, 2);
    await z.owner.setDailyRate({ kind: "narzedzie", toolId: z.e02 }, 15);

    const costs = await costsOf(z, z.ratajeId);
    expect(costs.tools.map((row) => [row.tool.code, row.days, row.rates, row.daysWithoutRate, row.amount])).toEqual([
      ["E-01", 3, [{ amount: 20, days: 3 }], 0, 60],
      ["E-02", 3, [{ amount: 15, days: 3 }], 0, 45],
      ["E-03", 3, [], 3, 0],
      ["P-01", 3, [{ amount: 60, days: 3 }], 0, 180],
    ]);
    expect(costs.total).toBe(285);
    expect((await z.owner.toolCard(z.e01))!.dailyRate).toEqual({ source: "firma", percent: 1, amount: 20 });
    expect((await z.owner.toolCard(z.e02))!.dailyRate).toEqual({ source: "narzedzie", amount: 15 });
    expect((await z.owner.toolCard(z.e03))!.dailyRate).toEqual({ source: "firma", percent: 1, amount: null });
    expect((await z.owner.toolCard(z.p01))!.dailyRate).toEqual({ source: "kategoria", percent: 2, amount: 60 });
    expect(await z.owner.dailyRates()).toEqual({
      costStartDay: "2026-03-04",
      companyPercent: 1,
      categories: [{ category: z.measuring, percent: 2 }],
    });
  });

  it("zdjęte nadpisanie kategorii i narzędzia przestaje obowiązywać od dnia zdjęcia", async () => {
    const z = await givenZawbud();
    await move(z, "2026-03-02T08:00:00+01:00", "wydanie", z.baseId, z.ratajeId, [z.e02, z.p01]);
    await z.owner.setDailyRate({ kind: "firma" }, 1);
    await z.owner.setDailyRate({ kind: "kategoria", categoryId: z.measuring.id }, 2);
    await z.owner.setDailyRate({ kind: "narzedzie", toolId: z.e02 }, 15);
    testbed.clock.set("2026-03-04T08:00:00+01:00");

    await z.owner.setDailyRate({ kind: "kategoria", categoryId: z.measuring.id }, null);
    await z.owner.setDailyRate({ kind: "narzedzie", toolId: z.e02 }, null);

    const costs = await costsOf(z, z.ratajeId);
    expect(costs.tools.map((row) => [row.tool.code, row.rates])).toEqual([
      ["E-02", [{ amount: 15, days: 2 }, { amount: 5, days: 1 }]],
      ["P-01", [{ amount: 60, days: 2 }, { amount: 30, days: 1 }]],
    ]);
    expect((await z.owner.toolCard(z.p01))!.dailyRate).toEqual({ source: "firma", percent: 1, amount: 30 });
    expect((await z.owner.dailyRates()).categories).toEqual([]);
  });

  it("stawka procentowa liczy się od wartości z danego dnia, a narzędzie bez wartości ma dni bez stawki", async () => {
    const z = await givenZawbud();
    await move(z, "2026-03-02T08:00:00+01:00", "wydanie", z.baseId, z.ratajeId, [z.e03]);
    await z.owner.setDailyRate({ kind: "firma" }, 1);
    testbed.clock.set("2026-03-05T08:00:00+01:00");

    await z.owner.editTool(z.e03, { value: 300 });

    const costs = await costsOf(z, z.ratajeId);
    expect(costs.tools[0]).toMatchObject({ days: 4, rates: [{ amount: 3, days: 1 }], daysWithoutRate: 3, amount: 3 });
  });
});

describe("dni na budowie i pojeździe", () => {
  it("każda rozpoczęta doba w Polsce: wydanie i zwrot tego samego dnia to jeden dzień, a trwający pobyt liczy się do dziś", async () => {
    const z = await givenZawbud();
    await z.owner.setDailyRate({ kind: "firma" }, 1);
    await move(z, "2026-03-03T09:00:00+01:00", "wydanie", z.baseId, z.ratajeId, [z.e01, z.e02]);
    await move(z, "2026-03-03T15:00:00+01:00", "zwrot", z.ratajeId, z.baseId, [z.e01]);
    await move(z, "2026-03-03T16:00:00+01:00", "wydanie", z.baseId, z.ratajeId, [z.e01]);
    await move(z, "2026-03-04T07:00:00+01:00", "zwrot", z.ratajeId, z.baseId, [z.e01]);
    // Za pół godziny północ w Polsce, choć w UTC to jeszcze ten sam dzień.
    await move(z, "2026-03-04T23:30:00+01:00", "wydanie", z.baseId, z.ratajeId, [z.p01]);
    testbed.clock.set("2026-03-05T00:30:00+01:00");

    expect(await daysOf(z, z.ratajeId)).toEqual({ "E-01": 2, "E-02": 3, "P-01": 2 });
  });

  it("dzień przejścia z budowy A na budowę B albo pojazd liczy się na obu", async () => {
    const z = await givenZawbud();
    await z.owner.setDailyRate({ kind: "firma" }, 1);
    await move(z, "2026-03-03T08:00:00+01:00", "wydanie", z.baseId, z.ratajeId, [z.e01, z.p01]);
    await move(z, "2026-03-05T12:00:00+01:00", "przeniesienie", z.ratajeId, z.winogradyId, [z.e01]);
    await move(z, "2026-03-05T13:00:00+01:00", "przeniesienie", z.ratajeId, z.busId, [z.p01]);
    testbed.clock.set("2026-03-06T10:00:00+01:00");

    expect(await daysOf(z, z.ratajeId)).toEqual({ "E-01": 3, "P-01": 3 });
    expect(await daysOf(z, z.winogradyId)).toEqual({ "E-01": 2 });
    expect(await costsOf(z, z.busId)).toMatchObject({
      location: { id: z.busId, name: "Bus WX 12345", kind: "pojazd" },
      total: 60,
      tools: [{ tool: { code: "P-01" }, days: 2, rates: [{ amount: 30, days: 2 }], amount: 60 }],
    });
  });

  it("sprzęt w serwisie i na bazie się nie liczy, a kosztów bazy i serwisu nie ma", async () => {
    const z = await givenZawbud();
    await z.owner.setDailyRate({ kind: "firma" }, 1);
    await move(z, "2026-03-03T08:00:00+01:00", "wydanie", z.baseId, z.ratajeId, [z.e01]);
    await move(z, "2026-03-04T10:00:00+01:00", "do_serwisu", z.ratajeId, z.hiltiId, [z.e01]);
    await move(z, "2026-03-08T10:00:00+01:00", "z_serwisu", z.hiltiId, z.baseId, [z.e01]);
    await move(z, "2026-03-10T10:00:00+01:00", "wydanie", z.baseId, z.ratajeId, [z.e01]);
    testbed.clock.set("2026-03-11T10:00:00+01:00");

    expect(await daysOf(z, z.ratajeId)).toEqual({ "E-01": 4 });
    await expect(z.owner.locationCosts(z.baseId)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(z.owner.locationCosts(z.hiltiId)).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("cofnięty ruch się nie liczy", async () => {
    const z = await givenZawbud();
    await z.owner.setDailyRate({ kind: "firma" }, 1);
    await move(z, "2026-03-03T08:00:00+01:00", "wydanie", z.baseId, z.ratajeId, [z.e01, z.e02], z.nowakId);
    const transfer = await move(z, "2026-03-04T08:00:00+01:00", "przeniesienie", z.ratajeId, z.winogradyId, [z.e01], z.nowakId);
    testbed.clock.set("2026-03-04T08:05:00+01:00");
    await testbed.registry.as(z.nowakId).undoMovement({ operationId: randomUUID(), movementId: transfer.id });
    const issue = await move(z, "2026-03-04T09:00:00+01:00", "wydanie", z.baseId, z.busId, [z.p01], z.nowakId);
    testbed.clock.set("2026-03-04T09:10:00+01:00");
    await testbed.registry.as(z.nowakId).undoMovement({ operationId: randomUUID(), movementId: issue.id });
    testbed.clock.set("2026-03-06T10:00:00+01:00");

    expect(await daysOf(z, z.ratajeId)).toEqual({ "E-01": 4, "E-02": 4 });
    expect(await daysOf(z, z.winogradyId)).toEqual({});
    expect(await daysOf(z, z.busId)).toEqual({});
  });

  it("korekta przenosi narzędzie od chwili zapisu, a zaginięcie i wycofanie kończą pobyt", async () => {
    const z = await givenZawbud();
    await z.owner.setDailyRate({ kind: "firma" }, 1);
    await move(z, "2026-03-03T08:00:00+01:00", "wydanie", z.baseId, z.ratajeId, [z.e01, z.e02, z.p01]);
    testbed.clock.set("2026-03-04T10:00:00+01:00");
    await z.owner.retireTool({ operationId: randomUUID(), toolId: z.e02, reason: "Spalony silnik" });
    testbed.clock.set("2026-03-05T10:00:00+01:00");
    await z.owner.markToolLost({ operationId: randomUUID(), toolId: z.p01, reason: "Nie ma go na budowie" });
    testbed.clock.set("2026-03-06T10:00:00+01:00");
    await z.owner.correctTool({ operationId: randomUUID(), toolId: z.e01, locationId: z.winogradyId, reason: "Stoi na Winogradach" });
    // Odnaleziony niwelator wraca na Rataje korektą.
    testbed.clock.set("2026-03-08T10:00:00+01:00");
    await z.owner.correctTool({ operationId: randomUUID(), toolId: z.p01, locationId: z.ratajeId, state: "w_obiegu", reason: "Znaleziony" });
    testbed.clock.set("2026-03-10T10:00:00+01:00");

    expect(await daysOf(z, z.ratajeId)).toEqual({ "E-01": 4, "E-02": 2, "P-01": 6 });
    expect(await daysOf(z, z.winogradyId)).toEqual({ "E-01": 5 });
  });

  it("ruch z kolejki offline liczy się od chwili zdarzenia, nie zapisu", async () => {
    const z = await givenZawbud();
    await z.owner.setDailyRate({ kind: "firma" }, 1);
    testbed.clock.set("2026-03-05T18:00:00+01:00");
    await testbed.registry.as(z.nowakId).registerQueuedMovement({
      operationId: randomUUID(),
      kind: "wydanie",
      fromLocationId: z.baseId,
      toLocationId: z.ratajeId,
      toolIds: [z.e01],
      occurredAt: new Date("2026-03-03T08:00:00+01:00"),
      source: "checklista",
    });

    expect(await daysOf(z, z.ratajeId)).toEqual({ "E-01": 3 });
  });
});

describe("okres zestawienia", () => {
  it("miesiąc i własny zakres liczą tylko dni z okresu, a cała budowa od pierwszego dnia sprzętu do dziś", async () => {
    const z = await givenZawbud();
    await z.owner.setDailyRate({ kind: "firma" }, 1);
    await move(z, "2026-03-02T08:00:00+01:00", "wydanie", z.baseId, z.ratajeId, [z.e01]);
    await move(z, "2026-03-20T08:00:00+01:00", "wydanie", z.baseId, z.ratajeId, [z.e02]);
    await move(z, "2026-03-25T08:00:00+01:00", "zwrot", z.ratajeId, z.baseId, [z.e02]);
    testbed.clock.set("2026-04-10T10:00:00+02:00");

    const march = await costsOf(z, z.ratajeId, { from: "2026-03-01", to: "2026-03-31" });
    expect(march.period).toEqual({ from: "2026-03-01", to: "2026-03-31" });
    expect(march.tools.map((row) => [row.tool.code, row.days, row.amount])).toEqual([
      ["E-01", 30, 600],
      ["E-02", 6, 30],
    ]);
    expect(march.total).toBe(630);

    const april = await costsOf(z, z.ratajeId, { from: "2026-04-01", to: "2026-04-30" });
    expect(april.period).toEqual({ from: "2026-04-01", to: "2026-04-10" });
    expect(april.tools.map((row) => [row.tool.code, row.days])).toEqual([["E-01", 10]]);

    const range = await costsOf(z, z.ratajeId, { from: "2026-03-24", to: "2026-03-26" });
    expect(range.tools.map((row) => [row.tool.code, row.days])).toEqual([
      ["E-01", 3],
      ["E-02", 2],
    ]);

    const whole = await costsOf(z, z.ratajeId);
    expect(whole.period).toEqual({ from: "2026-03-02", to: "2026-04-10" });
    expect(whole.tools.map((row) => [row.tool.code, row.days])).toEqual([
      ["E-01", 40],
      ["E-02", 6],
    ]);
  });

  it("budowa, na której nie było sprzętu, ma puste koszty bez okresu, a zły okres jest odrzucany", async () => {
    const z = await givenZawbud();
    await z.owner.setDailyRate({ kind: "firma" }, 1);

    expect(await z.owner.locationCosts(z.winogradyId)).toEqual({
      status: "koszty",
      location: { id: z.winogradyId, name: "Winogrady", kind: "budowa" },
      period: null,
      total: 0,
      tools: [],
    });
    for (const period of [
      { from: "2026-03-10", to: "2026-03-01" },
      { from: "2026-02-30", to: "2026-03-01" },
      { from: "", to: "2026-03-01" },
    ]) {
      await expect(z.owner.locationCosts(z.ratajeId, period), JSON.stringify(period)).rejects.toMatchObject({ code: "invalid_input" });
    }
    await expect(z.owner.locationCosts(randomUUID())).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("ustawianie stawek", () => {
  it("odrzuca procent spoza 0–100 albo z więcej niż dwoma miejscami po przecinku, brak stawki firmy i nieznaną kategorię", async () => {
    const z = await givenZawbud();
    for (const percent of [-1, 100.01, 1.234, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(z.owner.setDailyRate({ kind: "firma" }, percent), String(percent)).rejects.toMatchObject({ code: "invalid_input" });
    }
    await expect(z.owner.setDailyRate({ kind: "firma" }, null)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(z.owner.setDailyRate({ kind: "kategoria", categoryId: randomUUID() }, 2)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(z.owner.setDailyRate({ kind: "narzedzie", toolId: randomUUID() }, 2)).rejects.toMatchObject({ code: "not_found" });
    await expect(z.owner.setDailyRate({ kind: "narzedzie", toolId: z.e01 }, -5)).rejects.toMatchObject({ code: "invalid_input" });

    expect(await z.owner.dailyRates()).toEqual({ costStartDay: null, companyPercent: null, categories: [] });
  });

  it("kilka stawek zapisuje się razem albo wcale", async () => {
    const z = await givenZawbud();
    await z.owner.setDailyRate({ kind: "firma" }, 1);

    await expect(
      z.owner.setDailyRates([
        { target: { kind: "firma" }, rate: 2 },
        { target: { kind: "kategoria", categoryId: z.measuring.id }, rate: 500 },
      ]),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(await z.owner.dailyRates()).toMatchObject({ companyPercent: 1, categories: [] });

    await z.owner.setDailyRates([
      { target: { kind: "firma" }, rate: 2 },
      { target: { kind: "kategoria", categoryId: z.measuring.id }, rate: 3 },
    ]);
    expect(await z.owner.dailyRates()).toMatchObject({ companyPercent: 2, categories: [{ category: z.measuring, percent: 3 }] });
  });

  it("0% to ważna stawka: sprzęt kategorii liczy się za darmo", async () => {
    const z = await givenZawbud();
    await move(z, "2026-03-02T08:00:00+01:00", "wydanie", z.baseId, z.ratajeId, [z.p01]);
    await z.owner.setDailyRate({ kind: "firma" }, 1);
    await z.owner.setDailyRate({ kind: "kategoria", categoryId: z.measuring.id }, 0);

    expect((await costsOf(z, z.ratajeId)).tools[0]).toMatchObject({ rates: [{ amount: 0, days: 1 }], daysWithoutRate: 0, amount: 0 });
  });
});

describe("kto widzi stawki i koszty", () => {
  it("kierownik (także tej budowy), magazynier i pracownik nie widzą ani nie ustawiają stawek i kosztów", async () => {
    const z = await givenZawbud();
    await move(z, "2026-03-02T08:00:00+01:00", "wydanie", z.baseId, z.ratajeId, [z.e01]);
    await z.owner.setDailyRate({ kind: "firma" }, 1);

    for (const memberId of [z.nowakId, z.storekeeperId, z.workerId]) {
      const member = testbed.registry.as(memberId);
      await expect(member.locationCosts(z.ratajeId)).rejects.toMatchObject({ code: "forbidden" });
      await expect(member.dailyRates()).rejects.toMatchObject({ code: "forbidden" });
      await expect(member.setDailyRate({ kind: "firma" }, 5)).rejects.toMatchObject({ code: "forbidden" });
      await expect(member.setDailyRate({ kind: "narzedzie", toolId: z.e01 }, 5)).rejects.toMatchObject({ code: "forbidden" });
      await expect(member.setDailyRates([{ target: { kind: "firma" }, rate: 5 }])).rejects.toMatchObject({ code: "forbidden" });
      expect(await member.toolCard(z.e01)).not.toHaveProperty("dailyRate");
    }
    expect(await z.owner.dailyRates()).toMatchObject({ companyPercent: 1 });
  });

  it("połączenie z bazą jako kierownik nie czyta stawek ani historii wartości i nie dopisze stawki", async () => {
    const z = await givenZawbud();
    await z.owner.setDailyRate({ kind: "firma" }, 1);
    await z.owner.setDailyRate({ kind: "narzedzie", toolId: z.e01 }, 30);

    const seen = await withActor(testbed.db, z.nowakId, async (sql) => ({
      rates: await sql("select * from app.daily_rates"),
      values: await sql("select * from app.tool_value_history"),
    }));
    expect(seen).toEqual({ rates: [], values: [] });

    await expect(
      withActor(testbed.db, z.nowakId, (sql) =>
        sql("insert into app.daily_rates (company_id, kind, percent, valid_from, recorded_at, recorded_by) values ($1, 'firma', 50, '2026-01-01', now(), $2)", [
          z.zawbud.companyId,
          z.nowakId,
        ]),
      ),
    ).rejects.toThrow();
    expect(await z.owner.dailyRates()).toMatchObject({ costStartDay: "2026-03-02", companyPercent: 1 });
  });

  it("w trybie tylko do odczytu stawki się nie zmieniają, a koszty dalej widać", async () => {
    const z = await givenZawbud();
    await move(z, "2026-03-02T08:00:00+01:00", "wydanie", z.baseId, z.ratajeId, [z.e01]);
    await z.owner.setDailyRate({ kind: "firma" }, 1);
    const adminId = await testbed.givenSuperAdmin();
    await testbed.registry.superAdmin(adminId).setManualReadOnly(z.zawbud.companyId, true);

    await expect(z.owner.setDailyRate({ kind: "firma" }, 2)).rejects.toMatchObject({ code: "read_only" });
    expect(await costsOf(z, z.ratajeId)).toMatchObject({ total: 20 });
  });
});
