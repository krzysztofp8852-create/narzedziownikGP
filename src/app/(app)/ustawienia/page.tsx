import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { canManageSettings, canPrintStickers } from "@/registry/registry";
import { BaseAddressForm } from "../lokalizacje/location-forms";
import { ServicesSection } from "../lokalizacje/services-section";
import { TeamSection } from "../zespol/team-section";
import { DailyRatesSection, IssueSettingsSection, LegalSection, SettingsSection } from "./settings-section";
import { SubscriptionSection } from "./subscription-section";

export const metadata: Metadata = { title: t("settingsPage.title") };

/**
 * Sprawy firmy, które nie są codzienną pracą na tablicy: abonament, zespół, serwisy, próg alarmu, kto widzi zgłoszenia,
 * stawki dzienne kosztu sprzętu, adres bazy na mapie, naklejki QR, dokumenty prawne.
 */
export default async function SettingsPage() {
  const session = await requireSession();
  if (!canManageSettings(session)) redirect("/");
  const registry = getRegistry().as(session.userId);
  const [subscription, members, locations, settings, stickerCandidates, dailyRates, categories] = await Promise.all([
    registry.subscription(),
    registry.team(),
    registry.locations(),
    registry.settings(),
    canPrintStickers(session) ? registry.stickerCandidates() : null,
    registry.dailyRates(),
    registry.categories(),
  ]);

  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("settingsPage.back")}
        </Link>
      </p>
      <h1 className="display page-title">{t("settingsPage.title")}</h1>
      <div className="company-grid">
        <SubscriptionSection subscription={subscription} />
        <SettingsSection settings={settings} />
        <IssueSettingsSection settings={settings} />
        <DailyRatesSection rates={dailyRates} categories={categories} />
        <section className="company-card" aria-labelledby="base-address-title">
          <h2 id="base-address-title" className="display section-title">
            {t("settings.baseAddressTitle")}
          </h2>
          <BaseAddressForm address={locations.base.address} />
        </section>
        {stickerCandidates && (
          <section className="company-card" aria-labelledby="stickers">
            <h2 id="stickers" className="display section-title">
              {t("stickers.title")}
            </h2>
            <p className="muted">
              {t("stickers.settingsHint", { count: stickerCandidates.filter((candidate) => candidate.printedAt === null).length })}
            </p>
            <p>
              <Link className="button button-quiet" href="/naklejki">
                {t("stickers.settingsLink")}
              </Link>
            </p>
          </section>
        )}
        <ServicesSection services={locations.services} />
        <TeamSection session={session} members={members} recorders={subscription.recorders} />
        <LegalSection />
      </div>
    </>
  );
}
