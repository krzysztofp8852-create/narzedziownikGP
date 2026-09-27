"use client";

import { signOut } from "@/app/actions";
import { t } from "@/i18n/t";
import { forgetBoard } from "@/lib/offline/service-worker";

/** Wylogowanie; najpierw kopia tablicy tej osoby znika z telefonu, żeby bez sieci nie zobaczył jej nikt inny. */
export function SignOutForm() {
  return (
    <form
      action={async () => {
        await forgetBoard();
        await signOut();
      }}
    >
      <button className="button button-quiet" type="submit">
        {t("header.logout")}
      </button>
    </form>
  );
}
