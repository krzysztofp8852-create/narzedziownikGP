import { deliverAsSystem } from "./bell";
import type { Notification, QualificationsNotification, Recipient } from "./notifications";
import type { Sql } from "./ports";
import type { PushCopy } from "./push";
import { type NotifiedQualification, scheduledQualifications } from "./qualifications";
import { type ReminderLead, reminderPhase } from "./reminder-lead";
import { owners } from "./reports";
import { warsawTime } from "./validation";

/**
 * Wyprzedzenie przypomnień o uprawnieniach (każdy rodzaj, także własny): 30 dni, bo tyle trzeba, żeby umówić
 * badania albo szkolenie, i raz po końcu ważności.
 */
const QUALIFICATION_LEAD: ReminderLead = { daysBefore: 30, afterDue: true };

/** Firmy z uprawnieniami, dla których zadanie dzienne sprawdza przypomnienia. */
export async function companiesWithQualifications(sql: Sql): Promise<string[]> {
  const rows = await sql<{ company_id: string }>("select distinct company_id from app.qualifications order by company_id");
  return rows.map((row) => row.company_id);
}

/**
 * Zadanie dzienne dla jednej firmy: uprawnienia aktywnych osób, którym dziś (w Polsce) należy się przypomnienie,
 * każde zdarzenie (data ważności i faza) raz. Każdy aktywny właściciel dostaje jedno zbiorcze o wszystkich, a osoba
 * z aktywnym kontem jedno o własnych (właściciel ma swoje w zbiorczym). Kierownik nie dostaje przypomnień o innych
 * osobach. Transakcja systemowa (poza RLS). Zwraca liczbę nowych przypomnień i kopie push nowych wpisów dzwonka.
 */
export async function notifyDueQualifications(sql: Sql, companyId: string, now: Date): Promise<{ qualifications: number; copies: PushCopy[] }> {
  const today = warsawTime(now).day;
  // Kolejność (od najwcześniejszego) zostaje w każdym przypomnieniu.
  const detected: { qualification: NotifiedQualification; account: Recipient | null }[] = [];
  for (const { account, ...qualification } of await scheduledQualifications(sql, { today, withinDays: QUALIFICATION_LEAD.daysBefore, companyId })) {
    const phase = reminderPhase(QUALIFICATION_LEAD, qualification.dueOn, today);
    if (!phase) continue;
    const inserted = await sql(
      `insert into app.qualification_alerts (qualification_id, company_id, due_on, phase, detected_at) values ($1, $2, $3, $4, $5)
       on conflict do nothing returning qualification_id`,
      [qualification.id, companyId, qualification.dueOn, phase, now],
    );
    if (inserted.length === 0) continue;
    detected.push({
      qualification: { ...qualification, overdue: phase === "po" },
      account: account?.active ? { userId: account.userId, fullName: account.fullName } : null,
    });
  }
  if (detected.length === 0) return { qualifications: 0, copies: [] };

  const summary = (recipient: Recipient, entries: typeof detected): QualificationsNotification => ({
    kind: "uprawnienia",
    recipient,
    qualifications: entries.map((entry) => entry.qualification),
  });
  const companyOwners = await owners(sql, companyId);
  const notifications: Notification[] = companyOwners.map((owner) => summary({ userId: owner.userId, fullName: owner.fullName }, detected));
  const ownerIds = new Set(companyOwners.map((owner) => owner.userId));
  const ownOnes = detected.filter((entry) => entry.account && !ownerIds.has(entry.account.userId));
  for (const entries of Map.groupBy(ownOnes, (entry) => entry.account!.userId).values()) {
    notifications.push(summary(entries[0].account!, entries));
  }
  const copies = await deliverAsSystem(sql, companyId, notifications, now);
  return { qualifications: detected.length, copies };
}
