import { deliverAsSystem } from "./bell";
import { type DeadlineKind, scheduledDeadlines } from "./deadlines";
import type { DeadlinesNotification, Notification, NotifiedDeadline, Recipient } from "./notifications";
import type { Sql } from "./ports";
import type { PushCopy } from "./push";
import type { Session } from "./registry";
import { owners } from "./reports";
import { type ReminderLead, reminderPhase, reminderWindow } from "./reminder-lead";
import { warsawTime } from "./validation";

/**
 * Wyprzedzenie przypomnień o terminach narzędzi: tydzień, bo tyle trzeba, żeby ściągnąć sprzęt z budowy na bazę albo
 * do serwisu, a termin zwrotu wynajętego dzień, bo wynajem trwa zwykle kilka dni. Koniec gwarancji przypomina się
 * tylko przed. Terminy pojazdu: OC, AC i tachograf 30 dni, żeby zdążyć porównać oferty i umówić warsztat z
 * legalizacją, a przegląd techniczny i własny termin tydzień.
 */
const DEADLINE_LEADS: Record<DeadlineKind, ReminderLead> = {
  przeglad: { daysBefore: 7, afterDue: true },
  kalibracja: { daysBefore: 7, afterDue: true },
  udt: { daysBefore: 7, afterDue: true },
  gwarancja: { daysBefore: 7, afterDue: false },
  zwrot: { daysBefore: 1, afterDue: true },
  przeglad_techniczny: { daysBefore: 7, afterDue: true },
  oc: { daysBefore: 30, afterDue: true },
  ac: { daysBefore: 30, afterDue: true },
  tachograf: { daysBefore: 30, afterDue: true },
  wlasny: { daysBefore: 7, afterDue: true },
};

/**
 * Terminy w skrzynce „Wymaga uwagi”: te, którym należy się dziś przypomnienie (to samo okno co w zadaniu dziennym),
 * póki nikt ich nie wykona. Właściciel wszystkie, kierownik sprzętu na swojej budowie albo pojeździe i swojego pojazdu,
 * a do tego magazynier terminy narzędzi, choć przypomnień nie dostaje: sam je wykonuje. Pracownik żadnych. Od
 * najwcześniejszego.
 */
export async function deadlinesToHandle(sql: Sql, session: Session, now: Date): Promise<NotifiedDeadline[]> {
  if (session.role === "pracownik") return [];
  const today = warsawTime(now).day;
  return (await scheduledDeadlines(sql, { today, withinDays: reminderWindow(DEADLINE_LEADS) })).flatMap(({ manager, ...deadline }) => {
    const phase = reminderPhase(DEADLINE_LEADS[deadline.kind], deadline.dueOn, today);
    const mine =
      session.role === "wlasciciel" ||
      (session.role === "kierownik" && manager?.userId === session.userId) ||
      (session.role === "magazynier" && deadline.tool !== null);
    return phase && mine ? [{ ...deadline, overdue: phase === "po" }] : [];
  });
}

/** Firmy z terminami, dla których zadanie dzienne sprawdza przypomnienia. */
export async function companiesWithDeadlines(sql: Sql): Promise<string[]> {
  const rows = await sql<{ company_id: string }>("select distinct company_id from app.tool_deadlines where due_on is not null order by company_id");
  return rows.map((row) => row.company_id);
}

/**
 * Zadanie dzienne dla jednej firmy: terminy sprzętu w obiegu i aktywnych pojazdów, którym dziś (w Polsce) należy się
 * przypomnienie, każde zdarzenie (termin z danego dnia i faza) raz. Każdy aktywny właściciel dostaje jedno zbiorcze
 * o wszystkich, a aktywny kierownik budowy albo pojazdu jedno o sprzęcie, który jest teraz u niego, i o terminach
 * swojego pojazdu. Właściciel, który sam jest kierownikiem budowy albo pojazdu, ma je w zbiorczym i drugiego nie
 * dostaje. Transakcja systemowa (poza RLS). Zwraca
 * liczbę nowych przypomnień i kopie push nowych wpisów dzwonka.
 */
export async function notifyDueDeadlines(sql: Sql, companyId: string, now: Date): Promise<{ deadlines: number; copies: PushCopy[] }> {
  const today = warsawTime(now).day;
  // Kolejność terminów (od najwcześniejszego) zostaje w każdym przypomnieniu.
  const detected: { deadline: NotifiedDeadline; manager: Recipient | null }[] = [];
  for (const { manager, ...deadline } of await scheduledDeadlines(sql, { today, withinDays: reminderWindow(DEADLINE_LEADS), companyId })) {
    const phase = reminderPhase(DEADLINE_LEADS[deadline.kind], deadline.dueOn, today);
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
