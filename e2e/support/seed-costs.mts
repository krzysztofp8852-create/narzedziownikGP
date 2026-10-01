/**
 * Firma do testu dymnego kosztów sprzętu: właściciel i kierownik z własnymi hasłami, budowa Rataje z młotem H-01
 * (3200 zł) wydanym dziś. Stawek jeszcze nie ma. Wypisuje dane logowania i identyfikator budowy jako JSON.
 */
import { randomUUID } from "node:crypto";
import { getRegistry } from "@/lib/registry-instance";

const registry = getRegistry();
const suffix = randomUUID().slice(0, 8);
const companyName = `Test dymny kosztów ${new Date().toISOString().slice(0, 16)}`;
const signedInNow = () => ({ signedInAt: new Date(Date.now() + 1000) });

const ownerEmail = `smoke-owner-${suffix}@narzedziownik.test`;
const company = await registry.system().createCompany({
  name: companyName,
  baseName: "Magazyn",
  owner: { email: ownerEmail, fullName: "Jan Testowy" },
});
const owner = registry.as(company.ownerUserId);
const ownerPassword = `Wlasciciel-${randomUUID().slice(0, 8)}`;
await owner.changePassword(ownerPassword, signedInNow());

const managerEmail = `smoke-manager-${suffix}@narzedziownik.test`;
const manager = await owner.addMember({ firstName: "Adam", lastName: "Nowak", email: managerEmail, role: "kierownik" });
const managerPassword = `Kierownik-${randomUUID().slice(0, 8)}`;
await registry.as(manager.userId).changePassword(managerPassword, signedInNow());

const { locationId: siteId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", managerId: manager.userId });
const hammers = await owner.addCategory({ name: "Młoty", prefix: "H" });
const { toolId } = await owner.addTool({ operationId: randomUUID(), code: "H-01", name: "Młot Hilti", categoryId: hammers.id, value: 3200 });
const { base } = await owner.whereIsWhat();
await registry.as(manager.userId).registerMovement({
  operationId: randomUUID(),
  kind: "wydanie",
  fromLocationId: base.id,
  toLocationId: siteId,
  toolIds: [toolId],
  source: "checklista",
});

console.log(
  JSON.stringify({
    companyName,
    siteId,
    owner: { email: ownerEmail, password: ownerPassword },
    manager: { email: managerEmail, password: managerPassword },
  }),
);
process.exit(0);
