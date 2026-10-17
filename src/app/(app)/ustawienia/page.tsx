import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { SETTINGS_PAGES, settingsHref } from "@/lib/settings-pages";
import { canManageSettings } from "@/registry/registry";
import { SettingsAnchorRedirect } from "./settings-anchor";
import { settingsPageTitle } from "./settings-subpage";

export const generateMetadata = (): Metadata => ({ title: t("settingsPage.title") });

/**
 * Ustawienia właściciela, czyli sprawy firmy ustawiane raz, a nie codzienna praca: cztery podstrony (Firma i abonament,
 * Sprzęt, Ludzie i dostęp, Dokumenty i dziennik zmian). Język jest w Moim koncie. Dawne kotwice kart tej strony
 * przekierowują na ich podstronę.
 */
export default async function SettingsPage() {
  const session = await requireSession();
  if (!canManageSettings(session)) redirect("/");

  return (
    <>
      <SettingsAnchorRedirect />
      <h1 className="display page-title">{t("settingsPage.title")}</h1>
      <nav className="company-grid" aria-label={t("settingsPage.title")}>
        {SETTINGS_PAGES.map((page) => {
          // W demo nie ma wylogowania po bezczynności, więc opis Ludzi i dostępu go nie obiecuje.
          const hint = page === "dostep" && session.company.demo ? "settingsPage.pages.dostep.hintDemo" : (`settingsPage.pages.${page}.hint` as const);
          return (
            <section key={page} className="company-card settings-page" aria-labelledby={`settings-page-${page}`}>
              <h2 id={`settings-page-${page}`} className="display section-title">
                <Link href={settingsHref(page)}>{settingsPageTitle(page)}</Link>
              </h2>
              <p className="muted">{t(hint)}</p>
            </section>
          );
        })}
      </nav>
    </>
  );
}
