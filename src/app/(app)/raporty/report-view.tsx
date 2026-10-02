import Link from "next/link";
import { formatCalendarDay } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { reportHeading, reportSections } from "@/lib/report-text";
import type { Report } from "@/registry/registry";

/**
 * Raport na stronie: nagłówek i sekcje. Raport z dzwonka pokazuje dzień, z którego jest; raport na teraz mówi, że to
 * stan w tej chwili, i nie przypomina o weekendzie, bo bywa otwierany w środku tygodnia.
 */
export function ReportView({ report, live = false }: { report: Report; live?: boolean }) {
  const heading = reportHeading(report);
  return (
    <>
      <div>
        <h1 className="display page-title">{heading.title}</h1>
        <p className="muted">{live ? t("reports.liveDayOf", { day: formatCalendarDay(report.day) }) : heading.day}</p>
        {heading.intro && !live && <p>{heading.intro}</p>}
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
