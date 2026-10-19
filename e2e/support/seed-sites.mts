/**
 * Firma do testu dymnego strony Budowy: właściciel i dwóch kierowników z własnymi hasłami. Adam Nowak prowadzi budowę
 * Rataje i zakończoną już Junikowo, Ewa Lis budowę Winogrady i zakończoną Garbary. Wypisuje dane logowania jako JSON.
 */
import { randomUUID } from "node:crypto";
import { getRegistry } from "@/lib/registry-instance";

const registry = getRegistry();
const suffix = randomUUID().slice(0, 8);
const companyName = `Test dymny budów ${new Date().toISOString().slice(0, 16)}`;
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

async function addManager(firstName: string, lastName: string) {
  const email = `smoke-manager-${lastName.toLowerCase()}-${suffix}@narzedziownik.test`;
  const manager = await owner.addMember({ firstName, lastName, email, role: "kierownik" });
  const password = `Kierownik-${randomUUID().slice(0, 8)}`;
  await registry.as(manager.userId).changePassword(password, signedInNow());
  return { userId: manager.userId, email, password };
}

const nowak = await addManager("Adam", "Nowak");
const lis = await addManager("Ewa", "Lis");

await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", managerId: nowak.userId });
await owner.addSite({ name: "Winogrady", address: "os. Wichrowe 3, Poznań", managerId: lis.userId });
const { locationId: junikowoId } = await owner.addSite({ name: "Junikowo", address: "ul. Grunwaldzka 300, Poznań", managerId: nowak.userId });
await owner.closeSite(junikowoId);
// Garbary zamknięte po Junikowie: zakończone budowy idą od ostatnio zamkniętej, na to liczy e2e/sites.spec.ts.
const { locationId: garbaryId } = await owner.addSite({ name: "Garbary", address: "ul. Garbary 50, Poznań", managerId: lis.userId });
await owner.closeSite(garbaryId);

console.log(
  JSON.stringify({
    companyName,
    owner: { email: ownerEmail, password: ownerPassword },
    nowak: { email: nowak.email, password: nowak.password },
    lis: { email: lis.email, password: lis.password },
  }),
);
process.exit(0);
