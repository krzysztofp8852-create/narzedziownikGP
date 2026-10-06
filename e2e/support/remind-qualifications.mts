/**
 * Zadanie dzienne przypomnień o uprawnieniach (to, co robi /zadania/terminy) tylko dla jednej firmy testowej
 * (identyfikator w argumencie). Inne firmy nic nie dostają. Wypisuje liczbę nowych przypomnień jako JSON.
 */
import { getRegistry } from "@/lib/registry-instance";

const [companyId] = process.argv.slice(2);
if (!companyId) throw new Error("Podaj identyfikator firmy");
const result = await getRegistry().system().notifyCompanyDueQualifications(companyId);
console.log(JSON.stringify(result));
process.exit(0);
