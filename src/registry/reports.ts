import { whereIsWhat } from "./board";
import { deliverAsSystem } from "./bell";
import { type UpcomingDeadline, upcomingDeadlines } from "./deadlines";
import { RegistryError } from "./errors";
import { type EmailedNotification, type Notification, type Recipient, reportKey } from "./notifications";
import type { Sql } from "./ports";
import type { PushCopy } from "./push";
import type { Session } from "./registry";
import { toolReports } from "./tool-reports";
import { daysSince, type LocationKind } from "./tools";
import { warsawTime } from "./validation";

export const REPORT_KINDS = ["tygodniowy", "piatkowy"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export function isReportKind(text: string): text is ReportKind {
  return (REPORT_KINDS as readonly string[]).includes(text);
}

/** Pełne podsumowanie dla właściciela, w poniedziałek o 7:00. */
export interface WeeklyReport {
  kind: "tygodniowy";
  /** Dzień raportu w Polsce, RRRR-MM-DD. */
  day: string;
  thresholdDays: number;
  /** Narzędzia z alarmem, od najdłużej stojącego. */
  overThreshold: {
    id: string;
    code: string;
    name: string;
    location: { id: string; name: string };
    /** Od ilu dni tam stoi. */
    days: number;
    /** Kierownik lokalizacji. */
    manager: string;
  }[];
  /** Zaginione, od najdawniej zaginionego. */
  lost: { id: string; code: string; name: string; days: number; lastLocation: { id: string; name: string }; responsible: string | null }[];
  /** Łączna wartość sprzętu poza bazą w zł. */
  offBaseValue: number;
  /** Kwota poza bazą z raportu tygodniowego z poprzedniego tygodnia; null, gdy go nie było. */
  previousOffBaseValue: number | null;
  /** O ile zł kwota poza bazą urosła (albo zmalała, gdy ujemna) od poprzedniego tygodnia; null bez porównania. */
  offBaseChange: number | null;
  /** Zgłoszenia narzędzi czekające na decyzję, od najstarszego. */
  toolReports: { id: string; code: string; name: string; location: { id: string; name: string }; reportedBy: string; daysWaiting: number }[];
  /** Narzędzia na bazie najdłużej bez wyjazdu, od najdłużej. */
  longestUnused: { id: string; code: string; name: string; days: number }[];
  /** Terminy w najbliższych 30 dniach i te po terminie, od najwcześniejszego; brak w raportach sprzed terminów. */
  deadlines?: UpcomingDeadline[];
}

/** Krótka lista sprzętu poza bazą przed weekendem, w piątek o 16:00. */
export interface FridayReport {
  kind: "piatkowy";
  /** Dzień raportu w Polsce, RRRR-MM-DD. */
  day: string;
  /** Lokalizacje poza bazą, na których jest sprzęt, z kierownikiem. */
  locations: {
    id: string;
    name: string;
    kind: LocationKind;
    manager: { id: string; fullName: string };
    tools: { id: string; code: string; name: string; days: number }[];
  }[];
}

export type Report = WeeklyReport | FridayReport;

/** Ile narzędzi najdłużej nieużywanych pokazuje raport tygodniowy. */
const LONGEST_UNUSED_COUNT = 5;

/** Pora raportów: dzień tygodnia (1 = poniedziałek) i godzina czasu polskiego. */
const SCHEDULE: Record<ReportKind, { weekday: number; hour: number }> = {
  tygodniowy: { weekday: 1, hour: 7 },
  piatkowy: { weekday: 5, hour: 16 },
};


/**
 * Raporty, na które przyszła pora: od godziny raportu do końca tego dnia w Polsce. Harmonogram uruchamia
 * zadanie o obu godzinach UTC, które mogą nią być (czas zimowy i letni), a raport idzie raz na dzień.
 */
export function dueReports(now: Date): { kind: ReportKind; day: string }[] {
  const local = warsawTime(now);
  return REPORT_KINDS.filter((kind) => local.weekday === SCHEDULE[kind].weekday && local.hour >= SCHEDULE[kind].hour)
    .map((kind) => ({ kind, day: local.day }));
}

/** Dzień o `days` wcześniej (RRRR-MM-DD). */
function daysBefore(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** Poniedziałek tygodnia, w którym jest dany dzień. */
function mondayOf(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return daysBefore(day, (weekday + 6) % 7);
}

export function requireWeeklyReportReader(session: Session) {
  if (session.role !== "wlasciciel") throw new RegistryError("forbidden");
}

export function requireFridayReportReader(session: Session) {
  if (session.role !== "wlasciciel" && session.role !== "kierownik") throw new RegistryError("forbidden");
}

/**
 * Raport tygodniowy firmy aktora w danej chwili, z tych samych danych co tablica „Gdzie jest co”, i terminy sprzętu.
 * Kwotę poza bazą porównuje z raportem z poniedziałku poprzedniego tygodnia. Tylko właściciel (wartości w zł).
 */
export async function weeklyReport(sql: Sql, session: Session, now: Date): Promise<WeeklyReport> {
  requireWeeklyReportReader(session);
  const day = warsawTime(now).day;
  const board = await whereIsWhat(sql, session, now);
  const [{ threshold_days }] = await sql<{ threshold_days: number }>("select alarm_threshold_days as threshold_days from app.companies where id = $1", [
    session.company.id,
  ]);
  const [previous] = await sql<{ value: string }>(
    "select off_base_value::text as value from app.company_reports where company_id = $1 and kind = 'tygodniowy' and day = $2",
    [session.company.id, daysBefore(mondayOf(day), 7)],
  );
  const pending = await toolReports(sql);
  const offBaseValue = board.offBaseValue!;
  const previousOffBaseValue = previous ? Number(previous.value) : null;
  return {
    kind: "tygodniowy",
    day,
    thresholdDays: threshold_days,
    overThreshold: [...board.sites, ...board.vehicles]
      .flatMap((place) =>
        place.tools
          .filter((tool) => tool.alarm)
          .map((tool) => ({
            id: tool.id,
            code: tool.code,
            name: tool.name,
            location: { id: place.id, name: place.name },
            days: tool.daysInPlace,
            manager: place.manager.fullName,
          })),
      )
      .sort((a, b) => b.days - a.days || a.code.localeCompare(b.code)),
    lost: board.lost.map((tool) => ({
      id: tool.id,
      code: tool.code,
      name: tool.name,
      days: tool.daysLost,
      lastLocation: tool.lastLocation,
      responsible: tool.responsible,
    })),
    offBaseValue,
    previousOffBaseValue,
    // W groszach, żeby nie zbierać błędów zaokrągleń.
    offBaseChange: previousOffBaseValue === null ? null : (Math.round(offBaseValue * 100) - Math.round(previousOffBaseValue * 100)) / 100,
    toolReports: pending.map((report) => ({
      id: report.id,
      code: report.code,
      name: report.name,
      location: report.location,
      reportedBy: report.reportedBy,
      daysWaiting: daysSince(report.reportedAt, now),
    })),
    longestUnused: [...board.base.tools]
      .sort((a, b) => b.daysInPlace - a.daysInPlace || a.code.localeCompare(b.code))
      .slice(0, LONGEST_UNUSED_COUNT)
      .map((tool) => ({ id: tool.id, code: tool.code, name: tool.name, days: tool.daysInPlace })),
    deadlines: await upcomingDeadlines(sql, now),
  };
}

/**
 * Raport piątkowy w danej chwili: właściciel widzi całą firmę, kierownik tylko swoje lokalizacje.
 * Sprzęt poza bazą z tablicy, bez wartości.
 */
export async function fridayReport(sql: Sql, session: Session, now: Date): Promise<FridayReport> {
  requireFridayReportReader(session);
  const board = await whereIsWhat(sql, session, now);
  const places = [
    ...board.sites.map((site) => ({ ...site, kind: "budowa" as const })),
    ...board.vehicles.map((vehicle) => ({ ...vehicle, kind: "pojazd" as const })),
  ];
  const locations = places
    .filter((place) => place.tools.length > 0)
    .map((place) => ({
      id: place.id,
      name: place.name,
      kind: place.kind,
      manager: { id: place.manager.id, fullName: place.manager.fullName },
      tools: place.tools.map((tool) => ({ id: tool.id, code: tool.code, name: tool.name, days: tool.daysInPlace })),
    }));
  const report: FridayReport = { kind: "piatkowy", day: warsawTime(now).day, locations };
  return session.role === "wlasciciel" ? report : forManager(report, session.userId);
}

/** Raport piątkowy zawężony do lokalizacji kierownika. */
function forManager(report: FridayReport, managerId: string): FridayReport {
  return { ...report, locations: report.locations.filter((location) => location.manager.id === managerId) };
}

/** Raport z dzwonka aktora z danego dnia (np. z linku w powiadomieniu); null, gdy go nie dostał. */
export async function sentReport(sql: Sql, session: Session, kind: ReportKind, day: string): Promise<Report | null> {
  const [row] = await sql<{ content: { report: Report } }>(
    "select content from app.notifications where recipient_id = $1 and dedupe_key = $2",
    [session.userId, reportKey(kind, day)],
  );
  return row?.content.report ?? null;
}

/** Aktywni właściciele firmy, z e-mailem, od najdawniej dodanego. Transakcja systemowa. */
export async function owners(sql: Sql, companyId: string): Promise<(Recipient & { email: string })[]> {
  const rows = await sql<{ user_id: string; full_name: string; email: string }>(
    "select user_id, full_name, email from app.users where company_id = $1 and role = 'wlasciciel' and active order by created_at, user_id",
    [companyId],
  );
  return rows.map((row) => ({ userId: row.user_id, fullName: row.full_name, email: row.email }));
}

/** Firmy, dla których zadanie harmonogramu składa raporty. */
export async function companies(sql: Sql): Promise<string[]> {
  const rows = await sql<{ id: string }>("select id from app.companies order by id");
  return rows.map((row) => row.id);
}

/**
 * Zapisuje raport firmy z danego dnia w dzwonkach adresatów, o ile firma jeszcze go nie dostała. Tygodniowy:
 * każdy właściciel (z e-mailem). Piątkowy: każdy właściciel całą firmę (z e-mailem), a każdy aktywny kierownik
 * swoje lokalizacje; gdy na nich (albo w całej firmie) nic nie ma, nie dostaje nic. Właściciel, który sam jest
 * kierownikiem lokalizacji, dostaje tylko raport całej firmy. Transakcja systemowa (poza RLS).
 * Zwraca, czy ktoś dostał raport, i kopie push i e-mail nowych wpisów.
 */
export async function deliverReport(
  sql: Sql,
  companyId: string,
  report: Report,
  now: Date,
): Promise<{ delivered: boolean; copies: PushCopy[]; emails: EmailedNotification[] }> {
  const offBaseValue = report.kind === "tygodniowy" ? report.offBaseValue : null;
  const inserted = await sql(
    `insert into app.company_reports (company_id, kind, day, off_base_value, generated_at) values ($1, $2, $3, $4, $5)
     on conflict do nothing returning day`,
    [companyId, report.kind, report.day, offBaseValue, now],
  );
  if (inserted.length === 0) return { delivered: false, copies: [], emails: [] };

  const emailed: EmailedNotification[] = [];
  const notifications: Notification[] = [];
  const nothingOffBase = report.kind === "piatkowy" && report.locations.length === 0;
  for (const owner of nothingOffBase ? [] : await owners(sql, companyId)) {
    const notification: EmailedNotification =
      report.kind === "tygodniowy"
        ? { kind: "raport_tygodniowy", recipient: owner, report }
        : { kind: "raport_piatkowy", recipient: owner, report };
    notifications.push(notification);
    emailed.push(notification);
  }
  if (report.kind === "piatkowy") {
    const managerIds = [...new Set(report.locations.map((location) => location.manager.id))];
    const managers = await sql<{ user_id: string; full_name: string }>(
      "select user_id, full_name from app.users where user_id = any($1::uuid[]) and role = 'kierownik' and active order by full_name",
      [managerIds],
    );
    for (const manager of managers) {
      notifications.push({
        kind: "raport_piatkowy",
        recipient: { userId: manager.user_id, fullName: manager.full_name },
        report: forManager(report, manager.user_id),
      });
    }
  }
  const copies = await deliverAsSystem(sql, companyId, notifications, now);
  const fresh = new Set(copies.map((copy) => copy.recipientId));
  return { delivered: copies.length > 0, copies, emails: emailed.filter((notification) => fresh.has(notification.recipient.userId)) };
}
