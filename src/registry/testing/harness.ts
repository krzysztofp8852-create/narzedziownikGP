import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { createPgDb } from "../pg-db";
import type { Db } from "../ports";
import { createRegistry, type Registry } from "../registry";
import { FakeAuthAdmin, FixedClock } from "./fakes";
import { createPgliteDb } from "./pglite-db";

export const START = new Date("2026-03-02T07:00:00+01:00");

export interface RegistryTestbed {
  registry: Registry;
  clock: FixedClock;
  auth: FakeAuthAdmin;
  db: Db;
  /** Firma z bazą i właścicielem, założona tak jak robi to skrypt. */
  givenCompany(name: string, options?: { email?: string; fullName?: string; baseName?: string }): Promise<GivenCompany>;
  givenSuperAdmin(): Promise<string>;
}

export interface GivenCompany {
  companyId: string;
  ownerId: string;
  temporaryPassword: string;
}

/**
 * Punkt testowania Rejestru: prawdziwy Postgres z RLS, wstrzyknięty zegar
 * i czysta baza przed każdym testem.
 *
 * Domyślnie PGlite w pamięci. Z REGISTRY_TEST_DATABASE_URL testy idą na
 * wskazany Postgres z Supabase (np. `supabase start` w CI), którego tabele
 * są czyszczone przed każdym testem. Nigdy nie wskazuj tu bazy z danymi.
 */
export function setupRegistryTestbed(): RegistryTestbed {
  const clock = new FixedClock(START);
  let db: Db & { close(): Promise<void> };
  let auth: FakeAuthAdmin;
  let registry: Registry;

  beforeAll(async () => {
    db = await openTestDb();
    auth = new FakeAuthAdmin(db);
    registry = createRegistry({ db, clock, authAdmin: auth });
  });

  beforeEach(async () => {
    await resetDb(db);
    auth.clear();
    clock.set(START);
  });

  afterAll(async () => {
    await db?.close();
  });

  let counter = 0;
  return {
    get registry() {
      return registry;
    },
    get db() {
      return db;
    },
    get auth() {
      return auth;
    },
    clock,
    async givenCompany(name, options = {}) {
      counter += 1;
      const result = await registry.system().createCompany({
        name,
        baseName: options.baseName ?? "Baza",
        owner: {
          email: options.email ?? `wlasciciel${counter}@${slug(name)}.test`,
          fullName: options.fullName ?? `Właściciel ${name}`,
        },
      });
      return { companyId: result.companyId, ownerId: result.ownerUserId, temporaryPassword: result.temporaryPassword };
    },
    async givenSuperAdmin() {
      const { userId } = await auth.createUser({ email: `admin-${randomUUID()}@gp-engineering.test`, password: "x".repeat(12) });
      await db.transaction((sql) =>
        sql("insert into app.super_admins (user_id, created_at) values ($1, $2)", [userId, clock.now()]),
      );
      return userId;
    },
  };
}

async function openTestDb(): Promise<Db & { close(): Promise<void> }> {
  const url = process.env.REGISTRY_TEST_DATABASE_URL;
  if (!url) return createPgliteDb();
  const db = createPgDb({ connectionString: url, max: 2 });
  return { transaction: db.transaction, close: db.end };
}

async function resetDb(db: Db) {
  await db.transaction(async (sql) => {
    const tables = await sql<{ name: string }>(
      "select format('%I.%I', schemaname, tablename) as name from pg_tables where schemaname = 'app'",
    );
    await sql(`truncate ${[...tables.map((t) => t.name), "auth.users"].join(", ")} cascade`);
  });
}

function slug(text: string) {
  return text
    .normalize("NFD")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase();
}
