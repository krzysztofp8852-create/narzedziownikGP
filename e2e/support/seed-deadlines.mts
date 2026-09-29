/**
 * Firma do testu dymnego terminów: właściciel i magazynier. Niwelator N-01 jest na bazie bez terminów, a młotowiertarka
 * H-01 w serwisie, z przeglądem co 12 miesięcy za 3 dni i gwarancją. Wypisuje dane logowania i daty jako JSON.
 */
import { randomUUID } from "node:crypto";
import { formatCalendarDay, formatDay } from "@/i18n/dates";
import { getRegistry } from "@/lib/registry-instance";

const DAY_MS = 24 * 60 * 60 * 1000;
const registry = getRegistry();
const suffix = randomUUID().slice(0, 8);
const companyName = `Test dymny terminów ${new Date().toISOString().slice(0, 16)}`;
const signedInNow = () => ({ signedInAt: new Date(Date.now() + 1000) });
const dayFromNow = (days: number) => formatDay(new Date(Date.now() + days * DAY_MS));

const company = await registry.system().createCompany({
  name: companyName,
  baseName: "Magazyn",
  owner: { email: `smoke-owner-${suffix}@narzedziownik.test`, fullName: "Jan Testowy" },
});
const ownerPassword = `Wlasciciel-${randomUUID().slice(0, 8)}`;
const owner = registry.as(company.ownerUserId);
await owner.changePassword(ownerPassword, signedInNow());

const storekeeperEmail = `smoke-magazyn-${suffix}@narzedziownik.test`;
const storekeeper = await owner.addMember({ firstName: "Piotr", lastName: "Wiśniewski", email: storekeeperEmail, role: "magazynier" });
const storekeeperPassword = `Magazynier-${randomUUID().slice(0, 8)}`;
await registry.as(storekeeper.userId).changePassword(storekeeperPassword, signedInNow());

const levels = await owner.addCategory({ name: "Pomiarowe", prefix: "N" });
const hammers = await owner.addCategory({ name: "Młotowiertarki", prefix: "H" });
const { toolId: levelId } = await owner.addTool({ operationId: randomUUID(), code: "N-01", name: "Niwelator laserowy", categoryId: levels.id });
const { toolId: hammerId } = await owner.addTool({ operationId: randomUUID(), code: "H-01", name: "Młotowiertarka Hilti", categoryId: hammers.id });
const { locationId: serviceId } = await owner.addService({ name: "Serwis Hilti" });
const { base } = await owner.whereIsWhat();
await owner.registerMovement({ operationId: randomUUID(), kind: "do_serwisu", fromLocationId: base.id, toLocationId: serviceId, toolIds: [hammerId], source: "checklista" });
await owner.addDeadline({ toolId: hammerId, kind: "przeglad", dueOn: dayFromNow(3), cycleMonths: 12 });
await owner.addDeadline({ toolId: hammerId, kind: "gwarancja", dueOn: dayFromNow(400) });

const calibrationDue = dayFromNow(5);
console.log(
  JSON.stringify({
    companyName,
    owner: { email: `smoke-owner-${suffix}@narzedziownik.test`, password: ownerPassword },
    storekeeper: { email: storekeeperEmail, password: storekeeperPassword },
    levelId,
    hammerId,
    calibrationDue,
    calibrationDueText: formatCalendarDay(calibrationDue),
    todayText: formatCalendarDay(dayFromNow(0)),
  }),
);
process.exit(0);
