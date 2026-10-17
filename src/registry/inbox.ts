import * as bell from "./bell";
import type { BellEntry } from "./bell";
import { deadlinesToHandle } from "./deadline-reminders";
import { type IssueSummary, issuesToHandle } from "./issues";
import type { NotificationKind, NotifiedDeadline, NotifiedPunch } from "./notifications";
import type { Sql } from "./ports";
import { forgottenExitsToHandle } from "./punch-reminders";
import { canClarifyPunches, type Punch, type PunchConflict, punchConflictsToClarify, punchesToClarify } from "./punches";
import { qualificationsToHandle } from "./qualification-reminders";
import type { NotifiedQualification } from "./qualifications";
import { movementsToClarify, type RejectedMovement } from "./queued-movements";
import type { Session } from "./registry";
import { alarmsToHandle, type LocationAlarm } from "./thresholds";
import { canReviewToolReports, type ToolReport, toolReports } from "./tool-reports";

/** Zakładka skrzynki „Wymaga uwagi”. */
export type InboxList = "do_zrobienia" | "informacje";

/**
 * Sprawa w „Do zrobienia”. Wynika ze stanu firmy, a nie z wpisu w dzwonku, więc znika sama, gdy ktoś ją załatwi
 * (zaakceptuje narzędzie, zamknie albo przeczyta zgłoszenie, wyjaśni ruch lub odbicie, odbije wyjście, zwiezie sprzęt,
 * wykona termin, odnowi uprawnienie).
 */
export type ToDoItem =
  | { kind: "ruch_odrzucony"; rejection: RejectedMovement }
  | { kind: "zgloszenie_narzedzia"; report: ToolReport }
  | { kind: "zgloszenie"; issue: IssueSummary }
  | { kind: "brak_wyjscia"; punch: NotifiedPunch }
  | { kind: "odbicie"; punch: Punch }
  | { kind: "konflikt_odbicia"; conflict: PunchConflict }
  | ({ kind: "alarm" } & LocationAlarm)
  | { kind: "termin"; deadline: NotifiedDeadline }
  | { kind: "uprawnienie"; qualification: NotifiedQualification };

export type ToDoKind = ToDoItem["kind"];

/** Skrzynka „Wymaga uwagi” osoby. */
export interface Inbox {
  /** Sprawy do załatwienia, od najpilniejszego rodzaju. */
  toDo: ToDoItem[];
  /** Ile spraw jest w „Do zrobienia”: licznik przy dzwonku. */
  toDoCount: number;
  /** Raporty i potwierdzenia z dzwonka, od najnowszego. */
  info: BellEntry[];
}

/**
 * Gdzie w skrzynce jest sprawa z powiadomienia danego rodzaju: w „Informacjach” (sam wpis dzwonka) albo w „Do
 * zrobienia” jako sprawa danego rodzaju, wyliczana ze stanu firmy, bo sam wpis nie wie, kiedy ktoś ją załatwi.
 * Nowy rodzaj powiadomienia nie skompiluje się bez miejsca tutaj.
 */
const NOTIFICATION_PLACE = {
  narzedzia_zabrane: "informacje",
  raport_tygodniowy: "informacje",
  raport_piatkowy: "informacje",
  sprzet_wynajety: "informacje",
  tylko_do_odczytu_wkrotce: "informacje",
  tylko_do_odczytu: "informacje",
  prog_przekroczony: "alarm",
  progi_przekroczone: "alarm",
  ruch_odrzucony: "ruch_odrzucony",
  terminy: "termin",
  uprawnienia: "uprawnienie",
  przypomnienie_wyjscia: "brak_wyjscia",
} as const satisfies Record<NotificationKind, "informacje" | ToDoKind>;

/** Zakładka skrzynki, na której jest sprawa z powiadomienia danego rodzaju. */
export function inboxList(kind: NotificationKind): InboxList {
  return NOTIFICATION_PLACE[kind] === "informacje" ? "informacje" : "do_zrobienia";
}

const INFO_KINDS = (Object.keys(NOTIFICATION_PLACE) as NotificationKind[]).filter((kind) => inboxList(kind) === "informacje");

/** Najwięcej wpisów w „Informacjach”. */
const INFO_LIMIT = 50;

/**
 * Skrzynka osoby: każde źródło według tych samych predykatów co jego strona szczegółów (kto widzi zgłoszenia, kto
 * wyjaśnia odbicia, czyje lokalizacje), więc nikt nie dostaje sprawy, której nie może otworzyć ani załatwić.
 */
export async function inbox(sql: Sql, session: Session, now: Date): Promise<Inbox> {
  const toDo = await toDoItems(sql, session, now);
  return { toDo, toDoCount: toDo.length, info: await bell.entries(sql, session, INFO_LIMIT, INFO_KINDS) };
}

/** Licznik przy dzwonku: ile spraw jest w „Do zrobienia”, bez wczytywania „Informacji”. */
export async function toDoCount(sql: Sql, session: Session, now: Date): Promise<number> {
  return (await toDoItems(sql, session, now)).length;
}

async function toDoItems(sql: Sql, session: Session, now: Date): Promise<ToDoItem[]> {
  const clarifier = canClarifyPunches(session);
  return [
    ...(await movementsToClarify(sql, session)).map((rejection) => ({ kind: "ruch_odrzucony" as const, rejection })),
    ...(canReviewToolReports(session) ? await toolReports(sql) : []).map((report) => ({ kind: "zgloszenie_narzedzia" as const, report })),
    ...(await issuesToHandle(sql, session)).map((issue) => ({ kind: "zgloszenie" as const, issue })),
    ...(await forgottenExitsToHandle(sql, session)).map((punch) => ({ kind: "brak_wyjscia" as const, punch })),
    ...(clarifier ? await punchesToClarify(sql, session) : []).map((punch) => ({ kind: "odbicie" as const, punch })),
    ...(clarifier ? await punchConflictsToClarify(sql, session) : []).map((conflict) => ({ kind: "konflikt_odbicia" as const, conflict })),
    ...(await alarmsToHandle(sql, session, now)).map((alarm) => ({ kind: "alarm" as const, ...alarm })),
    ...(await deadlinesToHandle(sql, session, now)).map((deadline) => ({ kind: "termin" as const, deadline })),
    ...(await qualificationsToHandle(sql, session, now)).map((qualification) => ({ kind: "uprawnienie" as const, qualification })),
  ];
}
