import { deliverAsSystem } from "./bell";
import { type DeadlineKind, scheduledDeadlines } from "./deadlines";
import type { DeadlinesNotification, Notification, NotifiedDeadline, Recipient } from "./notifications";
import type { Sql } from "./ports";
import type { PushCopy } from "./push";
import { owners } from "./reports";
import { type ReminderLead, reminderPhase, reminderWindow } from "./reminder-lead";
import { warsawTime } from "./validation";

/**
 * Wyprzedzenie przypomnień o terminach narzędzi: tydzień, bo tyle trzeba, żeby ściągnąć sprzęt z budowy na bazę albo
 * do serwisu. Koniec gwarancji przypomina się tylko przed.
 */
const TOOL_DEADLINE_LEADS: Record<DeadlineKind, ReminderLead> = {
  przeglad: { daysBefore: 7, afterDue: true },
  kalibracja: { daysBefore: 7, afterDue: true },
  udt: { daysBefore: 7, afterDue: true },
  gwarancja: { daysBefore: 7, afterDue: false },
};

/** Firmy z terminami, dla których zadanie dzienne sprawdza przypomnienia. */
export async function companiesWithDeadlines(sql: Sql): Promise<string[]> {
  const rows = await sql<{ company_id: string }>("select distinct company_id from app.tool_deadlines where due_on is not null order by company_id");
  return rows.map((row) => row.company_id);
}

/**
 * Zadanie dzienne dla jednej firmy: terminy sprzętu w obiegu, którym dziś (w Polsce) należy się przypomnienie, każde
 * zdarzenie (termin z danego dnia i faza) raz. Każdy aktywny właściciel dostaje jedno zbiorcze o wszystkich, a aktywny
 * kierownik budowy albo pojazdu jedno o sprzęcie, który jest teraz u niego. Właściciel, który sam jest kierownikiem
 * budowy albo pojazdu, ma ten sprzęt w zbiorczym i drugiego nie dostaje. Transakcja systemowa (poza RLS). Zwraca
 * liczbę nowych przypomnień i kopie push nowych wpisów dzwonka.
 */
export async function notifyDueDeadlines(sql: Sql, companyId: string, now: Date): Promise<{ deadlines: number; copies: PushCopy[] }> {
  const today = warsawTime(now).day;
  // Kolejność terminów (od najwcześniejszego) zostaje w każdym przypomnieniu.
  const detected: { deadline: NotifiedDeadline; manager: Recipient | null }[] = [];
  for (const { manager, ...deadline } of await scheduledDeadlines(sql, { today, withinDays: reminderWindow(TOOL_DEADLINE_LEADS), companyId })) {
    const phase = reminderPhase(TOOL_DEADLINE_LEADS[deadline.kind], deadline.dueOn, today);
    if (!phase) continue;
    const inserted = await sql(
      `insert into app.deadline_alerts (deadline_id, company_id, due_on, phase, detected_at) values ($1, $2, $3, $4, $5)
       on conflict do nothing returning deadline_id`,
      [deadline.id, companyId, deadline.dueOn, phase, now],
    );
    if (inserted.length === 0) continue;
    detected.push({
      deadline: { ...deadline, overdue: phase === "po" },
      manager: manager?.active ? { userId: manager.userId, fullName: manager.fullName } : null,
    });
  }
  if (detected.length === 0) return { deadlines: 0, copies: [] };

  const summary = (recipient: Recipient, entries: typeof detected): DeadlinesNotification => ({
    kind: "terminy",
    recipient,
    deadlines: entries.map((entry) => entry.deadline),
  });
  const companyOwners = await owners(sql, companyId);
  const notifications: Notification[] = companyOwners.map((owner) => summary({ userId: owner.userId, fullName: owner.fullName }, detected));
  const ownerIds = new Set(companyOwners.map((owner) => owner.userId));
  const forSiteManagers = detected.filter((entry) => entry.manager && !ownerIds.has(entry.manager.userId));
  for (const entries of Map.groupBy(forSiteManagers, (entry) => entry.manager!.userId).values()) {
    notifications.push(summary(entries[0].manager!, entries));
  }
  const copies = await deliverAsSystem(sql, companyId, notifications, now);
  return { deadlines: detected.length, copies };
}
