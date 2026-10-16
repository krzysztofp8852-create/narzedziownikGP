"use client";

import { useActionState } from "react";
import { t } from "@/i18n/t";
import { sendPasswordLink } from "./actions";

/** Przycisk wysyłający link do zmiany hasła; po wysłaniu zostaje sama informacja. */
export function PasswordLinkForm() {
  const [state, action, pending] = useActionState(sendPasswordLink, {});
  if (state.sent) return <p role="status">{t("myAccount.password.sent")}</p>;
  return (
    <form action={action}>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <button className="button button-quiet" type="submit" disabled={pending}>
        {pending ? t("myAccount.password.submitting") : t("myAccount.password.submit")}
      </button>
    </form>
  );
}
