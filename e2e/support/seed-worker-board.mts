/**
 * Firma do testu tablicy pracownika: właściciel, kierownik Nowak i pracownik Kowalczyk z nazwą użytkownika. Na Ratajach
 * (pinezka w stałym punkcie, plakat) są szlifierki S-01 i S-02, na Winogradach wiertarka W-01, a na bazie młot H-01.
 * Kowalczykowi za 10 dni kończy się szkolenie BHP, a na jego zgłoszenie pękniętej tarczy S-01 odpisał właściciel.
 * Wypisuje kod plakatu Rataje, położenie budowy i dane logowania jako JSON.
 */
import { randomUUID } from "node:crypto";
import { formatDay } from "@/i18n/dates";
import { getRegistry } from "@/lib/registry-instance";

const registry = getRegistry();
const suffix = randomUUID().slice(0, 8);
const companyName = `Test dymny tablicy pracownika ${new Date().toISOString().slice(0, 16)}`;
const signedInNow = () => ({ signedInAt: new Date(Date.now() + 1000) });
const RATAJE = { lat: 52.4083, lng: 16.9335 };

const company = await registry.system().createCompany({
  name: companyName,
  baseName: "Magazyn",
  owner: { email: `smoke-owner-${suffix}@narzedziownik.test`, fullName: "Jan Testowy" },
});
const owner = registry.as(company.ownerUserId);
await owner.changePassword(`Wlasciciel-${randomUUID().slice(0, 8)}`, signedInNow());

const nowak = await owner.addMember({ firstName: "Adam", lastName: "Nowak", email: `smoke-nowak-${suffix}@narzedziownik.test`, role: "kierownik" });
const username = `kowalczyk.${suffix}`;
const worker = await owner.addMember({ firstName: "Piotr", lastName: "Kowalczyk", email: "", username, role: "pracownik" });
const workerPassword = `Pracownik-${randomUUID().slice(0, 8)}`;
await registry.as(worker.userId).changePassword(workerPassword, signedInNow());

const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", managerId: nowak.userId });
await owner.moveMapPin(ratajeId, RATAJE);
const { code: posterCode } = await owner.poster(ratajeId);
const { locationId: winogradyId } = await owner.addSite({ name: "Winogrady", address: "os. Wichrowe 3, Poznań", managerId: nowak.userId });

const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
const drills = await owner.addCategory({ name: "Wiertarki", prefix: "W" });
const hammers = await owner.addCategory({ name: "Młoty", prefix: "H" });
const addTool = async (code: string, name: string, categoryId: string) =>
  (await owner.addTool({ operationId: randomUUID(), code, name, categoryId })).toolId;
const s01 = await addTool("S-01", "Szlifierka kątowa", grinders.id);
const s02 = await addTool("S-02", "Szlifierka do betonu", grinders.id);
const w01 = await addTool("W-01", "Wiertarka Makita", drills.id);
await addTool("H-01", "Młot udarowy", hammers.id);
const { base } = await owner.whereIsWhat();
const issue = (to: string, toolIds: string[]) =>
  owner.registerMovement({ operationId: randomUUID(), kind: "wydanie", fromLocationId: base.id, toLocationId: to, toolIds, source: "checklista" });
await issue(ratajeId, [s01, s02]);
await issue(winogradyId, [w01]);

const person = (await owner.people()).find((candidate) => candidate.account?.userId === worker.userId)!;
const dueOn = formatDay(new Date(Date.now() + 10 * 24 * 60 * 60 * 1000));
await owner.addQualification({ personId: person.personId, kind: "szkolenie_bhp", dueOn });

const { issueId } = await registry
  .as(worker.userId)
  .fileIssue({ operationId: randomUUID(), kind: "uszkodzenie", description: "Tarcza pęknięta", toolId: s01 });
await owner.commentOnIssue({ operationId: randomUUID(), issueId, text: "Jutro przywiozę nową tarczę" });

console.log(JSON.stringify({ companyName, posterCode, site: RATAJE, worker: { login: username, password: workerPassword } }));
process.exit(0);
