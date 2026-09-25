import { afterAll, beforeAll, beforeEach } from "vitest";
import { createPgDb } from "../pg-db";
import type { Db } from "../ports";
import { createRegistry, type Registry, type Role } from "../registry";
import { FakeAuthAdmin, FakePhotoStore, FixedClock } from "./fakes";
import { createPgliteDb } from "./pglite-db";

export const START = new Date("2026-03-02T07:00:00+01:00");

export interface RegistryTestbed {
  registry: Registry;
  clock: FixedClock;
  auth: FakeAuthAdmin;
  photos: FakePhotoStore;
  db: Db;
  /** Firma z bazą i właścicielem, założona tak jak robi to skrypt. */
  givenCompany(name: string, options?: { email?: string; fullName?: string; baseName?: string }): Promise<GivenCompany>;
  /** Jak givenCompany, ale właściciel ma już własne hasło. */
  givenActiveCompany(name: string, options?: { baseName?: string }): Promise<GivenCompany>;
  /** Osoba z rolą w firmie, z własnym hasłem. */
  givenMember(company: GivenCompany, role: Role, fullName?: string): Promise<string>;
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
  const photos = new FakePhotoStore();
  let registry: Registry;

  beforeAll(async () => {
    db = await openTestDb();
    auth = new FakeAuthAdmin(db);
    registry = createRegistry({ db, clock, authAdmin: auth, photos });
  });

  beforeEach(async () => {
    await resetDb(db);
    auth.clear();
    photos.clear();
    clock.set(START);
  });

  afterAll(async () => {
    await db?.close();
  });

  let counter = 0;
  const givenCompany: RegistryTestbed["givenCompany"] = async (name, options = {}) => {
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
  };

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
    photos,
    givenCompany,
    async givenActiveCompany(name, options = {}) {
      const company = await givenCompany(name, options);
      await registry.as(company.ownerId).changePassword(`${name}-haslo-1`);
      return company;
    },
    // Dopóki właściciel nie umie dodawać osób (#4), zakładamy je bezpośrednio w bazie.
    async givenMember(company, role, fullName = `${role} ${counter}`) {
      counter += 1;
      const email = `${role}${counter}@${company.companyId}.test`;
      const { userId } = await auth.createUser({ email, password: `${role}-haslo-${counter}` });
      await db.transaction((sql) =>
        sql(
          `insert into app.users (user_id, company_id, role, full_name, email, must_change_password, created_at)
           values ($1, $2, $3, $4, $5, false, $6)`,
          [userId, company.companyId, role, fullName, email, clock.now()],
        ),
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
