import { formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import type { NotificationContent } from "@/registry/registry";
import { historySearch } from "./history-filters";

/** Tekst powiadomienia w dzwonku: nagłówek i jedno zdanie szczegółów. */
export function notificationText(notification: NotificationContent): { title: string; body: string } {
  switch (notification.kind) {
    case "narzedzia_zabrane":
      return {
        title: t("notifications.toolsTaken.subject", {
          author: notification.takenBy,
          codes: notification.tools.map((tool) => tool.code).join(", "),
          from: notification.from.name,
        }),
        body: t("bell.toolsTaken", { to: notification.to.name, when: formatDateTime(notification.occurredAt) }),
      };
    case "prog_przekroczony":
      return {
        title: t("bell.thresholdExceeded", {
          code: notification.tool.code,
          name: notification.tool.name,
          place: notification.location.name,
          days: notification.thresholdDays,
        }),
        body: t("bell.thresholdExceededBody", { since: formatDateTime(notification.since) }),
      };
    case "progi_przekroczone":
      return {
        title: t(countKey(notification.tools.length), { count: notification.tools.length, days: notification.thresholdDays }),
        body: notification.tools.map((tool) => `${tool.code} (${tool.location.name})`).join(", "),
      };
  }
}

/** Dokąd prowadzi powiadomienie: karta narzędzia, historia albo tablica. */
export function notificationLink(notification: NotificationContent): string {
  switch (notification.kind) {
    case "narzedzia_zabrane":
      return notification.tools.length === 1
        ? `/narzedzia/${notification.tools[0].id}`
        : `/historia${historySearch({ locationId: notification.from.id })}`;
    case "prog_przekroczony":
      return `/narzedzia/${notification.tool.id}`;
    case "progi_przekroczone":
      return "/";
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
