/**
 * Firma do testu dymnego strony Pojazdy: właściciel, kierownik i pracownik. Bus Ducato (kierownik Adam Nowak) ma OC
 * za 10 dni, przegląd techniczny 3 dni po terminie i AC za 90 dni, a Stary bus jest nieaktywny. Wypisuje dane
 * logowania i daty terminów jako JSON.
 */
import { randomUUID } from "node:crypto";
import { formatCalendarDay, formatDay } from "@/i18n/dates";
import { getRegistry } from "@/lib/registry-instance";

const DAY_MS = 24 * 60 * 60 * 1000;
const registry = getRegistry();
const suffix = randomUUID().slice(0, 8);
const companyName = `Test dymny pojazdów ${new Date().toISOString().slice(0, 16)}`;
const signedInNow = () => ({ signedInAt: new Date(Date.now() + 1000) });
const dayFromNow = (days: number) => formatDay(new Date(Date.now() + days * DAY_MS));

const ownerEmail = `smoke-owner-${suffix}@narzedziownik.test`;
const company = await registry.system().createCompany({
  name: companyName,
  baseName: "Magazyn",
  owner: { email: ownerEmail, fullName: "Jan Testowy" },
});
const ownerPassword = `Wlasciciel-${randomUUID().slice(0, 8)}`;
const owner = registry.as(company.ownerUserId);
await owner.changePassword(ownerPassword, signedInNow());

const managerEmail = `smoke-manager-${suffix}@narzedziownik.test`;
const manager = await owner.addMember({ firstName: "Adam", lastName: "Nowak", email: managerEmail, role: "kierownik" });
const managerPassword = `Kierownik-${randomUUID().slice(0, 8)}`;
await registry.as(manager.userId).changePassword(managerPassword, signedInNow());

const workerLogin = `zielinski.${suffix}`;
const worker = await owner.addMember({ firstName: "Marek", lastName: "Zieliński", email: "", username: workerLogin, role: "pracownik" });
const workerPassword = `Pracownik-${randomUUID().slice(0, 8)}`;
await registry.as(worker.userId).changePassword(workerPassword, signedInNow());

const { locationId: busId } = await owner.addVehicle({ name: "Bus Ducato", managerId: manager.userId, registrationNumber: "WPI 4K21" });
const ocDue = dayFromNow(10);
const inspectionDue = dayFromNow(-3);
await owner.addDeadline({ vehicleId: busId, kind: "oc", dueOn: ocDue, cycleMonths: 12 });
await owner.addDeadline({ vehicleId: busId, kind: "przeglad_techniczny", dueOn: inspectionDue, cycleMonths: 12 });
await owner.addDeadline({ vehicleId: busId, kind: "ac", dueOn: dayFromNow(90), cycleMonths: 12 });

const { locationId: oldBusId } = await owner.addVehicle({ name: "Stary bus", managerId: company.ownerUserId });
await owner.deactivateVehicle(oldBusId);

console.log(
  JSON.stringify({
    companyName,
    owner: { login: ownerEmail, password: ownerPassword },
    manager: { login: managerEmail, password: managerPassword },
    worker: { login: workerLogin, password: workerPassword },
    busId,
    oldBusId,
    ocDueText: formatCalendarDay(ocDue),
    inspectionDueText: formatCalendarDay(inspectionDue),
  }),
);
process.exit(0);
