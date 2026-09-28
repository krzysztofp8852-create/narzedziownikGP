"use client";

import Link from "next/link";
import { useActionState } from "react";
import { t } from "@/i18n/t";
import { signIn } from "./actions";

/** `nextPath`: dokąd wrócić po zalogowaniu (ścieżka aplikacji). */
export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, action, pending] = useActionState(signIn, {});
  return (
    <form action={action}>
      <input type="hidden" name="next" value={nextPath} />
      <div className="field">
        <label htmlFor="login">{t("login.login")}</label>
        <input
          id="login"
          name="login"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          defaultValue={state.login}
          required
        />
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
