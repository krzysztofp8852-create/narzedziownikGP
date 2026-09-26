/**
 * Dwie firmy do testu naklejek QR: w pierwszej właściciel z młotem H-01 na bazie, w drugiej sam
 * właściciel. Wypisuje dane logowania obu właścicieli i identyfikator młota (z adresu naklejki) jako JSON.
 *
 * Zakłada wszystko przez Rejestr, tak jak zrobiliby to właściciele w aplikacji.
 */
import { randomUUID } from "node:crypto";
import { getRegistry } from "@/lib/registry-instance";

const registry = getRegistry();
const suffix = randomUUID().slice(0, 8);
const stamp = new Date().toISOString().slice(0, 16);
const signedInNow = () => ({ signedInAt: new Date(Date.now() + 1000) });

async function companyWithOwner(name: string, role: string) {
  const email = `smoke-stickers-${role}-${suffix}@narzedziownik.test`;
  const company = await registry.system().createCompany({ name, baseName: "Magazyn", owner: { email, fullName: "Jan Testowy" } });
  const password = `Wlasciciel-${randomUUID().slice(0, 8)}`;
  await registry.as(company.ownerUserId).changePassword(password, signedInNow());
  return { owner: registry.as(company.ownerUserId), credentials: { email, password } };
}

const zawbud = await companyWithOwner(`Test dymny naklejek ${stamp}`, "a");
const budrex = await companyWithOwner(`Test dymny naklejek, inna firma ${stamp}`, "b");
const hammers = await zawbud.owner.addCategory({ name: "Młoty", prefix: "H" });
const { toolId } = await zawbud.owner.addTool({ operationId: randomUUID(), code: "H-01", name: "Młot Hilti", categoryId: hammers.id });

console.log(JSON.stringify({ owner: zawbud.credentials, otherOwner: budrex.credentials, toolId }));
process.exit(0);
