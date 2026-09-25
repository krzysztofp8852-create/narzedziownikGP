"use client";

import { useActionState } from "react";
import { t } from "@/i18n/t";
import type { ChangePasswordState } from "./actions";

interface ChangePasswordFormProps {
  minLength: number;
  action: (prev: ChangePasswordState, formData: FormData) => Promise<ChangePasswordState>;
}

/** Nowe hasło z powtórzeniem: zamiana hasła tymczasowego albo ustawienie hasła po linku z e-maila. */
export function ChangePasswordForm({ minLength, action: submit }: ChangePasswordFormProps) {
  const [state, action, pending] = useActionState(submit, {});
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
