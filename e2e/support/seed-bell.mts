/**
 * Firma do testu skrzynki „Wymaga uwagi”: kierownicy Nowak (Rataje) i Kowalski (Winogrady). Nowak zabrał S-01
 * z Winogrady na Rataje, więc Kowalski ma powiadomienie w „Informacjach”, i zgłosił kupioną szlifierkę, więc właściciel
 * ma ją w „Do zrobienia”. Wypisuje dane logowania właściciela i Kowalskiego jako JSON.
 */
import { randomUUID } from "node:crypto";
import { getRegistry } from "@/lib/registry-instance";

const registry = getRegistry();
const suffix = randomUUID().slice(0, 8);
const companyName = `Test dymny dzwonka ${new Date().toISOString().slice(0, 16)}`;
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

async function manager(firstName: string, lastName: string) {
  const email = `smoke-${lastName.toLowerCase()}-${suffix}@narzedziownik.test`;
  const { userId } = await owner.addMember({ firstName, lastName, email, role: "kierownik" });
  const password = `Kierownik-${randomUUID().slice(0, 8)}`;
  await registry.as(userId).changePassword(password, signedInNow());
  return { userId, email, password };
}
const nowak = await manager("Adam", "Nowak");
const kowalski = await manager("Jan", "Kowalski");

const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", managerId: nowak.userId });
const { locationId: winogradyId } = await owner.addSite({ name: "Winogrady", address: "os. Wichrowe 3, Poznań", managerId: kowalski.userId });
const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
const { toolId } = await owner.addTool({ operationId: randomUUID(), code: "S-01", name: "Szlifierka kątowa", categoryId: grinders.id });
const { base } = await owner.whereIsWhat();

const move = (actorId: string, kind: "wydanie" | "przeniesienie", from: string, to: string) =>
  registry.as(actorId).registerMovement({ operationId: randomUUID(), kind, fromLocationId: from, toLocationId: to, toolIds: [toolId], source: "checklista" });
await move(kowalski.userId, "wydanie", base.id, winogradyId);
await move(nowak.userId, "przeniesienie", winogradyId, ratajeId);
const reported = await registry
  .as(nowak.userId)
  .reportTool({ operationId: randomUUID(), siteId: ratajeId, name: "Szlifierka Bosch", categoryId: grinders.id });

console.log(
  JSON.stringify({
    companyName,
    owner: { email: ownerEmail, password: ownerPassword },
    manager: { email: kowalski.email, password: kowalski.password },
    toolId,
    reportedCode: reported.code,
  }),
);
process.exit(0);
