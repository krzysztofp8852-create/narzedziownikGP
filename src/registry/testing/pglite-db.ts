import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Db, Sql } from "../ports";

const repoRoot = join(import.meta.dirname, "../../..");

/** Świeża baza PGlite (prawdziwy Postgres w WASM) z imitacją Supabase i wszystkimi migracjami. */
export async function createPgliteDb(): Promise<Db & { close(): Promise<void> }> {
  const pg = new PGlite();
  await pg.exec(readFileSync(join(import.meta.dirname, "supabase-auth-shim.sql"), "utf8"));
  const migrationsDir = join(repoRoot, "supabase/migrations");
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }
  return {
    transaction: (fn) =>
      pg.transaction(async (tx) => {
        const sql: Sql = async (text, params) => (await tx.query(text, params)).rows as never;
        return fn(sql);
      }),
    close: () => pg.close(),
  };
}
