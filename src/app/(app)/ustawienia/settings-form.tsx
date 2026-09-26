"use client";

import { useActionState } from "react";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import type { CompanySettings } from "@/registry/registry";
import { type SettingsFormState, updateSettings } from "./actions";

export function SettingsForm({ settings, maxDays }: { settings: CompanySettings; maxDays: number }) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(updateSettings, {});

  return (
    <form onSubmit={submitKeepingValues(formAction)} className="stack-form">
      <div className="field">
        <label htmlFor="alarmThresholdDays">{t("settings.alarmThreshold")}</label>
        <input
          id="alarmThresholdDays"
          name="alarmThresholdDays"
          type="number"
          inputMode="numeric"
          min={1}
          max={maxDays}
          step={1}
          defaultValue={settings.alarmThresholdDays}
          aria-describedby="alarmThresholdDays-hint"
          required
        />
        <small id="alarmThresholdDays-hint">{t("settings.alarmThresholdHint", { max: maxDays })}</small>
      </div>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && !pending && <p role="status">{t("settings.saved")}</p>}
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>
          {pending ? t("settings.submitting") : t("settings.submit")}
        </button>
      </div>
    </form>
  );
}
