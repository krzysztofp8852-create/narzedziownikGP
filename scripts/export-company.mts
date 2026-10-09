/**
 * Pełny eksport danych firmy na jej żądanie (umowa § 6 ust. 2, zmiana dostawcy): ZIP z plikiem CSV każdej tabeli,
 * zdjęciami i dokumentami w oryginalnym formacie i README z opisem struktury.
 *
 *   npm run company:export:prod -- --company <id firmy> --out <katalog>
 *
 * Bez `:prod` łączy się z bazą i Storage ze zmiennych z .env.local (zob. README). Działa także w trybie tylko do
 * odczytu i po końcu umowy. Plik nazywa się `eksport-<id firmy>-<data i godzina UTC>.zip`.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { writeZipFile } from "@/export/zip-file";
import { getRegistry } from "@/lib/registry-instance";
import { RegistryError } from "@/registry/errors";

const { values } = parseArgs({
  options: {
    company: { type: "string" },
    out: { type: "string" },
  },
});

if (!values.company || !values.out) {
  console.error("Użycie: npm run company:export -- --company <id firmy> --out <katalog>");
  process.exit(1);
}

const companyId = values.company;
mkdirSync(values.out, { recursive: true });
const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
const path = join(values.out, `eksport-${companyId}-${stamp}.zip`);

try {
  const summary = await writeZipFile(path, (add) => getRegistry().system().exportCompany(companyId, add));
  console.log(`Eksport firmy „${summary.companyName}”: ${path}`);
  console.log(`Tabele: ${summary.tables}, pliki ze zdjęciami i dokumentami: ${summary.files}.`);
  if (summary.missingFiles.length > 0) {
    console.warn(`Brak w kubełkach ${summary.missingFiles.length} plików (wypisane też w README.md eksportu):`);
    for (const missing of summary.missingFiles) console.warn(`  ${missing}`);
  }
} catch (error) {
  if (error instanceof RegistryError && error.code === "not_found") {
    console.error(`Nie ma firmy o id ${companyId}.`);
    process.exit(1);
  }
  throw error;
}
process.exit(0);
