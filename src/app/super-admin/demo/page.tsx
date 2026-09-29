import type { Metadata } from "next";
import { formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { requireSuperAdmin } from "@/lib/auth";
import { demoEventText, demoVisitDuration } from "@/lib/demo-log-text";
import { getRegistry } from "@/lib/registry-instance";

export const metadata: Metadata = { title: t("superAdmin.demoLog.title") };

const time = new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Warsaw" });

/** Dziennik demo: wizyty z ostatnich 30 dni, od najnowszej, z przebiegiem (wejścia do ról, ekrany, akcje). */
export default async function DemoLogPage() {
  const visits = await getRegistry()
    .superAdmin(await requireSuperAdmin())
    .demoVisits();

  return (
    <>
      <h1 className="display page-title">{t("superAdmin.demoLog.title")}</h1>
      <p className="muted">{t("superAdmin.demoLog.intro")}</p>
      {visits.length === 0 ? (
        <p className="empty">{t("superAdmin.demoLog.empty")}</p>
      ) : (
        <ol className="movements" data-testid="demo-visits">
          {visits.map((visit) => (
            <li key={visit.id} className="movement" data-testid="demo-visit">
              <span className="movement-head">
                <time dateTime={visit.startedAt.toISOString()}>{formatDateTime(visit.startedAt)}</time>
                <span>{visit.roles.map((role) => t(`roles.${role}`)).join(" → ")}</span>
              </span>
              <span className="muted movement-meta">
                {[
                  demoVisitDuration(visit.startedAt, visit.lastSeenAt),
                  visit.device && t(`superAdmin.demoLog.devices.${visit.device}`),
                  t("superAdmin.demoLog.pages", { count: visit.pageCount }),
                  t("superAdmin.demoLog.actions", { count: visit.actionCount }),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <details className="location-more">
                <summary>{t("superAdmin.demoLog.timeline")}</summary>
                <ol className="history demo-timeline">
                  {visit.events.map((event, index) => (
                    <li key={index} className={event.kind === "akcja" ? "demo-event demo-event-action" : "demo-event"}>
                      <time dateTime={event.at.toISOString()}>{time.format(event.at)}</time>
                      <span className="tag">{t(`roles.${event.role}`)}</span>
                      <span>{demoEventText(event)}</span>
                      {event.kind === "strona" && <span className="muted demo-event-path">{event.detail}</span>}
                    </li>
                  ))}
                </ol>
              </details>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
