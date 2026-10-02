import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Db, Sql } from "../ports";

const repoRoot = join(import.meta.dirname, "../../..");
const migrationsDir = join(repoRoot, "supabase/migrations");
const migrations = () =>
  readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

/** Świeża baza PGlite (prawdziwy Postgres w WASM) z imitacją Supabase i wszystkimi migracjami. */
export async function createPgliteDb(): Promise<Db & { close(): Promise<void> }> {
  const { db, migrate } = await createPgliteDbBefore(null);
  await migrate();
  return db;
}

/**
 * Baza PGlite z migracjami sprzed `migration` (nazwa pliku), do testu migracji na danych z poprzedniej wersji:
 * `migrate` wykonuje ją i wszystkie późniejsze. Z `null` nie wykonuje żadnej, dopóki nie wywoła się `migrate`.
 */
export async function createPgliteDbBefore(
  migration: string | null,
): Promise<{ db: Db & { close(): Promise<void> }; migrate(): Promise<void> }> {
  const pg = new PGlite();
  await pg.exec(readFileSync(join(import.meta.dirname, "supabase-auth-shim.sql"), "utf8"));
  const all = migrations();
  if (migration !== null && !all.includes(migration)) throw new Error(`Nie ma migracji ${migration}`);
  const split = migration === null ? 0 : all.indexOf(migration);
  for (const file of all.slice(0, split)) await pg.exec(readFileSync(join(migrationsDir, file), "utf8"));
  return {
    db: {
      transaction: (fn) =>
        pg.transaction(async (tx) => {
          const sql: Sql = async (text, params) => (await tx.query(text, params)).rows as never;
          return fn(sql);
        }),
      close: () => pg.close(),
    },
    migrate: async () => {
      for (const file of all.slice(split)) await pg.exec(readFileSync(join(migrationsDir, file), "utf8"));
    },
  };
}
