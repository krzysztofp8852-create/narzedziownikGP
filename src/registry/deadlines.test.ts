import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RegisteredKind } from "./registry";
import { withActor } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();

/**
 * Zawbud (dziś 2 marca 2026): kierownik Nowak prowadzi Rataje, magazynier Wiśniewski, pracownik Zieliński.
 * Niwelator N-01 jest na Ratajach, młotowiertarka H-01 na bazie; jest też serwis Hilti.
 */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Swarzędz" });
  const ownerId = zawbud.ownerId;
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const storekeeperId = await testbed.givenMember(zawbud, "magazynier", "Piotr Wiśniewski");
  const workerId = await testbed.givenMember(zawbud, "pracownik", "Marek Zieliński");
  const owner = testbed.registry.as(ownerId);
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
  const { locationId: serviceId } = await owner.addService({ name: "Serwis Hilti" });
  const levels = await owner.addCategory({ name: "Pomiarowe", prefix: "N" });
  const hammers = await owner.addCategory({ name: "Młoty", prefix: "H" });
  const n01 = (await owner.addTool({ operationId: randomUUID(), code: "N-01", name: "Niwelator laserowy", categoryId: levels.id })).toolId;
  const h01 = (await owner.addTool({ operationId: randomUUID(), code: "H-01", name: "Młotowiertarka Hilti", categoryId: hammers.id })).toolId;
  const { base } = await owner.whereIsWhat();
  await move(nowakId, "wydanie", base.id, ratajeId, [n01]);
  return { zawbud, owner, ownerId, nowakId, storekeeperId, workerId, ratajeId, serviceId, baseId: base.id, n01, h01 };
}

function pdf(text = "Świadectwo wzorcowania nr 12/2026") {
  return new Blob([`%PDF-1.7\n${text}\n%%EOF`], { type: "application/pdf" });
}

function jpeg(bytes = 1000) {
  return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(bytes).fill(1)])], { type: "image/jpeg" });
}

async function bellOf(userId: string) {
  return (await testbed.registry.as(userId).bell()).entries.map((entry) => entry.notification);
}

function move(actorId: string, kind: RegisteredKind, from: string, to: string, toolIds: string[]) {
  return testbed.registry
    .as(actorId)
    .registerMovement({ operationId: randomUUID(), kind, fromLocationId: from, toLocationId: to, toolIds, source: "checklista" });
}

describe("terminy narzędzia", () => {
  it("właściciel dodaje kalibrację niwelatora co 12 miesięcy, a kierownik, magazynier i pracownik widzą ją na karcie", async () => {
    const z = await givenZawbud();

    await z.owner.addDeadline({ toolId: z.n01, kind: "kalibracja", dueOn: "2026-04-15", cycleMonths: 12, note: "Świadectwo z laboratorium" });

    for (const userId of [z.ownerId, z.nowakId, z.storekeeperId, z.workerId]) {
      const card = await testbed.registry.as(userId).toolCard(z.n01);
      expect(card?.deadlines).toEqual([
        {
          id: expect.any(String),
          kind: "kalibracja",
          dueOn: "2026-04-15",
          daysLeft: 44,
          status: "pozniej",
          cycleMonths: 12,
          note: "Świadectwo z laboratorium",
          lastDoneOn: null,
          documents: [],
        },
      ]);
    }
    expect((await z.owner.toolCard(z.h01))?.deadlines).toEqual([]);
  });

  it("właściciel zmienia datę, cykl i opis terminu, a potem go usuwa", async () => {
    const z = await givenZawbud();
    const { deadlineId } = await z.owner.addDeadline({ toolId: z.h01, kind: "przeglad", dueOn: "2026-03-20", cycleMonths: 6, note: "Przegląd elektryczny" });

    await z.owner.updateDeadline(deadlineId, { dueOn: "2026-03-10", cycleMonths: null, note: "" });

    expect((await z.owner.toolCard(z.h01))?.deadlines).toEqual([
      expect.objectContaining({ id: deadlineId, kind: "przeglad", dueOn: "2026-03-10", daysLeft: 8, status: "wkrotce", cycleMonths: null, note: null }),
    ]);

    await z.owner.deleteDeadline(deadlineId);

    expect((await z.owner.toolCard(z.h01))?.deadlines).toEqual([]);
    await expect(z.owner.updateDeadline(deadlineId, { dueOn: "2026-04-01" })).rejects.toMatchObject({ code: "not_found" });
    await expect(z.owner.deleteDeadline(deadlineId)).rejects.toMatchObject({ code: "not_found" });
  });

  it("kierownik, magazynier i pracownik terminów nie dodają, nie zmieniają i nie usuwają, także z pominięciem Rejestru", async () => {
    const z = await givenZawbud();
    const { deadlineId } = await z.owner.addDeadline({ toolId: z.n01, kind: "kalibracja", dueOn: "2026-04-15" });

    for (const userId of [z.nowakId, z.storekeeperId, z.workerId]) {
      const registry = testbed.registry.as(userId);
      await expect(registry.addDeadline({ toolId: z.h01, kind: "przeglad", dueOn: "2026-05-01" })).rejects.toMatchObject({ code: "forbidden" });
      await expect(registry.updateDeadline(deadlineId, { dueOn: "2027-01-01" })).rejects.toMatchObject({ code: "forbidden" });
      await expect(registry.deleteDeadline(deadlineId)).rejects.toMatchObject({ code: "forbidden" });
    }
    await expect(
      withActor(testbed.db, z.storekeeperId, (sql) =>
        sql("insert into app.tool_deadlines (company_id, tool_id, kind, due_on, created_at) values ($1, $2, 'przeglad', '2026-05-01', now())", [
          z.zawbud.companyId,
          z.h01,
        ]),
      ),
    ).rejects.toThrow();
    expect(await withActor(testbed.db, z.nowakId, (sql) => sql("update app.tool_deadlines set due_on = '2027-01-01' returning id"))).toEqual([]);
    expect((await z.owner.toolCard(z.n01))?.deadlines).toEqual([expect.objectContaining({ id: deadlineId, dueOn: "2026-04-15" })]);
  });

  it("jeden termin każdego rodzaju na narzędzie, z poprawną datą, cyklem 1–120 miesięcy i bez cyklu przy gwarancji", async () => {
    const z = await givenZawbud();
    await z.owner.addDeadline({ toolId: z.n01, kind: "kalibracja", dueOn: "2026-04-15" });
    const add = (input: Partial<Parameters<typeof z.owner.addDeadline>[0]>) =>
      z.owner.addDeadline({ toolId: z.n01, kind: "przeglad", dueOn: "2026-05-01", ...input });

    await expect(add({ kind: "kalibracja" })).rejects.toMatchObject({ code: "deadline_taken" });
    await expect(add({ kind: "serwis" as never })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(add({ dueOn: "2026-02-30" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(add({ dueOn: "1.05.2026" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(add({ cycleMonths: 0 })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(add({ cycleMonths: 121 })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(add({ cycleMonths: 1.5 })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(add({ note: "x".repeat(201) })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(add({ kind: "gwarancja", cycleMonths: 12 })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(add({ toolId: randomUUID() })).rejects.toMatchObject({ code: "not_found" });

    const { deadlineId: warrantyId } = await add({ kind: "gwarancja", dueOn: "2027-09-30" });
    await expect(z.owner.updateDeadline(warrantyId, { cycleMonths: 12 })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(z.owner.updateDeadline(warrantyId, { dueOn: "wczoraj" })).rejects.toMatchObject({ code: "invalid_input" });
    expect((await z.owner.toolCard(z.n01))?.deadlines.map((deadline) => deadline.kind)).toEqual(["kalibracja", "gwarancja"]);
  });
});

describe("wykonanie terminu", () => {
  it("kalibracja z cyklem 12 miesięcy wykonana dziś ma następny termin za rok, a przegląd miesięczny z 31 stycznia pod koniec lutego", async () => {
    const z = await givenZawbud();
    const { deadlineId: calibrationId } = await z.owner.addDeadline({ toolId: z.n01, kind: "kalibracja", dueOn: "2026-03-10", cycleMonths: 12 });
    const { deadlineId: inspectionId } = await z.owner.addDeadline({ toolId: z.h01, kind: "przeglad", dueOn: "2026-01-31", cycleMonths: 1 });

    expect(await z.owner.completeDeadline({ operationId: randomUUID(), deadlineId: calibrationId, doneOn: "2026-03-02" })).toEqual({
      dueOn: "2027-03-02",
    });
    expect(await z.owner.completeDeadline({ operationId: randomUUID(), deadlineId: inspectionId, doneOn: "2026-01-31" })).toEqual({
      dueOn: "2026-02-28",
    });

    expect((await z.owner.toolCard(z.n01))?.deadlines).toEqual([
      expect.objectContaining({ kind: "kalibracja", dueOn: "2027-03-02", lastDoneOn: "2026-03-02", cycleMonths: 12, status: "pozniej" }),
    ]);
    expect((await z.owner.toolCard(z.h01))?.deadlines).toEqual([
      expect.objectContaining({ kind: "przeglad", dueOn: "2026-02-28", lastDoneOn: "2026-01-31", status: "po_terminie", daysLeft: -2 }),
    ]);
  });

  it("przegląd bez cyklu po wykonaniu nie ma następnego terminu, a gwarancji nie da się wykonać", async () => {
    const z = await givenZawbud();
    const { deadlineId: udtId } = await z.owner.addDeadline({ toolId: z.h01, kind: "udt", dueOn: "2026-03-05" });
    const { deadlineId: warrantyId } = await z.owner.addDeadline({ toolId: z.h01, kind: "gwarancja", dueOn: "2027-03-01" });

    expect(await z.owner.completeDeadline({ operationId: randomUUID(), deadlineId: udtId, doneOn: "2026-02-27" })).toEqual({ dueOn: null });
    await expect(z.owner.completeDeadline({ operationId: randomUUID(), deadlineId: warrantyId, doneOn: "2026-03-02" })).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(z.owner.completeDeadline({ operationId: randomUUID(), deadlineId: randomUUID(), doneOn: "2026-03-02" })).rejects.toMatchObject({
      code: "not_found",
    });

    expect((await z.owner.toolCard(z.h01))?.deadlines).toEqual([
      expect.objectContaining({ kind: "gwarancja", dueOn: "2027-03-01" }),
      expect.objectContaining({ kind: "udt", dueOn: null, daysLeft: null, status: "bez_terminu", lastDoneOn: "2026-02-27" }),
    ]);
    // Nowy termin po wykonaniu wpisuje właściciel.
    await z.owner.updateDeadline(udtId, { dueOn: "2027-02-27" });
    expect((await z.owner.toolCard(z.h01))?.deadlines).toEqual([
      expect.objectContaining({ kind: "udt", dueOn: "2027-02-27", lastDoneOn: "2026-02-27" }),
      expect.objectContaining({ kind: "gwarancja" }),
    ]);
  });

  it("przy wykonaniu można podać następny termin, np. magazynier po powrocie z serwisu przeglądu bez cyklu", async () => {
    const z = await givenZawbud();
    const { deadlineId: udtId } = await z.owner.addDeadline({ toolId: z.h01, kind: "udt", dueOn: "2026-03-05" });
    const { deadlineId: calibrationId } = await z.owner.addDeadline({ toolId: z.n01, kind: "kalibracja", dueOn: "2026-03-05", cycleMonths: 12 });
    const storekeeper = testbed.registry.as(z.storekeeperId);

    expect(await storekeeper.completeDeadline({ operationId: randomUUID(), deadlineId: udtId, doneOn: "2026-03-02", nextDueOn: "2027-03-01" })).toEqual({
      dueOn: "2027-03-01",
    });
    // Podany termin wygrywa z cyklem, np. gdy serwis wpisał krótszą ważność świadectwa.
    expect(
      await storekeeper.completeDeadline({ operationId: randomUUID(), deadlineId: calibrationId, doneOn: "2026-03-02", nextDueOn: "2026-09-02" }),
    ).toEqual({ dueOn: "2026-09-02" });
    for (const nextDueOn of ["2026-03-02", "2026-02-27", "za rok"]) {
      await expect(storekeeper.completeDeadline({ operationId: randomUUID(), deadlineId: udtId, doneOn: "2026-03-02", nextDueOn })).rejects.toMatchObject({
        code: "invalid_input",
      });
    }

    expect((await z.owner.toolCard(z.h01))?.deadlines).toEqual([expect.objectContaining({ kind: "udt", dueOn: "2027-03-01", lastDoneOn: "2026-03-02" })]);
    expect((await z.owner.toolCard(z.n01))?.deadlines).toEqual([expect.objectContaining({ kind: "kalibracja", dueOn: "2026-09-02", cycleMonths: 12 })]);
  });

  it("ponowne wysłanie tego samego wykonania zwraca bieżący termin i nie cofa zmiany właściciela", async () => {
    const z = await givenZawbud();
    const { deadlineId } = await z.owner.addDeadline({ toolId: z.h01, kind: "przeglad", dueOn: "2026-03-05", cycleMonths: 12 });
    const storekeeper = testbed.registry.as(z.storekeeperId);
    const complete = { operationId: randomUUID(), deadlineId, doneOn: "2026-03-02", document: { kind: "protokol" as const, file: pdf(), fileName: "p.pdf" } };
    expect(await storekeeper.completeDeadline(complete)).toEqual({ dueOn: "2027-03-02" });
    await z.owner.updateDeadline(deadlineId, { dueOn: "2027-01-15" });

    expect(await storekeeper.completeDeadline(complete)).toEqual({ dueOn: "2027-01-15" });

    expect((await z.owner.toolCard(z.h01))?.deadlines).toEqual([
      expect.objectContaining({ dueOn: "2027-01-15", lastDoneOn: "2026-03-02", documents: [expect.objectContaining({ fileName: "p.pdf" })] }),
    ]);
    expect(testbed.documents.photos.size).toBe(1);
  });

  it("wykonanie wpisuje właściciel i magazynier, a kierownik i pracownik nie", async () => {
    const z = await givenZawbud();
    const { deadlineId } = await z.owner.addDeadline({ toolId: z.h01, kind: "przeglad", dueOn: "2026-03-05", cycleMonths: 6 });

    for (const userId of [z.nowakId, z.workerId]) {
      await expect(testbed.registry.as(userId).completeDeadline({ operationId: randomUUID(), deadlineId, doneOn: "2026-03-02" })).rejects.toMatchObject({
        code: "forbidden",
      });
    }
    expect(
      await withActor(testbed.db, z.nowakId, (sql) =>
        sql("select * from app.complete_tool_deadline($1, '2026-03-02', null, $2)", [deadlineId, randomUUID()]).catch(() => "odmowa"),
      ),
    ).toBe("odmowa");

    expect(
      await testbed.registry.as(z.storekeeperId).completeDeadline({ operationId: randomUUID(), deadlineId, doneOn: "2026-03-02" }),
    ).toEqual({ dueOn: "2026-09-02" });
  });

  it("wykonania nie wpisuje się z przyszłości, a dzień liczy się w Polsce", async () => {
    const z = await givenZawbud();
    const { deadlineId } = await z.owner.addDeadline({ toolId: z.h01, kind: "przeglad", dueOn: "2026-03-05", cycleMonths: 12 });

    // 2 marca, 23:30 w Polsce: 3 marca jeszcze nie nadszedł.
    testbed.clock.set("2026-03-02T22:30:00Z");
    await expect(z.owner.completeDeadline({ operationId: randomUUID(), deadlineId, doneOn: "2026-03-03" })).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(z.owner.completeDeadline({ operationId: randomUUID(), deadlineId, doneOn: "3 marca" })).rejects.toMatchObject({
      code: "invalid_input",
    });

    // 3 marca, 0:30 w Polsce, choć w UTC to jeszcze 2 marca.
    testbed.clock.set("2026-03-02T23:30:00Z");
    expect(await z.owner.completeDeadline({ operationId: randomUUID(), deadlineId, doneOn: "2026-03-03" })).toEqual({ dueOn: "2027-03-03" });
  });
});

describe("dokumenty terminu", () => {
  it("właściciel dołącza PDF świadectwa kalibracji: każdy w firmie widzi go na karcie i może otworzyć", async () => {
    const z = await givenZawbud();
    const { deadlineId } = await z.owner.addDeadline({ toolId: z.n01, kind: "kalibracja", dueOn: "2026-04-15", cycleMonths: 12 });
    const file = pdf();

    const { documentId } = await z.owner.addDeadlineDocument({
      operationId: randomUUID(),
      deadlineId,
      kind: "swiadectwo",
      file,
      fileName: "swiadectwo-N-01.pdf",
    });

    for (const userId of [z.ownerId, z.nowakId, z.storekeeperId, z.workerId]) {
      const registry = testbed.registry.as(userId);
      expect((await registry.toolCard(z.n01))?.deadlines[0].documents).toEqual([
        {
          id: documentId,
          kind: "swiadectwo",
          fileName: "swiadectwo-N-01.pdf",
          contentType: "application/pdf",
          uploadedAt: testbed.clock.now(),
          uploadedBy: `Właściciel Zawbud`,
        },
      ]);
      const opened = await registry.deadlineDocument(documentId);
      expect(opened?.fileName).toBe("swiadectwo-N-01.pdf");
      expect(opened?.file.type).toBe("application/pdf");
      expect(await opened?.file.text()).toBe(await file.text());
    }
    expect(testbed.documents.photos.size).toBe(1);
  });

  it("fakturę widzi i dołącza tylko właściciel, bo ma cenę; magazynier dołącza protokół przy wykonaniu przeglądu", async () => {
    const z = await givenZawbud();
    const { deadlineId: warrantyId } = await z.owner.addDeadline({ toolId: z.h01, kind: "gwarancja", dueOn: "2027-06-30" });
    const { deadlineId: inspectionId } = await z.owner.addDeadline({ toolId: z.h01, kind: "przeglad", dueOn: "2026-03-05", cycleMonths: 12 });
    const invoice = await z.owner.addDeadlineDocument({ operationId: randomUUID(), deadlineId: warrantyId, kind: "faktura", file: pdf("Faktura 3900 zł"), fileName: "faktura.pdf" });
    await z.owner.addDeadlineDocument({ operationId: randomUUID(), deadlineId: warrantyId, kind: "karta_gwarancyjna", file: jpeg(), fileName: "karta.jpg" });

    const storekeeper = testbed.registry.as(z.storekeeperId);
    await expect(
      storekeeper.addDeadlineDocument({ operationId: randomUUID(), deadlineId: warrantyId, kind: "faktura", file: pdf(), fileName: "f.pdf" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(
      await storekeeper.completeDeadline({
        operationId: randomUUID(),
        deadlineId: inspectionId,
        doneOn: "2026-03-02",
        document: { kind: "protokol", file: pdf("Protokół z przeglądu"), fileName: "protokol.pdf" },
      }),
    ).toEqual({ dueOn: "2027-03-02" });

    const documentsOf = async (userId: string) =>
      (await testbed.registry.as(userId).toolCard(z.h01))?.deadlines.map((deadline) => [deadline.kind, deadline.documents.map((document) => document.kind)]);
    expect(await documentsOf(z.ownerId)).toEqual([
      ["przeglad", ["protokol"]],
      ["gwarancja", ["faktura", "karta_gwarancyjna"]],
    ]);
    for (const userId of [z.nowakId, z.storekeeperId, z.workerId]) {
      expect(await documentsOf(userId)).toEqual([
        ["przeglad", ["protokol"]],
        ["gwarancja", ["karta_gwarancyjna"]],
      ]);
      expect(await testbed.registry.as(userId).deadlineDocument(invoice.documentId)).toBeNull();
    }
    for (const userId of [z.nowakId, z.workerId]) {
      await expect(
        testbed.registry.as(userId).addDeadlineDocument({ operationId: randomUUID(), deadlineId: inspectionId, kind: "protokol", file: pdf(), fileName: "p.pdf" }),
      ).rejects.toMatchObject({ code: "forbidden" });
    }
  });

  it("dokument to PDF albo zdjęcie do 4 MB rozpoznane po treści; ponowne wysłanie go nie dubluje", async () => {
    const z = await givenZawbud();
    const { deadlineId } = await z.owner.addDeadline({ toolId: z.n01, kind: "kalibracja", dueOn: "2026-04-15" });
    const attach = (file: Blob, operationId = randomUUID()) =>
      z.owner.addDeadlineDocument({ operationId, deadlineId, kind: "swiadectwo", file, fileName: "plik.pdf" });

    await expect(attach(new Blob(["to nie jest PDF"], { type: "application/pdf" }))).rejects.toMatchObject({ code: "document_invalid" });
    await expect(attach(new Blob([new Uint8Array(4 * 1024 * 1024 + 1)]))).rejects.toMatchObject({ code: "document_invalid" });
    await expect(attach(new Blob([]))).rejects.toMatchObject({ code: "document_invalid" });
    await expect(z.owner.addDeadlineDocument({ operationId: randomUUID(), deadlineId, kind: "swiadectwo", file: pdf(), fileName: " " })).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(z.owner.addDeadlineDocument({ operationId: randomUUID(), deadlineId, kind: "zdjecie" as never, file: pdf(), fileName: "a.pdf" })).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(
      z.owner.addDeadlineDocument({ operationId: randomUUID(), deadlineId: randomUUID(), kind: "swiadectwo", file: pdf(), fileName: "a.pdf" }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(testbed.documents.photos.size).toBe(0);

    const operationId = randomUUID();
    const first = await attach(pdf(), operationId);
    const again = await attach(pdf(), operationId);

    expect(again).toEqual(first);
    expect((await z.owner.toolCard(z.n01))?.deadlines[0].documents).toHaveLength(1);
    expect(testbed.documents.photos.size).toBe(1);
  });

  it("właściciel usuwa dokument, a usunięcie terminu usuwa jego dokumenty z kubełka", async () => {
    const z = await givenZawbud();
    const { deadlineId } = await z.owner.addDeadline({ toolId: z.n01, kind: "kalibracja", dueOn: "2026-04-15" });
    const first = await z.owner.addDeadlineDocument({ operationId: randomUUID(), deadlineId, kind: "swiadectwo", file: pdf(), fileName: "2025.pdf" });
    await z.owner.addDeadlineDocument({ operationId: randomUUID(), deadlineId, kind: "swiadectwo", file: jpeg(), fileName: "2026.jpg" });

    await expect(testbed.registry.as(z.storekeeperId).deleteDeadlineDocument(first.documentId)).rejects.toMatchObject({ code: "forbidden" });
    await z.owner.deleteDeadlineDocument(first.documentId);

    expect((await z.owner.toolCard(z.n01))?.deadlines[0].documents.map((document) => document.fileName)).toEqual(["2026.jpg"]);
    expect(testbed.documents.photos.size).toBe(1);
    expect(await z.owner.deadlineDocument(first.documentId)).toBeNull();
    await expect(z.owner.deleteDeadlineDocument(first.documentId)).rejects.toMatchObject({ code: "not_found" });

    await z.owner.deleteDeadline(deadlineId);

    expect(testbed.documents.photos.size).toBe(0);
  });

  it("gdy zapis w kubełku się nie uda, dokumentu nie ma, a wykonanie przeglądu się nie zapisuje", async () => {
    const z = await givenZawbud();
    const { deadlineId } = await z.owner.addDeadline({ toolId: z.h01, kind: "przeglad", dueOn: "2026-03-05", cycleMonths: 12 });
    testbed.documents.failWith = new Error("Storage nie odpowiada");

    await expect(
      z.owner.completeDeadline({ operationId: randomUUID(), deadlineId, doneOn: "2026-03-02", document: { kind: "protokol", file: pdf(), fileName: "p.pdf" } }),
    ).rejects.toThrow("Storage nie odpowiada");

    expect((await z.owner.toolCard(z.h01))?.deadlines).toEqual([expect.objectContaining({ dueOn: "2026-03-05", lastDoneOn: null, documents: [] })]);
  });
});

describe("najbliższy termin", () => {
  it("tablica i karta podają najbliższy termin z tym, czy jest po terminie, i gwarancję, póki trwa", async () => {
    const z = await givenZawbud();
    const cutters = await z.owner.addCategory({ name: "Przecinarki", prefix: "P" });
    const p01 = (await z.owner.addTool({ operationId: randomUUID(), code: "P-01", name: "Przecinarka", categoryId: cutters.id })).toolId;
    await z.owner.addDeadline({ toolId: z.h01, kind: "gwarancja", dueOn: "2026-04-10" });
    await z.owner.addDeadline({ toolId: z.h01, kind: "przeglad", dueOn: "2026-02-20", cycleMonths: 12 });
    await z.owner.addDeadline({ toolId: z.n01, kind: "gwarancja", dueOn: "2026-01-15" });
    await z.owner.addDeadline({ toolId: z.n01, kind: "kalibracja", dueOn: "2026-06-01", cycleMonths: 12 });
    const { deadlineId } = await z.owner.addDeadline({ toolId: p01, kind: "udt", dueOn: "2026-03-01" });
    await z.owner.completeDeadline({ operationId: randomUUID(), deadlineId, doneOn: "2026-03-01" });

    for (const userId of [z.ownerId, z.workerId]) {
      const board = await testbed.registry.as(userId).whereIsWhat();
      const onBoard = (toolId: string) => [...board.base.tools, ...board.sites.flatMap((site) => site.tools)].find((tool) => tool.id === toolId);
      const overdueInspection = { kind: "przeglad", dueOn: "2026-02-20", daysLeft: -10, overdue: true };
      expect(onBoard(z.h01)).toMatchObject({ nextDeadline: overdueInspection, nextInspection: overdueInspection, warrantyUntil: "2026-04-10" });
      const calibration = { kind: "kalibracja", dueOn: "2026-06-01", daysLeft: 91, overdue: false };
      expect(onBoard(z.n01)).toMatchObject({ nextDeadline: calibration, nextInspection: calibration, warrantyUntil: null });
      expect(onBoard(p01)).toMatchObject({ nextDeadline: null, nextInspection: null, warrantyUntil: null });
    }
    expect(await z.owner.toolCard(z.h01)).toMatchObject({
      nextDeadline: { kind: "przeglad", dueOn: "2026-02-20", daysLeft: -10, overdue: true },
      warrantyUntil: "2026-04-10",
    });
    // Gwarancja kończy się przed przeglądem: najbliższy termin to gwarancja, a przegląd zostaje najbliższym przeglądem.
    await z.owner.addDeadline({ toolId: p01, kind: "gwarancja", dueOn: "2026-03-10" });
    await z.owner.updateDeadline(deadlineId, { dueOn: "2026-05-01" });
    expect(await z.owner.toolCard(p01)).toMatchObject({
      nextDeadline: { kind: "gwarancja", dueOn: "2026-03-10", daysLeft: 8, overdue: false },
      nextInspection: { kind: "udt", dueOn: "2026-05-01", daysLeft: 60, overdue: false },
      warrantyUntil: "2026-03-10",
    });
    // Ostatni dzień gwarancji to jeszcze gwarancja.
    testbed.clock.set("2026-04-10T20:00:00Z");
    expect(await z.owner.toolCard(z.h01)).toMatchObject({ warrantyUntil: "2026-04-10" });
    testbed.clock.set("2026-04-10T22:30:00Z");
    expect(await z.owner.toolCard(z.h01)).toMatchObject({ warrantyUntil: null });
  });
});

describe("przypomnienia o terminach", () => {
  it("tydzień przed terminem w Polsce właściciel i kierownik budowy, na której jest niwelator, dostają przypomnienie, raz", async () => {
    const z = await givenZawbud();
    const { deadlineId } = await z.owner.addDeadline({ toolId: z.n01, kind: "kalibracja", dueOn: "2026-03-13", cycleMonths: 12 });

    // 5 marca, 23:30 w Polsce: do terminu jeszcze 8 dni.
    testbed.clock.set("2026-03-05T22:30:00Z");
    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 0 });
    // 6 marca, 0:30 w Polsce, choć w UTC to jeszcze 5 marca: zostało 7 dni.
    testbed.clock.set("2026-03-05T23:30:00Z");
    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 1 });

    const reminder = {
      kind: "terminy",
      deadlines: [
        {
          id: deadlineId,
          kind: "kalibracja",
          dueOn: "2026-03-13",
          overdue: false,
          tool: { id: z.n01, code: "N-01", name: "Niwelator laserowy" },
          location: { id: z.ratajeId, name: "Rataje", kind: "budowa" },
        },
      ],
    };
    expect(await bellOf(z.ownerId)).toEqual([reminder]);
    expect(await bellOf(z.nowakId)).toEqual([reminder]);
    expect(await bellOf(z.storekeeperId)).toEqual([]);
    expect(await bellOf(z.workerId)).toEqual([]);
    expect(testbed.notifier.sent).toEqual([]);

    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 0 });
    testbed.clock.set("2026-03-07T05:00:00Z");
    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 0 });
    expect(await bellOf(z.ownerId)).toHaveLength(1);
  });

  it("po terminie przypomnienie przychodzi raz; koniec gwarancji tylko tydzień przed", async () => {
    const z = await givenZawbud();
    await z.owner.addDeadline({ toolId: z.h01, kind: "przeglad", dueOn: "2026-03-20" });
    await z.owner.addDeadline({ toolId: z.h01, kind: "gwarancja", dueOn: "2026-03-20" });

    testbed.clock.set("2026-03-13T06:00:00Z");
    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 2 });
    // W dniu terminu jeszcze nie „po terminie”.
    testbed.clock.set("2026-03-20T22:30:00Z");
    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 0 });
    testbed.clock.set("2026-03-20T23:30:00Z");
    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 1 });
    testbed.clock.set("2026-04-20T05:00:00Z");
    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 0 });

    const summaries = (await bellOf(z.ownerId)).map((n) => n.kind === "terminy" && n.deadlines.map((d) => [d.kind, d.overdue]));
    expect(summaries).toEqual([[["przeglad", true]], [["przeglad", false], ["gwarancja", false]]]);
  });

  it("kierownik dostaje tylko o sprzęcie na swoich lokalizacjach; na bazie i w serwisie tylko właściciel, a wycofany sprzęt nikt", async () => {
    const z = await givenZawbud();
    const kowalskiId = await testbed.givenMember(z.zawbud, "kierownik", "Jan Kowalski");
    const { locationId: busId } = await z.owner.addVehicle({ name: "Bus WPI 4K21", managerId: kowalskiId });
    const tool = async (code: string) => {
      const [category] = await z.owner.categories();
      return (await z.owner.addTool({ operationId: randomUUID(), code, name: `Narzędzie ${code}`, categoryId: category.id })).toolId;
    };
    const [onBus, inService, retired] = [await tool("N-02"), await tool("N-03"), await tool("N-04")];
    await move(kowalskiId, "wydanie", z.baseId, busId, [onBus]);
    await move(z.ownerId, "do_serwisu", z.baseId, z.serviceId, [inService]);
    await z.owner.retireTool({ operationId: randomUUID(), toolId: retired, reason: "sprzedany" });
    for (const toolId of [z.n01, z.h01, onBus, inService, retired]) {
      await z.owner.addDeadline({ toolId, kind: "przeglad", dueOn: "2026-03-06" });
    }

    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 4 });

    const codes = async (userId: string) =>
      (await bellOf(userId)).map((n) => n.kind === "terminy" && n.deadlines.map((d) => [d.tool.code, d.location.kind]));
    expect(await codes(z.ownerId)).toEqual([
      [
        ["H-01", "baza"],
        ["N-01", "budowa"],
        ["N-02", "pojazd"],
        ["N-03", "serwis"],
      ],
    ]);
    expect(await codes(z.nowakId)).toEqual([[["N-01", "budowa"]]]);
    expect(await codes(kowalskiId)).toEqual([[["N-02", "pojazd"]]]);
  });

  it("wykonany przegląd z cyklem przypomina się znowu przed następnym terminem, a każda firma dostaje swoje", async () => {
    const z = await givenZawbud();
    const other = await testbed.givenActiveCompany("Budrex");
    const otherOwner = testbed.registry.as(other.ownerId);
    const otherCategory = await otherOwner.addCategory({ name: "Młoty", prefix: "H" });
    const otherTool = (await otherOwner.addTool({ operationId: randomUUID(), code: "H-01", name: "Młot Budrexu", categoryId: otherCategory.id })).toolId;
    await otherOwner.addDeadline({ toolId: otherTool, kind: "udt", dueOn: "2026-03-08" });
    const { deadlineId } = await z.owner.addDeadline({ toolId: z.h01, kind: "przeglad", dueOn: "2026-03-05", cycleMonths: 1 });

    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 2 });
    await z.owner.completeDeadline({ operationId: randomUUID(), deadlineId, doneOn: "2026-03-02" });
    // Przegląd Zawbudu ma nowy termin za tydzień, a badanie UDT Budrexu jest już po terminie.
    testbed.clock.set("2026-03-26T06:00:00Z");
    expect(await testbed.registry.system().notifyDueDeadlines()).toEqual({ deadlines: 2 });

    const dueDays = async (userId: string) =>
      (await bellOf(userId)).map((n) => n.kind === "terminy" && n.deadlines.map((d) => [d.tool.name, d.dueOn, d.overdue]));
    expect(await dueDays(z.ownerId)).toEqual([[["Młotowiertarka Hilti", "2026-04-02", false]], [["Młotowiertarka Hilti", "2026-03-05", false]]]);
    expect(await dueDays(other.ownerId)).toEqual([[["Młot Budrexu", "2026-03-08", true]], [["Młot Budrexu", "2026-03-08", false]]]);
  });
});

describe("terminy w najbliższych 30 dniach", () => {
  it("raport tygodniowy i lista terminów mają terminy z najbliższych 30 dni i te po terminie, bez wygasłych gwarancji", async () => {
    const z = await givenZawbud();
    await z.owner.addDeadline({ toolId: z.h01, kind: "przeglad", dueOn: "2026-02-20", cycleMonths: 12 });
    await z.owner.addDeadline({ toolId: z.h01, kind: "gwarancja", dueOn: "2026-04-01" });
    await z.owner.addDeadline({ toolId: z.n01, kind: "kalibracja", dueOn: "2026-03-20" });
    await z.owner.addDeadline({ toolId: z.n01, kind: "gwarancja", dueOn: "2026-02-01" });
    await z.owner.addDeadline({ toolId: z.n01, kind: "udt", dueOn: "2026-04-02" });

    const h01 = { id: z.h01, code: "H-01", name: "Młotowiertarka Hilti" };
    const n01 = { id: z.n01, code: "N-01", name: "Niwelator laserowy" };
    const expected = [
      {
        id: expect.any(String),
        kind: "przeglad",
        dueOn: "2026-02-20",
        daysLeft: -10,
        overdue: true,
        tool: h01,
        location: { id: z.baseId, name: "Magazyn Swarzędz", kind: "baza" },
        responsible: null,
      },
      {
        id: expect.any(String),
        kind: "kalibracja",
        dueOn: "2026-03-20",
        daysLeft: 18,
        overdue: false,
        tool: n01,
        location: { id: z.ratajeId, name: "Rataje", kind: "budowa" },
        responsible: "Adam Nowak",
      },
      expect.objectContaining({ kind: "gwarancja", dueOn: "2026-04-01", daysLeft: 30, overdue: false, tool: h01 }),
    ];
    expect((await z.owner.weeklyReport()).deadlines).toEqual(expected);
    for (const userId of [z.ownerId, z.nowakId, z.storekeeperId, z.workerId]) {
      expect(await testbed.registry.as(userId).upcomingDeadlines()).toEqual(expected);
    }

    // Poniedziałek 7:00: raport w dzwonku ma te same terminy.
    await testbed.registry.system().sendDueReports();
    const [entry] = (await testbed.registry.as(z.ownerId).bell()).entries;
    expect(entry.notification).toMatchObject({ kind: "raport_tygodniowy", report: { deadlines: expected } });
  });
});

describe("tryb tylko do odczytu i izolacja firm", () => {
  it("w trybie tylko do odczytu terminy i dokumenty są widoczne, ale żadnego nie da się dodać, zmienić, wykonać ani usunąć", async () => {
    const z = await givenZawbud();
    const { deadlineId } = await z.owner.addDeadline({ toolId: z.n01, kind: "kalibracja", dueOn: "2026-03-20", cycleMonths: 12 });
    const { documentId } = await z.owner.addDeadlineDocument({ operationId: randomUUID(), deadlineId, kind: "swiadectwo", file: pdf(), fileName: "s.pdf" });
    const adminId = await testbed.givenSuperAdmin();
    await testbed.registry.superAdmin(adminId).setManualReadOnly(z.zawbud.companyId, true);
    const cardBefore = await z.owner.toolCard(z.n01);
    const document = { kind: "swiadectwo" as const, file: pdf(), fileName: "nowe.pdf" };

    const commands: [string, () => Promise<unknown>][] = [
      ["addDeadline", () => z.owner.addDeadline({ toolId: z.h01, kind: "przeglad", dueOn: "2026-05-01" })],
      ["updateDeadline", () => z.owner.updateDeadline(deadlineId, { dueOn: "2026-05-01" })],
      ["deleteDeadline", () => z.owner.deleteDeadline(deadlineId)],
      ["completeDeadline", () => z.owner.completeDeadline({ operationId: randomUUID(), deadlineId, doneOn: "2026-03-02" })],
      [
        "completeDeadline (magazynier)",
        () => testbed.registry.as(z.storekeeperId).completeDeadline({ operationId: randomUUID(), deadlineId, doneOn: "2026-03-02", document }),
      ],
      ["addDeadlineDocument", () => z.owner.addDeadlineDocument({ operationId: randomUUID(), deadlineId, ...document })],
      ["deleteDeadlineDocument", () => z.owner.deleteDeadlineDocument(documentId)],
    ];
    for (const [name, command] of commands) {
      await expect(command(), name).rejects.toMatchObject({ code: "read_only" });
    }

    expect(await z.owner.toolCard(z.n01)).toEqual(cardBefore);
    expect(await testbed.registry.as(z.nowakId).upcomingDeadlines()).toEqual([expect.objectContaining({ id: deadlineId })]);
    expect(await testbed.registry.as(z.workerId).deadlineDocument(documentId)).toMatchObject({ fileName: "s.pdf" });
    expect(testbed.documents.photos.size).toBe(1);
  });

  it("inna firma nie widzi terminów ani dokumentów i niczego w nich nie zmieni", async () => {
    const z = await givenZawbud();
    const { deadlineId } = await z.owner.addDeadline({ toolId: z.n01, kind: "kalibracja", dueOn: "2026-03-20" });
    const { documentId } = await z.owner.addDeadlineDocument({ operationId: randomUUID(), deadlineId, kind: "swiadectwo", file: pdf(), fileName: "s.pdf" });
    const other = await testbed.givenActiveCompany("Budrex");
    const stranger = testbed.registry.as(other.ownerId);

    expect(await stranger.upcomingDeadlines()).toEqual([]);
    expect(await stranger.deadlineDocument(documentId)).toBeNull();
    await expect(stranger.addDeadline({ toolId: z.n01, kind: "przeglad", dueOn: "2026-05-01" })).rejects.toMatchObject({ code: "not_found" });
    await expect(stranger.updateDeadline(deadlineId, { dueOn: "2026-05-01" })).rejects.toMatchObject({ code: "not_found" });
    await expect(stranger.completeDeadline({ operationId: randomUUID(), deadlineId, doneOn: "2026-03-02" })).rejects.toMatchObject({ code: "not_found" });
    await expect(
      stranger.addDeadlineDocument({ operationId: randomUUID(), deadlineId, kind: "swiadectwo", file: pdf(), fileName: "a.pdf" }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(stranger.deleteDeadlineDocument(documentId)).rejects.toMatchObject({ code: "not_found" });
    await expect(stranger.deleteDeadline(deadlineId)).rejects.toMatchObject({ code: "not_found" });

    expect((await z.owner.toolCard(z.n01))?.deadlines).toEqual([
      expect.objectContaining({ id: deadlineId, dueOn: "2026-03-20", documents: [expect.objectContaining({ id: documentId })] }),
    ]);
  });
});
