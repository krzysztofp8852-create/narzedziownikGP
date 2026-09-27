import type { Metadata } from "next";
import Link from "next/link";
import { SiteManagerLabel } from "@/components/site-manager-label";
import { formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { historySearch } from "@/lib/history-filters";
import { getRegistry } from "@/lib/registry-instance";

export const metadata: Metadata = { title: t("siteClosing.finishedTitle") };

/** Zakończone budowy, których nie ma już na tablicy, z odnośnikiem do ich historii ruchów. */
export default async function FinishedSitesPage() {
  const session = await requireSession();
  const sites = await getRegistry().as(session.userId).finishedSites();

  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("siteClosing.back")}
        </Link>
      </p>
      <h1 className="display page-title">{t("siteClosing.finishedTitle")}</h1>
      {sites.length === 0 ? (
        <p className="empty">{t("siteClosing.finishedEmpty")}</p>
      ) : (
        <div className="site-grid">
          {sites.map((site) => (
            <section key={site.id} className="location location-site" aria-labelledby={`finished-${site.id}`}>
              <div className="location-head">
                <h2 id={`finished-${site.id}`} className="display location-name">
                  <span className="location-kind">{t("board.siteKind")}</span> <span>{site.name}</span>
                </h2>
                <span className="tag">{t("siteStatus.zakonczona")}</span>
              </div>
              <div className="location-details">
                <p className="muted">{site.address}</p>
                <p>
                  <SiteManagerLabel manager={site.manager} />
                </p>
                <p className="muted">{t("siteClosing.finishedOn", { when: formatDateTime(site.finishedAt), name: site.finishedBy })}</p>
              </div>
              <div className="section-head">
                <Link href={`/historia${historySearch({ locationId: site.id })}`}>{t("siteClosing.history")}</Link>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
