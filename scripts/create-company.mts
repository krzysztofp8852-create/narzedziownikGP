/**
 * Zakłada firmę z bazą i kontem właściciela z hasłem tymczasowym.
 *
 *   npm run company:create -- --name "Zawbud" --owner-email jan@zawbud.pl --owner-name "Jan Kowalski"
 *
 * Łączy się z bazą i Supabase Auth ze zmiennych z .env.local (zob. README).
 */
import { parseArgs } from "node:util";
import { t } from "@/i18n/t";
import { getRegistry } from "@/lib/registry-instance";

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    "owner-email": { type: "string" },
    "owner-name": { type: "string" },
    "base-name": { type: "string", default: t("defaults.baseName") },
    json: { type: "boolean", default: false },
  },
});

if (!values.name || !values["owner-email"] || !values["owner-name"]) {
  console.error('Użycie: npm run company:create -- --name "Firma" --owner-email e-mail --owner-name "Imię Nazwisko"');
  process.exit(1);
}

const created = await getRegistry()
  .system()
  .createCompany({
    name: values.name,
    baseName: values["base-name"],
    owner: { email: values["owner-email"], fullName: values["owner-name"] },
  });

if (values.json) {
  console.log(JSON.stringify(created));
} else {
  console.log(`Firma „${values.name}” założona (id ${created.companyId}).`);
  console.log(`Właściciel: ${values["owner-email"]}`);
  console.log(`Hasło tymczasowe: ${created.temporaryPassword}`);
}
process.exit(0);
