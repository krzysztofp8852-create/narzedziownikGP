import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { t } from "@/i18n/t";
import { signOut } from "../actions";

export const metadata: Metadata = { title: t("noAccess.title") };

export default function NoAccessPage() {
  return (
    <AuthShell title={t("noAccess.title")}>
      <p>{t("noAccess.body")}</p>
      <form action={signOut}>
        <button className="button" type="submit">
          {t("noAccess.logout")}
        </button>
      </form>
    </AuthShell>
  );
}
