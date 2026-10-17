import Link from "next/link";
import { SiteManagerLabel } from "@/components/site-manager-label";
import { formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { historySearch } from "@/lib/history-filters";
import type { FinishedSite } from "@/registry/registry";
import { locationPagePath } from "../lokalizacje/location-page";

/** Zakończone budowy, których nie ma już na tablicy, z odnośnikiem do ich historii ruchów. */
export function FinishedSites({ sites }: { sites: FinishedSite[] }) {
  return (
    <section id="zakonczone" className="board-section" aria-labelledby="finished-sites">
      <h2 id="finished-sites" className="display section-title">
        {t("siteClosing.finishedTitle")}
      </h2>
      {sites.length === 0 ? (
        <p className="empty">{t("siteClosing.finishedEmpty")}</p>
      ) : (
        <div className="site-grid">
          {sites.map((site) => (
            <section key={site.id} className="location location-site" aria-labelledby={`finished-${site.id}`}>
              <div className="location-head">
                <h3 id={`finished-${site.id}`} className="display location-name">
                  <span className="location-kind">{t("board.siteKind")}</span> <Link href={locationPagePath("budowa", site.id)}>{site.name}</Link>
                </h3>
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
    </section>
  );
}
