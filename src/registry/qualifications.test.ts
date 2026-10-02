import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withActor } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();

/**
 * Zawbud (dziś 2 marca 2026): kierownik Adam Nowak, magazynier Piotr Wiśniewski, pracownik Marek Zieliński (konta)
 * i Zbigniew Kaczmarek z brygady, bez konta.
 */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud");
  const ownerId = zawbud.ownerId;
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const storekeeperId = await testbed.givenMember(zawbud, "magazynier", "Piotr Wiśniewski");
  const workerId = await testbed.givenMember(zawbud, "pracownik", "Marek Zieliński");
  const owner = testbed.registry.as(ownerId);
  const { personId: kaczmarek } = await owner.addPerson({ fullName: "Zbigniew Kaczmarek", note: "Brygada Marka" });
  const personOf = async (userId: string) => (await owner.people()).find((person) => person.account?.userId === userId)!.personId;
  return {
    zawbud,
    owner,
    ownerId,
    nowakId,
    storekeeperId,
    workerId,
    nowak: testbed.registry.as(nowakId),
    storekeeper: testbed.registry.as(storekeeperId),
    worker: testbed.registry.as(workerId),
    kaczmarek,
    ownerPerson: await personOf(ownerId),
    nowakPerson: await personOf(nowakId),
    storekeeperPerson: await personOf(storekeeperId),
    zielinski: await personOf(workerId),
  };
}

function pdf(text = "Zaświadczenie o ukończeniu szkolenia BHP") {
  return new Blob([`%PDF-1.7\n${text}\n%%EOF`], { type: "application/pdf" });
}

async function bellOf(userId: string) {
  return (await testbed.registry.as(userId).bell()).entries.map((entry) => entry.notification);
}

/** Rodzaj, osoba, data i „po terminie” każdego uprawnienia z przypomnień w dzwonku, od najnowszego przypomnienia. */
async function remindersOf(userId: string) {
  return (await bellOf(userId)).flatMap((n) => (n.kind === "uprawnienia" ? [n.qualifications.map((q) => [q.kind, q.person.fullName, q.dueOn, q.overdue])] : []));
}

describe("uprawnienia przy osobie", () => {
  it("właściciel i kierownik wpisują uprawnienia ze stałej listy, z datą, cyklem, notatką i opisem, i widzą je przy osobie", async () => {
    const z = await givenZawbud();

    const { qualificationId: bhp } = await z.owner.addQualification({
      personId: z.kaczmarek,
      kind: "szkolenie_bhp",
      dueOn: "2026-03-20",
      cycleMonths: 12,
      note: "Szkolenie okresowe w ośrodku Atest",
    });
    const { qualificationId: udt } = await z.nowak.addQualification({ personId: z.kaczmarek, kind: "udt", detail: " wózki widłowe ", dueOn: "2029-05-01" });
    await z.nowak.addQualification({ personId: z.kaczmarek, kind: "prawo_jazdy", detail: "C+E", dueOn: "2031-01-15" });

    const expected = {
      person: { id: z.kaczmarek, fullName: "Zbigniew Kaczmarek", active: true, role: null },
      qualifications: [
        {
          id: bhp,
          kind: "szkolenie_bhp",
          customKind: null,
          detail: null,
          dueOn: "2026-03-20",
          daysLeft: 18,
          status: "wkrotce",
          cycleMonths: 12,
          note: "Szkolenie okresowe w ośrodku Atest",
          lastDoneOn: null,
          documents: [],
        },
        expect.objectContaining({ id: udt, kind: "udt", detail: "wózki widłowe", dueOn: "2029-05-01", status: "pozniej", cycleMonths: null, note: null }),
        expect.objectContaining({ kind: "prawo_jazdy", detail: "C+E", dueOn: "2031-01-15" }),
      ],
    };
    expect(await z.owner.personQualifications(z.kaczmarek)).toEqual(expected);
    expect(await z.nowak.personQualifications(z.kaczmarek)).toEqual(expected);
  });

  it("pracownik i magazynier widzą tylko własne uprawnienia; cudzej osoby nie ma", async () => {
    const z = await givenZawbud();
    await z.owner.addQualification({ personId: z.zielinski, kind: "badania_lekarskie", dueOn: "2026-09-30", cycleMonths: 24 });
    await z.owner.addQualification({ personId: z.kaczmarek, kind: "szkolenie_bhp", dueOn: "2026-03-20" });
    await z.owner.addQualification({ personId: z.storekeeperPerson, kind: "udt", detail: "suwnice", dueOn: "2027-01-01" });

    expect(await z.worker.personQualifications(z.zielinski)).toMatchObject({
      person: { id: z.zielinski, fullName: "Marek Zieliński", role: "pracownik" },
      qualifications: [{ kind: "badania_lekarskie", dueOn: "2026-09-30", status: "pozniej" }],
    });
    expect(await z.worker.personQualifications(z.kaczmarek)).toBeNull();
    expect(await z.storekeeper.personQualifications(z.zielinski)).toBeNull();

    const people = async (registry: typeof z.owner) =>
      (await registry.peopleQualifications()).map((entry) => [entry.person.fullName, entry.qualifications.map((q) => q.kind)]);
    expect(await people(z.worker)).toEqual([["Marek Zieliński", ["badania_lekarskie"]]]);
    expect(await people(z.storekeeper)).toEqual([["Piotr Wiśniewski", ["udt"]]]);
    expect(await people(z.nowak)).toEqual([
      ["Adam Nowak", []],
      ["Marek Zieliński", ["badania_lekarskie"]],
      ["Piotr Wiśniewski", ["udt"]],
      ["Właściciel Zawbud", []],
      ["Zbigniew Kaczmarek", ["szkolenie_bhp"]],
    ]);
    expect(await people(z.owner)).toEqual(await people(z.nowak));
  });

  it("pracownik i magazynier niczego nie wpisują, także z pominięciem Rejestru", async () => {
    const z = await givenZawbud();
    const { qualificationId } = await z.owner.addQualification({ personId: z.zielinski, kind: "szkolenie_bhp", dueOn: "2026-03-20", cycleMonths: 12 });

    for (const registry of [z.worker, z.storekeeper]) {
      await expect(registry.addQualification({ personId: z.zielinski, kind: "pierwsza_pomoc", dueOn: "2027-01-01" })).rejects.toMatchObject({ code: "forbidden" });
      await expect(registry.updateQualification(qualificationId, { dueOn: "2030-01-01" })).rejects.toMatchObject({ code: "forbidden" });
      await expect(registry.completeQualification({ operationId: randomUUID(), qualificationId, doneOn: "2026-03-02" })).rejects.toMatchObject({ code: "forbidden" });
      await expect(registry.addQualificationDocument({ operationId: randomUUID(), qualificationId, file: pdf(), fileName: "bhp.pdf" })).rejects.toMatchObject({
        code: "forbidden",
      });
      await expect(registry.deleteQualification(qualificationId)).rejects.toMatchObject({ code: "forbidden" });
    }
    await expect(
      withActor(testbed.db, z.workerId, (sql) =>
        sql("insert into app.qualifications (company_id, person_id, kind, due_on, created_at) values ($1, $2, 'pierwsza_pomoc', '2027-01-01', now())", [
          z.zawbud.companyId,
          z.zielinski,
        ]),
      ),
    ).rejects.toThrow();
    expect(await withActor(testbed.db, z.workerId, (sql) => sql("update app.qualifications set due_on = '2030-01-01' returning id"))).toEqual([]);
    expect((await z.owner.personQualifications(z.zielinski))?.qualifications).toEqual([expect.objectContaining({ id: qualificationId, dueOn: "2026-03-20" })]);
  });

  it("zmienia datę, cykl, notatkę i opis; usuwa tylko właściciel, razem z dokumentami", async () => {
    const z = await givenZawbud();
    const { qualificationId } = await z.owner.addQualification({ personId: z.kaczmarek, kind: "sep", dueOn: "2026-06-01", cycleMonths: 60 });
    await z.nowak.addQualificationDocument({ operationId: randomUUID(), qualificationId, file: pdf("Świadectwo SEP E"), fileName: "sep.pdf" });

    await z.nowak.updateQualification(qualificationId, { dueOn: "2031-06-01", cycleMonths: null, note: "Grupa G1", detail: "E" });
    expect((await z.owner.personQualifications(z.kaczmarek))?.qualifications).toEqual([
      expect.objectContaining({ id: qualificationId, kind: "sep", dueOn: "2031-06-01", cycleMonths: null, note: "Grupa G1", detail: "E" }),
    ]);

    await expect(z.nowak.deleteQualification(qualificationId)).rejects.toMatchObject({ code: "forbidden" });
    expect(testbed.documents.photos.size).toBe(1);
    await z.owner.deleteQualification(qualificationId);

    expect((await z.owner.personQualifications(z.kaczmarek))?.qualifications).toEqual([]);
    expect(testbed.documents.photos.size).toBe(0);
    await expect(z.owner.deleteQualification(qualificationId)).rejects.toMatchObject({ code: "not_found" });
  });

  it("odrzuca złe dane: rodzaj, datę, cykl, opis, którego rodzaj nie ma albo wymaga, notatkę przy badaniach i powtórkę", async () => {
    const z = await givenZawbud();
    const add = (input: Partial<Parameters<typeof z.owner.addQualification>[0]>) =>
      z.owner.addQualification({ personId: z.kaczmarek, kind: "szkolenie_bhp", dueOn: "2026-05-01", ...input });
    await add({});

    await expect(add({})).rejects.toMatchObject({ code: "qualification_taken" });
    for (const input of [
      { kind: "spawanie" as never },
      { dueOn: "2026-02-30" },
      { cycleMonths: 0 },
      { cycleMonths: 121 },
      { kind: "udt" as const },
      { kind: "prawo_jazdy" as const, detail: " " },
      { kind: "pierwsza_pomoc" as const, detail: "PCK" },
      { kind: "badania_lekarskie" as const, note: "Bez przeciwwskazań" },
      { kind: "badania_wysokosc" as const, detail: "do 3 m" },
      { kind: "pierwsza_pomoc" as const, note: "x".repeat(201) },
      { kind: "wlasny" as const },
      { dueOn: undefined as never },
    ]) {
      await expect(add(input), JSON.stringify(input)).rejects.toMatchObject({ code: "invalid_input" });
    }
    // Dwa UDT na różne urządzenia to dwa uprawnienia, a to samo urządzenie drugi raz już nie.
    await add({ kind: "udt", detail: "wózki widłowe" });
    await add({ kind: "udt", detail: "podesty ruchome" });
    await expect(add({ kind: "udt", detail: "Wózki widłowe" })).rejects.toMatchObject({ code: "qualification_taken" });
    await expect(z.owner.addQualification({ personId: randomUUID(), kind: "szkolenie_bhp", dueOn: "2026-05-01" })).rejects.toMatchObject({ code: "not_found" });
    expect((await z.owner.personQualifications(z.kaczmarek))?.qualifications).toHaveLength(3);
  });

  it("osobie, która odeszła z firmy, nowych uprawnień się nie wpisuje", async () => {
    const z = await givenZawbud();
    await z.owner.deactivatePerson(z.kaczmarek);

    await expect(z.owner.addQualification({ personId: z.kaczmarek, kind: "szkolenie_bhp", dueOn: "2026-05-01" })).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("własne rodzaje uprawnień", () => {
  it("właściciel dodaje rodzaj firmy, a kierownik wpisuje go osobie", async () => {
    const z = await givenZawbud();

    const { kindId } = await z.owner.addQualificationKind({ name: " Operator koparki " });
    await z.owner.addQualificationKind({ name: "Spawacz MAG" });
    const { qualificationId } = await z.nowak.addQualification({ personId: z.kaczmarek, kind: "wlasny", customKindId: kindId, dueOn: "2027-04-30" });

    expect(await z.nowak.qualificationKinds()).toEqual([
      { id: kindId, name: "Operator koparki" },
      { id: expect.any(String), name: "Spawacz MAG" },
    ]);
    expect((await z.owner.personQualifications(z.kaczmarek))?.qualifications).toEqual([
      expect.objectContaining({ id: qualificationId, kind: "wlasny", customKind: { id: kindId, name: "Operator koparki" }, dueOn: "2027-04-30" }),
    ]);
    await expect(z.nowak.addQualification({ personId: z.kaczmarek, kind: "wlasny", customKindId: kindId, dueOn: "2028-01-01" })).rejects.toMatchObject({
      code: "qualification_taken",
    });
  });

  it("rodzaj dodaje tylko właściciel, bez powtórek i pustych nazw; rodzaju innej firmy nie da się wpisać", async () => {
    const z = await givenZawbud();
    await z.owner.addQualificationKind({ name: "Operator koparki" });
    const budrex = testbed.registry.as((await testbed.givenActiveCompany("Budrex")).ownerId);
    const { kindId: foreignKind } = await budrex.addQualificationKind({ name: "Dźwigowy" });

    await expect(z.nowak.addQualificationKind({ name: "Spawacz" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(z.worker.addQualificationKind({ name: "Spawacz" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(z.owner.addQualificationKind({ name: "operator KOPARKI" })).rejects.toMatchObject({ code: "qualification_kind_taken" });
    await expect(z.owner.addQualificationKind({ name: "  " })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(z.owner.addQualification({ personId: z.kaczmarek, kind: "wlasny", customKindId: foreignKind, dueOn: "2027-01-01" })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(z.owner.addQualification({ personId: z.kaczmarek, kind: "szkolenie_bhp", customKindId: foreignKind, dueOn: "2027-01-01" })).rejects.toMatchObject({
      code: "invalid_input",
    });
    expect((await z.owner.qualificationKinds()).map((kind) => kind.name)).toEqual(["Operator koparki"]);
  });
});

describe("dokumenty uprawnień i badania lekarskie", () => {
  it("zaświadczenie ze szkolenia widzą właściciel, kierownik i sama osoba", async () => {
    const z = await givenZawbud();
    const { qualificationId } = await z.owner.addQualification({ personId: z.zielinski, kind: "szkolenie_bhp", dueOn: "2026-11-30", cycleMonths: 12 });

    const { documentId } = await z.nowak.addQualificationDocument({ operationId: randomUUID(), qualificationId, file: pdf(), fileName: " bhp-2025.pdf " });

    for (const registry of [z.owner, z.nowak, z.worker]) {
      expect((await registry.personQualifications(z.zielinski))?.qualifications[0].documents).toEqual([
        { id: documentId, fileName: "bhp-2025.pdf", contentType: "application/pdf", uploadedAt: testbed.clock.now(), uploadedBy: "Adam Nowak" },
      ]);
      expect(await registry.qualificationDocument(documentId)).toMatchObject({ fileName: "bhp-2025.pdf" });
    }
    expect(await z.storekeeper.qualificationDocument(documentId)).toBeNull();
  });

  it("orzeczenie z badań dodaje i czyta tylko właściciel; kierownik i sama osoba widzą tylko „ważne do” i stan", async () => {
    const z = await givenZawbud();
    const { qualificationId: medical } = await z.owner.addQualification({ personId: z.zielinski, kind: "badania_lekarskie", dueOn: "2026-02-20", cycleMonths: 24 });
    const { qualificationId: heights } = await z.owner.addQualification({ personId: z.zielinski, kind: "badania_wysokosc", dueOn: "2026-08-31" });

    const { documentId } = await z.owner.addQualificationDocument({ operationId: randomUUID(), qualificationId: medical, file: pdf("Orzeczenie lekarskie"), fileName: "orzeczenie.pdf" });
    await expect(
      z.nowak.addQualificationDocument({ operationId: randomUUID(), qualificationId: heights, file: pdf("Orzeczenie"), fileName: "wysokosc.pdf" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      z.nowak.completeQualification({
        operationId: randomUUID(),
        qualificationId: medical,
        doneOn: "2026-03-02",
        document: { file: pdf("Orzeczenie"), fileName: "nowe.pdf" },
      }),
    ).rejects.toMatchObject({ code: "forbidden" });

    expect((await z.owner.personQualifications(z.zielinski))?.qualifications[0]).toMatchObject({ id: medical, documents: [{ id: documentId }] });
    for (const registry of [z.nowak, z.worker]) {
      expect((await registry.personQualifications(z.zielinski))?.qualifications).toEqual([
        expect.objectContaining({ id: medical, kind: "badania_lekarskie", dueOn: "2026-02-20", status: "po_terminie", note: null, documents: [] }),
        expect.objectContaining({ id: heights, kind: "badania_wysokosc", dueOn: "2026-08-31", status: "pozniej", documents: [] }),
      ]);
      expect(await registry.qualificationDocument(documentId)).toBeNull();
    }
    // Z pominięciem Rejestru kierownik też nie odczyta ani nie dopisze dokumentu badań.
    expect(await withActor(testbed.db, z.nowakId, (sql) => sql("select id from app.qualification_documents"))).toEqual([]);
    await expect(
      withActor(testbed.db, z.nowakId, (sql) =>
        sql(
          `insert into app.qualification_documents (company_id, qualification_id, file_path, file_name, content_type, uploaded_by, uploaded_at, client_operation_id)
           values ($1, $2, 'x/y.pdf', 'y.pdf', 'application/pdf', $3, now(), $4)`,
          [z.zawbud.companyId, heights, z.nowakId, randomUUID()],
        ),
      ),
    ).rejects.toThrow();
  });

  it("dokument usuwa tylko właściciel; plik znika z kubełka", async () => {
    const z = await givenZawbud();
    const { qualificationId } = await z.owner.addQualification({ personId: z.kaczmarek, kind: "pierwsza_pomoc", dueOn: "2027-01-01" });
    const { documentId } = await z.nowak.addQualificationDocument({ operationId: randomUUID(), qualificationId, file: pdf(), fileName: "kpp.pdf" });

    await expect(z.nowak.deleteQualificationDocument(documentId)).rejects.toMatchObject({ code: "forbidden" });
    await z.owner.deleteQualificationDocument(documentId);

    expect((await z.owner.personQualifications(z.kaczmarek))?.qualifications[0].documents).toEqual([]);
    expect(testbed.documents.photos.size).toBe(0);
  });

  it("ponowne wysłanie tego samego dokumentu go nie dubluje; plik, który nie jest PDF ani zdjęciem, odpada", async () => {
    const z = await givenZawbud();
    const { qualificationId } = await z.owner.addQualification({ personId: z.kaczmarek, kind: "pierwsza_pomoc", dueOn: "2027-01-01" });
    const operationId = randomUUID();

    const first = await z.owner.addQualificationDocument({ operationId, qualificationId, file: pdf(), fileName: "kpp.pdf" });
    const again = await z.owner.addQualificationDocument({ operationId, qualificationId, file: pdf(), fileName: "kpp.pdf" });

    expect(again).toEqual(first);
    await expect(
      z.owner.addQualificationDocument({ operationId: randomUUID(), qualificationId, file: new Blob(["tekst"]), fileName: "a.txt" }),
    ).rejects.toMatchObject({ code: "document_invalid" });
    expect((await z.owner.personQualifications(z.kaczmarek))?.qualifications[0].documents).toHaveLength(1);
    expect(testbed.documents.photos.size).toBe(1);
  });
});

describe("wykonanie uprawnienia", () => {
  it("wykonanie z cyklem przesuwa ważność o cykl od dnia wykonania; ponowne wysłanie niczego nie zmienia", async () => {
    const z = await givenZawbud();
    const { qualificationId } = await z.owner.addQualification({ personId: z.kaczmarek, kind: "szkolenie_bhp", dueOn: "2026-03-10", cycleMonths: 12 });
    const operationId = randomUUID();

    const done = await z.nowak.completeQualification({ operationId, qualificationId, doneOn: "2026-03-02", document: { file: pdf(), fileName: "bhp.pdf" } });
    await z.owner.updateQualification(qualificationId, { note: "Nowy ośrodek" });
    const again = await z.nowak.completeQualification({ operationId, qualificationId, doneOn: "2026-03-02", document: { file: pdf(), fileName: "bhp.pdf" } });

    expect(done).toEqual({ dueOn: "2027-03-02" });
    expect(again).toEqual({ dueOn: "2027-03-02" });
    expect((await z.owner.personQualifications(z.kaczmarek))?.qualifications).toEqual([
      expect.objectContaining({ dueOn: "2027-03-02", lastDoneOn: "2026-03-02", status: "pozniej", note: "Nowy ośrodek", documents: [expect.objectContaining({ fileName: "bhp.pdf" })] }),
    ]);
  });

  it("bez cyklu trzeba podać nową datę ważności, późniejszą niż wykonanie; wykonania z przyszłości nie ma", async () => {
    const z = await givenZawbud();
    const { qualificationId } = await z.owner.addQualification({ personId: z.kaczmarek, kind: "udt", detail: "wózki widłowe", dueOn: "2026-03-10" });
    const complete = (input: { doneOn: string; nextDueOn?: string | null }) =>
      z.owner.completeQualification({ operationId: randomUUID(), qualificationId, ...input });

    await expect(complete({ doneOn: "2026-03-01" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(complete({ doneOn: "2026-03-03", nextDueOn: "2031-03-03" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(complete({ doneOn: "2026-03-01", nextDueOn: "2026-03-01" })).rejects.toMatchObject({ code: "invalid_input" });

    expect(await complete({ doneOn: "2026-03-01", nextDueOn: "2031-02-28" })).toEqual({ dueOn: "2031-02-28" });
  });
});

describe("przypomnienia o uprawnieniach", () => {
  it("30 dni przed końcem ważności (w Polsce) właściciel dostaje zbiorcze, a osoba z kontem o własnym; kierownik nic, raz", async () => {
    const z = await givenZawbud();
    await z.owner.addQualification({ personId: z.zielinski, kind: "badania_lekarskie", dueOn: "2026-04-05", cycleMonths: 24 });
    await z.owner.addQualification({ personId: z.kaczmarek, kind: "szkolenie_bhp", dueOn: "2026-04-05" });

    // 5 marca, 23:30 w Polsce: do końca ważności jeszcze 31 dni.
    testbed.clock.set("2026-03-05T22:30:00Z");
    expect(await testbed.registry.system().notifyDueQualifications()).toEqual({ qualifications: 0 });
    // 6 marca, 0:30 w Polsce, choć w UTC to jeszcze 5 marca: zostało 30 dni.
    testbed.clock.set("2026-03-05T23:30:00Z");
    expect(await testbed.registry.system().notifyDueQualifications()).toEqual({ qualifications: 2 });

    expect(await bellOf(z.ownerId)).toEqual([
      {
        kind: "uprawnienia",
        qualifications: [
          {
            id: expect.any(String),
            kind: "badania_lekarskie",
            customKind: null,
            detail: null,
            dueOn: "2026-04-05",
            overdue: false,
            person: { id: z.zielinski, fullName: "Marek Zieliński" },
          },
          expect.objectContaining({ kind: "szkolenie_bhp", person: { id: z.kaczmarek, fullName: "Zbigniew Kaczmarek" } }),
        ],
      },
    ]);
    expect(await remindersOf(z.workerId)).toEqual([[["badania_lekarskie", "Marek Zieliński", "2026-04-05", false]]]);
    expect(await bellOf(z.nowakId)).toEqual([]);
    expect(await bellOf(z.storekeeperId)).toEqual([]);
    expect(testbed.notifier.sent).toEqual([]);

    expect(await testbed.registry.system().notifyDueQualifications()).toEqual({ qualifications: 0 });
    testbed.clock.set("2026-03-20T05:00:00Z");
    expect(await testbed.registry.system().notifyDueQualifications()).toEqual({ qualifications: 0 });
    expect(await bellOf(z.ownerId)).toHaveLength(1);
  });

  it("po końcu ważności przypomnienie przychodzi raz; kierownik dostaje tylko o własnym uprawnieniu, a właściciel o swoim w zbiorczym", async () => {
    const z = await givenZawbud();
    await z.owner.addQualification({ personId: z.nowakPerson, kind: "prawo_jazdy", detail: "C", dueOn: "2026-03-10" });
    await z.owner.addQualification({ personId: z.ownerPerson, kind: "pierwsza_pomoc", dueOn: "2026-03-10" });

    expect(await testbed.registry.system().notifyDueQualifications()).toEqual({ qualifications: 2 });
    // W dniu końca ważności jeszcze nie „po terminie”.
    testbed.clock.set("2026-03-10T22:30:00Z");
    expect(await testbed.registry.system().notifyDueQualifications()).toEqual({ qualifications: 0 });
    testbed.clock.set("2026-03-10T23:30:00Z");
    expect(await testbed.registry.system().notifyDueQualifications()).toEqual({ qualifications: 2 });
    testbed.clock.set("2026-04-20T05:00:00Z");
    expect(await testbed.registry.system().notifyDueQualifications()).toEqual({ qualifications: 0 });

    expect(await remindersOf(z.ownerId)).toEqual([
      [
        ["prawo_jazdy", "Adam Nowak", "2026-03-10", true],
        ["pierwsza_pomoc", "Właściciel Zawbud", "2026-03-10", true],
      ],
      [
        ["prawo_jazdy", "Adam Nowak", "2026-03-10", false],
        ["pierwsza_pomoc", "Właściciel Zawbud", "2026-03-10", false],
      ],
    ]);
    expect(await remindersOf(z.nowakId)).toEqual([[["prawo_jazdy", "Adam Nowak", "2026-03-10", true]], [["prawo_jazdy", "Adam Nowak", "2026-03-10", false]]]);
  });

  it("osoba, która odeszła, nie ma przypomnień; wykonane z cyklem przypomina się znowu przed nową datą, a każda firma dostaje swoje", async () => {
    const z = await givenZawbud();
    const { personId: wrobel } = await z.owner.addPerson({ fullName: "Tadeusz Wróbel", note: null });
    await z.owner.addQualification({ personId: wrobel, kind: "szkolenie_bhp", dueOn: "2026-03-10" });
    await z.owner.deactivatePerson(wrobel);
    const { qualificationId } = await z.owner.addQualification({ personId: z.kaczmarek, kind: "szkolenie_bhp", dueOn: "2026-03-05", cycleMonths: 2 });
    const budrex = await testbed.givenActiveCompany("Budrex");
    const budrexOwner = testbed.registry.as(budrex.ownerId);
    const { personId: budrexPerson } = await budrexOwner.addPerson({ fullName: "Ola Budrex", note: null });
    await budrexOwner.addQualification({ personId: budrexPerson, kind: "pierwsza_pomoc", dueOn: "2026-03-08" });

    expect(await testbed.registry.system().notifyDueQualifications()).toEqual({ qualifications: 2 });
    await z.owner.completeQualification({ operationId: randomUUID(), qualificationId, doneOn: "2026-03-02" });
    // Nowa data BHP to 2 maja, więc 2 kwietnia zostaje 30 dni; Budrex jest już po terminie.
    testbed.clock.set("2026-04-02T06:00:00Z");
    expect(await testbed.registry.system().notifyDueQualifications()).toEqual({ qualifications: 2 });

    expect(await remindersOf(z.ownerId)).toEqual([
      [["szkolenie_bhp", "Zbigniew Kaczmarek", "2026-05-02", false]],
      [["szkolenie_bhp", "Zbigniew Kaczmarek", "2026-03-05", false]],
    ]);
    expect(await remindersOf(budrex.ownerId)).toEqual([[["pierwsza_pomoc", "Ola Budrex", "2026-03-08", true]], [["pierwsza_pomoc", "Ola Budrex", "2026-03-08", false]]]);
  });

  it("przypomnienia dla jednej firmy (scenariusz demo) nie dotykają innych", async () => {
    const z = await givenZawbud();
    await z.owner.addQualification({ personId: z.kaczmarek, kind: "szkolenie_bhp", dueOn: "2026-03-10" });
    const budrex = await testbed.givenActiveCompany("Budrex");
    const budrexOwner = testbed.registry.as(budrex.ownerId);
    const { personId } = await budrexOwner.addPerson({ fullName: "Ola Budrex", note: null });
    await budrexOwner.addQualification({ personId, kind: "pierwsza_pomoc", dueOn: "2026-03-08" });

    expect(await testbed.registry.system().notifyCompanyDueQualifications(z.zawbud.companyId)).toEqual({ qualifications: 1 });

    expect(await bellOf(budrex.ownerId)).toEqual([]);
  });
});

describe("uprawnienia po terminie i wkrótce", () => {
  it("lista Ludzie i raport tygodniowy mają uprawnienia z najbliższych 30 dni i po terminie, bez osób, które odeszły", async () => {
    const z = await givenZawbud();
    await z.owner.addQualification({ personId: z.zielinski, kind: "badania_lekarskie", dueOn: "2026-02-20" });
    await z.owner.addQualification({ personId: z.kaczmarek, kind: "szkolenie_bhp", dueOn: "2026-04-01", cycleMonths: 12 });
    await z.owner.addQualification({ personId: z.kaczmarek, kind: "pierwsza_pomoc", dueOn: "2026-04-02" });
    const { personId: wrobel } = await z.owner.addPerson({ fullName: "Tadeusz Wróbel", note: null });
    await z.owner.addQualification({ personId: wrobel, kind: "szkolenie_bhp", dueOn: "2026-03-05" });
    await z.owner.deactivatePerson(wrobel);

    const expected = [
      {
        id: expect.any(String),
        kind: "badania_lekarskie",
        customKind: null,
        detail: null,
        dueOn: "2026-02-20",
        daysLeft: -10,
        overdue: true,
        person: { id: z.zielinski, fullName: "Marek Zieliński" },
      },
      expect.objectContaining({ kind: "szkolenie_bhp", dueOn: "2026-04-01", daysLeft: 30, overdue: false, person: { id: z.kaczmarek, fullName: "Zbigniew Kaczmarek" } }),
    ];
    expect(await z.owner.upcomingQualifications()).toEqual(expected);
    expect(await z.nowak.upcomingQualifications()).toEqual(expected);
    expect(await z.worker.upcomingQualifications()).toEqual([expected[0]]);
    expect(await z.storekeeper.upcomingQualifications()).toEqual([]);
    expect((await z.owner.weeklyReport()).qualifications).toEqual(expected);

    // Poniedziałek 7:00: raport w dzwonku ma te same uprawnienia.
    await testbed.registry.system().sendDueReports();
    const [entry] = (await testbed.registry.as(z.ownerId).bell()).entries;
    expect(entry.notification).toMatchObject({ kind: "raport_tygodniowy", report: { qualifications: expected } });
  });
});

describe("tryb tylko do odczytu i izolacja firm", () => {
  it("w trybie tylko do odczytu uprawnienia i dokumenty widać, ale niczego nie da się wpisać, zmienić, wykonać ani usunąć", async () => {
    const z = await givenZawbud();
    const { qualificationId } = await z.owner.addQualification({ personId: z.kaczmarek, kind: "szkolenie_bhp", dueOn: "2026-03-20", cycleMonths: 12 });
    const { documentId } = await z.owner.addQualificationDocument({ operationId: randomUUID(), qualificationId, file: pdf(), fileName: "bhp.pdf" });
    await testbed.registry.superAdmin(await testbed.givenSuperAdmin()).setManualReadOnly(z.zawbud.companyId, true);
    const before = await z.owner.personQualifications(z.kaczmarek);

    const commands: [string, () => Promise<unknown>][] = [
      ["addQualification", () => z.owner.addQualification({ personId: z.kaczmarek, kind: "pierwsza_pomoc", dueOn: "2027-01-01" })],
      ["addQualificationKind", () => z.owner.addQualificationKind({ name: "Operator koparki" })],
      ["updateQualification", () => z.nowak.updateQualification(qualificationId, { dueOn: "2027-01-01" })],
      ["completeQualification", () => z.nowak.completeQualification({ operationId: randomUUID(), qualificationId, doneOn: "2026-03-02" })],
      ["addQualificationDocument", () => z.nowak.addQualificationDocument({ operationId: randomUUID(), qualificationId, file: pdf(), fileName: "a.pdf" })],
      ["deleteQualificationDocument", () => z.owner.deleteQualificationDocument(documentId)],
      ["deleteQualification", () => z.owner.deleteQualification(qualificationId)],
    ];
    for (const [name, command] of commands) {
      await expect(command(), name).rejects.toMatchObject({ code: "read_only" });
    }

    expect(await z.owner.personQualifications(z.kaczmarek)).toEqual(before);
    expect(await z.nowak.qualificationDocument(documentId)).toMatchObject({ fileName: "bhp.pdf" });
    expect(await z.nowak.upcomingQualifications()).toEqual([expect.objectContaining({ id: qualificationId })]);
  });

  it("inna firma nie widzi uprawnień, rodzajów ani dokumentów i niczego w nich nie zmieni", async () => {
    const z = await givenZawbud();
    const { qualificationId } = await z.owner.addQualification({ personId: z.kaczmarek, kind: "szkolenie_bhp", dueOn: "2026-03-20" });
    const { documentId } = await z.owner.addQualificationDocument({ operationId: randomUUID(), qualificationId, file: pdf(), fileName: "bhp.pdf" });
    await z.owner.addQualificationKind({ name: "Operator koparki" });
    const stranger = testbed.registry.as((await testbed.givenActiveCompany("Budrex")).ownerId);

    expect(await stranger.personQualifications(z.kaczmarek)).toBeNull();
    expect(await stranger.upcomingQualifications()).toEqual([]);
    expect(await stranger.qualificationKinds()).toEqual([]);
    expect(await stranger.qualificationDocument(documentId)).toBeNull();
    await expect(stranger.addQualification({ personId: z.kaczmarek, kind: "pierwsza_pomoc", dueOn: "2027-01-01" })).rejects.toMatchObject({ code: "not_found" });
    await expect(stranger.updateQualification(qualificationId, { dueOn: "2027-01-01" })).rejects.toMatchObject({ code: "not_found" });
    await expect(stranger.completeQualification({ operationId: randomUUID(), qualificationId, doneOn: "2026-03-02" })).rejects.toMatchObject({ code: "not_found" });
    await expect(stranger.addQualificationDocument({ operationId: randomUUID(), qualificationId, file: pdf(), fileName: "a.pdf" })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(stranger.deleteQualificationDocument(documentId)).rejects.toMatchObject({ code: "not_found" });
    await expect(stranger.deleteQualification(qualificationId)).rejects.toMatchObject({ code: "not_found" });

    expect((await z.owner.personQualifications(z.kaczmarek))?.qualifications).toEqual([
      expect.objectContaining({ id: qualificationId, dueOn: "2026-03-20", documents: [expect.objectContaining({ id: documentId })] }),
    ]);
  });
});
