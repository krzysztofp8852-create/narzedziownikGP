/**
 * Zamknięcie „bez wyjścia” odbić otwartych sprzed dzisiejszej północy (to, co o północy robi /zadania/odbicia) tylko
 * w jednej firmie testowej (identyfikator w argumencie). Inne firmy nic nie dostają. Wypisuje liczbę zamkniętych odbić
 * jako JSON.
 */
import { getRegistry } from "@/lib/registry-instance";

const [companyId] = process.argv.slice(2);
if (!companyId) throw new Error("Podaj identyfikator firmy");
const result = await getRegistry().system().closeCompanyForgottenExits(companyId);
console.log(JSON.stringify(result));
process.exit(0);
