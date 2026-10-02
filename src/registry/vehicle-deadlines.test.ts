import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withActor } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();

/**
 * Zawbud (dziś 2 marca 2026): kierownik Nowak jeździ busem WPI 4K21, kierownik Kowalski prowadzi budowę Rataje,
 * magazynier Wiśniewski, pracownik Zieliński. Właściciel sam jeździ osobówką bez sprzętu. Niwelator N-01 jest na
 * Ratajach.
 */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Swarzędz" });
  const ownerId = zawbud.ownerId;
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const kowalskiId = await testbed.givenMember(zawbud, "kierownik", "Jan Kowalski");
  const storekeeperId = await testbed.givenMember(zawbud, "magazynier", "Piotr Wiśniewski");
  const workerId = await testbed.givenMember(zawbud, "pracownik", "Marek Zieliński");
  const owner = testbed.registry.as(ownerId);
  const { locationId: busId } = await owner.addVehicle({ name: "Bus Ducato", managerId: nowakId, registrationNumber: "WPI 4K21" });
  const { locationId: carId } = await owner.addVehicle({ name: "Skoda Octavia", managerId: ownerId });
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: kowalskiId });
  const levels = await owner.addCategory({ name: "Pomiarowe", prefix: "N" });
  const n01 = (await owner.addTool({ operationId: randomUUID(), code: "N-01", name: "Niwelator laserowy", categoryId: levels.id })).toolId;
  const { base } = await owner.whereIsWhat();
  await testbed.registry
    .as(kowalskiId)
    .registerMovement({ operationId: randomUUID(), kind: "wydanie", fromLocationId: base.id, toLocationId: ratajeId, toolIds: [n01], source: "checklista" });
  return { zawbud, owner, ownerId, nowakId, kowalskiId, storekeeperId, workerId, busId, carId, ratajeId, n01 };
}

function pdf(text = "Polisa OC nr 123/2026") {
  return new Blob([`%PDF-1.7\n${text}\n%%EOF`], { type: "application/pdf" });
}

async function bellOf(userId: string) {
  return (await testbed.registry.as(userId).bell()).entries.map((entry) => entry.notification);
}

describe("dane pojazdu", () => {
  it("właściciel wpisuje numer rejestracyjny i VIN; osobówka bez sprzętu to zwykły pojazd bez tych danych", async () => {
    const z = await givenZawbud();

    await z.owner.changeVehicleData(z.carId, { registrationNumber: " po  1234a ", vin: "wvwzzz1kzaw000123" });

    for (const userId of [z.ownerId, z.nowakId, z.workerId]) {
      const { vehicles } = await testbed.registry.as(userId).locations();
      expect(vehicles.map(({ name, registrationNumber, vin }) => ({ name, registrationNumber, vin }))).toEqual([
        { name: "Bus Ducato", registrationNumber: "WPI 4K21", vin: null },
        { name: "Skoda Octavia", registrationNumber: "PO 1234A", vin: "WVWZZZ1KZAW000123" },
      ]);
    }

    // Pusty numer i pusty VIN czyszczą dane.
    await z.owner.changeVehicleData(z.carId, { registrationNumber: "", vin: " " });
    expect((await z.owner.locations()).vehicles.find((vehicle) => vehicle.id === z.carId)).toMatchObject({ registrationNumber: null, vin: null });
  });

  it("VIN ma 17 znaków bez I, O i Q; danych nie zmienia nikt poza właścicielem ani przy nieaktywnym pojeździe", async () => {
    const z = await givenZawbud();

    for (const vin of ["WVWZZZ1KZAW00012", "WVWZZZ1KZAW0001234", "WVWZZZ1KZAWO00123", "WVWZZZ1KZAW-00123"]) {
      await expect(z.owner.changeVehicleData(z.carId, { registrationNumber: null, vin }), vin).rejects.toMatchObject({ code: "vin_invalid" });
    }
    await expect(z.owner.addVehicle({ name: "Bus", managerId: z.nowakId, vin: "123" })).rejects.toMatchObject({ code: "vin_invalid" });
    await expect(z.owner.changeVehicleData(z.carId, { registrationNumber: "PO 1234 ABCDEFGH", vin: null })).rejects.toMatchObject({
      code: "invalid_input",
    });
    for (const userId of [z.nowakId, z.storekeeperId, z.workerId]) {
      await expect(testbed.registry.as(userId).changeVehicleData(z.busId, { registrationNumber: "WPI 0000", vin: null })).rejects.toMatchObject({
        code: "forbidden",
      });
    }
    await z.owner.deactivateVehicle(z.carId);
    await expect(z.owner.changeVehicleData(z.carId, { registrationNumber: "PO 1", vin: null })).rejects.toMatchObject({ code: "vehicle_inactive" });

    expect((await z.owner.locations()).vehicles.map((vehicle) => vehicle.registrationNumber)).toEqual(["WPI 4K21", null]);
  });
});

describe("terminy pojazdu", () => {
  it("właściciel dodaje OC, przegląd techniczny i własny termin z nazwą, a każdy w firmie widzi je na stronie pojazdu", async () => {
    const z = await givenZawbud();

    await z.owner.addDeadline({ vehicleId: z.busId, kind: "oc", dueOn: "2026-03-20", cycleMonths: 12, note: "PZU, polisa roczna" });
    await z.owner.addDeadline({ vehicleId: z.busId, kind: "przeglad_techniczny", dueOn: "2026-06-10", cycleMonths: 12 });
    await z.owner.addDeadline({ vehicleId: z.busId, kind: "wlasny", name: " Wymiana opon ", dueOn: "2026-04-01", cycleMonths: 6 });

    for (const userId of [z.ownerId, z.nowakId, z.kowalskiId, z.storekeeperId, z.workerId]) {
      expect(await testbed.registry.as(userId).vehicleDeadlines(z.busId)).toEqual([
        {
          id: expect.any(String),
          kind: "oc",
          dueOn: "2026-03-20",
          daysLeft: 18,
          status: "wkrotce",
          cycleMonths: 12,
          note: "PZU, polisa roczna",
          lastDoneOn: null,
          documents: [],
        },
        expect.objectContaining({ kind: "wlasny", name: "Wymiana opon", dueOn: "2026-04-01", daysLeft: 30, cycleMonths: 6 }),
        expect.objectContaining({ kind: "przeglad_techniczny", dueOn: "2026-06-10", status: "pozniej" }),
      ]);
    }
    expect(await z.owner.vehicleDeadlines(z.carId)).toEqual([]);
    // Terminy pojazdu nie są terminami narzędzia.
    expect((await z.owner.toolCard(z.n01))?.deadlines).toEqual([]);
  });

  it("jeden termin każdego rodzaju na pojazd, własnych wiele, ale z różnymi nazwami; rodzaje narzędzi i pojazdów się nie mieszają", async () => {
    const z = await givenZawbud();
    await z.owner.addDeadline({ vehicleId: z.busId, kind: "oc", dueOn: "2026-03-20" });
    await z.owner.addDeadline({ vehicleId: z.busId, kind: "wlasny", name: "Wymiana opon", dueOn: "2026-04-01" });

    await expect(z.owner.addDeadline({ vehicleId: z.busId, kind: "oc", dueOn: "2026-05-01" })).rejects.toMatchObject({ code: "deadline_taken" });
    await expect(z.owner.addDeadline({ vehicleId: z.busId, kind: "wlasny", name: "wymiana OPON", dueOn: "2026-05-01" })).rejects.toMatchObject({
      code: "deadline_taken",
    });
    await z.owner.addDeadline({ vehicleId: z.busId, kind: "wlasny", name: "Serwis klimatyzacji", dueOn: "2026-05-01" });
    // Ten sam rodzaj na innym pojeździe to inny termin.
    await z.owner.addDeadline({ vehicleId: z.carId, kind: "oc", dueOn: "2026-08-01" });

    const invalid = [
      { vehicleId: z.busId, kind: "przeglad" as const, dueOn: "2026-05-01" },
      { vehicleId: z.busId, kind: "wlasny" as const, dueOn: "2026-05-01" },
      { vehicleId: z.busId, kind: "wlasny" as const, name: " ", dueOn: "2026-05-01" },
      { vehicleId: z.busId, kind: "ac" as const, name: "AC", dueOn: "2026-05-01" },
      { toolId: z.n01, kind: "oc" as const, dueOn: "2026-05-01" },
    ];
    for (const input of invalid) {
      await expect(z.owner.addDeadline(input), JSON.stringify(input)).rejects.toMatchObject({ code: "invalid_input" });
    }
    await expect(z.owner.addDeadline({ vehicleId: z.ratajeId, kind: "oc", dueOn: "2026-05-01" })).rejects.toMatchObject({ code: "not_found" });
    await expect(z.owner.addDeadline({ vehicleId: randomUUID(), kind: "oc", dueOn: "2026-05-01" })).rejects.toMatchObject({ code: "not_found" });
    for (const userId of [z.nowakId, z.storekeeperId, z.workerId]) {
      await expect(testbed.registry.as(userId).addDeadline({ vehicleId: z.busId, kind: "ac", dueOn: "2026-05-01" })).rejects.toMatchObject({
        code: "forbidden",
      });
    }
    await z.owner.deactivateVehicle(z.carId);
    await expect(z.owner.addDeadline({ vehicleId: z.carId, kind: "ac", dueOn: "2026-05-01" })).rejects.toMatchObject({ code: "vehicle_inactive" });

    expect((await z.owner.vehicleDeadlines(z.busId)).map((deadline) => deadline.name ?? deadline.kind)).toEqual([
      "oc",
      "Wymiana opon",
      "Serwis klimatyzacji",
    ]);
  });

  it("właściciel zmienia datę, cykl i nazwę własnego terminu; nazwy nie ma przy innych rodzajach", async () => {
    const z = await givenZawbud();
    const { deadlineId } = await z.owner.addDeadline({ vehicleId: z.busId, kind: "wlasny", name: "Wymiana opon", dueOn: "2026-04-01" });
    const { deadlineId: ocId } = await z.owner.addDeadline({ vehicleId: z.busId, kind: "oc", dueOn: "2026-03-20" });

    await z.owner.updateDeadline(deadlineId, { name: "Opony zimowe", dueOn: "2026-10-15", cycleMonths: 12 });

    expect(await z.owner.vehicleDeadlines(z.busId)).toEqual([
      expect.objectContaining({ id: ocId, kind: "oc" }),
      expect.objectContaining({ id: deadlineId, name: "Opony zimowe", dueOn: "2026-10-15", cycleMonths: 12 }),
    ]);
    await expect(z.owner.updateDeadline(deadlineId, { name: "" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(z.owner.updateDeadline(ocId, { name: "OC" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(testbed.registry.as(z.nowakId).updateDeadline(ocId, { dueOn: "2026-04-01" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("wykonanie przeglądu liczy następny termin od dnia przeglądu, a odnowienie polisy od końca starej, jeśli jeszcze trwała", async () => {
    const z = await givenZawbud();
    const add = async (kind: "oc" | "ac" | "przeglad_techniczny" | "tachograf", dueOn: string, cycleMonths: number) =>
      (await z.owner.addDeadline({ vehicleId: z.busId, kind, dueOn, cycleMonths })).deadlineId;
    const inspection = await add("przeglad_techniczny", "2026-03-05", 12);
    const liability = await add("oc", "2026-03-15", 12);
    const autoCasco = await add("ac", "2026-02-20", 12);
    const tachograph = await add("tachograf", "2026-03-10", 24);
    const complete = (deadlineId: string, doneOn = "2026-03-02") => z.owner.completeDeadline({ operationId: randomUUID(), deadlineId, doneOn });

    expect(await complete(inspection)).toEqual({ dueOn: "2027-03-02" });
    // Nowa polisa zaczyna się po końcu starej.
    expect(await complete(liability)).toEqual({ dueOn: "2027-03-15" });
    // Polisa AC skończyła się 20 lutego: nowa liczy się od dnia zakupu.
    expect(await complete(autoCasco, "2026-02-25")).toEqual({ dueOn: "2027-02-25" });
    expect(await complete(tachograph)).toEqual({ dueOn: "2028-03-02" });

    expect((await z.owner.vehicleDeadlines(z.busId)).find((deadline) => deadline.id === liability)).toMatchObject({
      dueOn: "2027-03-15",
      lastDoneOn: "2026-03-02",
    });
  });

  it("wykonanie terminu pojazdu wpisuje tylko właściciel, a magazynier tylko terminów narzędzi", async () => {
    const z = await givenZawbud();
    const { deadlineId } = await z.owner.addDeadline({ vehicleId: z.busId, kind: "przeglad_techniczny", dueOn: "2026-03-05", cycleMonths: 12 });

    for (const userId of [z.nowakId, z.storekeeperId, z.workerId]) {
      await expect(
        testbed.registry.as(userId).completeDeadline({ operationId: randomUUID(), deadlineId, doneOn: "2026-03-02" }),
      ).rejects.toMatchObject({ code: "forbidden" });
    }
    // Magazynier nie obejdzie Rejestru: baza też nie wpisze mu wykonania terminu pojazdu.
    await expect(
      withActor(testbed.db, z.storekeeperId, (sql) =>
        sql("select * from app.complete_tool_deadline($1, '2026-03-02', null, $2)", [deadlineId, randomUUID()]),
      ),
    ).resolves.toEqual([]);

    expect(await z.owner.vehicleDeadlines(z.busId)).toEqual([expect.objectContaining({ dueOn: "2026-03-05", lastDoneOn: null })]);
  });

  it("termin nieaktywnego pojazdu zostaje do wglądu: nie da się go zmienić, wykonać ani dołączyć dokumentu, tylko usunąć", async () => {
    const z = await givenZawbud();
    const { deadlineId } = await z.owner.addDeadline({ vehicleId: z.carId, kind: "oc", dueOn: "2026-03-20", cycleMonths: 12 });
    await z.owner.deactivateVehicle(z.carId);

    const commands: [string, () => Promise<unknown>][] = [
      ["updateDeadline", () => z.owner.updateDeadline(deadlineId, { dueOn: "2026-05-01" })],
      ["completeDeadline", () => z.owner.completeDeadline({ operationId: randomUUID(), deadlineId, doneOn: "2026-03-02" })],
      ["addDeadlineDocument", () => z.owner.addDeadlineDocument({ operationId: randomUUID(), deadlineId, kind: "polisa", file: pdf(), fileName: "p.pdf" })],
    ];
    for (const [name, command] of commands) {
      await expect(command(), name).rejects.toMatchObject({ code: "vehicle_inactive" });
    }
    expect(await z.owner.vehicleDeadlines(z.carId)).toEqual([expect.objectContaining({ dueOn: "2026-03-20", lastDoneOn: null, documents: [] })]);

    await z.owner.deleteDeadline(deadlineId);
    expect(await z.owner.vehicleDeadlines(z.carId)).toEqual([]);
  });

  it("usunięcie terminu pojazdu zabiera jego dokumenty", async () => {
    const z = await givenZawbud();
    const { deadlineId } = await z.owner.addDeadline({ vehicleId: z.busId, kind: "oc", dueOn: "2026-03-20" });
    await z.owner.addDeadlineDocument({ operationId: randomUUID(), deadlineId, kind: "polisa", file: pdf(), fileName: "polisa.pdf" });

    await z.owner.deleteDeadline(deadlineId);

    expect(await z.owner.vehicleDeadlines(z.busId)).toEqual([]);
    expect(testbed.documents.photos.size).toBe(0);
  });
});

describe("dokumenty terminów pojazdu", () => {
  it("polisę widzą właściciel i kierownik pojazdu, a fakturę tylko właściciel; inni w firmie nie widzą żadnego", async () => {
    const z = await givenZawbud();
    const { deadlineId } = await z.owner.addDeadline({ vehicleId: z.busId, kind: "oc", dueOn: "2026-03-20", cycleMonths: 12 });
    const policy = await z.owner.addDeadlineDocument({ operationId: randomUUID(), deadlineId, kind: "polisa", file: pdf(), fileName: "polisa-oc.pdf" });
    const invoice = await z.owner.addDeadlineDocument({ operationId: randomUUID(), deadlineId, kind: "faktura", file: pdf("Faktura 2100 zł"), fileName: "f.pdf" });

    const documents = async (userId: string) =>
      (await testbed.registry.as(userId).vehicleDeadlines(z.busId)).flatMap((deadline) => deadline.documents.map((document) => document.fileName));
    expect(await documents(z.ownerId)).toEqual(["polisa-oc.pdf", "f.pdf"]);
    expect(await documents(z.nowakId)).toEqual(["polisa-oc.pdf"]);
    expect(await testbed.registry.as(z.nowakId).deadlineDocument(policy.documentId)).toMatchObject({ fileName: "polisa-oc.pdf" });
    expect(await testbed.registry.as(z.nowakId).deadlineDocument(invoice.documentId)).toBeNull();
    for (const userId of [z.kowalskiId, z.storekeeperId, z.workerId]) {
      expect(await documents(userId)).toEqual([]);
      expect(await testbed.registry.as(userId).deadlineDocument(policy.documentId)).toBeNull();
    }

    // Nowy kierownik pojazdu widzi polisę, a poprzedni już nie.
    await z.owner.changeVehicleManager(z.busId, z.kowalskiId);
    expect(await documents(z.kowalskiId)).toEqual(["polisa-oc.pdf"]);
    expect(await documents(z.nowakId)).toEqual([]);
  });

  it("dokument do terminu pojazdu dołącza tylko właściciel, z rodzajów pojazdu (polisa, dowód rejestracyjny, protokół)", async () => {
    const z = await givenZawbud();
    const { deadlineId } = await z.owner.addDeadline({ vehicleId: z.busId, kind: "przeglad_techniczny", dueOn: "2026-03-05", cycleMonths: 12 });
    const attach = (userId: string, kind: "dowod_rejestracyjny" | "karta_gwarancyjna" | "protokol") =>
      testbed.registry.as(userId).addDeadlineDocument({ operationId: randomUUID(), deadlineId, kind, file: pdf(), fileName: "dowod.pdf" });

    for (const userId of [z.nowakId, z.storekeeperId, z.workerId]) {
      await expect(attach(userId, "dowod_rejestracyjny")).rejects.toMatchObject({ code: "forbidden" });
    }
    await expect(attach(z.ownerId, "karta_gwarancyjna")).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      z.owner.completeDeadline({ operationId: randomUUID(), deadlineId, doneOn: "2026-03-02", document: { kind: "protokol", file: pdf(), fileName: "p.pdf" } }),
    ).resolves.toEqual({ dueOn: "2027-03-02" });
    await attach(z.ownerId, "dowod_rejestracyjny");

    expect((await testbed.registry.as(z.nowakId).vehicleDeadlines(z.busId))[0].documents.map((document) => document.kind)).toEqual([
      "protokol",
      "dowod_rejestracyjny",
    ]);
    // Do terminu narzędzia polisy się nie dołącza.
    const { deadlineId: calibrationId } = await z.owner.addDeadline({ toolId: z.n01, kind: "kalibracja", dueOn: "2026-04-01" });
    await expect(
      z.owner.addDeadlineDocument({ operationId: randomUUID(), deadlineId: calibrationId, kind: "polisa", file: pdf(), fileName: "a.pdf" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("przypomnienia o terminach pojazdu", () => {
  it("OC przypomina się 30 dni przed, a przegląd techniczny 7 dni przed; oba raz po terminie, właścicielowi i kierownikowi pojazdu", async () => {
    const z = await givenZawbud();
    const { deadlineId: ocId } = await z.owner.addDeadline({ vehicleId: z.busId, kind: "oc", dueOn: "2026-04-10" });
    await z.owner.addDeadline({ vehicleId: z.busId, kind: "przeglad_techniczny", dueOn: "2026-04-10" });

    // 10 marca w Polsce: do OC zostało 31 dni.
    testbed.clock.set("2026-03-10T06:00:00Z");
    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 0 });
    testbed.clock.set("2026-03-11T06:00:00Z");
    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 1 });

    const reminder = {
      kind: "terminy",
      deadlines: [
        {
          id: ocId,
          kind: "oc",
          dueOn: "2026-04-10",
          overdue: false,
          tool: null,
          location: { id: z.busId, name: "Bus Ducato", kind: "pojazd" },
        },
      ],
    };
    expect(await bellOf(z.ownerId)).toEqual([reminder]);
    expect(await bellOf(z.nowakId)).toEqual([reminder]);
    for (const userId of [z.kowalskiId, z.storekeeperId, z.workerId]) expect(await bellOf(userId)).toEqual([]);

    // Przegląd: tydzień przed.
    testbed.clock.set("2026-04-02T06:00:00Z");
    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 0 });
    testbed.clock.set("2026-04-03T06:00:00Z");
    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 1 });
    // Dzień po terminie: po jednym „po terminie” o każdym, potem już nic.
    testbed.clock.set("2026-04-11T06:00:00Z");
    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 2 });
    testbed.clock.set("2026-05-11T06:00:00Z");
    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 0 });

    const kinds = async (userId: string) =>
      (await bellOf(userId)).map((n) => n.kind === "terminy" && n.deadlines.map((d) => [d.kind, d.overdue]));
    const expected = [[["przeglad_techniczny", true], ["oc", true]], [["przeglad_techniczny", false]], [["oc", false]]];
    expect(await kinds(z.ownerId)).toEqual(expected);
    expect(await kinds(z.nowakId)).toEqual(expected);
  });

  it("AC i tachograf 30 dni przed, własny termin 7 dni; właściciel, który sam jeździ, dostaje jedno zbiorcze; nieaktywny pojazd nie przypomina", async () => {
    const z = await givenZawbud();
    await z.owner.addDeadline({ vehicleId: z.busId, kind: "ac", dueOn: "2026-04-01" });
    await z.owner.addDeadline({ vehicleId: z.busId, kind: "tachograf", dueOn: "2026-04-01" });
    await z.owner.addDeadline({ vehicleId: z.busId, kind: "wlasny", name: "Wymiana opon", dueOn: "2026-03-09" });
    await z.owner.addDeadline({ vehicleId: z.busId, kind: "wlasny", name: "Serwis klimatyzacji", dueOn: "2026-03-10" });
    await z.owner.addDeadline({ vehicleId: z.carId, kind: "oc", dueOn: "2026-03-20" });
    const { locationId: oldVanId } = await z.owner.addVehicle({ name: "Stary bus", managerId: z.kowalskiId });
    await z.owner.addDeadline({ vehicleId: oldVanId, kind: "oc", dueOn: "2026-03-20" });
    await z.owner.deactivateVehicle(oldVanId);

    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 4 });

    const names = async (userId: string) =>
      (await bellOf(userId)).map((n) => n.kind === "terminy" && n.deadlines.map((d) => `${d.location.name}: ${d.name ?? d.kind}`));
    expect(await names(z.ownerId)).toEqual([["Bus Ducato: Wymiana opon", "Skoda Octavia: oc", "Bus Ducato: ac", "Bus Ducato: tachograf"]]);
    expect(await names(z.nowakId)).toEqual([["Bus Ducato: Wymiana opon", "Bus Ducato: ac", "Bus Ducato: tachograf"]]);
    expect(await names(z.kowalskiId)).toEqual([]);
  });
});

describe("terminy pojazdów na liście terminów i w raporcie", () => {
  it("lista terminów i raport tygodniowy mają terminy pojazdów obok terminów narzędzi, z kierownikiem pojazdu", async () => {
    const z = await givenZawbud();
    await z.owner.addDeadline({ toolId: z.n01, kind: "kalibracja", dueOn: "2026-03-20" });
    await z.owner.addDeadline({ vehicleId: z.busId, kind: "oc", dueOn: "2026-03-25" });
    await z.owner.addDeadline({ vehicleId: z.carId, kind: "przeglad_techniczny", dueOn: "2026-02-27" });
    await z.owner.addDeadline({ vehicleId: z.busId, kind: "wlasny", name: "Wymiana opon", dueOn: "2026-03-20" });
    await z.owner.addDeadline({ vehicleId: z.busId, kind: "ac", dueOn: "2026-04-20" });
    const { locationId: oldVanId } = await z.owner.addVehicle({ name: "Stary bus", managerId: z.kowalskiId });
    await z.owner.addDeadline({ vehicleId: oldVanId, kind: "oc", dueOn: "2026-03-10" });
    await z.owner.deactivateVehicle(oldVanId);

    const bus = { id: z.busId, name: "Bus Ducato", kind: "pojazd" };
    const expected = [
      {
        id: expect.any(String),
        kind: "przeglad_techniczny",
        dueOn: "2026-02-27",
        daysLeft: -3,
        overdue: true,
        tool: null,
        location: { id: z.carId, name: "Skoda Octavia", kind: "pojazd" },
        responsible: "Właściciel Zawbud",
      },
      { id: expect.any(String), kind: "wlasny", name: "Wymiana opon", dueOn: "2026-03-20", daysLeft: 18, overdue: false, tool: null, location: bus, responsible: "Adam Nowak" },
      expect.objectContaining({ kind: "kalibracja", dueOn: "2026-03-20", tool: expect.objectContaining({ code: "N-01" }), responsible: "Jan Kowalski" }),
      expect.objectContaining({ kind: "oc", dueOn: "2026-03-25", tool: null, location: bus }),
    ];
    for (const userId of [z.ownerId, z.nowakId, z.storekeeperId, z.workerId]) {
      expect(await testbed.registry.as(userId).upcomingDeadlines()).toEqual(expected);
    }
    expect((await z.owner.weeklyReport()).deadlines).toEqual(expected);
  });
});

describe("tryb tylko do odczytu i izolacja firm", () => {
  it("w trybie tylko do odczytu danych i terminów pojazdu nie da się zmienić", async () => {
    const z = await givenZawbud();
    const { deadlineId } = await z.owner.addDeadline({ vehicleId: z.busId, kind: "oc", dueOn: "2026-03-20", cycleMonths: 12 });
    const adminId = await testbed.givenSuperAdmin();
    await testbed.registry.superAdmin(adminId).setManualReadOnly(z.zawbud.companyId, true);

    await expect(z.owner.changeVehicleData(z.busId, { registrationNumber: "WPI 0000", vin: null })).rejects.toMatchObject({ code: "read_only" });
    await expect(z.owner.addDeadline({ vehicleId: z.busId, kind: "ac", dueOn: "2026-05-01" })).rejects.toMatchObject({ code: "read_only" });
    await expect(z.owner.completeDeadline({ operationId: randomUUID(), deadlineId, doneOn: "2026-03-02" })).rejects.toMatchObject({ code: "read_only" });

    expect(await testbed.registry.as(z.nowakId).vehicleDeadlines(z.busId)).toEqual([expect.objectContaining({ id: deadlineId, dueOn: "2026-03-20" })]);
  });

  it("inna firma nie widzi terminów ani danych pojazdu i nic w nich nie zmieni", async () => {
    const z = await givenZawbud();
    const { deadlineId } = await z.owner.addDeadline({ vehicleId: z.busId, kind: "oc", dueOn: "2026-03-20" });
    const { documentId } = await z.owner.addDeadlineDocument({ operationId: randomUUID(), deadlineId, kind: "polisa", file: pdf(), fileName: "p.pdf" });
    const other = await testbed.givenActiveCompany("Budrex");
    const stranger = testbed.registry.as(other.ownerId);

    expect(await stranger.vehicleDeadlines(z.busId)).toEqual([]);
    expect(await stranger.upcomingDeadlines()).toEqual([]);
    expect(await stranger.deadlineDocument(documentId)).toBeNull();
    await expect(stranger.addDeadline({ vehicleId: z.busId, kind: "ac", dueOn: "2026-05-01" })).rejects.toMatchObject({ code: "not_found" });
    await expect(stranger.changeVehicleData(z.busId, { registrationNumber: "X 1", vin: null })).rejects.toMatchObject({ code: "not_found" });
    await expect(stranger.completeDeadline({ operationId: randomUUID(), deadlineId, doneOn: "2026-03-02" })).rejects.toMatchObject({ code: "not_found" });

    expect(await z.owner.vehicleDeadlines(z.busId)).toEqual([expect.objectContaining({ dueOn: "2026-03-20" })]);
    expect((await z.owner.locations()).vehicles[0].registrationNumber).toBe("WPI 4K21");
  });
});
