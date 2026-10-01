import { daysBetween } from "./validation";

/**
 * Kiedy przypomina się termin danego rodzaju: ile dni przed terminem i czy raz po nim. Stałe w programie, a nie
 * ustawienie firmy: 7 dni przy terminach narzędzi i przeglądzie pojazdu, 30 przy OC, AC, tachografie i uprawnieniach
 * ludzi, 1 przy zwrocie sprzętu wynajętego.
 */
export interface ReminderLead {
  daysBefore: number;
  /** Czy po terminie przychodzi przypomnienie „po” (koniec gwarancji go nie ma: po nim nie ma już czego pilnować). */
  afterDue: boolean;
}

/**
 * Które przypomnienie należy się w dniu `today` (RRRR-MM-DD, w Polsce) o terminie `dueOn`: „przed” od `daysBefore` dni
 * przed terminem do dnia terminu, „po” od następnego dnia.
 */
export function reminderPhase(lead: ReminderLead, dueOn: string, today: string): "przed" | "po" | null {
  const daysLeft = daysBetween(today, dueOn);
  if (daysLeft < 0) return lead.afterDue ? "po" : null;
  return daysLeft <= lead.daysBefore ? "przed" : null;
}

/** Na ile dni do przodu zadanie dzienne szuka terminów: najdłuższe wyprzedzenie z rodzajów. */
export function reminderWindow(leads: Record<string, ReminderLead>): number {
  return Math.max(...Object.values(leads).map((lead) => lead.daysBefore));
}
