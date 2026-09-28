import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { DamagedIcon } from "@/components/damaged-icon";
import { MovementEntry } from "@/components/movement-entry";
import { SiteManagerLabel } from "@/components/site-manager-label";
import { VehicleIcon } from "@/components/vehicle-icon";
import { formatDays } from "@/i18n/days";
import { formatMoney } from "@/i18n/money";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { textEntryEnabled, voiceEntryEnabled } from "@/lib/interpretation-instance";
import { getRegistry } from "@/lib/registry-instance";
import {
  canCloseSite,
  canImportTools,
  canManageLocations,
  canManageTools,
  canPrintStickers,
  canReportTools,
  canReviewToolReports,
  canSeeValues,
  type RecentMovement,
  type Session,
  type SiteManagerCandidate,
  type ToolOnBoard,
  type ToolReport,
  type WhereIsWhat,
} from "@/registry/registry";
import { changeSiteManager, changeVehicleManager } from "./lokalizacje/actions";
import { AddSiteForm, AddVehicleForm, ChangeManagerForm, DeactivateVehicleForm, VehicleAlarmForm } from "./lokalizacje/location-forms";
import { BoardSnapshot } from "./board-snapshot";
import { OperationsPanel } from "./operations-panel";
import { checklistData } from "./ruch/load-checklist";
import { UndoButton } from "./ruch/undo-button";
import { type MapDevice, type MapPlace, SiteMap } from "./site-map";

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
              {tool.registration === "zgloszone" && <span className="tag tag-reported">{t("board.reported")}</span>}
              {tool.damagedSince && (
                <span className="tag tag-damaged">
                  <DamagedIcon /> {t("board.damaged")}
                </span>
              )}
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

/** Zgłoszenia narzędzi czekające na decyzję właściciela: rozpatruje je w oknie 📋; bez zgłoszeń sekcji nie ma. */
function ToolReports({ reports }: { reports: ToolReport[] }) {
  if (reports.length === 0) return null;
  return (
    <section className="location location-reports" aria-labelledby="tool-reports">
      <div className="location-head">
        <h2 id="tool-reports" className="display section-title">
          {t("board.toolReportsWaiting", { count: reports.length })}
        </h2>
        <Link href="/zgloszenia#zgloszone-narzedzia">{t("board.toolReportsLink")}</Link>
      </div>
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

function SiteCard({
  site,
  managers,
  session,
}: {
  site: WhereIsWhat["sites"][number];
  managers: SiteManagerCandidate[] | null;
  session: Session;
}) {
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
          <ChangeManagerForm
            action={changeSiteManager.bind(null, site.id)}
            location={site}
            label={t("locations.newManager", { name: site.name })}
            managers={managers}
          />
        </details>
      )}
      {canCloseSite(session, site) && (
        <p>
          <Link className="button button-quiet button-small" href={`/budowy/${site.id}/zamykanie`}>
            {t("siteClosing.close")}
          </Link>
        </p>
      )}
    </section>
  );
}

/**
 * Pojazd na tablicy, jak budowa: kierownik i sprzęt, który jest poza bazą. Właściciel zmienia tu
 * kierownika, włącza alarm po progu dni i dezaktywuje pusty pojazd.
 */
function VehicleCard({ vehicle, managers }: { vehicle: WhereIsWhat["vehicles"][number]; managers: SiteManagerCandidate[] | null }) {
  return (
    <section className="location location-site location-vehicle" aria-labelledby={`location-${vehicle.id}`}>
      <div className="location-head">
        <h3 id={`location-${vehicle.id}`} className="display location-name">
          <span className="location-kind">
            <VehicleIcon /> {t("board.vehicleKind")}
          </span>{" "}
          <span>{vehicle.name}</span>
        </h3>
        <LocationTotals count={vehicle.tools.length} totalValue={vehicle.totalValue} />
      </div>
      <div className="location-details">
        <p>
          <SiteManagerLabel manager={vehicle.manager} />
        </p>
        {!vehicle.alarmEnabled && <p className="muted">{t("board.vehicleAlarmOff")}</p>}
      </div>
      {vehicle.tools.length === 0 ? <p className="empty">{t("board.vehicleEmpty")}</p> : <ToolList tools={vehicle.tools} />}
      {managers && (
        <>
          {managers.length > 0 && (
            <details className="location-more">
              <summary>{t("locations.changeManager")}</summary>
              <ChangeManagerForm
                action={changeVehicleManager.bind(null, vehicle.id)}
                location={vehicle}
                label={t("locations.newVehicleManager", { name: vehicle.name })}
                managers={managers}
              />
            </details>
          )}
          <details className="location-more">
            <summary>{t("locations.vehicleAlarm")}</summary>
            <VehicleAlarmForm vehicle={vehicle} />
          </details>
          <details className="location-more">
            <summary>{t("locations.deactivateVehicle")}</summary>
            <DeactivateVehicleForm vehicle={vehicle} empty={vehicle.tools.length === 0} />
          </details>
        </>
      )}
    </section>
  );
}

/** Kafelek dodawania budowy albo pojazdu; bez aktywnego kierownika odsyła do zespołu. */
function AddLocationTile({ title, managers, form }: { title: string; managers: SiteManagerCandidate[]; form: ReactNode }) {
  return (
    <details className="location location-add">
      <summary className="panel-summary">{title}</summary>
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
        form
      )}
    </details>
  );
}

/**
 * DEMO: rejestr nie zna jeszcze lokalizatorów, więc „urządzeniami z lokalizatorem” są pierwsze
 * narzędzia z każdego miejsca.
 */
function mapData({ base, sites, vehicles }: WhereIsWhat): { places: MapPlace[]; devices: MapDevice[] } {
  const places: MapPlace[] = [
    { id: base.id, kind: "base", name: base.name, toolCount: base.tools.length },
    ...sites.map((site) => ({ id: site.id, kind: "site" as const, name: site.name, address: site.address, toolCount: site.tools.length })),
    ...vehicles.map((vehicle) => ({ id: vehicle.id, kind: "vehicle" as const, name: vehicle.name, toolCount: vehicle.tools.length })),
  ];
  const tracked = (placeId: string, tools: ToolOnBoard[], count: number) =>
    tools.slice(0, count).map((tool) => ({ id: tool.id, code: tool.code, name: tool.name, placeId }));
  const devices = [
    ...tracked(base.id, base.tools, 2),
    ...sites.flatMap((site) => tracked(site.id, site.tools, 2)),
    ...vehicles.flatMap((vehicle) => tracked(vehicle.id, vehicle.tools, 1)),
  ];
  return { places, devices };
}

function Vehicles({ vehicles, managers }: { vehicles: WhereIsWhat["vehicles"]; managers: SiteManagerCandidate[] | null }) {
  // Firma bez pojazdów nie potrzebuje tej sekcji; właściciel widzi ją, żeby dodać pierwszy.
  if (vehicles.length === 0 && !managers) return null;
  return (
    <section className="board-section" aria-labelledby="board-vehicles">
      <h2 id="board-vehicles" className="display section-title">
        {t("board.vehiclesTitle")}
      </h2>
      <div className="site-grid">
        {vehicles.map((vehicle) => (
          <VehicleCard key={vehicle.id} vehicle={vehicle} managers={managers} />
        ))}
        {managers && <AddLocationTile title={t("board.addVehicle")} managers={managers} form={<AddVehicleForm managers={managers} />} />}
      </div>
    </section>
  );
}

export default async function BoardPage(props: PageProps<"/">) {
  const session = await requireSession();
  const { nagranie } = await props.searchParams;
  const registry = getRegistry().as(session.userId);
  const [board, movements, managers, categories, reports] = await Promise.all([
    registry.whereIsWhat(),
    registry.recentMovements(),
    canManageLocations(session) ? registry.siteManagerCandidates() : null,
    canManageTools(session) || canReportTools(session) ? registry.categories() : null,
    canReviewToolReports(session) ? registry.toolReports() : [],
  ]);
  // Chwila pobrania stanu: tablica z kopii w telefonie pokazuje ją bez sieci (service worker czyta ją z atrybutu).
  const fetchedAt = new Date().toISOString();
  const { base, sites, vehicles } = board;
  const onSites = sites.reduce((sum, site) => sum + site.tools.length, 0);
  const onVehicles = vehicles.reduce((sum, vehicle) => sum + vehicle.tools.length, 0);

  return (
    <div className="board" data-fetched-at={fetchedAt}>
      <aside className="board-side" aria-label={t("board.sidebar")}>
        <OperationsPanel
          checklist={checklistData(session, board)}
          newTool={
            categories &&
            canManageTools(session) && {
              categories,
              showValue: canSeeValues(session),
              operationId: randomUUID(),
              canImport: canImportTools(session),
              canPrintStickers: canPrintStickers(session),
            }
          }
          textEntry={textEntryEnabled()}
          voiceEntry={voiceEntryEnabled()}
          recordingId={typeof nagranie === "string" ? nagranie : undefined}
          reportTool={
            categories &&
            canReportTools(session) && {
              categories,
              sites: sites.filter((site) => site.manager.id === session.userId).map((site) => ({ id: site.id, name: site.name })),
              operationId: randomUUID(),
            }
          }
        />
        <RecentMovements movements={movements} />
      </aside>

      <div className="board-main">
        <section className="where" aria-labelledby="board-title">
          <BoardSnapshot fetchedAt={fetchedAt} />
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
              {vehicles.length > 0 && (
                <div>
                  <dt>{t("board.statVehicles")}</dt>
                  <dd>{onVehicles}</dd>
                </div>
              )}
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

          <ToolReports reports={reports} />

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
              <SiteCard key={site.id} site={site} managers={managers} session={session} />
            ))}
            {managers && <AddLocationTile title={t("board.addSite")} managers={managers} form={<AddSiteForm managers={managers} />} />}
          </div>
          <div className="section-head">
            <Link href="/budowy/zakonczone">{t("siteClosing.finishedLink")}</Link>
          </div>

          <SiteMap {...mapData(board)} />

          <Vehicles vehicles={vehicles} managers={managers} />

          <Services services={board.services} />
          <Lost lost={board.lost} lostValue={board.lostValue} />
        </section>
      </div>
    </div>
  );
}
