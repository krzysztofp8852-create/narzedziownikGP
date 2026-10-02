import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { reportTitle } from "@/lib/report-text";
import { isReportKind, reportKindsOf } from "@/registry/registry";
import { ReportView } from "../report-view";

export async function generateMetadata(props: PageProps<"/raporty/[kind]">): Promise<Metadata> {
  const { kind } = await props.params;
  return { title: isReportKind(kind) ? reportTitle(kind) : undefined };
}

/** Raport na teraz: złożony w tej chwili z tych samych danych co raport z dzwonka. Tylko rodzaje, które aktor dostaje. */
export default async function LiveReportPage(props: PageProps<"/raporty/[kind]">) {
  const session = await requireSession();
  const { kind } = await props.params;
  if (!isReportKind(kind) || !reportKindsOf(session).includes(kind)) redirect("/raporty");
  const registry = getRegistry().as(session.userId);
  const report = kind === "tygodniowy" ? await registry.weeklyReport() : await registry.fridayReport();

  return (
    <>
      <p>
        <Link href="/raporty" className="muted">
          {t("reports.backToReports")}
        </Link>
      </p>
      <ReportView report={report} live />
    </>
  );
}
