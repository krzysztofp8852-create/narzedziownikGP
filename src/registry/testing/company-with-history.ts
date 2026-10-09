import { randomUUID } from "node:crypto";
import type { NewCompanyInput } from "../registry";
import type { RegistryTestbed } from "./harness";

export const zawbud: NewCompanyInput = {
  name: "Zawbud",
  baseName: "Baza",
  owner: { email: "jan@zawbud.pl", fullName: "Jan Kowalski" },
  invoice: { name: "Zawbud Jan Kowalski", taxId: "778-123-45-63", address: "ul. Polna 3\n60-001 Poznań" },
  tier: "sredni",
  paidUntil: "2026-12-31",
};

export function jpeg() {
  return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(500).fill(1)])], { type: "image/jpeg" });
}

/**
 * Firma z panelu (domyślnie Zawbud) z właścicielem po zmianie hasła, kierownikiem, budową, narzędziem ze stawką,
 * ruchem, zgłoszeniem ze zdjęciem, terminem i uprawnieniem z dokumentami, odbiciami i czatem ze zdjęciem. Zakłada ją
 * super-admin `adminId`.
 */
export async function givenCompanyWithHistory(testbed: RegistryTestbed, adminId: string, input: NewCompanyInput = zawbud) {
  const created = await testbed.registry.superAdmin(adminId).createCompany(input);
  const owner = testbed.registry.as(created.ownerUserId);
  await owner.changePassword(`${input.name}-haslo-1`, testbed.signedInNow());
  const company = { companyId: created.companyId, ownerId: created.ownerUserId, temporaryPassword: "" };
  const managerId = await testbed.givenMember(company, "kierownik", "Adam Nowak");
  const { locationId: siteId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId });
  const category = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
  const { toolId } = await owner.addTool({ operationId: randomUUID(), code: "S-01", name: "Szlifierka", categoryId: category.id, value: 300 });
  await owner.setDailyRate({ kind: "firma" }, 1);
  await owner.setDailyRate({ kind: "narzedzie", toolId }, 5);
  const { base } = await owner.whereIsWhat();
  await owner.registerMovement({ operationId: randomUUID(), kind: "wydanie", fromLocationId: base.id, toLocationId: siteId, toolIds: [toolId], source: "checklista" });
  const { issueId } = await testbed.registry.as(managerId).fileIssue({ operationId: randomUUID(), kind: "inne", description: "Brakuje tarczy", photo: jpeg() });
  await owner.commentOnIssue({ operationId: randomUUID(), issueId, text: "Dokupimy" });
  const { deadlineId } = await owner.addDeadline({ toolId, kind: "przeglad", dueOn: "2026-06-01", cycleMonths: 12 });
  await owner.addDeadlineDocument({ operationId: randomUUID(), deadlineId, kind: "protokol", file: jpeg(), fileName: "protokol.jpg" });
  const { personId } = await owner.addPerson({ fullName: "Zbigniew Kaczmarek", note: null });
  const { kindId } = await owner.addQualificationKind({ name: "Operator koparki" });
  const { qualificationId } = await owner.addQualification({ personId, kind: "wlasny", customKindId: kindId, dueOn: "2026-03-20" });
  await owner.addQualificationDocument({ operationId: randomUUID(), qualificationId, file: jpeg(), fileName: "zaswiadczenie.jpg" });
  await testbed.registry.system().notifyCompanyDueQualifications(company.companyId);
  const { code: posterToken } = await owner.poster(siteId);
  const manager = testbed.registry.as(managerId);
  await manager.punch({ operationId: randomUUID(), posterToken, position: null });
  const [managerPunch] = await owner.punchesToClarify();
  await owner.explainPunch({ punchId: managerPunch.id, note: "Piwnica bez GPS" });
  await owner.correctPunch({ punchId: managerPunch.id, enteredAt: new Date(managerPunch.enteredAt.getTime() - 60_000), reason: "Był wcześniej" });
  // Skan z kolejki offline sprzed odbicia kierownika: konflikt do wyjaśnienia.
  await manager.registerQueuedPunch({ operationId: randomUUID(), posterToken, position: null, scannedAt: new Date(0) });
  await owner.explainPunchConflict({ conflictId: (await owner.punchConflictsToClarify())[0].id, note: null });
  await owner.sendSupportMessage({ operationId: randomUUID(), text: "Zrzut ekranu", photo: jpeg() });
  return { ...company, managerId, siteId, toolId, issueId, personId };
}
