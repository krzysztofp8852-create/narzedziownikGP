/**
 * Zakłada konto super-admina (GP Engineering) z wygenerowanym hasłem. Super-admin zakłada firmy
 * i pilnuje abonamentów w panelu /super-admin.
 *
 *   npm run super-admin:create -- --email krzysztof@gp-engineering.pl
 *
 * Łączy się z bazą i Supabase Auth ze zmiennych z .env.local (zob. README).
 */
import { parseArgs } from "node:util";
import { getRegistry } from "@/lib/registry-instance";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    json: { type: "boolean", default: false },
  },
});

if (!values.email) {
  console.error("Użycie: npm run super-admin:create -- --email e-mail");
  process.exit(1);
}

const created = await getRegistry().system().createSuperAdmin({ email: values.email });

if (values.json) {
  console.log(JSON.stringify(created));
} else {
  console.log(`Super-admin ${values.email} założony (id ${created.userId}).`);
  console.log(`Hasło: ${created.password}`);
  console.log("Zapisz je teraz w menedżerze haseł; nie zobaczysz go ponownie.");
}
process.exit(0);
