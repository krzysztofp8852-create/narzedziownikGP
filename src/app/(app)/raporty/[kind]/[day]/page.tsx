import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { reportTitle } from "@/lib/report-text";
import { canSeeReports, isCalendarDay, isReportKind } from "@/registry/registry";
import { ReportView } from "../../report-view";

export async function generateMetadata(props: PageProps<"/raporty/[kind]/[day]">): Promise<Metadata> {
  const { kind } = await props.params;
  return { title: isReportKind(kind) ? reportTitle(kind) : undefined };
}

/** Raport z dzwonka (link z powiadomienia, pusha, e-maila i strony Raporty): tak jak go aktor wtedy dostał. */
export default async function ReportPage(props: PageProps<"/raporty/[kind]/[day]">) {
  const session = await requireSession();
  const { kind, day } = await props.params;
  const report =
    isReportKind(kind) && isCalendarDay(day) ? await getRegistry().as(session.userId).sentReport(kind, day) : null;

  // Kto nie widzi strony Raporty (np. kierownik, który został pracownikiem), wraca do dzwonka.
  const back = (
    <p>
      {canSeeReports(session) ? (
        <Link href="/raporty" className="muted">
          {t("reports.backToReports")}
        </Link>
      ) : (
        <Link href="/dzwonek" className="muted">
          {t("reports.back")}
        </Link>
      )}
    </p>
  );
  if (!report) {
    return (
      <>
        {back}
        <p className="empty">{t("reports.notFound")}</p>
      </>
    );
  }

  return (
    <>
      {back}
      <ReportView report={report} />
    </>
  );
}
