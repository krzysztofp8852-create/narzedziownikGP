"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import type { Category, ToolReport } from "@/registry/registry";
import { acceptToolReport, rejectToolReport } from "./actions";

/** Jedno zgłoszenie na liście właściciela: akceptacja z kodem i wartością albo odrzucenie z komentarzem. */
export function ToolReportReview({ report, categories, operationId }: { report: ToolReport; categories: Category[]; operationId: string }) {
  const [open, setOpen] = useState<"accept" | "reject" | null>(null);
  const [code, setCode] = useState(report.code);
  const [accepted, accept, accepting] = useActionState(acceptToolReport.bind(null, report.id), {});
  const [rejected, reject, rejecting] = useActionState(rejectToolReport.bind(null, report.id), {});

  return (
    <li className="tool-report">
      <div className="tool-report-head">
        <Link href={`/narzedzia/${report.id}`} className="tool-row">
          <span className="plate">{report.code}</span>
          <span className="tool-row-name">
            {report.name}
            <span className="tool-row-sub muted">
              {report.category.name} · {t("toolReports.reportedBy", { name: report.reportedBy, when: formatDateTime(report.reportedAt) })} ·{" "}
              {t("toolReports.now", { place: report.location.name })}
            </span>
          </span>
        </Link>
        <div className="operation-tabs">
          {(["accept", "reject"] as const).map((action) => (
            <button
              key={action}
              type="button"
              className={open === action ? "button" : "button button-quiet"}
              aria-expanded={open === action}
              onClick={() => setOpen((current) => (current === action ? null : action))}
            >
              {t(`toolReports.${action}`)}
            </button>
          ))}
        </div>
      </div>

      {open === "accept" && (
        <form onSubmit={submitKeepingValues(accept)} className="stack-form">
          <div className="field-row">
            <div className="field">
              <label htmlFor={`accept-code-${report.id}`}>{t("toolReports.code")}</label>
              <input
                id={`accept-code-${report.id}`}
                name="code"
                className="plate-input"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                autoCapitalize="characters"
                maxLength={20}
                required
              />
            </div>
            <div className="field">
              <label htmlFor={`accept-value-${report.id}`}>{t("toolReports.value")}</label>
              <input id={`accept-value-${report.id}`} name="value" inputMode="decimal" required />
            </div>
          </div>
          <div className="field">
            <label htmlFor={`accept-category-${report.id}`}>{t("toolReports.category")}</label>
            <select id={`accept-category-${report.id}`} name="categoryId" defaultValue={report.category.id} required>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {t("tools.categoryOption", { name: category.name, prefix: category.prefix })}
                </option>
              ))}
            </select>
          </div>
          {accepted.error && (
            <p className="form-error" role="alert">
              {accepted.error}
            </p>
          )}
          <div className="form-actions">
            <button className="button" type="submit" disabled={accepting}>
              {accepting ? t("toolReports.submitting") : t("toolReports.submitAccept")}
            </button>
          </div>
        </form>
      )}

      {open === "reject" && (
        <form onSubmit={submitKeepingValues(reject)} className="stack-form">
          <input type="hidden" name="operationId" value={operationId} />
          <div className="field">
            <label htmlFor={`reject-comment-${report.id}`}>{t("toolReports.comment")}</label>
            <input
              id={`reject-comment-${report.id}`}
              name="comment"
              placeholder={t("toolReports.commentPlaceholder")}
              aria-describedby={`reject-hint-${report.id}`}
              required
            />
            <small id={`reject-hint-${report.id}`}>{t("toolReports.rejectHint")}</small>
          </div>
          {rejected.error && (
            <p className="form-error" role="alert">
              {rejected.error}
            </p>
          )}
          <div className="form-actions">
            <button className="button button-danger" type="submit" disabled={rejecting}>
              {rejecting ? t("toolReports.submitting") : t("toolReports.submitReject")}
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
