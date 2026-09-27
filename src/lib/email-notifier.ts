import { formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import type { Notifier } from "@/registry/ports";
import type { EmailedNotification } from "@/registry/registry";

export interface Email {
  to: string;
  subject: string;
  text: string;
}

/** Treść e-maila z powiadomieniem, np. „Adam Nowak zabiera S-01, S-02 z budowy Winogrady”. */
export function notificationEmail(notification: EmailedNotification): Email {
  const codes = notification.tools.map((tool) => tool.code).join(", ");
  return {
    to: notification.recipient.email,
    subject: t("notifications.toolsTaken.subject", { author: notification.takenBy, codes, from: notification.from.name }),
    text: [
      t("notifications.greeting", { name: notification.recipient.fullName }),
      "",
      t("notifications.toolsTaken.lead", {
        author: notification.takenBy,
        from: notification.from.name,
        to: notification.to.name,
        when: formatDateTime(notification.occurredAt),
      }),
      ...notification.tools.map((tool) => `- ${tool.code} ${tool.name}`),
      "",
      t("notifications.toolsTaken.responsibility"),
      "",
      t("notifications.signature"),
    ].join("\n"),
  };
}

/** Kanał e-mail portu powiadomień na API Resend (https://resend.com/docs/api-reference/emails/send-email). */
export function createResendNotifier({ apiKey, from }: { apiKey: string; from: string }): Notifier {
  return {
    async send(notification) {
      const email = notificationEmail(notification);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          // Ponowiona wysyłka tego samego powiadomienia nie dotrze drugi raz.
          "Idempotency-Key": `${notification.kind}/${notification.movementId}/${notification.recipient.userId}`,
        },
        body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Resend odrzucił e-mail (${response.status}): ${await response.text()}`);
    },
  };
}

/** Bez klucza Resend (lokalnie, w CI) powiadomienia trafiają tylko do logu serwera. */
export const logNotifier: Notifier = {
  async send(notification) {
    const email = notificationEmail(notification);
    console.warn(`[powiadomienie bez wysyłki: brak RESEND_API_KEY] do ${email.to}: ${email.subject}`);
  },
};
