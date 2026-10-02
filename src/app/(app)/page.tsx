import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { MovementEntry } from "@/components/movement-entry";
import { SiteManagerLabel } from "@/components/site-manager-label";
import { Money, ToolList } from "@/components/tool-list";
import { VehicleIcon } from "@/components/vehicle-icon";
import { formatDays } from "@/i18n/days";
import { formatMoney } from "@/i18n/money";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { textEntryEnabled, voiceEntryEnabled } from "@/lib/interpretation-instance";
import { getRegistry } from "@/lib/registry-instance";
import {
  canCloseSite,
  canImportTools,
  canManageLocations,
  canManageTools,
  canHandleRentalsAt,
  canPrintStickers,
  canPunchOthers,
  canRentTools,
  canReportTools,
  canReviewToolReports,
  canSeeValues,
  type MapPin,
  type RecentMovement,
  type Session,
  type SiteManagerCandidate,
  type ToolOnBoard,
  type ToolReport,
  UPCOMING_DAYS,
  type WhereIsWhat,
} from "@/registry/registry";
import { changeSiteManager, changeVehicleManager } from "./lokalizacje/actions";
import { locationPagePath } from "./lokalizacje/location-page";
import {
  AddSiteForm,
  AddVehicleForm,
  ChangeManagerForm,
  ChangeSiteAddressForm,
  DeactivateVehicleForm,
  VehicleAlarmForm,
} from "./lokalizacje/location-forms";
import { BoardSnapshot } from "./board-snapshot";
import { OperationsPanel } from "./operations-panel";
import { PunchButton } from "./punch-button";
import { checklistData } from "./ruch/load-checklist";
import { UndoButton } from "./ruch/undo-button";
import { TutorialCard } from "./samouczek/tutorial";
import { DemoSiteMap, type MapDevice, type MapPlace } from "./demo-site-map";
import { SiteMap, type SiteMapPin } from "./site-map";

export const metadata: Metadata = { title: t("board.title") };

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
    <section className="location location-lost" aria-labelledby="board-lost" data-tour="lost">
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
    <section className="location location-reports" aria-labelledby="tool-reports" data-tour="tool-reports">
      <div className="location-head">
        <h2 id="tool-reports" className="display section-title">
          {t("board.toolReportsWaiting", { count: reports.length })}
        </h2>
        <Link href="/zgloszenia#zgloszone-narzedzia">{t("board.toolReportsLink")}</Link>
      </div>
    </section>
  );
}

/** Ile sztuk sprzętu ma termin w najbliższych 30 dniach (i ile po terminie), z odnośnikiem do listy; bez nich sekcji nie ma. */
function DeadlinesDue({ board }: { board: WhereIsWhat }) {
  const tools = [board.base, ...board.sites, ...board.vehicles, ...board.services]
    .flatMap((place) => place.tools)
    .filter((tool) => tool.nextDeadline && tool.nextDeadline.daysLeft <= UPCOMING_DAYS);
  if (tools.length === 0) return null;
  const overdue = tools.filter((tool) => tool.nextDeadline?.overdue).length;
  return (
    <section className="location location-reports" aria-labelledby="deadlines-due">
      <div className="location-head">
        <h2 id="deadlines-due" className="display section-title">
          {t("deadlines.boardDue", { days: UPCOMING_DAYS, count: tools.length })}
          {overdue > 0 && <span className="text-danger"> · {t("deadlines.boardOverdue", { count: overdue })}</span>}
        </h2>
        <Link href="/terminy">{t("deadlines.boardLink")}</Link>
      </div>
    </section>
  );
}

function RecentMovements({ movements }: { movements: RecentMovement[] }) {
  return (
    <section className="recent" aria-labelledby="recent-movements" data-tour="recent">
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
          <span className="location-kind">{t("board.siteKind")}</span> <Link href={locationPagePath("budowa", site.id)}>{site.name}</Link>
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
      {managers && (
        <>
          <details className="location-more">
            <summary>{t("locations.changeManager")}</summary>
            <ChangeManagerForm
              action={changeSiteManager.bind(null, site.id)}
              location={site}
              label={t("locations.newManager", { name: site.name })}
              managers={managers}
            />
          </details>
          <details className="location-more">
            <summary>{t("locations.changeAddress")}</summary>
            <ChangeSiteAddressForm site={site} />
          </details>
        </>
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
          <Link href={locationPagePath("pojazd", vehicle.id)}>{vehicle.name}</Link>
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
          <details className="location-more">
            <summary>{t("locations.changeManager")}</summary>
            <ChangeManagerForm
              action={changeVehicleManager.bind(null, vehicle.id)}
              location={vehicle}
              label={t("locations.newVehicleManager", { name: vehicle.name })}
              managers={managers}
            />
          </details>
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

/** Kafelek dodawania budowy albo pojazdu. Kierownika jest zawsze z kogo wybrać, bo może nim być sam właściciel. */
function AddLocationTile({ title, form }: { title: string; form: ReactNode }) {
  return (
    <details className="location location-add">
      <summary className="panel-summary">{title}</summary>
      {form}
    </details>
  );
}

/**
 * Mapa firmy demo (ADR 0026): rejestr nie zna lokalizatorów, więc „urządzeniami z lokalizatorem” są pierwsze
 * narzędzia z każdego miejsca. Prawdziwa firma tego nie widzi.
 */
function demoMapData({ base, sites, vehicles }: WhereIsWhat): { places: MapPlace[]; devices: MapDevice[] } {
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

/** Pinezki mapy budów z liczbą narzędzi z tablicy (tej samej chwili co reszta tablicy). */
function sitePins(pins: MapPin[], { base, sites }: WhereIsWhat): SiteMapPin[] {
  const toolCounts = new Map([base, ...sites].map((place) => [place.id, place.tools.length]));
  return pins.map((pin) => ({ ...pin, toolCount: toolCounts.get(pin.id) ?? 0 }));
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
        {managers && <AddLocationTile title={t("board.addVehicle")} form={<AddVehicleForm managers={managers} />} />}
      </div>
    </section>
  );
}

export default async function BoardPage(props: PageProps<"/">) {
  const session = await requireSession();
  const { nagranie } = await props.searchParams;
  const registry = getRegistry().as(session.userId);
  // Firma demo ma mapę demo bez dostawcy mapy; prawdziwa firma mapę Google, o ile jest klucz przeglądarki.
  const googleMaps = session.company.demo ? null : serverEnv.googleMaps();
  const [board, movements, managers, categories, reports, tutorial, mapPins] = await Promise.all([
    registry.whereIsWhat(),
    registry.recentMovements(),
    canManageLocations(session) ? registry.siteManagerCandidates() : null,
    canManageTools(session) || canReportTools(session) || canRentTools(session) ? registry.categories() : null,
    canReviewToolReports(session) ? registry.toolReports() : [],
    registry.tutorial(),
    googleMaps ? registry.siteMap() : null,
  ]);
  // Chwila pobrania stanu: tablica z kopii w telefonie pokazuje ją bez sieci (service worker czyta ją z atrybutu).
  const fetchedAt = new Date().toISOString();
  const { base, sites, vehicles } = board;
  const onSites = sites.reduce((sum, site) => sum + site.tools.length, 0);
  const onVehicles = vehicles.reduce((sum, vehicle) => sum + vehicle.tools.length, 0);

  return (
    <>
      {/* Samouczek startuje sam, dopóki go nie pominięto ani nie ukończono. */}
      {tutorial?.closed === null && (
        <TutorialCard tutorial={tutorial} entry={{ textEntry: textEntryEnabled(), voiceEntry: voiceEntryEnabled() }} />
      )}
      {/* Odbija się każdy z kontem; skaner prowadzi na stronę odbicia, jak kod QR plakatu budowy, a bez sieci do kolejki. */}
      {!session.company.readOnly && <PunchButton userId={session.userId} punchesOthers={canPunchOthers(session)} />}
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
            rentedTool={
              categories &&
              canRentTools(session) && {
                categories,
                places: rentalPlaces(session, board),
                showValue: canSeeValues(session),
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
              <dl className="stats" data-tour="stats">
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
                  <div data-tour="off-base">
                    <dt>{t("board.statOffBase")}</dt>
                    <dd data-testid="off-base-value">{formatMoney(board.offBaseValue)}</dd>
                  </div>
                )}
                <div className={board.alarmCount > 0 ? "stat-alarm" : undefined} data-tour="alarms">
                  <dt>{t("board.statAlarms")}</dt>
                  <dd data-testid="alarm-count">{board.alarmCount}</dd>
                </div>
              </dl>
            </div>

            <ToolReports reports={reports} />
            <DeadlinesDue board={board} />

            <section className="location" aria-labelledby="location-base">
              <div className="location-head">
                <h2 id="location-base" className="display location-name">
                  <span className="location-kind location-kind-base">{t("board.baseKind")}</span> <Link href={locationPagePath("baza", base.id)}>{base.name}</Link>
                </h2>
                <LocationTotals count={base.tools.length} totalValue={base.totalValue} />
              </div>
              {base.tools.length === 0 ? (
                <p className="empty">{t("board.baseEmpty")}</p>
              ) : (
                <ToolList tools={base.tools} wide atBase />
              )}
            </section>

            <div id="budowy" className="site-grid">
              {sites.length === 0 && !managers && (
                <div className="empty">
                  <p>{t("board.noSites")}</p>
                </div>
              )}
              {sites.map((site) => (
                <SiteCard key={site.id} site={site} managers={managers} session={session} />
              ))}
              {managers && <AddLocationTile title={t("board.addSite")} form={<AddSiteForm managers={managers} />} />}
            </div>
            <div className="section-head">
              <Link href="/budowy/zakonczone">{t("siteClosing.finishedLink")}</Link>
            </div>

            {session.company.demo ? (
              <DemoSiteMap {...demoMapData(board)} />
            ) : (
              googleMaps &&
              mapPins && <SiteMap pins={sitePins(mapPins, board)} maps={googleMaps} canEdit={canManageLocations(session)} />
            )}

            <Vehicles vehicles={vehicles} managers={managers} />

            <Services services={board.services} />
            <Lost lost={board.lost} lostValue={board.lostValue} />
          </section>
        </div>
      </div>
    </>
  );
}

/**
 * Gdzie aktor przyjmuje sprzęt wynajęty: właściciel i magazynier na bazie, budowach i pojazdach z tablicy (aktywnych),
 * kierownik na swoich.
 */
function rentalPlaces(session: Session, board: WhereIsWhat) {
  const place = ({ id, name }: { id: string; name: string }) => ({ id, name });
  const handled = (kind: "budowa" | "pojazd") => (location: { id: string; name: string; manager: { id: string } }) =>
    canHandleRentalsAt(session, { kind, managerId: location.manager.id });
  return {
    base: canHandleRentalsAt(session, { kind: "baza", managerId: null }) ? place(board.base) : null,
    sites: board.sites.filter(handled("budowa")).map(place),
    vehicles: board.vehicles.filter(handled("pojazd")).map(place),
  };
}
