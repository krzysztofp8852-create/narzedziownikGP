/**
 * Firma do testu dymnego nawigacji: właściciel, kierownik budowy Rataje, magazynier i pracownik z nazwą użytkownika,
 * każdy z własnym hasłem, a na bazie jedno narzędzie (jest co wydać, więc Skanuj otwiera skaner ruchów).
 * Wypisuje dane logowania wszystkich jako JSON.
 */
import { randomUUID } from "node:crypto";
import { getRegistry } from "@/lib/registry-instance";

const registry = getRegistry();
const suffix = randomUUID().slice(0, 8);
const companyName = `Test dymny nawigacji ${new Date().toISOString().slice(0, 16)}`;
const signedInNow = () => ({ signedInAt: new Date(Date.now() + 1000) });

const ownerEmail = `smoke-owner-${suffix}@narzedziownik.test`;
const company = await registry.system().createCompany({
  name: companyName,
  baseName: "Magazyn",
  owner: { email: ownerEmail, fullName: "Jan Testowy" },
});
const ownerPassword = `Wlasciciel-${randomUUID().slice(0, 8)}`;
const owner = registry.as(company.ownerUserId);
await owner.changePassword(ownerPassword, signedInNow());

const managerEmail = `smoke-manager-${suffix}@narzedziownik.test`;
const manager = await owner.addMember({ firstName: "Adam", lastName: "Nowak", email: managerEmail, role: "kierownik" });
const managerPassword = `Kierownik-${randomUUID().slice(0, 8)}`;
await registry.as(manager.userId).changePassword(managerPassword, signedInNow());

const storekeeperEmail = `smoke-storekeeper-${suffix}@narzedziownik.test`;
const storekeeper = await owner.addMember({ firstName: "Ewa", lastName: "Magazyn", email: storekeeperEmail, role: "magazynier" });
const storekeeperPassword = `Magazynier-${randomUUID().slice(0, 8)}`;
await registry.as(storekeeper.userId).changePassword(storekeeperPassword, signedInNow());

const workerLogin = `zielinski.${suffix}`;
const worker = await owner.addMember({ firstName: "Marek", lastName: "Zieliński", email: "", username: workerLogin, role: "pracownik" });
const workerPassword = `Pracownik-${randomUUID().slice(0, 8)}`;
await registry.as(worker.userId).changePassword(workerPassword, signedInNow());

await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", managerId: manager.userId });
const hammers = await owner.addCategory({ name: "Młoty", prefix: "H" });
await owner.addTool({ operationId: randomUUID(), code: "H-01", name: "Młot Hilti", categoryId: hammers.id, value: 3200 });

console.log(
  JSON.stringify({
    companyName,
    owner: { login: ownerEmail, password: ownerPassword },
    manager: { login: managerEmail, password: managerPassword },
    storekeeper: { login: storekeeperEmail, password: storekeeperPassword },
    worker: { login: workerLogin, password: workerPassword },
  }),
);
process.exit(0);
