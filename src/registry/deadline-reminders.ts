import { deliverAsSystem } from "./bell";
import { type DeadlineKind, scheduledDeadlines } from "./deadlines";
import type { DeadlinesNotification, Notification, NotifiedDeadline, Recipient } from "./notifications";
import type { Sql } from "./ports";
import type { PushCopy } from "./push";
import { owners } from "./reports";
import { daysBetween, warsawTime } from "./validation";

/** Przypomnienie przychodzi tyle dni przed terminem: tyle trzeba, żeby ściągnąć sprzęt z budowy na bazę albo do serwisu. */
const REMINDER_DAYS_BEFORE = 7;

/**
 * Które przypomnienie należy się w dniu `today` (RRRR-MM-DD, w Polsce): „przed” od tygodnia przed terminem do dnia
 * terminu, „po” od następnego dnia. Koniec gwarancji przypomina się tylko przed: po nim nie ma już czego pilnować.
 */
function reminderPhase(kind: DeadlineKind, dueOn: string, today: string): "przed" | "po" | null {
  const daysLeft = daysBetween(today, dueOn);
  if (daysLeft < 0) return kind === "gwarancja" ? null : "po";
  return daysLeft <= REMINDER_DAYS_BEFORE ? "przed" : null;
}

/** Firmy z terminami, dla których zadanie dzienne sprawdza przypomnienia. */
export async function companiesWithDeadlines(sql: Sql): Promise<string[]> {
  const rows = await sql<{ company_id: string }>("select distinct company_id from app.tool_deadlines where due_on is not null order by company_id");
  return rows.map((row) => row.company_id);
}

/**
 * Zadanie dzienne dla jednej firmy: terminy sprzętu w obiegu, którym dziś (w Polsce) należy się przypomnienie, każde
 * zdarzenie (termin z danego dnia i faza) raz. Każdy aktywny właściciel dostaje jedno zbiorcze o wszystkich, a aktywny
 * kierownik budowy albo pojazdu jedno o sprzęcie, który jest teraz u niego. Transakcja systemowa (poza RLS). Zwraca
 * liczbę nowych przypomnień i kopie push nowych wpisów dzwonka.
 */
export async function notifyDueDeadlines(sql: Sql, companyId: string, now: Date): Promise<{ deadlines: number; copies: PushCopy[] }> {
  const today = warsawTime(now).day;
  // Kolejność terminów (od najwcześniejszego) zostaje w każdym przypomnieniu.
  const detected: { deadline: NotifiedDeadline; manager: Recipient | null }[] = [];
  for (const { manager, ...deadline } of await scheduledDeadlines(sql, { today, withinDays: REMINDER_DAYS_BEFORE, companyId })) {
    const phase = reminderPhase(deadline.kind, deadline.dueOn, today);
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
  const notifications: Notification[] = (await owners(sql, companyId)).map((owner) => summary({ userId: owner.userId, fullName: owner.fullName }, detected));
  for (const entries of Map.groupBy(detected.filter((entry) => entry.manager), (entry) => entry.manager!.userId).values()) {
    notifications.push(summary(entries[0].manager!, entries));
  }
  const copies = await deliverAsSystem(sql, companyId, notifications, now);
  return { deadlines: detected.length, copies };
}
