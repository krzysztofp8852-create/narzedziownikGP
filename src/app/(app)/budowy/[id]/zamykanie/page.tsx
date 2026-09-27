import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteManagerLabel } from "@/components/site-manager-label";
import { formatDays } from "@/i18n/days";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { canCloseSite, canForceCloseSites, canMoveTools } from "@/registry/registry";
import { CloseSiteForm, ForceCloseForm, ReturnForm, TransferForm } from "./closing-forms";

export const metadata: Metadata = { title: t("siteClosing.close") };

/**
 * Domykanie budowy: lista narzędzi, które na niej zostały, z akcjami zwrotu i przeniesienia.
 * Pustą budowę kierownik lub właściciel zamyka; z narzędziami zamknięcie wymusza tylko właściciel.
 */
export default async function SiteClosingPage(props: PageProps<"/budowy/[id]/zamykanie">) {
  const { id } = await props.params;
  const session = await requireSession();
  const registry = getRegistry().as(session.userId);
  const board = await registry.whereIsWhat();
  const site = board.sites.find((candidate) => candidate.id === id);
  if (!site) {
    // Zamkniętą budowę widać już tylko wśród zakończonych.
    if ((await registry.finishedSites()).some((finished) => finished.id === id)) redirect("/budowy/zakonczone");
    notFound();
  }
  if (!canCloseSite(session, site)) redirect("/");

  const targets = board.sites
    .filter((other) => other.id !== site.id && canMoveTools(session, other))
    .map((other) => ({ id: other.id, name: other.name }));
  const place = { id: site.id, name: site.name };

  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("siteClosing.back")}
        </Link>
      </p>
      <h1 className="display page-title">{t("siteClosing.title", { name: site.name })}</h1>
      <div className="location-details">
        <p className="muted">{site.address}</p>
        <p>
          <SiteManagerLabel manager={site.manager} />
        </p>
      </div>

      {site.tools.length === 0 ? (
        <section className="company-card" aria-label={t("siteClosing.close")}>
          <p>{t("siteClosing.emptyHint")}</p>
          <CloseSiteForm site={place} />
        </section>
      ) : (
        <>
          <section className="location location-site" aria-labelledby="remaining-tools">
            <div className="location-head">
              <h2 id="remaining-tools" className="display section-title">
                {t("siteClosing.remainingTitle")}
              </h2>
              <span className="location-count">{t("board.toolCount", { count: site.tools.length })}</span>
            </div>
            <p className="muted">{t("siteClosing.remainingHint")}</p>
            <ul className="tool-reports">
              {site.tools.map((tool) => (
                <li key={tool.id} className="tool-report">
                  <div className="tool-report-head">
                    <Link href={`/narzedzia/${tool.id}`} className="tool-row">
                      <span className="plate">{tool.code}</span>
                      <span className="tool-row-name">{tool.name}</span>
                      <span className="tool-row-meta">
                        <span className="tool-row-days">{formatDays(tool.daysInPlace)}</span>
                      </span>
                    </Link>
                  </div>
                  <ReturnForm
                    siteId={site.id}
                    baseId={board.base.id}
                    toolIds={[tool.id]}
                    operationId={randomUUID()}
                    label={t("siteClosing.returnTool")}
                  />
                  {targets.length > 0 && (
                    <TransferForm siteId={site.id} tool={tool} sites={targets} operationId={randomUUID()} />
                  )}
                </li>
              ))}
            </ul>
            {site.tools.length > 1 && (
              <ReturnForm
                siteId={site.id}
                baseId={board.base.id}
                toolIds={site.tools.map((tool) => tool.id)}
                operationId={randomUUID()}
                label={t("siteClosing.returnAll", { count: site.tools.length })}
              />
            )}
          </section>

          {canForceCloseSites(session) ? (
            <section className="company-card" aria-labelledby="force-close">
              <h2 id="force-close" className="display section-title">
                {t("siteClosing.forceTitle")}
              </h2>
              <p className="muted">
                {t("siteClosing.forceHint", { count: site.tools.length, manager: site.manager.fullName })}
              </p>
              <ForceCloseForm site={place} count={site.tools.length} operationId={randomUUID()} />
            </section>
          ) : (
            <p className="muted">{t("siteClosing.managerHint")}</p>
          )}
        </>
      )}
    </>
  );
}
