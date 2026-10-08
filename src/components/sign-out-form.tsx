"use client";

import { signOut } from "@/app/actions";
import { t } from "@/i18n/t";
import { forgetBoard } from "@/lib/offline/service-worker";
import { disableAppPush } from "@/lib/push/app";
import { unsubscribeFromPush } from "@/lib/push/client";

/**
 * Wylogowanie; najpierw kopia tablicy tej osoby znika z telefonu, żeby bez sieci nie zobaczył jej nikt inny,
 * a powiadomienia push tej osoby przestają przychodzić na ten telefon.
 */
export function SignOutForm({ className = "button button-quiet", label = t("header.logout") }: { className?: string; label?: string }) {
  return (
    <form
      action={async () => {
        await Promise.all([forgetBoard(), unsubscribeFromPush({ server: true }), disableAppPush({ server: true })]);
        await signOut();
      }}
    >
      <button className={className} type="submit">
        {label}
      </button>
    </form>
  );
}
