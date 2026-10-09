/**
 * Usuwa w całości (dane, pliki, konta) firmy z testów dymnych i e2e założone od chwili w argumencie (ISO 8601).
 * Uruchamia go raport `test-company-cleanup.ts` po udanym przebiegu testów. Wypisuje wynik jako JSON.
 */
import { getRegistry } from "@/lib/registry-instance";

const [since] = process.argv.slice(2);
const createdSince = new Date(since ?? "");
if (Number.isNaN(createdSince.getTime())) throw new Error("Podaj chwilę startu testów (ISO 8601)");
const result = await getRegistry().system().deleteTestCompanies(createdSince);
console.log(JSON.stringify(result));
process.exit(0);
