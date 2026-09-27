import { formatCalendarDay, formatDateTime } from "@/i18n/dates";
import { formatMoney } from "@/i18n/money";
import { t } from "@/i18n/t";
import type { Notifier } from "@/registry/ports";
import type { EmailedNotification, Report, ToolsTakenNotification } from "@/registry/registry";
import { fridayToolCount, reportHeading, reportLink, reportSections } from "./report-text";

export interface Email {
  to: string;
  subject: string;
  text: string;
  /** Wersja HTML (raporty); bez niej klient poczty pokaże tekst. */
  html?: string;
}

/**
 * Treść e-maila z powiadomieniem. `appUrl`: adres aplikacji do linku w e-mailu z raportem; bez niego raport
 * jest tylko w treści.
 */
export function notificationEmail(notification: EmailedNotification, { appUrl }: { appUrl: string | null } = { appUrl: null }): Email {
  switch (notification.kind) {
    case "narzedzia_zabrane":
      return toolsTakenEmail(notification);
    case "raport_tygodniowy":
    case "raport_piatkowy":
      return reportEmail(notification.recipient, notification.report, appUrl);
  }
}

/** „Adam Nowak zabiera S-01, S-02 z budowy Winogrady”. */
function toolsTakenEmail(notification: ToolsTakenNotification): Email {
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

/** Raport w e-mailu: te same sekcje co na stronie raportu, jako tekst i jako HTML w jednej kolumnie (telefon). */
function reportEmail(recipient: { email: string; fullName: string }, report: Report, appUrl: string | null): Email {
  const heading = reportHeading(report);
  const sections = reportSections(report);
  const url = appUrl ? new URL(reportLink(report), appUrl).toString() : null;
  const day = formatCalendarDay(report.day);
  const subject =
    report.kind === "tygodniowy"
      ? t("reports.email.weeklySubject", { day, value: formatMoney(report.offBaseValue) })
      : t("reports.email.fridaySubject", { day, count: fridayToolCount(report) });
  const greeting = t("notifications.greeting", { name: recipient.fullName });

  const text = [
    greeting,
    "",
    heading.title,
    heading.day,
    ...(heading.intro ? [heading.intro] : []),
    ...sections.flatMap((section) => [
      "",
      section.title.toUpperCase(),
      ...(section.lead ?? []),
      ...(section.items.length === 0 && section.empty ? [section.empty] : []),
      ...section.items.map((item) => `- ${item.code} ${item.name}: ${item.detail}`),
    ]),
    ...(url ? ["", t("reports.open", { url })] : []),
    "",
    t("notifications.signature"),
  ].join("\n");

  const muted = "color:#6b6b66;";
  const html = `<!doctype html>
<html lang="pl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f1;">
<div style="max-width:600px;margin:0 auto;padding:20px 16px;background:#ffffff;color:#1d1d1b;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.5;">
<p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>
<h1 style="margin:0;font-size:24px;line-height:1.25;">${escapeHtml(heading.title)}</h1>
<p style="margin:4px 0 0;${muted}">${escapeHtml(heading.day)}</p>
${heading.intro ? `<p style="margin:12px 0 0;">${escapeHtml(heading.intro)}</p>` : ""}
${sections
  .map(
    (section) => `<h2 style="margin:28px 0 8px;font-size:18px;line-height:1.3;">${escapeHtml(section.title)}</h2>
${(section.lead ?? [])
  .map((line, index) =>
    index === 0 ? `<p style="margin:0;font-size:28px;font-weight:700;">${escapeHtml(line)}</p>` : `<p style="margin:4px 0 0;${muted}">${escapeHtml(line)}</p>`,
  )
  .join("\n")}
${section.items.length === 0 && section.empty ? `<p style="margin:0;${muted}">${escapeHtml(section.empty)}</p>` : ""}
${
  section.items.length > 0
    ? `<ul style="margin:0;padding:0;list-style:none;">${section.items
        .map(
          (item) =>
            `<li style="padding:10px 0;border-top:1px solid #e5e5e0;"><strong style="font-family:Menlo,Consolas,monospace;">${escapeHtml(item.code)}</strong> ${escapeHtml(item.name)}<br><span style="${muted}font-size:15px;">${escapeHtml(item.detail)}</span></li>`,
        )
        .join("")}</ul>`
    : ""
}`,
  )
  .join("\n")}
${
  url
    ? `<p style="margin:32px 0 0;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 20px;background:#1d1d1b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">${escapeHtml(t("reports.openButton"))}</a></p>`
    : ""
}
<p style="margin:32px 0 0;${muted}font-size:14px;">${escapeHtml(t("notifications.signature"))}</p>
</div>
</body>
</html>`;

  return { to: recipient.email, subject, text, html };
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

/** Ponowiona wysyłka tego samego powiadomienia nie dotrze drugi raz. */
function idempotencyKey(notification: EmailedNotification): string {
  const event = notification.kind === "narzedzia_zabrane" ? notification.movementId : notification.report.day;
  return `${notification.kind}/${event}/${notification.recipient.userId}`;
}

/** Kanał e-mail portu powiadomień na API Resend (https://resend.com/docs/api-reference/emails/send-email). */
export function createResendNotifier({ apiKey, from, appUrl }: { apiKey: string; from: string; appUrl: string | null }): Pick<Notifier, "send"> {
  return {
    async send(notification) {
      const email = notificationEmail(notification, { appUrl });
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey(notification),
        },
        body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, ...(email.html && { html: email.html }) }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Resend odrzucił e-mail (${response.status}): ${await response.text()}`);
    },
  };
}

/** Bez klucza Resend (lokalnie, w CI) powiadomienia trafiają tylko do logu serwera. */
export const logNotifier: Pick<Notifier, "send"> = {
  async send(notification) {
    const email = notificationEmail(notification);
    console.warn(`[powiadomienie bez wysyłki: brak RESEND_API_KEY] do ${email.to}: ${email.subject}`);
  },
};
