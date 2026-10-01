"use client";

import { useActionState } from "react";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import { setToolRate, type ToolRateFormState } from "../actions";

/** Kwota tego narzędzia za dzień zamiast procentu wartości; puste pole wraca do stawki kategorii albo firmy. */
export function ToolRateForm({ toolId, amount }: { toolId: string; amount: number | null }) {
  const [state, formAction, pending] = useActionState<ToolRateFormState, FormData>(setToolRate.bind(null, toolId), {});

  return (
    <form onSubmit={submitKeepingValues(formAction)} className="stack-form">
      <p className="muted">{t("dailyRates.toolOwnHint")}</p>
      <div className="field">
        <label htmlFor="toolRateAmount">{t("dailyRates.toolOwnLabel")}</label>
        <input id="toolRateAmount" name="amount" inputMode="decimal" defaultValue={amount === null ? "" : String(amount).replace(".", ",")} />
      </div>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && !pending && <p role="status">{t("dailyRates.saved")}</p>}
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>
          {pending ? t("dailyRates.submitting") : t("dailyRates.toolOwnSubmit")}
        </button>
      </div>
    </form>
  );
}
