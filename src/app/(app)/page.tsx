import type { Metadata } from "next";
import Link from "next/link";
import { SiteManagerLabel } from "@/components/site-manager-label";
import { formatDateTime } from "@/i18n/dates";
import { formatDays } from "@/i18n/days";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { canManageLocations, canManageTools, type Movement, type ToolOnBoard } from "@/registry/registry";

export const metadata: Metadata = { title: t("board.title") };

function ToolList({ tools }: { tools: ToolOnBoard[] }) {
  return (
    <ul className="tool-list">
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
    <section aria-labelledby="recent-movements">
      <h2 id="recent-movements" className="display section-title">
        {t("board.recentTitle")}
      </h2>
      {movements.length === 0 ? (
        <p className="empty">{t("board.recentEmpty")}</p>
      ) : (
        <ol className="history">
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

export default async function BoardPage() {
  const session = await requireSession();
  const registry = getRegistry().as(session.userId);
  const [{ base, sites }, movements] = await Promise.all([registry.whereIsWhat(), registry.recentMovements()]);

  return (
    <>
      <div className="page-head">
        <h1 className="display page-title">{t("board.title")}</h1>
        <div className="form-actions">
          <Link className="button" href="/ruch/wydanie">
            {t("board.issue")}
          </Link>
          <Link className="button" href="/ruch/zwrot">
            {t("board.return")}
          </Link>
          {canManageTools(session) && (
            <Link className="button button-quiet" href="/narzedzia/nowe">
              {t("board.addTool")}
            </Link>
          )}
        </div>
      </div>
      <section className="location" aria-labelledby="location-base">
        <div className="location-head">
          <h2 id="location-base" className="display location-name">
            <span className="plate">{t("board.baseKind")}</span>
            {base.name}
          </h2>
          <span className="location-count">{t("board.toolCount", { count: base.tools.length })}</span>
        </div>
        {base.tools.length === 0 ? <p className="empty">{t("board.baseEmpty")}</p> : <ToolList tools={base.tools} />}
      </section>
      {sites.length === 0 ? (
        <div className="empty">
          <p>{t("board.noSites")}</p>
          {canManageLocations(session) && (
            <p>
              <Link href="/lokalizacje">{t("board.addSite")}</Link>
            </p>
          )}
        </div>
      ) : (
        sites.map((site) => (
          <section key={site.id} className="location location-site" aria-labelledby={`location-${site.id}`}>
            <div className="location-head">
              <h2 id={`location-${site.id}`} className="display location-name">
                <span className="plate">{t("board.siteKind")}</span>
                {site.name}
              </h2>
              <span className="location-meta">
                <span className="location-status">{t(`siteStatus.${site.status}`)}</span>
                <span className="location-count">{t("board.toolCount", { count: site.tools.length })}</span>
              </span>
            </div>
            <div className="location-details">
              <p className="muted">{site.address}</p>
              <p>
                <SiteManagerLabel manager={site.manager} />
              </p>
            </div>
            {site.tools.length === 0 ? <p className="empty">{t("board.siteEmpty")}</p> : <ToolList tools={site.tools} />}
          </section>
        ))
      )}
      <RecentMovements movements={movements} />
    </>
  );
}
