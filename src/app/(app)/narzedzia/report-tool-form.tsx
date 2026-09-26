"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import { newOperationId } from "@/lib/operation-id";
import type { Category } from "@/registry/registry";
import { reportTool, type ToolReportFormState } from "./actions";

export interface ReportToolFormProps {
  categories: Category[];
  /** Aktywne budowy zgłaszającego kierownika. */
  sites: { id: string; name: string }[];
  operationId: string;
}

/** Kierownik zgłasza sprzęt kupiony na budowę; po zapisie pusty formularz pod następne zgłoszenie. */
export function ReportToolForm(props: ReportToolFormProps) {
  const [operationId, setOperationId] = useState(props.operationId);
  const [reported, setReported] = useState<ToolReportFormState["reported"]>();

  if (props.sites.length === 0) return <p className="empty">{t("toolReports.noSites")}</p>;
  if (props.categories.length === 0) return <p className="empty">{t("toolReports.noCategories")}</p>;

  return (
    <div className="stack-form">
      {reported && (
        <p role="status" className="checklist-done">
          {t("toolReports.reported", { code: reported.code, name: reported.name, place: reported.place })}{" "}
          <Link href={`/narzedzia/${reported.id}`}>{t("tools.openCard")}</Link>
        </p>
      )}
      <Fields
        key={operationId}
        {...props}
        operationId={operationId}
        onReported={(tool) => {
          setReported(tool);
          setOperationId(newOperationId());
        }}
      />
    </div>
  );
}

function Fields({
  categories,
  sites,
  operationId,
  onReported,
}: ReportToolFormProps & { onReported: (tool: NonNullable<ToolReportFormState["reported"]>) => void }) {
  const [siteId, setSiteId] = useState(sites.length === 1 ? sites[0].id : "");
  const [state, formAction, pending] = useActionState(async (prev: ToolReportFormState, formData: FormData) => {
    const result = await reportTool(prev, formData);
    if (result.reported) onReported(result.reported);
    return result;
  }, {});

  return (
    <form onSubmit={submitKeepingValues(formAction)} className="stack-form">
      <input type="hidden" name="operationId" value={operationId} />
      <input type="hidden" name="siteName" value={sites.find((site) => site.id === siteId)?.name ?? ""} />
      <p className="muted">{t("toolReports.reportHint")}</p>
      <div className="field">
        <label htmlFor="report-site">{t("toolReports.site")}</label>
        <select id="report-site" name="siteId" value={siteId} onChange={(event) => setSiteId(event.target.value)} required>
          <option value="" disabled>
            {t("toolReports.sitePlaceholder")}
          </option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="report-category">{t("tools.category")}</label>
        <select id="report-category" name="categoryId" defaultValue="" required>
          <option value="" disabled>
            {t("tools.categoryPlaceholder")}
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="report-name">{t("tools.name")}</label>
        <input id="report-name" name="name" required />
      </div>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>
          {pending ? t("toolReports.submitting") : t("toolReports.submitReport")}
        </button>
      </div>
    </form>
  );
}
