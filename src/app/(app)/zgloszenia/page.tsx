import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { DamagedIcon } from "@/components/damaged-icon";
import { formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { issueOpenLink, issueTargetText } from "@/lib/issue-text";
import { getRegistry } from "@/lib/registry-instance";
import { canReviewToolReports, type IssueSummary } from "@/registry/registry";
import { ToolReportReview } from "../narzedzia/tool-report-review";
import { markAllIssueEntriesRead } from "./actions";

export const metadata: Metadata = { title: t("issues.title") };

/**
 * Okno 📋: zgłoszenia, które aktor widzi (otwarte, potem zamknięte), a u właściciela także zgłoszone narzędzia
 * z budów, z akceptacją i odrzuceniem jak dotąd.
 */
export default async function IssuesPage() {
  const session = await requireSession();
  const registry = getRegistry().as(session.userId);
  const reviewer = canReviewToolReports(session);
  const [issues, unread, toolReports, categories] = await Promise.all([
    registry.issues(),
    registry.unreadIssueEntryCount(),
    reviewer ? registry.toolReports() : [],
    reviewer ? registry.categories() : [],
  ]);
  const open = issues.filter((issue) => issue.status === "otwarte");
  const closed = issues.filter((issue) => issue.status === "zamkniete");

  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("issues.back")}
        </Link>
      </p>
      <div className="section-head">
        <h1 className="display page-title">{t("issues.title")}</h1>
        <div className="undo">
          {unread > 0 && (
            <form action={markAllIssueEntriesRead}>
              <button className="button button-quiet button-small" type="submit">
                {t("issues.markAllRead")}
              </button>
            </form>
          )}
          <Link className="button button-small" href="/zgloszenia/nowe">
            {t("issues.new")}
          </Link>
        </div>
      </div>
      <p className="muted">{t("issues.intro")}</p>

      {toolReports.length > 0 && (
        <section className="location location-reports" aria-labelledby="tool-reports-title" id="zgloszone-narzedzia">
          <div className="location-head">
            <h2 id="tool-reports-title" className="display section-title">
              {t("toolReports.title")}
            </h2>
            <span className="location-count">{t("board.toolCount", { count: toolReports.length })}</span>
          </div>
          <p className="muted">{t("toolReports.intro")}</p>
          <ul className="tool-reports">
            {toolReports.map((report) => (
              <ToolReportReview key={report.id} report={report} categories={categories} operationId={randomUUID()} />
            ))}
          </ul>
        </section>
      )}

      {issues.length === 0 ? (
        <p className="empty">{t("issues.empty")}</p>
      ) : (
        <>
          <section aria-labelledby="issues-open">
            <h2 id="issues-open" className="display section-title">
              {t("issues.open")}
            </h2>
            {open.length === 0 ? <p className="empty">{t("issues.openEmpty")}</p> : <IssueList issues={open} />}
          </section>
          {closed.length > 0 && (
            <section aria-labelledby="issues-closed">
              <h2 id="issues-closed" className="display section-title">
                {t("issues.closed")}
              </h2>
              <IssueList issues={closed} />
            </section>
          )}
        </>
      )}
    </>
  );
}

function IssueList({ issues }: { issues: IssueSummary[] }) {
  return (
    <ol className="movements issue-list">
      {issues.map((issue) => (
        <li key={issue.id} className={issue.unread > 0 ? "movement issue-entry bell-entry-unread" : "movement issue-entry"}>
          {/* Zwykły odnośnik: otwarcie czyta wpisy zgłoszenia i przeładowuje licznik w nagłówku. */}
          <a href={issueOpenLink(issue.id)} className="issue-link">
            <span className="movement-head">
              {issue.unread > 0 && <span className="tag tag-unread">{t("issues.unread", { count: issue.unread })}</span>}
              <span className={`tag issue-kind issue-kind-${issue.kind}`}>
                {issue.kind === "uszkodzenie" && <DamagedIcon />} {t(`issues.kind.${issue.kind}`)}
              </span>
              <span>{issueTargetText({ tool: issue.tool, place: issue.location?.name ?? null })}</span>
            </span>
            <span className="issue-description">{issue.description}</span>
            <span className="muted movement-meta">
              {t("issues.reportedBy", { author: issue.author, when: formatDateTime(issue.createdAt) })}
              {issue.comments > 0 && ` · ${t("issues.comments", { count: issue.comments })}`}
            </span>
          </a>
        </li>
      ))}
    </ol>
  );
}
