import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withActor } from "./registry";
import { type GivenCompany, setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();
const DAY = 24 * 60 * 60 * 1000;

async function givenCategory(company: GivenCompany, name: string, prefix: string) {
  return testbed.registry.as(company.ownerId).addCategory({ name, prefix });
}

describe("dodawanie narzędzia", () => {
  it("nowe narzędzie ląduje na bazie z ruchem „przyjęcie” autorstwa dodającego", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Swarzędz" });
    const hammers = await givenCategory(zawbud, "Młoty", "H");
    const owner = testbed.registry.as(zawbud.ownerId);

    const { toolId } = await owner.addTool({
      operationId: randomUUID(),
      code: "H-03",
      name: "Młot udarowy",
      categoryId: hammers.id,
      brand: "Hilti",
      model: "TE 30",
      serialNumber: "SN-123",
      value: 3200,
      purchaseDate: "2025-04-15",
    });
    testbed.clock.advance(3 * DAY);

    const { base } = await owner.whereIsWhat();
    expect(base.tools).toEqual([
      { id: toolId, code: "H-03", name: "Młot udarowy", registration: "zaakceptowane", daysInPlace: 3 },
    ]);
    expect(await owner.toolCard(toolId)).toEqual({
      id: toolId,
      code: "H-03",
      name: "Młot udarowy",
      category: { id: hammers.id, name: "Młoty", prefix: "H" },
      brand: "Hilti",
      model: "TE 30",
      serialNumber: "SN-123",
      value: 3200,
      purchaseDate: "2025-04-15",
      photoUrl: null,
      alarmThresholdDays: null,
      companyAlarmThresholdDays: 30,
      state: "w_obiegu",
      registration: "zaakceptowane",
      location: { id: base.id, name: "Magazyn Swarzędz", kind: "baza" },
      daysInPlace: 3,
      history: [
        {
          kind: "przyjecie",
          source: "panel",
          occurredAt: new Date(testbed.clock.now().getTime() - 3 * DAY),
          author: "Właściciel Zawbud",
          from: null,
          to: "Magazyn Swarzędz",
        },
      ],
    });
  });
});

describe("podpowiedź kodu", () => {
  it("system podpowiada kolejny wolny numer w kategorii, a pusty kod zastępuje podpowiedzią", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const hammers = await givenCategory(zawbud, "Młoty", "H");
    const grinders = await givenCategory(zawbud, "Szlifierki", "S");
    const owner = testbed.registry.as(zawbud.ownerId);
    const add = (categoryId: string, code?: string) =>
      owner.addTool({ operationId: randomUUID(), name: "Narzędzie", categoryId, code });

    expect(await owner.suggestCode(grinders.id)).toBe("S-01");
    await add(hammers.id, "H-01");
    await add(hammers.id, "H-04");
    expect(await owner.suggestCode(hammers.id)).toBe("H-05");

    expect(await add(grinders.id)).toMatchObject({ code: "S-01" });
    expect(await add(grinders.id, "  ")).toMatchObject({ code: "S-02" });
    expect(await owner.suggestCode(grinders.id)).toBe("S-03");
  });

  it("numer rośnie ponad dwie cyfry, a kody innego kształtu nie przeszkadzają", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const hammers = await givenCategory(zawbud, "Młoty", "H");
    const owner = testbed.registry.as(zawbud.ownerId);
    await owner.addTool({ operationId: randomUUID(), name: "Młot", categoryId: hammers.id, code: "H-99" });
    await owner.addTool({ operationId: randomUUID(), name: "Młot", categoryId: hammers.id, code: "HILTI-1" });

    expect(await owner.suggestCode(hammers.id)).toBe("H-100");
  });
});

describe("unikalność kodu", () => {
  it("powtórzony kod w firmie jest odrzucany i nic się nie zapisuje, a inna firma może mieć ten sam kod", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const budrex = await testbed.givenActiveCompany("Budrex");
    const zawbudHammers = await givenCategory(zawbud, "Młoty", "H");
    const budrexHammers = await givenCategory(budrex, "Młoty", "H");
    const owner = testbed.registry.as(zawbud.ownerId);
    await owner.addTool({ operationId: randomUUID(), name: "Młot Hilti", categoryId: zawbudHammers.id, code: "H-03" });

    await expect(
      owner.addTool({ operationId: randomUUID(), name: "Młot Bosch", categoryId: zawbudHammers.id, code: " h-03 " }),
    ).rejects.toMatchObject({ code: "code_taken" });
    await expect(
      testbed.registry
        .as(budrex.ownerId)
        .addTool({ operationId: randomUUID(), name: "Młot Makita", categoryId: budrexHammers.id, code: "H-03" }),
    ).resolves.toMatchObject({ code: "H-03" });

    expect((await owner.whereIsWhat()).base.tools.map((tool) => tool.name)).toEqual(["Młot Hilti"]);
  });
});

describe("kategorie", () => {
  it("nazwa i prefiks kategorii są unikalne w firmie, a prefiks to 1–4 litery", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(zawbud.ownerId);
    await owner.addCategory({ name: "Szlifierki", prefix: "s" });

    await expect(owner.addCategory({ name: "szlifierki ", prefix: "SZ" })).rejects.toMatchObject({ code: "category_taken" });
    await expect(owner.addCategory({ name: "Sprężarki", prefix: "S" })).rejects.toMatchObject({ code: "prefix_taken" });
    await expect(owner.addCategory({ name: "Wiertarki", prefix: "W-1" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(owner.addCategory({ name: " ", prefix: "X" })).rejects.toMatchObject({ code: "invalid_input" });

    expect(await owner.categories()).toEqual([{ id: expect.any(String), name: "Szlifierki", prefix: "S" }]);
  });
});

describe("dane karty narzędzia", () => {
  it("odrzuca brak nazwy, zły kod, ujemną wartość, nieistniejącą datę, zerowy próg i obcą kategorię", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const budrex = await testbed.givenActiveCompany("Budrex");
    const hammers = await givenCategory(zawbud, "Młoty", "H");
    const foreignCategory = await givenCategory(budrex, "Wiertarki", "W");
    const owner = testbed.registry.as(zawbud.ownerId);
    const valid = { name: "Młot", categoryId: hammers.id };

    for (const invalid of [
      { name: "  " },
      { code: "H 03" },
      { code: "H_03" },
      { value: -1 },
      { value: Number.NaN },
      { purchaseDate: "2025-02-30" },
      { purchaseDate: "15.04.2025" },
      { alarmThresholdDays: 0 },
      { alarmThresholdDays: 2.5 },
      { categoryId: foreignCategory.id },
    ]) {
      await expect(owner.addTool({ operationId: randomUUID(), ...valid, ...invalid }), JSON.stringify(invalid)).rejects.toMatchObject({
        code: "invalid_input",
      });
    }

    expect((await owner.whereIsWhat()).base.tools).toEqual([]);
  });
});

describe("uprawnienia", () => {
  it("magazynier dodaje narzędzie bez wartości i nie widzi wartości, którą wpisał właściciel", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const hammers = await givenCategory(zawbud, "Młoty", "H");
    const storekeeperId = await testbed.givenMember(zawbud, "magazynier", "Piotr Magazynier");
    const storekeeper = testbed.registry.as(storekeeperId);
    const owner = testbed.registry.as(zawbud.ownerId);

    const own = await storekeeper.addTool({ operationId: randomUUID(), name: "Młot Bosch", categoryId: hammers.id });
    const valued = await owner.addTool({ operationId: randomUUID(), name: "Młot Hilti", categoryId: hammers.id, value: 3217.5 });

    expect(await storekeeper.toolCard(own.toolId)).toMatchObject({ code: "H-01", history: [{ author: "Piotr Magazynier" }] });
    expect(await storekeeper.toolCard(valued.toolId)).not.toHaveProperty("value");
    expect(await owner.toolCard(own.toolId)).toMatchObject({ value: null });
    expect(await owner.toolCard(valued.toolId)).toMatchObject({ value: 3217.5 });
  });

  it("magazynier nie może ustawić wartości ani progu dni, nawet wysyłając je z pominięciem formularza", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const hammers = await givenCategory(zawbud, "Młoty", "H");
    const storekeeper = testbed.registry.as(await testbed.givenMember(zawbud, "magazynier"));
    const tool = { operationId: randomUUID(), name: "Młot", categoryId: hammers.id };

    await expect(storekeeper.addTool({ ...tool, value: 100 })).rejects.toMatchObject({ code: "forbidden" });
    await expect(storekeeper.addTool({ ...tool, value: null })).rejects.toMatchObject({ code: "forbidden" });
    await expect(storekeeper.addTool({ ...tool, alarmThresholdDays: 60 })).rejects.toMatchObject({ code: "forbidden" });

    expect((await storekeeper.whereIsWhat()).base.tools).toEqual([]);
  });

  it("połączenie z bazą jako magazynier nie zwraca wartości narzędzia z żadnej tabeli", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const hammers = await givenCategory(zawbud, "Młoty", "H");
    const storekeeperId = await testbed.givenMember(zawbud, "magazynier");
    await testbed.registry
      .as(zawbud.ownerId)
      .addTool({ operationId: randomUUID(), name: "Młot", categoryId: hammers.id, value: 987654.32 });

    const visible = await withActor(testbed.db, storekeeperId, async (sql) => {
      const tables = await sql<{ name: string }>(
        `select format('%I.%I', schemaname, tablename) as name from pg_tables
         where schemaname = 'app' and has_table_privilege('authenticated', format('%I.%I', schemaname, tablename), 'select')`,
      );
      const dump: Record<string, unknown[]> = {};
      for (const { name } of tables) dump[name] = await sql(`select * from ${name}`);
      return JSON.stringify(dump);
    });

    expect(visible).toContain("H-01");
    expect(visible).not.toContain("987654");
  });

  it("kierownik widzi kartę narzędzia bez wartości, ale nie dodaje narzędzi ani kategorii", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const hammers = await givenCategory(zawbud, "Młoty", "H");
    const manager = testbed.registry.as(await testbed.givenMember(zawbud, "kierownik"));
    const { toolId } = await testbed.registry
      .as(zawbud.ownerId)
      .addTool({ operationId: randomUUID(), name: "Młot", categoryId: hammers.id, value: 3200 });

    await expect(manager.addTool({ operationId: randomUUID(), name: "Wkrętarka", categoryId: hammers.id })).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(manager.addCategory({ name: "Wkrętarki", prefix: "W" })).rejects.toMatchObject({ code: "forbidden" });

    const card = await manager.toolCard(toolId);
    expect(card).toMatchObject({ code: "H-01", name: "Młot" });
    expect(card).not.toHaveProperty("value");
  });
});

describe("izolacja firm", () => {
  it("firma B nie widzi narzędzi, kart ani kategorii firmy A, także po odgadnięciu identyfikatora", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const budrex = await testbed.givenActiveCompany("Budrex");
    const hammers = await givenCategory(zawbud, "Młoty", "H");
    const { toolId } = await testbed.registry
      .as(zawbud.ownerId)
      .addTool({ operationId: randomUUID(), name: "Młot", categoryId: hammers.id });
    const budrexOwner = testbed.registry.as(budrex.ownerId);

    expect((await budrexOwner.whereIsWhat()).base.tools).toEqual([]);
    expect(await budrexOwner.categories()).toEqual([]);
    expect(await budrexOwner.toolCard(toolId)).toBeNull();
    expect(await budrexOwner.toolCard("to-nie-jest-identyfikator")).toBeNull();
    await expect(budrexOwner.suggestCode(hammers.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(budrexOwner.suggestCode("to-nie-jest-identyfikator")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("idempotencja", () => {
  it("ponowne wysłanie dodania z tym samym identyfikatorem operacji zwraca pierwotny wynik bez duplikatu", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const hammers = await givenCategory(zawbud, "Młoty", "H");
    const owner = testbed.registry.as(zawbud.ownerId);
    const operationId = randomUUID();

    const first = await owner.addTool({ operationId, name: "Młot", categoryId: hammers.id });
    const again = await owner.addTool({ operationId, name: "Młot", categoryId: hammers.id });

    expect(again).toEqual(first);
    expect((await owner.whereIsWhat()).base.tools).toHaveLength(1);
  });

  it("dwa równoczesne wysłania tej samej operacji dają jeden wynik i jedno narzędzie", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const hammers = await givenCategory(zawbud, "Młoty", "H");
    const owner = testbed.registry.as(zawbud.ownerId);
    const input = { operationId: randomUUID(), name: "Młot", categoryId: hammers.id };

    const [first, second] = await Promise.all([owner.addTool(input), owner.addTool(input)]);

    expect(second).toEqual(first);
    expect((await owner.whereIsWhat()).base.tools).toHaveLength(1);
  });
});

describe("zdjęcie narzędzia", () => {
  const jpeg = (size = 3) => ({ bytes: new Uint8Array(size).fill(7), contentType: "image/jpeg" });

  it("zdjęcie dodane z narzędziem jest dostępne z karty narzędzia", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const hammers = await givenCategory(zawbud, "Młoty", "H");
    const owner = testbed.registry.as(zawbud.ownerId);
    const photo = jpeg();

    const { toolId } = await owner.addTool({ operationId: randomUUID(), name: "Młot", categoryId: hammers.id, photo });

    const { photoUrl } = (await owner.toolCard(toolId))!;
    expect(testbed.photos.photoAt(photoUrl!)).toEqual(photo);
  });

  it("odrzuca plik, który nie jest zdjęciem JPEG, PNG lub WebP albo ma ponad 3 MB, i nic nie zapisuje", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const hammers = await givenCategory(zawbud, "Młoty", "H");
    const owner = testbed.registry.as(zawbud.ownerId);
    const tool = { name: "Młot", categoryId: hammers.id };

    for (const photo of [{ bytes: new Uint8Array(3), contentType: "application/pdf" }, jpeg(3 * 1024 * 1024 + 1), jpeg(0)]) {
      await expect(owner.addTool({ operationId: randomUUID(), ...tool, photo })).rejects.toMatchObject({ code: "invalid_photo" });
    }

    expect(testbed.photos.paths()).toEqual([]);
    expect((await owner.whereIsWhat()).base.tools).toEqual([]);
  });

  it("gdy narzędzia nie da się zapisać, przesłane zdjęcie nie zostaje w magazynie", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const hammers = await givenCategory(zawbud, "Młoty", "H");
    const owner = testbed.registry.as(zawbud.ownerId);
    await owner.addTool({ operationId: randomUUID(), name: "Młot", categoryId: hammers.id, code: "H-01" });

    await expect(
      owner.addTool({ operationId: randomUUID(), name: "Młot", categoryId: hammers.id, code: "H-01", photo: jpeg() }),
    ).rejects.toMatchObject({ code: "code_taken" });

    expect(testbed.photos.paths()).toEqual([]);
  });
});

describe("edycja karty narzędzia", () => {
  it("właściciel poprawia dane, wartość i próg dni, a lokalizacja i historia zostają bez zmian", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const hammers = await givenCategory(zawbud, "Młoty", "H");
    const generators = await givenCategory(zawbud, "Agregaty", "A");
    const owner = testbed.registry.as(zawbud.ownerId);
    const { toolId } = await owner.addTool({ operationId: randomUUID(), name: "Agregt", categoryId: hammers.id, brand: "Honda", value: 100 });
    const before = (await owner.toolCard(toolId))!;

    await owner.editTool(toolId, {
      code: "a-07",
      name: "Agregat prądotwórczy",
      categoryId: generators.id,
      brand: " ",
      model: "EU 22i",
      serialNumber: "X1",
      value: 5400,
      purchaseDate: "2024-06-01",
      alarmThresholdDays: 60,
    });

    expect(await owner.toolCard(toolId)).toEqual({
      ...before,
      code: "A-07",
      name: "Agregat prądotwórczy",
      category: generators,
      brand: null,
      model: "EU 22i",
      serialNumber: "X1",
      value: 5400,
      purchaseDate: "2024-06-01",
      alarmThresholdDays: 60,
    });

    await owner.editTool(toolId, { value: null, alarmThresholdDays: null });
    expect(await owner.toolCard(toolId)).toMatchObject({ value: null, alarmThresholdDays: null, companyAlarmThresholdDays: 30 });
  });

  it("magazynier edytuje dane karty, ale nie wartość ani próg, a wartość wpisana przez właściciela zostaje", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const hammers = await givenCategory(zawbud, "Młoty", "H");
    const owner = testbed.registry.as(zawbud.ownerId);
    const storekeeper = testbed.registry.as(await testbed.givenMember(zawbud, "magazynier"));
    const { toolId } = await owner.addTool({ operationId: randomUUID(), name: "Młot", categoryId: hammers.id, value: 3200 });

    await storekeeper.editTool(toolId, { name: "Młot udarowy", serialNumber: "SN-9" });
    await expect(storekeeper.editTool(toolId, { value: 1 })).rejects.toMatchObject({ code: "forbidden" });
    await expect(storekeeper.editTool(toolId, { alarmThresholdDays: 90 })).rejects.toMatchObject({ code: "forbidden" });

    expect(await owner.toolCard(toolId)).toMatchObject({ name: "Młot udarowy", serialNumber: "SN-9", value: 3200, alarmThresholdDays: null });
  });

  it("odmawia zajętego kodu, kierownikowi i narzędziu innej firmy", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const budrex = await testbed.givenActiveCompany("Budrex");
    const hammers = await givenCategory(zawbud, "Młoty", "H");
    const owner = testbed.registry.as(zawbud.ownerId);
    await owner.addTool({ operationId: randomUUID(), name: "Młot", categoryId: hammers.id, code: "H-01" });
    const { toolId } = await owner.addTool({ operationId: randomUUID(), name: "Młot", categoryId: hammers.id, code: "H-02" });
    const manager = testbed.registry.as(await testbed.givenMember(zawbud, "kierownik"));

    await expect(owner.editTool(toolId, { code: "H-01" })).rejects.toMatchObject({ code: "code_taken" });
    await expect(owner.editTool(toolId, { code: "" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(manager.editTool(toolId, { name: "Mój młot" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(testbed.registry.as(budrex.ownerId).editTool(toolId, { name: "Nasz młot" })).rejects.toMatchObject({
      code: "not_found",
    });

    expect(await owner.toolCard(toolId)).toMatchObject({ code: "H-02", name: "Młot" });
  });

  it("nowe zdjęcie zastępuje stare, które znika z magazynu, a zdjęcie można też usunąć", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const hammers = await givenCategory(zawbud, "Młoty", "H");
    const owner = testbed.registry.as(zawbud.ownerId);
    const first = { bytes: new Uint8Array([1]), contentType: "image/jpeg" };
    const second = { bytes: new Uint8Array([2]), contentType: "image/png" };
    const { toolId } = await owner.addTool({ operationId: randomUUID(), name: "Młot", categoryId: hammers.id, photo: first });

    await owner.editTool(toolId, { photo: second });
    const { photoUrl } = (await owner.toolCard(toolId))!;
    expect(testbed.photos.photoAt(photoUrl!)).toEqual(second);
    expect(testbed.photos.paths()).toHaveLength(1);

    await owner.editTool(toolId, { photo: null });
    expect(await owner.toolCard(toolId)).toMatchObject({ photoUrl: null });
    expect(testbed.photos.paths()).toEqual([]);
  });
});

describe("historia ruchów", () => {
  it("tylko się dopisuje: ruchu nie da się zmienić ani usunąć nawet z pominięciem Rejestru", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    const hammers = await givenCategory(zawbud, "Młoty", "H");
    const owner = testbed.registry.as(zawbud.ownerId);
    const { toolId } = await owner.addTool({ operationId: randomUUID(), name: "Młot", categoryId: hammers.id });

    for (const statement of [
      "update app.movements set occurred_at = occurred_at - interval '1 day'",
      "delete from app.movement_tools",
      "delete from app.movements",
    ]) {
      await expect(testbed.db.transaction((sql) => sql(statement)), statement).rejects.toThrow(/tylko się dopisuje/);
      await expect(withActor(testbed.db, zawbud.ownerId, (sql) => sql(statement)), statement).rejects.toThrow();
    }

    expect((await owner.toolCard(toolId))!.history).toHaveLength(1);
  });
});
