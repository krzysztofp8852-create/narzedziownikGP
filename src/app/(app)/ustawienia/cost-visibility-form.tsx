"use client";

import { useActionState } from "react";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import { type SettingsFormState, updateCostVisibility } from "./actions";

/** Przełącznik „Kierownik widzi koszty swoich budów i pojazdów”, domyślnie wyłączony. */
export function CostVisibilityForm({ siteManagersSeeCosts }: { siteManagersSeeCosts: boolean }) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(updateCostVisibility, {});

  return (
    <form onSubmit={submitKeepingValues(formAction)} className="stack-form">
      <p className="muted">{t("costSettings.intro")}</p>
      <label className="checkbox">
        <input type="checkbox" name="siteManagersSeeCosts" defaultChecked={siteManagersSeeCosts} aria-describedby="siteManagersSeeCosts-hint" />{" "}
        {t("costSettings.siteManagers")}
      </label>
      <small id="siteManagersSeeCosts-hint" className="muted">
        {t("costSettings.siteManagersHint")}
      </small>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && !pending && <p role="status">{t("costSettings.saved")}</p>}
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>
          {pending ? t("costSettings.submitting") : t("costSettings.submit")}
        </button>
      </div>
    </form>
  );
}
