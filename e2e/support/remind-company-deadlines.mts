/**
 * Zadanie dzienne przypomnień o terminach (jak `/zadania/terminy`), ale tylko dla jednej firmy testowej:
 *
 *   npx tsx --env-file-if-exists=.env.local e2e/support/remind-company-deadlines.mts <companyId>
 *
 * Baza jest wspólna z produkcją, więc skrypt odmawia firmie, której nazwa nie zaczyna się od „Test e2e”, i nigdy nie
 * przechodzi po wszystkich firmach. Wypisuje liczbę nowych przypomnień jako JSON.
 */
import { registryDeps } from "@/lib/registry-instance";
import { createRegistry } from "@/registry/registry";

const companyId = process.argv[2];
if (!companyId) {
  console.error("Użycie: remind-company-deadlines.mts <companyId>");
  process.exit(1);
}

const deps = registryDeps();
const [company] = await deps.db.transaction((sql) =>
  sql<{ name: string }>("select name from app.companies where id = $1", [companyId]),
);
if (!company?.name.startsWith("Test e2e")) {
  console.error(`Firma ${companyId} nie jest firmą testową e2e: nic nie zrobiono.`);
  process.exit(1);
}

const result = await createRegistry(deps).system().notifyCompanyDueDeadlines(companyId);
console.log(JSON.stringify(result));
process.exit(0);
