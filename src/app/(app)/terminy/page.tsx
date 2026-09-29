import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { daysLeftText, upcomingDeadlineText } from "@/lib/deadline-text";
import { getRegistry } from "@/lib/registry-instance";
import { UPCOMING_DAYS } from "@/registry/registry";

export const metadata: Metadata = { title: t("deadlines.pageTitle") };

/**
 * Terminy sprzętu z najbliższych 30 dni i te po terminie, dla każdej roli: co, kiedy, gdzie jest sprzęt i kto za niego
 * odpowiada. Tu prowadzi zbiorcze przypomnienie z dzwonka.
 */
export default async function DeadlinesPage() {
  const session = await requireSession();
  const deadlines = await getRegistry().as(session.userId).upcomingDeadlines();

  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("deadlines.back")}
        </Link>
      </p>
      <h1 className="display page-title">{t("deadlines.pageTitle")}</h1>
      <p className="muted">{t("deadlines.pageIntro", { days: UPCOMING_DAYS })}</p>
      {deadlines.length === 0 ? (
        <p className="empty">{t("deadlines.pageEmpty", { days: UPCOMING_DAYS })}</p>
      ) : (
        <ul className="tool-list tool-list-wide" data-testid="upcoming-deadlines">
          {deadlines.map((deadline) => (
            <li key={deadline.id}>
              <Link href={`/narzedzia/${deadline.tool.id}#terminy`} className={deadline.overdue ? "tool-row tool-row-alarm" : "tool-row"}>
                <span className="plate">{deadline.tool.code}</span>
                <span className="tool-row-name">
                  {deadline.tool.name}
                  <span className="tool-row-sub muted">{upcomingDeadlineText(deadline)}</span>
                </span>
                <span className="tool-row-meta">
                  <span className="tool-row-days">{daysLeftText(deadline.daysLeft)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
