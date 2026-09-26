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
  canManageTools,
  canSeeValues,
  type Movement,
  type Site,
  type SiteManagerCandidate,
  type ToolOnBoard,
} from "@/registry/registry";
import { changeSiteManager } from "./lokalizacje/actions";
import { AddSiteForm, ChangeManagerForm } from "./lokalizacje/location-forms";
import { OperationsPanel } from "./operations-panel";
import { checklistData } from "./ruch/load-checklist";

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
        <ol className="movements">
          {movements.map((movement) => (
            <li key={movement.id} className="movement">
              <div className="movement-head">
                <span className={`movement-kind movement-kind-${movement.kind}`}>{t(`movementKind.${movement.kind}`)}</span>
                <span>
                  {movement.from
                    ? t("board.movementRoute", { from: movement.from.name, to: movement.to?.name ?? "" })
                    : movement.to && t("toolCard.movementTo", { place: movement.to.name })}
                </span>
              </div>
              <p className="movement-tools">{movement.tools.map((tool) => tool.code).join(", ")}</p>
              <p className="muted movement-meta">
                <time dateTime={movement.occurredAt.toISOString()}>{formatDateTime(movement.occurredAt)}</time>
                {" · "}
                {t("board.movementBy", { author: movement.author, source: t(`movementSource.${movement.source}`) })}
              </p>
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
          <span className="location-kind">{t("board.siteKind")}</span> <span>{site.name}</span>
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
            <Link className="button button-quiet" href="/ustawienia#zespol">
              {t("locations.goToTeam")}
            </Link>
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
  const [board, movements, managers, categories] = await Promise.all([
    registry.whereIsWhat(),
    registry.recentMovements(),
    canManageLocations(session) ? registry.siteManagerCandidates() : null,
    canManageTools(session) ? registry.categories() : null,
  ]);
  const { base, sites } = board;
  const onSites = sites.reduce((sum, site) => sum + site.tools.length, 0);

  return (
    <div className="board">
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
                <span className="location-kind location-kind-base">{t("board.baseKind")}</span> <span>{base.name}</span>
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
      </div>
    </div>
  );
}
