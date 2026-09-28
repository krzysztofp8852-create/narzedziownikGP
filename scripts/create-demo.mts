/**
 * Zakłada nową firmę demo „DemoBud” z zespołem, sprzętem i kilkoma tygodniami historii i robi z niej obecne
 * demo strony /demo. Poprzednie demo (z tym, co w nim naklikali oglądający) traci dostęp.
 *
 *   npm run demo:create
 *
 * Łączy się z bazą i Supabase Auth ze zmiennych z .env.local (zob. README).
 */
import { createDemoCompany } from "@/demo/company";
import { registryDeps } from "@/lib/registry-instance";

const { companyId } = await createDemoCompany(registryDeps());
console.log(`Firma demo założona (id ${companyId}). Wejście: /demo`);
process.exit(0);
