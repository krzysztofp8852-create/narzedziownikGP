/**
 * Zakłada nową firmę demo „DemoBud” z zespołem, sprzętem i kilkoma tygodniami historii i robi z niej obecne
 * demo strony /demo. Poprzednie demo (z tym, co w nim naklikali oglądający) znika w całości, z kontami i plikami.
 *
 *   npm run demo:create
 *
 * Łączy się z bazą i Supabase Auth ze zmiennych z .env.local, a `npm run demo:create:prod` z .env.produkcja
 * (projekt produkcyjny, zob. README i docs/adr/0039).
 */
import { createDemoCompany } from "@/demo/company";
import { registryDeps } from "@/lib/registry-instance";

const { companyId, purged } = await createDemoCompany(registryDeps());
console.log(`Firma demo założona (id ${companyId}). Wejście: /demo`);
console.log(`Usunięte poprzednie firmy demo: ${purged}.`);
process.exit(0);
