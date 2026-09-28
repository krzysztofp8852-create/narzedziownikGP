/**
 * Firma i super-admin do testu dymnego czatu z supportem: właściciel z własnym hasłem i konto super-admina.
 * Wypisuje ich dane logowania jako JSON. Konta super-admina nie da się usunąć z aplikacji, więc tylko w CI.
 */
import { randomUUID } from "node:crypto";
import { getRegistry } from "@/lib/registry-instance";

const registry = getRegistry();
const suffix = randomUUID().slice(0, 8);
const companyName = `Test dymny czatu ${new Date().toISOString().slice(0, 16)}`;
const signedInNow = () => ({ signedInAt: new Date(Date.now() + 1000) });

const company = await registry.system().createCompany({
  name: companyName,
  baseName: "Magazyn",
  owner: { email: `smoke-owner-${suffix}@narzedziownik.test`, fullName: "Jan Testowy" },
});
const ownerPassword = `Wlasciciel-${randomUUID().slice(0, 8)}`;
await registry.as(company.ownerUserId).changePassword(ownerPassword, signedInNow());
const admin = await registry.system().createSuperAdmin({ email: `smoke-super-${suffix}@narzedziownik.test` });

console.log(
  JSON.stringify({
    companyName,
    owner: { email: `smoke-owner-${suffix}@narzedziownik.test`, password: ownerPassword },
    superAdmin: { email: `smoke-super-${suffix}@narzedziownik.test`, password: admin.password },
  }),
);
process.exit(0);
