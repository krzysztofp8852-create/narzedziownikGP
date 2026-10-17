import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { MovementEntry } from "@/components/movement-entry";
import { Money, ToolList } from "@/components/tool-list";
import { formatDays } from "@/i18n/days";
import { formatMoney } from "@/i18n/money";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { textEntryEnabled, voiceEntryEnabled } from "@/lib/interpretation-instance";
import { getRegistry } from "@/lib/registry-instance";
import {
  canImportTools,
  canManageLocations,
  canManageTools,
  canHandleRentalsAt,
  canPrintStickers,
  canPunchOthers,
  canRegisterMovements,
  canRentTools,
  canReportTools,
  canReviewToolReports,
  canSeeValues,
  type RecentMovement,
  type Session,
  type SiteManagerCandidate,
  type ToolReport,
  UPCOMING_DAYS,
  type WhereIsWhat,
} from "@/registry/registry";
import { AddLocationTile, LocationTotals, SiteCard, VehicleCard } from "./lokalizacje/location-cards";
import { locationPagePath } from "./lokalizacje/location-page";
import { AddSiteForm, AddVehicleForm } from "./lokalizacje/location-forms";
import { SitesMap } from "./lokalizacje/sites-map";
import { FINISHED_SITES_HREF } from "@/lib/sites-view";
import { SitesAnchorRedirect } from "./budowy/sites-anchor";
import { BoardSnapshot } from "./board-snapshot";
import { OperationsPanel } from "./operations-panel";
import { PunchStatus } from "./punch-status";
import { ScanPanel } from "./scan-panel";
import { ForgetScanParam } from "./scan-param";
import { checklistData } from "./ruch/load-checklist";
import { UndoButton } from "./ruch/undo-button";
import { TutorialCard } from "./samouczek/tutorial";

export const generateMetadata = (): Metadata => ({ title: t("board.title") });

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
    <section className="location location-reports" aria-labelledby="deadlines-due" data-tour="deadlines">
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

function Vehicles({ vehicles, managers }: { vehicles: WhereIsWhat["vehicles"]; managers: SiteManagerCandidate[] | null }) {
  // Firma bez pojazdów nie potrzebuje tej sekcji; właściciel widzi ją, żeby dodać pierwszy.
  if (vehicles.length === 0 && !managers) return null;
  return (
    <section className="board-section" aria-labelledby="board-vehicles">
      <div className="section-head">
        <h2 id="board-vehicles" className="display section-title">
          {t("board.vehiclesTitle")}
        </h2>
        <Link href="/pojazdy">{t("board.vehiclesLink")}</Link>
      </div>
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
  const { nagranie, skanuj } = await props.searchParams;
  // Skanuj z nawigacji otwiera skaner, który sam rozpoznaje kod: plakat budowy to odbicie, naklejka to narzędzie.
  const readOnly = session.company.readOnly;
  const scan = skanuj !== undefined && !readOnly;
  const registry = getRegistry().as(session.userId);
  // Firma demo ma mapę demo bez dostawcy mapy; prawdziwa firma mapę Google, o ile jest klucz przeglądarki.
  const googleMaps = session.company.demo ? null : serverEnv.googleMaps();
  const [board, movements, managers, categories, reports, tutorial, mapPins, openPunch] = await Promise.all([
    registry.whereIsWhat(),
    registry.recentMovements(),
    canManageLocations(session) ? registry.siteManagerCandidates() : null,
    canManageTools(session) || canReportTools(session) || canRentTools(session) ? registry.categories() : null,
    canReviewToolReports(session) ? registry.toolReports() : [],
    registry.tutorial(),
    googleMaps ? registry.siteMap() : null,
    readOnly ? null : registry.ownOpenPunch(),
  ]);
  // Chwila pobrania stanu: tablica z kopii w telefonie pokazuje ją bez sieci (service worker czyta ją z atrybutu).
  const fetchedAt = new Date().toISOString();
  // Tablicy właściciela z wylogowaniem po bezczynności nie zostawiamy w telefonie (ADR 0044): po wylogowaniu jej wartości
  // w zł byłyby dostępne bez sesji.
  const keepCopy = session.idleLogoutMinutes === null;
  const { base, sites, vehicles } = board;
  const onSites = sites.reduce((sum, site) => sum + site.tools.length, 0);
  const onVehicles = vehicles.reduce((sum, vehicle) => sum + vehicle.tools.length, 0);
  const checklist = checklistData(session, board);

  return (
    <>
      {/* Pierwsze kroki właściciela startują same, dopóki ich nie pominięto ani nie ukończono. Samouczek kierownika
          i magazyniera otwiera się tylko z Pomocy. */}
      {tutorial?.closed === null && tutorial.role === "wlasciciel" && (
        <TutorialCard tutorial={tutorial} entry={{ textEntry: textEntryEnabled(), voiceEntry: voiceEntryEnabled() }} />
      )}
      {/* Odbija się każdy z kontem, skanując plakat w Skanuj (albo aparatem telefonu), więc każdy widzi, gdzie jest odbity. */}
      {!readOnly && <PunchStatus open={openPunch} now={new Date(fetchedAt)} />}
      {scan && <ForgetScanParam />}
      <SitesAnchorRedirect />
      {/* Kto zapisuje ruchy, ma skaner w operacjach; pracownik dostaje go osobno, z kartą narzędzia zamiast ruchu. */}
      {!readOnly && !canRegisterMovements(session) && (
        <ScanPanel
          userId={session.userId}
          punchesOthers={canPunchOthers(session)}
          tools={[...checklist.places.flatMap((place) => place.tools), ...board.lost].map(({ id, code }) => ({ id, code }))}
          opened={scan}
        />
      )}
      {/* Znak „bez kopii” tylko na tablicy bez kopii: inaczej nazwa atrybutu i tak trafiłaby do danych React w HTML. */}
      <div className="board" data-fetched-at={fetchedAt} {...(keepCopy ? {} : { "data-no-copy": "" })}>
        <aside className="board-side" aria-label={t("board.sidebar")}>
          <OperationsPanel
            checklist={checklist}
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
            scan={scan}
            punchesOthers={canPunchOthers(session)}
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
            <BoardSnapshot fetchedAt={fetchedAt} keepCopy={keepCopy} />
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

            <div className="site-grid">
              {sites.length === 0 && !managers && (
                <div className="empty">
                  <p>{t("board.noSites")}</p>
                </div>
              )}
              {sites.map((site) => (
                <SiteCard key={site.id} site={site} managers={managers} session={session} tools />
              ))}
              {managers && <AddLocationTile title={t("board.addSite")} form={<AddSiteForm managers={managers} />} />}
            </div>
            <div className="section-head">
              <Link href={FINISHED_SITES_HREF}>{t("siteClosing.finishedLink")}</Link>
            </div>

            <SitesMap demo={session.company.demo} board={board} pins={mapPins} maps={googleMaps} canEdit={canManageLocations(session)} />

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
