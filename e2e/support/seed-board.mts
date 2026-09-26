/**
 * Firma do testu dymnego tablicy: właściciel i kierownik z własnymi hasłami, budowa Rataje
 * z młotem H-01 (3200 zł) i szlifierką S-01 (450,50 zł), a na bazie szlifierka S-02 (380 zł).
 * Wypisuje dane logowania obu osób jako JSON.
 *
 * Zakłada wszystko przez Rejestr, tak jak zrobiliby to właściciel i kierownik w aplikacji.
 */
import { randomUUID } from "node:crypto";
import { getRegistry } from "@/lib/registry-instance";

const registry = getRegistry();
const suffix = randomUUID().slice(0, 8);
const companyName = `Test dymny tablicy ${new Date().toISOString().slice(0, 16)}`;
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

const { locationId: ratajeId } = await owner.addSite({
  name: "Rataje",
  address: "ul. Piłsudskiego 12, Poznań",
  managerId: manager.userId,
});
const hammers = await owner.addCategory({ name: "Młoty", prefix: "H" });
const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
const tool = async (code: string, name: string, categoryId: string, value: number) =>
  (await owner.addTool({ operationId: randomUUID(), code, name, categoryId, value })).toolId;
const h01 = await tool("H-01", "Młot Hilti", hammers.id, 3200);
const s01 = await tool("S-01", "Szlifierka kątowa", grinders.id, 450.5);
await tool("S-02", "Szlifierka mała", grinders.id, 380);

const { base } = await owner.whereIsWhat();
await registry.as(manager.userId).registerMovement({
  operationId: randomUUID(),
  kind: "wydanie",
  fromLocationId: base.id,
  toLocationId: ratajeId,
  toolIds: [h01, s01],
  source: "checklista",
});

console.log(
  JSON.stringify({
    companyName,
    owner: { email: ownerEmail, password: ownerPassword },
    manager: { email: managerEmail, password: managerPassword },
  }),
);
process.exit(0);
