"use client";

import { useActionState } from "react";
import { t } from "@/i18n/t";
import { changePassword } from "./actions";

export function ChangePasswordForm({ minLength }: { minLength: number }) {
  const [state, action, pending] = useActionState(changePassword, {});
  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="password">{t("changePassword.newPassword")}</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={minLength}
          aria-describedby="password-hint"
          required
        />
        <small id="password-hint">{t("changePassword.hint", { min: minLength })}</small>
      </div>
      <div className="field">
        <label htmlFor="repeat">{t("changePassword.repeatPassword")}</label>
        <input id="repeat" name="repeat" type="password" autoComplete="new-password" minLength={minLength} required />
      </div>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <button className="button" type="submit" disabled={pending}>
        {pending ? t("changePassword.submitting") : t("changePassword.submit")}
      </button>
    </form>
  );
}
