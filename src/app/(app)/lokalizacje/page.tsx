import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteManagerLabel } from "@/components/site-manager-label";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { canManageLocations } from "@/registry/registry";
import { changeSiteManager } from "./actions";
import { AddServiceForm, AddSiteForm, ChangeManagerForm } from "./location-forms";

export const metadata: Metadata = { title: t("locations.title") };

export default async function LocationsPage() {
  const session = await requireSession();
  if (!canManageLocations(session)) redirect("/");
  const registry = getRegistry().as(session.userId);
  const [{ sites, services }, managers] = await Promise.all([registry.locations(), registry.siteManagerCandidates()]);

  return (
    <>
      <h1 className="display page-title">{t("locations.title")}</h1>

      <section className="panel" aria-labelledby="add-site">
        <h2 id="add-site" className="display section-title">
          {t("locations.addSiteTitle")}
        </h2>
        {managers.length === 0 ? (
          <div className="stack-form">
            <p className="empty">{t("locations.noManagers")}</p>
            <p>
              <Link className="button button-quiet" href="/zespol">
                {t("locations.goToTeam")}
              </Link>
            </p>
          </div>
        ) : (
          <AddSiteForm managers={managers} />
        )}
      </section>

      <section aria-labelledby="sites">
        <h2 id="sites" className="display section-title">
          {t("locations.sites")}
        </h2>
        {sites.length === 0 ? (
          <p className="empty">{t("locations.noSitesYet")}</p>
        ) : (
          <ul className="member-list">
            {sites.map((site) => (
              <li key={site.id} className={site.status === "aktywna" ? "member" : "member member-inactive"}>
                <div className="member-head">
                  <strong>{site.name}</strong>
                  <span className="muted">{t(`siteStatus.${site.status}`)}</span>
                </div>
                <p className="muted member-email">{site.address}</p>
                <p className="member-status">
                  <SiteManagerLabel manager={site.manager} />
                </p>
                {site.status === "aktywna" && managers.length > 0 && (
                  <ChangeManagerForm action={changeSiteManager.bind(null, site.id)} site={site} managers={managers} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="add-service">
        <h2 id="add-service" className="display section-title">
          {t("locations.addServiceTitle")}
        </h2>
        <AddServiceForm />
      </section>

      <section aria-labelledby="services">
        <h2 id="services" className="display section-title">
          {t("locations.services")}
        </h2>
        {services.length === 0 ? (
          <p className="empty">{t("locations.noServicesYet")}</p>
        ) : (
          <ul className="member-list">
            {services.map((service) => (
              <li key={service.id} className="member">
                <strong>{service.name}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
