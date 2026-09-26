import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { MovementEntry } from "@/components/movement-entry";
import { SiteManagerLabel } from "@/components/site-manager-label";
import { formatDays } from "@/i18n/days";
import { formatMoney } from "@/i18n/money";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import {
  canManageLocations,
  canManageTools,
  canSeeValues,
  type RecentMovement,
  type SiteManagerCandidate,
  type ToolOnBoard,
  type WhereIsWhat,
} from "@/registry/registry";
import { changeSiteManager } from "./lokalizacje/actions";
import { AddSiteForm, ChangeManagerForm } from "./lokalizacje/location-forms";
import { OperationsPanel } from "./operations-panel";
import { checklistData } from "./ruch/load-checklist";
import { UndoButton } from "./ruch/undo-button";

export const metadata: Metadata = { title: t("board.title") };

/** Kwota w zł, gdy aktor ją widzi (klucz jest tylko u właściciela). */
function Money({ amount, className }: { amount: number | null | undefined; className?: string }) {
  return amount != null && <span className={className}>{formatMoney(amount)}</span>;
}

function ToolList({ tools, wide, atBase }: { tools: ToolOnBoard[]; wide?: boolean; atBase?: boolean }) {
  return (
    <ul className={wide ? "tool-list tool-list-wide" : "tool-list"}>
      {tools.map((tool) => (
        <li key={tool.id}>
          <Link href={`/narzedzia/${tool.id}`} className={tool.alarm ? "tool-row tool-row-alarm" : "tool-row"}>
            <span className="plate">{tool.code}</span>
            <span className="tool-row-name">
              {tool.name}
              {tool.alarm && <span className="tag tag-alarm">{t("board.overThreshold")}</span>}
            </span>
            <span className="tool-row-meta">
              <span className="tool-row-days">
                {atBase ? t("board.unused", { days: formatDays(tool.daysInPlace) }) : formatDays(tool.daysInPlace)}
              </span>
              <Money amount={tool.value} className="tool-row-value" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Liczba sztuk i, dla właściciela, suma wartości lokalizacji. */
function LocationTotals({ count, totalValue }: { count: number; totalValue?: number }) {
  return (
    <span className="location-totals">
      <span className="location-count">{t("board.toolCount", { count })}</span>
      <Money amount={totalValue} className="location-value" />
    </span>
  );
}

function Services({ services }: { services: WhereIsWhat["services"] }) {
  const withTools = services.filter((service) => service.tools.length > 0);
  return (
    <section className="board-section" aria-labelledby="board-services">
      <h2 id="board-services" className="display section-title">
        {t("board.servicesTitle")}
      </h2>
      {withTools.length === 0 ? (
        <p className="empty">{t("board.servicesEmpty")}</p>
      ) : (
        <div className="site-grid">
          {withTools.map((service) => (
            <section key={service.id} className="location location-service" aria-labelledby={`location-${service.id}`}>
              <div className="location-head">
                <h3 id={`location-${service.id}`} className="display location-name">
                  <span className="location-kind">{t("board.serviceKind")}</span> <span>{service.name}</span>
                </h3>
                <LocationTotals count={service.tools.length} totalValue={service.totalValue} />
              </div>
              <ToolList tools={service.tools} />
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function Lost({ lost, lostValue }: Pick<WhereIsWhat, "lost" | "lostValue">) {
  return (
    <section className="location location-lost" aria-labelledby="board-lost">
      <div className="location-head">
        <h2 id="board-lost" className="display section-title">
          {t("board.lostTitle")}
        </h2>
        {lost.length > 0 && <LocationTotals count={lost.length} totalValue={lostValue} />}
      </div>
      {lost.length === 0 ? (
        <p className="empty">{t("board.lostEmpty")}</p>
      ) : (
        <ul className="tool-list tool-list-wide">
          {lost.map((tool) => (
            <li key={tool.id}>
              <Link href={`/narzedzia/${tool.id}`} className="tool-row">
                <span className="plate">{tool.code}</span>
                <span className="tool-row-name">
                  {tool.name}
                  <span className="tool-row-sub muted">
                    {t("toolCard.lostLastLocation", { place: tool.lastLocation.name })}
                    {tool.responsible && ` · ${t("toolCard.lostResponsible", { name: tool.responsible })}`}
                  </span>
                </span>
                <span className="tool-row-meta">
                  <span className="tool-row-days">{t("board.lostFor", { days: formatDays(tool.daysLost) })}</span>
                  <Money amount={tool.value} className="tool-row-value" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentMovements({ movements }: { movements: RecentMovement[] }) {
  return (
    <section className="recent" aria-labelledby="recent-movements">
      <div className="section-head">
        <h2 id="recent-movements" className="display section-title">
          {t("board.recentTitle")}
        </h2>
        <Link href="/historia">{t("history.fullHistory")}</Link>
      </div>
      {movements.length === 0 ? (
        <p className="empty">{t("board.recentEmpty")}</p>
      ) : (
        <ol className="movements">
          {movements.map((movement) => (
            <MovementEntry key={movement.id} movement={movement}>
              {movement.undoable && <UndoButton movementId={movement.id} operationId={randomUUID()} />}
            </MovementEntry>
          ))}
        </ol>
      )}
    </section>
  );
}

function SiteCard({ site, managers }: { site: WhereIsWhat["sites"][number]; managers: SiteManagerCandidate[] | null }) {
  return (
    <section className="location location-site" aria-labelledby={`location-${site.id}`}>
      <div className="location-head">
        <h3 id={`location-${site.id}`} className="display location-name">
          <span className="location-kind">{t("board.siteKind")}</span> <span>{site.name}</span>
        </h3>
        <LocationTotals count={site.tools.length} totalValue={site.totalValue} />
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
              {board.offBaseValue !== undefined && (
                <div>
                  <dt>{t("board.statOffBase")}</dt>
                  <dd data-testid="off-base-value">{formatMoney(board.offBaseValue)}</dd>
                </div>
              )}
              <div className={board.alarmCount > 0 ? "stat-alarm" : undefined}>
                <dt>{t("board.statAlarms")}</dt>
                <dd data-testid="alarm-count">{board.alarmCount}</dd>
              </div>
            </dl>
          </div>

          <section className="location" aria-labelledby="location-base">
            <div className="location-head">
              <h2 id="location-base" className="display location-name">
                <span className="location-kind location-kind-base">{t("board.baseKind")}</span> <span>{base.name}</span>
              </h2>
              <LocationTotals count={base.tools.length} totalValue={base.totalValue} />
            </div>
            {base.tools.length === 0 ? (
              <p className="empty">{t("board.baseEmpty")}</p>
            ) : (
              <ToolList tools={base.tools} wide atBase />
            )}
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

          <Services services={board.services} />
          <Lost lost={board.lost} lostValue={board.lostValue} />
        </section>
      </div>
    </div>
  );
}
