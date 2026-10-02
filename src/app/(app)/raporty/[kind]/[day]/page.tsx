import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { reportHeading, reportSections, reportTitle } from "@/lib/report-text";
import { isCalendarDay, isReportKind } from "@/registry/registry";

export async function generateMetadata(props: PageProps<"/raporty/[kind]/[day]">): Promise<Metadata> {
  const { kind } = await props.params;
  return { title: isReportKind(kind) ? reportTitle(kind) : undefined };
}

/** Raport z dzwonka (link z powiadomienia, pusha i e-maila): tak jak go aktor wtedy dostał. */
export default async function ReportPage(props: PageProps<"/raporty/[kind]/[day]">) {
  const session = await requireSession();
  const { kind, day } = await props.params;
  const report =
    isReportKind(kind) && isCalendarDay(day) ? await getRegistry().as(session.userId).sentReport(kind, day) : null;

  const back = (
    <p>
      <Link href="/dzwonek" className="muted">
        {t("reports.back")}
      </Link>
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

  const heading = reportHeading(report);
  return (
    <>
      {back}
      <div>
        <h1 className="display page-title">{heading.title}</h1>
        <p className="muted">{heading.day}</p>
        {heading.intro && <p>{heading.intro}</p>}
      </div>
      {reportSections(report).map((section, index) => (
        <section key={index} className="location" aria-label={section.title}>
          <h2 className="display section-title">{section.title}</h2>
          {section.lead?.map((line, lineIndex) => (
            <p key={lineIndex} className={lineIndex === 0 ? "report-lead" : "muted"}>
              {line}
            </p>
          ))}
          {section.items.length === 0 && section.empty && <p className="empty">{section.empty}</p>}
          {section.items.length > 0 && (
            <ul className="tool-list">
              {section.items.map((item, itemIndex) => (
                // Narzędzie (osoba) bywa w sekcji terminów (uprawnień) kilka razy (np. przegląd i gwarancja).
                <li key={`${item.href}:${itemIndex}`}>
                  <Link href={item.href} className="tool-row report-row">
                    {item.code && <span className="plate">{item.code}</span>}
                    <span className="tool-row-name">
                      {item.name}
                      <span className="tool-row-sub muted">{item.detail}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {section.link && <Link href={section.link.href}>{section.link.label}</Link>}
        </section>
      ))}
    </>
  );
}
