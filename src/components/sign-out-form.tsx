"use client";

import { signOut } from "@/app/actions";
import { t } from "@/i18n/t";
import { forgetBoard } from "@/lib/offline/service-worker";
import { unsubscribeFromPush } from "@/lib/push/client";

/**
 * Wylogowanie; najpierw kopia tablicy tej osoby znika z telefonu, żeby bez sieci nie zobaczył jej nikt inny,
 * a powiadomienia push tej osoby przestają przychodzić na ten telefon.
 */
export function SignOutForm() {
  return (
    <form
      action={async () => {
        await Promise.all([forgetBoard(), unsubscribeFromPush({ server: true })]);
        await signOut();
      }}
    >
      <button className="button button-quiet" type="submit">
        {t("header.logout")}
      </button>
    </form>
  );
}
