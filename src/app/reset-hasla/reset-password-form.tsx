"use client";

import { useActionState } from "react";
import { t } from "@/i18n/t";
import { sendResetLink } from "./actions";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(sendResetLink, {});
  if (state.sent) return <p role="status">{t("resetPassword.sent")}</p>;
  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="email">{t("resetPassword.email")}</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <button className="button" type="submit" disabled={pending}>
        {pending ? t("resetPassword.submitting") : t("resetPassword.submit")}
      </button>
    </form>
  );
}
