import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { getRegistry } from "@/lib/registry-instance";
import { parseSitesView, sitesShownTo, type SitesView, sitesViewHref } from "@/lib/sites-view";
import { canManageLocations } from "@/registry/registry";
import { AddLocationTile, SiteCard } from "../lokalizacje/location-cards";
import { AddSiteForm } from "../lokalizacje/location-forms";
import { SitesMap } from "../lokalizacje/sites-map";
import { FinishedSites } from "./finished-sites";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(sitesShownTo(await requireSession()).onlyManaged ? "nav.mySites" : "nav.sites") };
}

/**
 * Budowy firmy: aktywne z adresem, kierownikiem i liczbą sprzętu, pod nimi zakończone, a jako drugi widok mapa. Kierownik
 * ma tu „Moje budowy”, czyli tylko te, którymi kieruje. Właściciel dodaje budowę i zmienia kierownika i adres, a zamyka
 * ją ten, kto może (kierownik swoją).
 */
export default async function SitesPage(props: PageProps<"/budowy">) {
  const session = await requireSession();
  const shown = sitesShownTo(session);
  // Firma demo ma mapę demo bez dostawcy mapy; prawdziwa firma mapę Google, o ile jest klucz przeglądarki.
  const googleMaps = session.company.demo ? null : serverEnv.googleMaps();
  const hasMap = session.company.demo || googleMaps !== null;
  const view: SitesView = hasMap ? parseSitesView((await props.searchParams).widok) : "lista";
  const registry = getRegistry().as(session.userId);
  const [board, finished, managers, pins] = await Promise.all([
    registry.whereIsWhat(),
    view === "lista" ? registry.finishedSites() : [],
    view === "lista" && canManageLocations(session) ? registry.siteManagerCandidates() : null,
    view === "mapa" && googleMaps ? registry.siteMap() : null,
  ]);
  const sites = shown.sites(board.sites);

  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("sitesPage.back")}
        </Link>
      </p>
      <h1 className="display page-title">{t(shown.onlyManaged ? "nav.mySites" : "nav.sites")}</h1>
      <p className="muted">{t(shown.onlyManaged ? "sitesPage.introOwn" : "sitesPage.intro")}</p>
      {hasMap && (
        <nav className="site-page-tabs" aria-label={t("sitesPage.views")}>
          {(["lista", "mapa"] as const).map((option) => (
            <Link key={option} href={sitesViewHref(option)} className="site-page-tab" aria-current={option === view ? "page" : undefined}>
              {t(option === "mapa" ? "sitesPage.map" : "sitesPage.list")}
            </Link>
          ))}
        </nav>
      )}
      {view === "mapa" ? (
        <SitesMap
          demo={session.company.demo}
          board={{ ...board, sites }}
          pins={pins && shown.pins(pins, board.sites)}
          maps={googleMaps}
          canEdit={canManageLocations(session)}
        />
      ) : (
        <>
          {sites.length === 0 && (
            <p className="empty">{t(shown.onlyManaged ? "sitesPage.emptyOwn" : managers ? "sitesPage.emptyOwner" : "sitesPage.empty")}</p>
          )}
          {(sites.length > 0 || managers) && (
            <div className="site-grid">
              {sites.map((site) => (
                <SiteCard key={site.id} site={site} managers={managers} session={session} />
              ))}
              {managers && <AddLocationTile title={t("board.addSite")} form={<AddSiteForm managers={managers} />} />}
            </div>
          )}
          <FinishedSites sites={shown.sites(finished)} />
        </>
      )}
    </>
  );
}
