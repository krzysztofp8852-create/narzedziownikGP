/**
 * Firma do testu dymnego odbijania: właściciel, kierownik Nowak (Rataje z pinezką w stałym punkcie, bez Google),
 * magazynier, pracownik z nazwą użytkownika, Wojciech Lis z kartoteki, bez konta, i szlifierka S-01 na bazie (do
 * Skanuj z naklejką). Wypisuje kod plakatu Rataje, położenie budowy, narzędzie i dane logowania jako JSON.
 * Z `--zapomniane-wyjscie` pracownik ma też wczorajsze odbicie na Rataje zamknięte o północy „bez wyjścia”, a JSON
 * podaje godzinę wyjścia (pole daty i godziny) osiem godzin po tamtym wejściu.
 */
import { randomUUID } from "node:crypto";
import { dateTimeInputValue } from "@/i18n/dates";
import { getRegistry } from "@/lib/registry-instance";

const registry = getRegistry();
const suffix = randomUUID().slice(0, 8);
const companyName = `Test dymny odbić ${new Date().toISOString().slice(0, 16)}`;
const signedInNow = () => ({ signedInAt: new Date(Date.now() + 1000) });
const RATAJE = { lat: 52.4083, lng: 16.9335 };

const ownerEmail = `smoke-owner-${suffix}@narzedziownik.test`;
const company = await registry.system().createCompany({ name: companyName, baseName: "Magazyn", owner: { email: ownerEmail, fullName: "Jan Testowy" } });
const owner = registry.as(company.ownerUserId);
const ownerPassword = `Wlasciciel-${suffix}`;
await owner.changePassword(ownerPassword, signedInNow());

const managerEmail = `smoke-manager-${suffix}@narzedziownik.test`;
const manager = await owner.addMember({ firstName: "Adam", lastName: "Nowak", email: managerEmail, role: "kierownik" });
const managerPassword = `Kierownik-${randomUUID().slice(0, 8)}`;
await registry.as(manager.userId).changePassword(managerPassword, signedInNow());

const username = `kowalczyk.${suffix}`;
const worker = await owner.addMember({ firstName: "Piotr", lastName: "Kowalczyk", email: "", username, role: "pracownik" });
const workerPassword = `Pracownik-${randomUUID().slice(0, 8)}`;
await registry.as(worker.userId).changePassword(workerPassword, signedInNow());

const storekeeperEmail = `smoke-storekeeper-${suffix}@narzedziownik.test`;
const storekeeper = await owner.addMember({ firstName: "Ewa", lastName: "Wiśniewska", email: storekeeperEmail, role: "magazynier" });
const storekeeperPassword = `Magazynier-${randomUUID().slice(0, 8)}`;
await registry.as(storekeeper.userId).changePassword(storekeeperPassword, signedInNow());

await owner.addPerson({ fullName: "Wojciech Lis", note: "Bez telefonu" });

const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
const { toolId } = await owner.addTool({ operationId: randomUUID(), code: "S-01", name: "Szlifierka kątowa", categoryId: grinders.id });

const { locationId: siteId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", managerId: manager.userId });
await owner.moveMapPin(siteId, RATAJE);
const { code } = await owner.poster(siteId);

let forgottenExitAt: string | null = null;
if (process.argv.includes("--zapomniane-wyjscie")) {
  // Pełna minuta, tak jak w polu daty i godziny, żeby czas na budowie wyszedł równo osiem godzin.
  const scannedAt = new Date(Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 60_000) * 60_000);
  await registry.as(worker.userId).registerQueuedPunch({ operationId: randomUUID(), posterToken: code, position: { ...RATAJE, accuracy: 10 }, scannedAt });
  await registry.system().closeCompanyForgottenExits(company.companyId);
  forgottenExitAt = dateTimeInputValue(new Date(scannedAt.getTime() + 8 * 60 * 60 * 1000));
}

console.log(
  JSON.stringify({
    companyName,
    siteId,
    posterCode: code,
    site: RATAJE,
    tool: { id: toolId, code: "S-01" },
    owner: { login: ownerEmail, password: ownerPassword },
    manager: { login: managerEmail, password: managerPassword },
    storekeeper: { login: storekeeperEmail, password: storekeeperPassword },
    worker: { login: username, password: workerPassword },
    forgottenExitAt,
  }),
);
process.exit(0);
