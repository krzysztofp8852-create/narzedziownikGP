import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withActor } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();

describe("izolacja firm", () => {
  it("właściciel firmy A widzi na tablicy i w nagłówku swoją firmę, a nie firmę B", async () => {
    const a = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Swarzędz" });
    await testbed.givenActiveCompany("Budrex", { baseName: "Magazyn Rataje" });

    expect(await testbed.registry.as(a.ownerId).whereIsWhat()).toMatchObject({ base: { name: "Magazyn Swarzędz" } });
    expect(await testbed.registry.as(a.ownerId).session()).toMatchObject({ company: { id: a.companyId, name: "Zawbud" } });
  });

  it("połączenie z bazą jako użytkownik firmy A nie zwraca żadnego wiersza firmy B z żadnej tabeli", async () => {
    const a = await testbed.givenActiveCompany("Zawbud");
    const b = await testbed.givenActiveCompany("Budrex");
    const baseB = (await testbed.registry.as(b.ownerId).whereIsWhat()).base.id;
    // Stawki i historia wartości firmy B (tabele kosztu sprzętu).
    const ownerB = testbed.registry.as(b.ownerId);
    const categoryB = await ownerB.addCategory({ name: "Młoty", prefix: "H" });
    const { toolId: toolB } = await ownerB.addTool({ operationId: randomUUID(), code: "H-01", name: "Młot", categoryId: categoryB.id, value: 900 });
    await ownerB.setDailyRates([
      { target: { kind: "firma" }, rate: 1 },
      { target: { kind: "kategoria", categoryId: categoryB.id }, rate: 2 },
      { target: { kind: "narzedzie", toolId: toolB }, rate: 7 },
    ]);
    // Sprzęt wynajęty firmy B: stawka wypożyczalni i termin zwrotu.
    const { toolId: rentedB } = await ownerB.addRentedTool({
      operationId: randomUUID(),
      locationId: baseB,
      name: "Minikoparka",
      categoryId: categoryB.id,
      rentalCompany: "Ramirent",
      dailyRate: 450,
      returnOn: "2026-03-10",
    });

    const visibleToA = await withActor(testbed.db, a.ownerId, async (sql) => {
      const tables = await sql<{ name: string }>(
        `select format('%I.%I', schemaname, tablename) as name from pg_tables
         where schemaname = 'app' and has_table_privilege('authenticated', format('%I.%I', schemaname, tablename), 'select')`,
      );
      expect(tables.length).toBeGreaterThan(0);
      const dump: Record<string, unknown[]> = {};
      for (const { name } of tables) dump[name] = await sql(`select * from ${name}`);
      return JSON.stringify(dump);
    });

    expect(visibleToA).toContain(a.companyId);
    for (const idOfB of [b.companyId, b.ownerId, baseB, categoryB.id, toolB, rentedB]) expect(visibleToA).not.toContain(idOfB);
  });

  it("każda tabela schematu app ma włączone RLS", async () => {
    const withoutRls = await testbed.db.transaction((sql) =>
      sql<{ name: string }>(
        `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'app' and c.relkind = 'r' and not c.relrowsecurity`,
      ),
    );

    expect(withoutRls).toEqual([]);
  });
});
