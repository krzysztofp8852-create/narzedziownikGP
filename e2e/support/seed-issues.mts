/**
 * Firma do testu dymnego zgłoszeń: właściciel, kierownik Nowak (Rataje) i pracownik z nazwą użytkownika.
 * Wiertarka W-02 jest na Ratajach. Wypisuje dane logowania właściciela i pracownika jako JSON.
 */
import { randomUUID } from "node:crypto";
import { getRegistry } from "@/lib/registry-instance";

const registry = getRegistry();
const suffix = randomUUID().slice(0, 8);
const companyName = `Test dymny zgłoszeń ${new Date().toISOString().slice(0, 16)}`;
const signedInNow = () => ({ signedInAt: new Date(Date.now() + 1000) });

const company = await registry.system().createCompany({
  name: companyName,
  baseName: "Magazyn",
  owner: { email: `smoke-owner-${suffix}@narzedziownik.test`, fullName: "Jan Testowy" },
});
const ownerPassword = `Wlasciciel-${randomUUID().slice(0, 8)}`;
const owner = registry.as(company.ownerUserId);
await owner.changePassword(ownerPassword, signedInNow());

const nowak = await owner.addMember({ firstName: "Adam", lastName: "Nowak", email: `smoke-nowak-${suffix}@narzedziownik.test`, role: "kierownik" });
await registry.as(nowak.userId).changePassword(`Kierownik-${randomUUID().slice(0, 8)}`, signedInNow());
const username = `zielinski.${suffix}`;
const worker = await owner.addMember({ firstName: "Marek", lastName: "Zieliński", email: "", username, role: "pracownik" });
const workerPassword = `Pracownik-${randomUUID().slice(0, 8)}`;
await registry.as(worker.userId).changePassword(workerPassword, signedInNow());

const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", managerId: nowak.userId });
const drills = await owner.addCategory({ name: "Wiertarki", prefix: "W" });
const { toolId } = await owner.addTool({ operationId: randomUUID(), code: "W-02", name: "Wiertarka Makita", categoryId: drills.id });
const { base } = await owner.whereIsWhat();
await registry
  .as(nowak.userId)
  .registerMovement({ operationId: randomUUID(), kind: "wydanie", fromLocationId: base.id, toLocationId: ratajeId, toolIds: [toolId], source: "checklista" });

console.log(
  JSON.stringify({
    companyName,
    owner: { email: `smoke-owner-${suffix}@narzedziownik.test`, password: ownerPassword },
    worker: { login: username, password: workerPassword },
    toolId,
  }),
);
process.exit(0);
