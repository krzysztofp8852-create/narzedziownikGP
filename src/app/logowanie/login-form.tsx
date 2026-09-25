"use client";

import Link from "next/link";
import { useActionState } from "react";
import { t } from "@/i18n/t";
import { signIn } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, {});
  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="email">{t("login.email")}</label>
        <input id="email" name="email" type="email" autoComplete="username" defaultValue={state.email} required />
      </div>
      <div className="field">
        <label htmlFor="password">{t("login.password")}</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <button className="button" type="submit" disabled={pending}>
        {pending ? t("login.submitting") : t("login.submit")}
      </button>
      <p className="auth-links">
        <Link href="/reset-hasla">{t("login.forgotPassword")}</Link>
      </p>
    </form>
  );
}
