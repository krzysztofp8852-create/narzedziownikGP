import { formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { notificationLink, notificationText } from "@/lib/bell-text";
import { issueOpenLink, issueSubjectText } from "@/lib/issue-text";
import { placeAt } from "@/lib/place-text";
import { punchCheckText, punchTimeText } from "@/lib/punch-text";
import type { NotificationContent, ToDoItem } from "@/registry/registry";
import { locationPagePath } from "@/lib/location-path";

type NotifiedToDo = Extract<ToDoItem, { kind: "ruch_odrzucony" | "brak_wyjscia" | "termin" | "uprawnienie" }>;

/**
 * Sprawy, które mają swój rodzaj powiadomienia, mówią tak jak ono i prowadzą tam, dokąd ono, żeby skrzynka i push
 * nie mówiły o tym samym dwoma głosami.
 */
function asNotification(item: NotifiedToDo): NotificationContent {
  switch (item.kind) {
    case "ruch_odrzucony": {
      const { id, kind, tools, to, reason, occurredAt } = item.rejection;
      return { kind: "ruch_odrzucony", rejectionId: id, movementKind: kind, tools, to, reason, occurredAt };
    }
    case "brak_wyjscia":
      return { kind: "przypomnienie_wyjscia", punches: [item.punch] };
    case "termin":
      return { kind: "terminy", deadlines: [item.deadline] };
    case "uprawnienie":
      return { kind: "uprawnienia", qualifications: [item.qualification] };
  }
}

/** Sprawa w „Do zrobienia”: nagłówek i jedno zdanie szczegółów. */
export function toDoText(item: ToDoItem): { title: string; body: string } {
  switch (item.kind) {
    case "ruch_odrzucony":
    case "brak_wyjscia":
    case "termin":
    case "uprawnienie":
      return notificationText(asNotification(item));
    case "zgloszenie_narzedzia":
      return {
        title: t("issues.entry.toolReport", { code: item.report.code, name: item.report.name }),
        body: t("issues.entry.toolReportBody", { author: item.report.reportedBy, place: item.report.location.name }),
      };
    case "zgloszenie":
      return {
        title: issueSubjectText({ kind: item.issue.kind, tool: item.issue.tool, place: item.issue.location?.name ?? null }),
        body: t("issues.entry.body", { author: item.issue.author, text: item.issue.description }),
      };
    case "odbicie": {
      const { punch } = item;
      const exit = punch.exit ? ` ${t("inbox.punchExit", { check: punchCheckText(punch.exit) })}` : "";
      return {
        title: t("inbox.punch", { person: punch.person.fullName, place: punch.place.name }),
        body: `${t("inbox.punchBody", { time: punchTimeText(punch), check: punchCheckText(punch.entry) })}${exit}`,
      };
    }
    case "konflikt_odbicia":
      return {
        title: t("inbox.punchConflict", { person: item.conflict.person.fullName, place: item.conflict.place?.name ?? t("punches.conflictUnknownPlace") }),
        body: t("inbox.punchConflictBody", { when: formatDateTime(item.conflict.scannedAt), reason: t(`punches.conflictReasons.${item.conflict.reason}`) }),
      };
    case "alarm":
      return {
        title: t("inbox.alarm", { place: placeAt(item.location) }),
        body: t("inbox.alarmBody", { count: item.tools, days: item.thresholdDays }),
      };
  }
}

/** Dokąd prowadzi sprawa: tam, gdzie się ją załatwia. */
export function toDoLink(item: ToDoItem): string {
  switch (item.kind) {
    case "ruch_odrzucony":
    case "brak_wyjscia":
    case "termin":
    case "uprawnienie":
      return notificationLink(asNotification(item));
    case "zgloszenie_narzedzia":
      return `/zgloszenia#narzedzie-${item.report.id}`;
    case "zgloszenie":
      return issueOpenLink(item.issue.id);
    case "odbicie":
    case "konflikt_odbicia":
      return "/odbicia";
    case "alarm":
      return locationPagePath(item.location.kind, item.location.id);
  }
}

/** Klucz sprawy na liście: rodzaj i to, czego dotyczy. */
export function toDoKey(item: ToDoItem): string {
  switch (item.kind) {
    case "ruch_odrzucony":
      return `${item.kind}:${item.rejection.id}`;
    case "zgloszenie_narzedzia":
      return `${item.kind}:${item.report.id}`;
    case "zgloszenie":
      return `${item.kind}:${item.issue.id}`;
    case "brak_wyjscia":
    case "odbicie":
      return `${item.kind}:${item.punch.id}`;
    case "konflikt_odbicia":
      return `${item.kind}:${item.conflict.id}`;
    case "alarm":
      return `${item.kind}:${item.location.id}`;
    case "termin":
      return `${item.kind}:${item.deadline.id}`;
    case "uprawnienie":
      return `${item.kind}:${item.qualification.id}`;
  }
}
