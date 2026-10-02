/**
 * Firma do testu dymnego odbijania: właściciel, kierownik Nowak (Rataje z pinezką w stałym punkcie, bez Google),
 * pracownik z nazwą użytkownika i Wojciech Lis z kartoteki, bez konta. Wypisuje kod plakatu Rataje, położenie budowy i dane logowania jako JSON.
 */
import { randomUUID } from "node:crypto";
import { getRegistry } from "@/lib/registry-instance";

const registry = getRegistry();
const suffix = randomUUID().slice(0, 8);
const companyName = `Test dymny odbić ${new Date().toISOString().slice(0, 16)}`;
const signedInNow = () => ({ signedInAt: new Date(Date.now() + 1000) });
const RATAJE = { lat: 52.4083, lng: 16.9335 };

const ownerEmail = `smoke-owner-${suffix}@narzedziownik.test`;
const company = await registry.system().createCompany({ name: companyName, baseName: "Magazyn", owner: { email: ownerEmail, fullName: "Jan Testowy" } });
const owner = registry.as(company.ownerUserId);
await owner.changePassword(`Wlasciciel-${suffix}`, signedInNow());

const managerEmail = `smoke-manager-${suffix}@narzedziownik.test`;
const manager = await owner.addMember({ firstName: "Adam", lastName: "Nowak", email: managerEmail, role: "kierownik" });
const managerPassword = `Kierownik-${randomUUID().slice(0, 8)}`;
await registry.as(manager.userId).changePassword(managerPassword, signedInNow());

const username = `kowalczyk.${suffix}`;
const worker = await owner.addMember({ firstName: "Piotr", lastName: "Kowalczyk", email: "", username, role: "pracownik" });
const workerPassword = `Pracownik-${randomUUID().slice(0, 8)}`;
await registry.as(worker.userId).changePassword(workerPassword, signedInNow());

await owner.addPerson({ fullName: "Wojciech Lis", note: "Bez telefonu" });

const { locationId: siteId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", managerId: manager.userId });
await owner.moveMapPin(siteId, RATAJE);
const { code } = await owner.poster(siteId);

console.log(
  JSON.stringify({
    companyName,
    siteId,
    posterCode: code,
    site: RATAJE,
    manager: { login: managerEmail, password: managerPassword },
    worker: { login: username, password: workerPassword },
  }),
);
process.exit(0);
