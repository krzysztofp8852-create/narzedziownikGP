import Link from "next/link";
import type { ReactNode } from "react";
import { t } from "@/i18n/t";
import { SETTINGS_HREF } from "@/lib/nav-path";
import type { SettingsPage } from "@/lib/settings-pages";

export const settingsPageTitle = (page: SettingsPage) => t(`settingsPage.pages.${page}.title`);

/** Podstrona ustawień: powrót do listy podstron, tytuł i karty. */
export function SettingsSubpage({ page, children }: { page: SettingsPage; children: ReactNode }) {
  return (
    <>
      <p>
        <Link href={SETTINGS_HREF} className="muted">
          {t("settingsPage.backToSettings")}
        </Link>
      </p>
      <h1 className="display page-title">{settingsPageTitle(page)}</h1>
      <div className="company-grid">{children}</div>
    </>
  );
}
