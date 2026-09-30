import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { DamagedIcon } from "@/components/damaged-icon";
import { MissingIcon } from "@/components/missing-icon";
import { formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { issueSubjectText } from "@/lib/issue-text";
import { getRegistry } from "@/lib/registry-instance";
import { MAX_ISSUE_TEXT_LENGTH } from "@/registry/registry";
import { CloseIssueForm, CommentForm } from "./issue-thread-forms";

export const metadata: Metadata = { title: t("issues.title") };

/** Zgłoszenie z opisem, zdjęciem i wątkiem; komentuje każdy, kto je widzi, a zamyka właściciel (i magazynier za zgodą). */
export default async function IssuePage(props: PageProps<"/zgloszenia/[id]">) {
  const session = await requireSession();
  const issue = await getRegistry()
    .as(session.userId)
    .issue((await props.params).id);

  const back = (
    <p>
      <Link href="/zgloszenia" className="muted">
        {t("issues.backToList")}
      </Link>
    </p>
  );
  if (!issue) {
    return (
      <>
        {back}
        <p className="empty">{t("errors.not_found")}</p>
      </>
    );
  }

  return (
    <>
      {back}
      <div className="section-head">
        <h1 className="display page-title">
          {issue.kind === "uszkodzenie" && <DamagedIcon />}
          {issue.kind === "brak" && <MissingIcon />} {issueSubjectText({ kind: issue.kind, tool: issue.tool, place: issue.location?.name ?? null })}
        </h1>
        <span className={issue.status === "otwarte" ? "tag tag-alarm" : "tag"}>{t(`issues.status.${issue.status}`)}</span>
      </div>

      <section className="issue-body" aria-label={t("issues.form.description")}>
        <p className="muted">{t("issues.details.reportedBy", { author: issue.author, when: formatDateTime(issue.createdAt) })}</p>
        <p className="issue-description">{issue.description}</p>
        {(issue.tool || issue.location) && (
          <dl className="details">
            {issue.tool && (
              <div>
                <dt>{t("issues.details.tool")}</dt>
                <dd>
                  <Link href={`/narzedzia/${issue.tool.id}`}>
                    <span className="plate">{issue.tool.code}</span> {issue.tool.name}
                  </Link>
                </dd>
              </div>
            )}
            {issue.location && (
              <div>
                <dt>{t("issues.details.location")}</dt>
                <dd>{issue.location.name}</dd>
              </div>
            )}
          </dl>
        )}
        {issue.photo && (
          <a href={`/zgloszenia/${issue.id}/zdjecie`} target="_blank" rel="noopener">
            {/* Zdjęcie z własnej trasy z sesją; optymalizacja obrazów Next nie przeniesie ciasteczek. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="issue-photo" src={`/zgloszenia/${issue.id}/zdjecie`} alt={t("issues.details.photo")} />
          </a>
        )}
        {issue.status === "zamkniete" && issue.closedAt && (
          <p role="status">
            {t("issues.details.closedBy", { when: formatDateTime(issue.closedAt), name: issue.closedBy ?? "" })}
            {issue.toolWorking && ` ${t("issues.details.toolWorking")}`}
          </p>
        )}
      </section>

      <section aria-labelledby="issue-thread">
        <h2 id="issue-thread" className="display section-title">
          {t("issues.details.thread")}
        </h2>
        {issue.thread.length === 0 ? (
          <p className="empty">{t("issues.details.threadEmpty")}</p>
        ) : (
          <ol className="movements issue-thread">
            {issue.thread.map((comment) => (
              <li key={comment.id} className="movement">
                <div className="movement-head">
                  <strong>{comment.author}</strong>
                  {comment.closes && <span className="tag">{t("issues.details.closing")}</span>}
                </div>
                <p className="issue-description">{comment.text}</p>
                <p className="muted movement-meta">
                  <time dateTime={comment.createdAt.toISOString()}>{formatDateTime(comment.createdAt)}</time>
                </p>
              </li>
            ))}
          </ol>
        )}
        {issue.canComment && <CommentForm issueId={issue.id} operationId={randomUUID()} maxLength={MAX_ISSUE_TEXT_LENGTH} />}
      </section>

      {issue.canClose && (
        <details className="panel">
          <summary className="panel-summary">{t("issues.close.title")}</summary>
          <CloseIssueForm
            issueId={issue.id}
            operationId={randomUUID()}
            canMarkToolWorking={issue.canMarkToolWorking}
            maxLength={MAX_ISSUE_TEXT_LENGTH}
          />
        </details>
      )}
    </>
  );
}
