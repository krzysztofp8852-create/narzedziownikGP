"use client";

import { useActionState, useState } from "react";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import type { IssueVisibility } from "@/registry/registry";
import { type SettingsFormState, updateIssueVisibility } from "./actions";

/** Przełączniki „Kto widzi zgłoszenia”; zamykanie przez magazyniera ma sens tylko, gdy je widzi. */
export function IssueVisibilityForm({ visibility }: { visibility: IssueVisibility }) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(updateIssueVisibility, {});
  const [storekeepers, setStorekeepers] = useState(visibility.storekeepers);

  return (
    <form onSubmit={submitKeepingValues(formAction)} className="stack-form">
      <p className="muted">{t("issueSettings.intro")}</p>
      <label className="checkbox">
        <input type="checkbox" name="siteManagers" defaultChecked={visibility.siteManagers} /> {t("issueSettings.siteManagers")}
      </label>
      <label className="checkbox">
        <input type="checkbox" name="storekeepers" checked={storekeepers} onChange={(event) => setStorekeepers(event.target.checked)} />{" "}
        {t("issueSettings.storekeepers")}
      </label>
      <label className="checkbox checkbox-nested">
        <input type="checkbox" name="storekeepersClose" defaultChecked={visibility.storekeepersClose} disabled={!storekeepers} />{" "}
        {t("issueSettings.storekeepersClose")}
      </label>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && !pending && <p role="status">{t("issueSettings.saved")}</p>}
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>
          {pending ? t("issueSettings.submitting") : t("issueSettings.submit")}
        </button>
      </div>
    </form>
  );
}
