import { formatCalendarDay, formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import type { NotificationContent } from "@/registry/registry";
import { deadlineKindName, deadlineKindWord, deadlineWhen } from "./deadline-text";
import { historySearch } from "./history-filters";
import { placeAt, placeFrom } from "./place-text";
import { reportLink, reportText } from "./report-text";

/** Tekst powiadomienia w dzwonku: nagłówek i jedno zdanie szczegółów. */
export function notificationText(notification: NotificationContent): { title: string; body: string } {
  switch (notification.kind) {
    case "narzedzia_zabrane":
      return {
        title: t("notifications.toolsTaken.subject", {
          author: notification.takenBy,
          codes: notification.tools.map((tool) => tool.code).join(", "),
          from: placeFrom(notification.from),
        }),
        body: t("bell.toolsTaken", { to: placeAt(notification.to), when: formatDateTime(notification.occurredAt) }),
      };
    case "prog_przekroczony":
      return {
        title: t("bell.thresholdExceeded", {
          code: notification.tool.code,
          name: notification.tool.name,
          place: placeAt(notification.location),
          days: notification.thresholdDays,
        }),
        body: t("bell.thresholdExceededBody", { since: formatDateTime(notification.since) }),
      };
    case "progi_przekroczone":
      return {
        title: t(countKey(notification.tools.length), { count: notification.tools.length, days: notification.thresholdDays }),
        body: notification.tools.map((tool) => `${tool.code} (${tool.location.name})`).join(", "),
      };
    case "ruch_odrzucony":
      return {
        title: t("bell.movementRejected", {
          kind: t(`movementKind.${notification.movementKind}`),
          codes: notification.tools.map((tool) => tool.code).join(", "),
        }),
        body: t("bell.movementRejectedBody", {
          when: formatDateTime(notification.occurredAt),
          reason: t(`errors.${notification.reason}`),
        }),
      };
    case "raport_tygodniowy":
    case "raport_piatkowy":
      return reportText(notification.report);
    case "tylko_do_odczytu_wkrotce":
      return {
        title:
          notification.daysLeft === 1 ? t("bell.readOnlySoon.one") : t("bell.readOnlySoon.many", { days: notification.daysLeft }),
        body: t("bell.readOnlySoonBody", {
          paidUntil: formatCalendarDay(notification.paidUntil),
          from: formatCalendarDay(notification.readOnlyFrom),
        }),
      };
    case "terminy": {
      const [only] = notification.deadlines;
      if (notification.deadlines.length === 1) {
        return {
          title: t("bell.deadline", { kind: deadlineKindName(only.kind), code: only.tool.code, name: only.tool.name, when: deadlineWhen(only) }),
          body: t("bell.deadlineBody", { place: placeAt(only.location) }),
        };
      }
      return {
        title: t("bell.deadlines", { count: notification.deadlines.length }),
        body: notification.deadlines
          .map((deadline) => t("bell.deadlineItem", { code: deadline.tool.code, kind: deadlineKindWord(deadline.kind), when: deadlineWhen(deadline) }))
          .join(" · "),
      };
    }
    case "sprzet_wynajety":
      return {
        title: t("bell.rentedTool", { code: notification.tool.code, name: notification.tool.name }),
        body: t("bell.rentedToolBody", {
          author: notification.addedBy,
          place: placeAt(notification.location),
          company: notification.rentalCompany,
          day: formatCalendarDay(notification.returnOn),
        }),
      };
    case "tylko_do_odczytu":
      return {
        title: t("bell.readOnly"),
        body:
          notification.reason === "po_terminie" && notification.paidUntil
            ? t("bell.readOnlyOverdue", { paidUntil: formatCalendarDay(notification.paidUntil) })
            : t("bell.readOnlyManual"),
      };
  }
}

/** Dokąd prowadzi powiadomienie: karta narzędzia, historia, tablica, terminy albo abonament w ustawieniach. */
export function notificationLink(notification: NotificationContent): string {
  switch (notification.kind) {
    case "narzedzia_zabrane":
      return notification.tools.length === 1
        ? `/narzedzia/${notification.tools[0].id}`
        : `/historia${historySearch({ locationId: notification.from.id })}`;
    case "prog_przekroczony":
    case "sprzet_wynajety":
      return `/narzedzia/${notification.tool.id}`;
    case "progi_przekroczone":
      return "/";
    case "ruch_odrzucony":
      return "/do-wyjasnienia";
    case "raport_tygodniowy":
    case "raport_piatkowy":
      return reportLink(notification.report);
    case "tylko_do_odczytu_wkrotce":
    case "tylko_do_odczytu":
      return "/ustawienia";
    case "terminy":
      return notification.deadlines.length === 1 ? `/narzedzia/${notification.deadlines[0].tool.id}#terminy` : "/terminy";
  }
}

/** „1 narzędzie przekroczyło”, „3 narzędzia przekroczyły”, „5 narzędzi przekroczyło”. */
function countKey(count: number) {
  if (count === 1) return "bell.thresholdsExceeded.one" as const;
  const tens = count % 100;
  return count % 10 >= 2 && count % 10 <= 4 && (tens < 12 || tens > 14)
    ? ("bell.thresholdsExceeded.few" as const)
    : ("bell.thresholdsExceeded.many" as const);
}
