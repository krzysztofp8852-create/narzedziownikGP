import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { canManageSettings, canPrintStickers } from "@/registry/registry";
import { ServicesSection } from "../lokalizacje/services-section";
import { TeamSection } from "../zespol/team-section";
import { SettingsSection } from "./settings-section";

export const metadata: Metadata = { title: t("settingsPage.title") };

/** Sprawy firmy, które nie są codzienną pracą na tablicy: zespół, serwisy, próg alarmu, naklejki QR, zakończone budowy. */
export default async function SettingsPage() {
  const session = await requireSession();
  if (!canManageSettings(session)) redirect("/");
  const registry = getRegistry().as(session.userId);
  const [members, locations, settings, stickerCandidates] = await Promise.all([
    registry.team(),
    registry.locations(),
    registry.settings(),
    canPrintStickers(session) ? registry.stickerCandidates() : null,
  ]);
  const finishedSites = locations.sites.filter((site) => site.status === "zakonczona");

  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("settingsPage.back")}
        </Link>
      </p>
      <h1 className="display page-title">{t("settingsPage.title")}</h1>
      <div className="company-grid">
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
        <TeamSection session={session} members={members} />
        {finishedSites.length > 0 && (
          <section className="company-card" aria-labelledby="finished-sites">
            <h2 id="finished-sites" className="display section-title">
              {t("settingsPage.finishedSites")}
            </h2>
            <ul className="member-list">
              {finishedSites.map((site) => (
                <li key={site.id} className="member member-inactive">
                  <strong>{site.name}</strong>
                  <p className="muted member-email">{site.address}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
