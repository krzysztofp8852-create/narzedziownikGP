import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatCalendarDay } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { reportLink, reportSummary, reportTitle } from "@/lib/report-text";
import { canSeeReports, reportKindsOf } from "@/registry/registry";

export const metadata: Metadata = { title: t("reports.page.title") };

/**
 * Raporty aktora: na teraz (właściciel tygodniowy i piątkowy, kierownik piątkowy ze swoimi lokalizacjami) i te, które
 * przyszły do dzwonka, od najnowszego. Magazynier i pracownik raportów nie dostają, więc strony nie otworzą.
 */
export default async function ReportsPage() {
  const session = await requireSession();
  if (!canSeeReports(session)) redirect("/");
  const kinds = reportKindsOf(session);
  const received = await getRegistry().as(session.userId).receivedReports();

  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("reports.page.back")}
        </Link>
      </p>
      <h1 className="display page-title">{t("reports.page.title")}</h1>
      <p className="muted">{kinds.includes("tygodniowy") ? t("reports.page.introOwner") : t("reports.page.introManager")}</p>
      <section className="location" aria-labelledby="reports-live">
        <h2 id="reports-live" className="display section-title">
          {t("reports.page.live")}
        </h2>
        <ul className="tool-list">
          {kinds.map((kind) => (
            <li key={kind}>
              <Link href={`/raporty/${kind}`} className="tool-row report-row">
                <span className="tool-row-name">
                  {reportTitle(kind)}
                  <span className="tool-row-sub muted">{t("reports.page.liveItem")}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="location" aria-labelledby="reports-received">
        <h2 id="reports-received" className="display section-title">
          {t("reports.page.received")}
        </h2>
        {received.length === 0 ? (
          <p className="empty">{t("reports.page.receivedEmpty")}</p>
        ) : (
          <ul className="tool-list">
            {received.map((report) => (
              <li key={reportLink(report)}>
                <Link href={reportLink(report)} className="tool-row report-row">
                  <span className="tool-row-name">
                    {reportTitle(report.kind)}
                    <span className="tool-row-sub muted">
                      {t("reports.dayOf", { day: formatCalendarDay(report.day) })} · {reportSummary(report)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
