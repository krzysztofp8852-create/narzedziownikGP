/**
 * Firma do testu filtrów strony Narzędzia: młot H-01 od 40 dni na budowie Rataje (alarm po progu 30 dni), szlifierka
 * S-01 w serwisie, S-02 zaginiona, S-03 na bazie. Wypisuje dane logowania magazyniera jako JSON.
 *
 * Zakłada wszystko przez Rejestr; jak skrypt demo ma własny zegar, który na dodanie i wydanie młota cofa się o 40 dni.
 * Sama firma powstaje teraz, żeby po udanym przebiegu usunął ją `test-company-cleanup`.
 */
import { randomUUID } from "node:crypto";
import { registryDeps } from "@/lib/registry-instance";
import { createRegistry } from "@/registry/registry";
import type { Notifier } from "@/registry/ports";

const DAY_MS = 24 * 60 * 60 * 1000;
let backdated: Date | null = null;
const silent: Notifier = { send: async () => {}, sendToSupport: async () => {}, sendCallbackRequest: async () => {}, push: async () => "sent" };
const registry = createRegistry({ ...registryDeps(), clock: { now: () => backdated ?? new Date() }, notifier: silent });

const suffix = randomUUID().slice(0, 8);
const companyName = `Test e2e filtrów narzędzi ${new Date().toISOString().slice(0, 16)}`;
const signedInNow = () => ({ signedInAt: new Date(Date.now() + 1000) });

const ownerEmail = `filters-owner-${suffix}@narzedziownik.test`;
const company = await registry.system().createCompany({
  name: companyName,
  baseName: "Magazyn",
  owner: { email: ownerEmail, fullName: "Jan Testowy" },
});
const owner = registry.as(company.ownerUserId);
await owner.changePassword(`Wlasciciel-${randomUUID().slice(0, 8)}`, signedInNow());

const storekeeperEmail = `filters-storekeeper-${suffix}@narzedziownik.test`;
const storekeeper = await owner.addMember({ firstName: "Piotr", lastName: "Wiśniewski", email: storekeeperEmail, role: "magazynier" });

const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", managerId: company.ownerUserId });
const { locationId: serviceId } = await owner.addService({ name: "Serwis Hilti" });
const hammers = await owner.addCategory({ name: "Młoty", prefix: "H" });
const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
const tool = async (code: string, name: string, categoryId: string) =>
  (await owner.addTool({ operationId: randomUUID(), code, name, categoryId })).toolId;
const s01 = await tool("S-01", "Szlifierka kątowa", grinders.id);
const s02 = await tool("S-02", "Szlifierka mała", grinders.id);
await tool("S-03", "Szlifierka duża", grinders.id);

const { base } = await owner.whereIsWhat();
const move = (kind: "wydanie" | "do_serwisu", toLocationId: string, toolIds: string[]) =>
  owner.registerMovement({ operationId: randomUUID(), kind, fromLocationId: base.id, toLocationId, toolIds, source: "checklista" });
backdated = new Date(Date.now() - 40 * DAY_MS);
const h01 = await tool("H-01", "Młot Hilti", hammers.id);
await move("wydanie", ratajeId, [h01]);
backdated = null;
await move("do_serwisu", serviceId, [s01]);
await move("wydanie", ratajeId, [s02]);
await owner.markToolLost({ operationId: randomUUID(), toolId: s02, reason: "nie ma jej na budowie" });

const storekeeperPassword = `Magazynier-${randomUUID().slice(0, 8)}`;
await registry.as(storekeeper.userId).changePassword(storekeeperPassword, signedInNow());

console.log(
  JSON.stringify({
    companyName,
    storekeeper: { email: storekeeperEmail, password: storekeeperPassword },
  }),
);
process.exit(0);
