import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { CHANGE_LOG_HREF } from "@/lib/settings-pages";
import { canManageSettings } from "@/registry/registry";
import { LegalSection } from "../settings-section";
import { SettingsSubpage, settingsPageTitle } from "../settings-subpage";

export const generateMetadata = (): Metadata => ({ title: settingsPageTitle("dokumenty") });

/** Dokumenty i dziennik zmian: dokumenty prawne do informowania ludzi i wejście do dziennika zmian. */
export default async function DocumentsSettingsPage() {
  const session = await requireSession();
  if (!canManageSettings(session)) redirect("/");

  return (
    <SettingsSubpage page="dokumenty">
      <LegalSection />
      <section className="company-card" aria-labelledby="change-log">
        <h2 id="change-log" className="display section-title">
          {t("changeLog.title")}
        </h2>
        <p className="muted">{t("changeLog.settingsHint")}</p>
        <p>
          <Link className="button button-quiet" href={CHANGE_LOG_HREF}>
            {t("changeLog.settingsLink")}
          </Link>
        </p>
      </section>
    </SettingsSubpage>
  );
}
