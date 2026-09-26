import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { SiteManagerLabel } from "@/components/site-manager-label";
import { formatDateTime } from "@/i18n/dates";
import { formatDays } from "@/i18n/days";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import {
  canManageLocations,
  canManageSettings,
  canManageTeam,
  canManageTools,
  canSeeValues,
  type Movement,
  type Site,
  type SiteManagerCandidate,
  type ToolOnBoard,
} from "@/registry/registry";
import { changeSiteManager } from "./lokalizacje/actions";
import { AddSiteForm, ChangeManagerForm } from "./lokalizacje/location-forms";
import { ServicesSection } from "./lokalizacje/services-section";
import { OperationsPanel } from "./operations-panel";
import { checklistData } from "./ruch/load-checklist";
import { SettingsSection } from "./ustawienia/settings-section";
import { TeamSection } from "./zespol/team-section";

export const metadata: Metadata = { title: t("board.title") };

function ToolList({ tools, wide }: { tools: ToolOnBoard[]; wide?: boolean }) {
  return (
    <ul className={wide ? "tool-list tool-list-wide" : "tool-list"}>
      {tools.map((tool) => (
        <li key={tool.id}>
          <Link href={`/narzedzia/${tool.id}`} className="tool-row">
            <span className="plate">{tool.code}</span>
            <span className="tool-row-name">{tool.name}</span>
            <span className="tool-row-days">{formatDays(tool.daysInPlace)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RecentMovements({ movements }: { movements: Movement[] }) {
  return (
    <section className="recent" aria-labelledby="recent-movements">
      <h2 id="recent-movements" className="display section-title">
        {t("board.recentTitle")}
      </h2>
      {movements.length === 0 ? (
        <p className="empty">{t("board.recentEmpty")}</p>
      ) : (
        <ol className="history history-compact">
          {movements.map((movement) => (
            <li key={movement.id}>
              <time dateTime={movement.occurredAt.toISOString()}>{formatDateTime(movement.occurredAt)}</time>
              <strong>{t(`movementKind.${movement.kind}`)}</strong>
              <span>{movement.tools.map((tool) => tool.code).join(", ")}</span>
              <span>
                {movement.from
                  ? t("board.movementRoute", { from: movement.from.name, to: movement.to?.name ?? "" })
                  : movement.to && t("toolCard.movementTo", { place: movement.to.name })}
              </span>
              <span className="muted">
                {t("board.movementBy", { author: movement.author, source: t(`movementSource.${movement.source}`) })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function SiteCard({ site, managers }: { site: Site & { tools: ToolOnBoard[] }; managers: SiteManagerCandidate[] | null }) {
  return (
    <section className="location location-site" aria-labelledby={`location-${site.id}`}>
      <div className="location-head">
        <h3 id={`location-${site.id}`} className="display location-name">
          <span className="plate">{t("board.siteKind")}</span>
          {site.name}
        </h3>
        <span className="location-count">{t("board.toolCount", { count: site.tools.length })}</span>
      </div>
      <div className="location-details">
        <p className="muted">{site.address}</p>
        <p>
          <SiteManagerLabel manager={site.manager} />
        </p>
      </div>
      {site.tools.length === 0 ? <p className="empty">{t("board.siteEmpty")}</p> : <ToolList tools={site.tools} />}
      {managers && managers.length > 0 && (
        <details className="location-more">
          <summary>{t("locations.changeManager")}</summary>
          <ChangeManagerForm action={changeSiteManager.bind(null, site.id)} site={site} managers={managers} />
        </details>
      )}
    </section>
  );
}

function AddSiteTile({ managers }: { managers: SiteManagerCandidate[] }) {
  return (
    <details className="location location-add">
      <summary className="panel-summary">{t("board.addSite")}</summary>
      {managers.length === 0 ? (
        <div className="stack-form">
          <p className="empty">{t("locations.noManagers")}</p>
          <p>
            <a className="button button-quiet" href="#zespol">
              {t("locations.goToTeam")}
            </a>
          </p>
        </div>
      ) : (
        <AddSiteForm managers={managers} />
      )}
    </details>
  );
}

export default async function BoardPage() {
  const session = await requireSession();
  const registry = getRegistry().as(session.userId);
  const ownsLocations = canManageLocations(session);
  const [board, movements, locations, managers, members, categories, settings] = await Promise.all([
    registry.whereIsWhat(),
    registry.recentMovements(),
    ownsLocations ? registry.locations() : null,
    ownsLocations ? registry.siteManagerCandidates() : null,
    canManageTeam(session) ? registry.team() : null,
    canManageTools(session) ? registry.categories() : null,
    canManageSettings(session) ? registry.settings() : null,
  ]);
  const { base, sites } = board;
  const onSites = sites.reduce((sum, site) => sum + site.tools.length, 0);
  const finishedSites = locations?.sites.filter((site) => site.status === "zakonczona") ?? [];

  return (
    <div className="board">
      <div className="board-main">
        <section className="where" aria-labelledby="board-title">
          <div className="page-head">
            <h1 id="board-title" className="display page-title">
              {t("board.title")}
            </h1>
            <dl className="stats">
              <div>
                <dt>{t("board.statBase")}</dt>
                <dd>{base.tools.length}</dd>
              </div>
              <div>
                <dt>{t("board.statSites")}</dt>
                <dd>{onSites}</dd>
              </div>
              <div>
                <dt>{t("board.statSiteCount")}</dt>
                <dd>{sites.length}</dd>
              </div>
            </dl>
          </div>

          <section className="location" aria-labelledby="location-base">
            <div className="location-head">
              <h2 id="location-base" className="display location-name">
                <span className="plate">{t("board.baseKind")}</span>
                {base.name}
              </h2>
              <span className="location-count">{t("board.toolCount", { count: base.tools.length })}</span>
            </div>
            {base.tools.length === 0 ? <p className="empty">{t("board.baseEmpty")}</p> : <ToolList tools={base.tools} wide />}
          </section>

          <div className="site-grid">
            {sites.length === 0 && !managers && (
              <div className="empty">
                <p>{t("board.noSites")}</p>
              </div>
            )}
            {sites.map((site) => (
              <SiteCard key={site.id} site={site} managers={managers} />
            ))}
            {managers && <AddSiteTile managers={managers} />}
          </div>
        </section>

        {(locations || members || settings) && (
          <section className="company" aria-labelledby="company-title">
            <h2 id="company-title" className="display section-title">
              {t("board.companyTitle")}
            </h2>
            <div className="company-grid">
              {members && <TeamSection session={session} members={members} />}
              {locations && <ServicesSection services={locations.services} />}
              {settings && <SettingsSection settings={settings} />}
              {finishedSites.length > 0 && (
                <section className="company-card" aria-labelledby="finished-sites">
                  <h3 id="finished-sites" className="display section-title">
                    {t("board.finishedSites")}
                  </h3>
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
          </section>
        )}
      </div>

      <aside className="board-side" aria-label={t("board.sidebar")}>
        <OperationsPanel
          checklist={checklistData(session, board)}
          newTool={
            categories && {
              categories,
              showValue: canSeeValues(session),
              operationId: randomUUID(),
            }
          }
        />
        <RecentMovements movements={movements} />
      </aside>
    </div>
  );
}
