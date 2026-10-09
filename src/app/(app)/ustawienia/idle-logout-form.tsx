"use client";

import { useActionState } from "react";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import { idleLogoutDuration } from "@/lib/idle-logout-text";
import { IDLE_LOGOUT_MINUTES } from "@/registry/registry";
import { type SettingsFormState, updateIdleLogout } from "./actions";

/** Po ilu minutach bezczynności przeglądarka właściciela się wyloguje; domyślnie nigdy. */
export function IdleLogoutForm({ minutes }: { minutes: number | null }) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(updateIdleLogout, {});

  return (
    <form onSubmit={submitKeepingValues(formAction)} className="stack-form">
      <p className="muted">{t("idleLogout.intro")}</p>
      <div className="field">
        <label htmlFor="ownerIdleLogoutMinutes">{t("idleLogout.label")}</label>
        <select id="ownerIdleLogoutMinutes" name="ownerIdleLogoutMinutes" defaultValue={minutes ?? ""} aria-describedby="ownerIdleLogoutMinutes-hint">
          <option value="">{t("idleLogout.off")}</option>
          {IDLE_LOGOUT_MINUTES.map((option) => (
            <option key={option} value={option}>
              {t("idleLogout.option", { duration: idleLogoutDuration(option) })}
            </option>
          ))}
        </select>
        <small id="ownerIdleLogoutMinutes-hint" className="muted">{t("idleLogout.hint")}</small>
      </div>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && !pending && <p role="status">{t("idleLogout.saved")}</p>}
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>
          {pending ? t("idleLogout.submitting") : t("idleLogout.submit")}
        </button>
      </div>
    </form>
  );
}
