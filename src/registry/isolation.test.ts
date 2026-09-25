import { describe, expect, it } from "vitest";
import { withActor } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();

async function givenActiveCompany(name: string, baseName = "Baza") {
  const company = await testbed.givenCompany(name, { baseName });
  await testbed.registry.as(company.ownerId).changePassword(`${name}-haslo-1`);
  return company;
}

describe("izolacja firm", () => {
  it("właściciel firmy A widzi na tablicy i w nagłówku swoją firmę, a nie firmę B", async () => {
    const a = await givenActiveCompany("Zawbud", "Magazyn Swarzędz");
    await givenActiveCompany("Budrex", "Magazyn Rataje");

    expect(await testbed.registry.as(a.ownerId).whereIsWhat()).toMatchObject({ base: { name: "Magazyn Swarzędz" } });
    expect(await testbed.registry.as(a.ownerId).session()).toMatchObject({ company: { id: a.companyId, name: "Zawbud" } });
  });

  it("połączenie z bazą jako użytkownik firmy A nie zwraca żadnego wiersza firmy B z żadnej tabeli", async () => {
    const a = await givenActiveCompany("Zawbud");
    const b = await givenActiveCompany("Budrex");
    const baseB = (await testbed.registry.as(b.ownerId).whereIsWhat()).base.id;

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
    for (const idOfB of [b.companyId, b.ownerId, baseB]) expect(visibleToA).not.toContain(idOfB);
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
