/**
 * Firma do testu dymnego checklisty: kierownik z własnym hasłem, jego budowa Rataje
 * i szlifierki S-01, S-02 na bazie. Wypisuje dane logowania kierownika jako JSON.
 *
 * Zakłada wszystko przez Rejestr, tak jak zrobiłby to właściciel w aplikacji.
 */
import { randomUUID } from "node:crypto";
import { getRegistry } from "@/lib/registry-instance";

const registry = getRegistry();
const suffix = randomUUID().slice(0, 8);
const companyName = `Test dymny checklisty ${new Date().toISOString().slice(0, 16)}`;
const signedInNow = () => ({ signedInAt: new Date(Date.now() + 1000) });

const company = await registry.system().createCompany({
  name: companyName,
  baseName: "Magazyn",
  owner: { email: `smoke-owner-${suffix}@narzedziownik.test`, fullName: "Jan Testowy" },
});
const owner = registry.as(company.ownerUserId);
await owner.changePassword(`Wlasciciel-${randomUUID()}`, signedInNow());

const managerEmail = `smoke-manager-${suffix}@narzedziownik.test`;
const manager = await owner.addMember({ firstName: "Adam", lastName: "Nowak", email: managerEmail, role: "kierownik" });
const managerPassword = `Kierownik-${randomUUID().slice(0, 8)}`;
await registry.as(manager.userId).changePassword(managerPassword, signedInNow());

await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", managerId: manager.userId });
const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
for (const [code, name] of [
  ["S-01", "Szlifierka kątowa"],
  ["S-02", "Szlifierka mała"],
  ["S-03", "Szlifierka do betonu"],
]) {
  await owner.addTool({ operationId: randomUUID(), code, name, categoryId: grinders.id });
}

console.log(JSON.stringify({ companyName, email: managerEmail, password: managerPassword }));
process.exit(0);
