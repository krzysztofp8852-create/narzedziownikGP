import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { canManageSettings, canPrintStickers } from "@/registry/registry";
import { BaseAddressForm } from "../../lokalizacje/location-forms";
import { ServicesSection } from "../../lokalizacje/services-section";
import { DailyRatesSection, SettingsSection } from "../settings-section";
import { SettingsSubpage, settingsPageTitle } from "../settings-subpage";

export const generateMetadata = (): Metadata => ({ title: settingsPageTitle("sprzet") });

/** Sprzęt: stawki dzienne kosztu sprzętu, próg alarmu na budowie, naklejki QR, serwisy i adres bazy na mapie. */
export default async function EquipmentSettingsPage() {
  const session = await requireSession();
  if (!canManageSettings(session)) redirect("/");
  const registry = getRegistry().as(session.userId);
  const [locations, settings, stickerCandidates, dailyRates, categories] = await Promise.all([
    registry.locations(),
    registry.settings(),
    canPrintStickers(session) ? registry.stickerCandidates() : null,
    registry.dailyRates(),
    registry.categories(),
  ]);

  return (
    <SettingsSubpage page="sprzet">
      <DailyRatesSection rates={dailyRates} categories={categories} />
      <SettingsSection settings={settings} />
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
      <section className="company-card" aria-labelledby="base-address-title">
        <h2 id="base-address-title" className="display section-title">
          {t("settings.baseAddressTitle")}
        </h2>
        <BaseAddressForm address={locations.base.address} />
      </section>
    </SettingsSubpage>
  );
}
