import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { MovementEntry } from "@/components/movement-entry";
import { Money } from "@/components/tool-list";
import { VehicleIcon } from "@/components/vehicle-icon";
import { formatMoney } from "@/i18n/money";
import { type MessageKey, t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { type BoardCounter, boardCounters, firstStepsOnBoard, parseBoardOperation, placeHref, placesOnBoard } from "@/lib/board-view";
import { addCategoryStep, addSiteStep } from "@/lib/empty-step";
import { textEntryEnabled, voiceEntryEnabled } from "@/lib/interpretation-instance";
import { getRegistry } from "@/lib/registry-instance";
import {
  canImportTools,
  canManageTools,
  canHandleRentalsAt,
  canPrintStickers,
  canPunchOthers,
  canRentTools,
  canReportTools,
  canSeeValues,
  type PlaceOnBoard,
  type RecentMovement,
  type Session,
  type WhereIsWhat,
} from "@/registry/registry";
import { SitesAnchorRedirect } from "./budowy/sites-anchor";
import { BoardSnapshot } from "./board-snapshot";
import { NeedsAttention } from "./needs-attention";
import { OperationsPanel } from "./operations-panel";
import { PunchStatus } from "./punch-status";
import { ForgetBoardParam } from "./board-param";
import { checklistData } from "./ruch/load-checklist";
import { UndoButton } from "./ruch/undo-button";
import { TutorialCard } from "./samouczek/tutorial";
import { WorkerBoard } from "./worker-board";

export const generateMetadata = (): Metadata => ({ title: t("nav.board") });

/** Ile ostatnich ruchów stoi na tablicy; resztę pokazuje Historia. */
const RECENT_ON_BOARD = 3;

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
        <EmptyState>{t("board.recentEmpty")}</EmptyState>
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

/** Podpis licznika, a dla przewodnika demo i testów jego znaczniki. */
const COUNTERS: Record<BoardCounter["key"], { label: MessageKey; tour?: string; testId?: string }> = {
  atBase: { label: "board.statBase" },
  onSites: { label: "board.statSites" },
  alarms: { label: "board.statAlarms", tour: "alarms", testId: "alarm-count" },
  offBase: { label: "board.statOffBase", tour: "off-base", testId: "off-base-value" },
};

/** Klikalne liczniki: każdy otwiera listę narzędzi przefiltrowaną do tego, co liczy; kwota poza bazą jest w zł. */
function Counters({ counters }: { counters: BoardCounter[] }) {
  return (
    <ul className="stats" aria-label={t("board.countersLabel")} data-tour="stats">
      {counters.map(({ key, value, href }) => (
        <li key={key} data-tour={COUNTERS[key].tour}>
          <Link href={href} className={key === "alarms" && value > 0 ? "stat stat-alarm" : "stat"}>
            <span className="stat-label">{t(COUNTERS[key].label)}</span>{" "}
            <strong className="stat-value" data-testid={COUNTERS[key].testId}>
              {key === "offBase" ? formatMoney(value) : value}
            </strong>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const PLACE_KINDS: Record<PlaceOnBoard["kind"], MessageKey> = {
  baza: "board.baseKind",
  budowa: "board.siteKind",
  pojazd: "board.vehicleKind",
  serwis: "board.serviceKind",
};

/** Zwinięty kafel miejsca: rodzaj, nazwa, liczba narzędzi, znaczek alarmu i (u właściciela) suma w zł. */
function PlaceTile({ place }: { place: PlaceOnBoard }) {
  return (
    <li>
      <Link href={placeHref(place)} className={place.alarm ? "place-tile place-tile-alarm" : "place-tile"}>
        <span className={place.kind === "baza" ? "location-kind location-kind-base" : "location-kind"}>
          {place.kind === "pojazd" && <VehicleIcon />} {t(PLACE_KINDS[place.kind])}
        </span>{" "}
        <span className="place-tile-name">{place.name}</span>{" "}
        {/* Spacje między częściami: nazwa odnośnika dla czytnika ekranu to „Budowa Rataje 2 szt. alarm”. */}
        <span className="place-tile-meta">
          <span className="location-count">{t("board.toolCount", { count: place.toolCount })}</span>{" "}
          {place.alarm && <span className="tag tag-alarm">{t("board.alarmTag")}</span>}{" "}
          <Money amount={place.totalValue} className="location-value" />
        </span>
      </Link>
    </li>
  );
}

/** „Gdzie jest sprzęt”: jedna siatka zwiniętych kafli; kierownik ma cudze budowy i pojazdy zwinięte pod spodem. */
function WhereEquipment({ session, places }: { session: Session; places: PlaceOnBoard[] }) {
  const { main, others } = placesOnBoard(session.role, places);
  const tiles = (list: PlaceOnBoard[]) => (
    <ul className="place-grid">
      {list.map((place) => (
        <PlaceTile key={place.id} place={place} />
      ))}
    </ul>
  );
  return (
    <section className="board-section" aria-labelledby="where-equipment">
      <h2 id="where-equipment" className="display section-title">
        {t("board.whereTitle")}
      </h2>
      {tiles(main)}
      {others.length > 0 && (
        <details className="place-others">
          <summary className="panel-summary">{t("board.otherPlaces", { count: others.length })}</summary>
          {tiles(others)}
        </details>
      )}
    </section>
  );
}

/**
 * Tablica właściciela, kierownika i magazyniera: co zrobić teraz. Od góry: pierwsze kroki właściciela, pasek odbicia,
 * operacje (trzy na wierzchu i „Więcej operacji”), „Wymaga uwagi”, klikalne liczniki, kafle „Gdzie jest sprzęt”
 * i trzy ostatnie ruchy. Pełne listy, mapa, budowy i pojazdy, serwis i zaginione mają swoje strony.
 */
export default async function BoardPage(props: PageProps<"/">) {
  const session = await requireSession();
  const { nagranie, skanuj, operacja } = await props.searchParams;
  // Skanuj z nawigacji otwiera skaner, który sam rozpoznaje kod: plakat budowy to odbicie, naklejka to narzędzie.
  const readOnly = session.company.readOnly;
  const scan = skanuj !== undefined && !readOnly;
  // Operacja z odnośnika, np. „Dodaj narzędzie” z pustego ekranu: otwiera się w panelu operacji, o ile ją masz.
  const operation = readOnly ? null : parseBoardOperation(operacja);
  // Pracownik ma swoją tablicę: o sobie, a nie o całej firmie.
  if (session.role === "pracownik") return <WorkerBoard session={session} scan={scan} />;
  const registry = getRegistry().as(session.userId);
  const [board, movements, { toDo }, categories, tutorial, openPunch] = await Promise.all([
    registry.whereIsWhat(),
    registry.recentMovements({ limit: RECENT_ON_BOARD }),
    registry.inbox(),
    canManageTools(session) || canReportTools(session) || canRentTools(session) ? registry.categories() : null,
    registry.tutorial(),
    readOnly ? null : registry.ownOpenPunch(),
  ]);
  // Chwila pobrania stanu: tablica z kopii w telefonie pokazuje ją bez sieci (service worker czyta ją z atrybutu).
  const fetchedAt = new Date().toISOString();
  // Tablicy właściciela z wylogowaniem po bezczynności nie zostawiamy w telefonie (ADR 0044): po wylogowaniu jej wartości
  // w zł byłyby dostępne bez sesji.
  const keepCopy = session.idleLogoutMinutes === null;
  const checklist = checklistData(session, board);

  return (
    <>
      {/* Pierwsze kroki właściciela stoją na górze, dopóki ich nie pominie ani nie zrobi. Samouczek kierownika
          i magazyniera otwiera się tylko z Pomocy. */}
      {firstStepsOnBoard(tutorial) && (
        <TutorialCard tutorial={tutorial} entry={{ textEntry: textEntryEnabled(), voiceEntry: voiceEntryEnabled() }} />
      )}
      {/* Odbija się każdy z kontem, skanując plakat w Skanuj (albo aparatem telefonu), więc każdy widzi, gdzie jest odbity. */}
      {!readOnly && <PunchStatus open={openPunch} now={new Date(fetchedAt)} />}
      {(scan || operation) && <ForgetBoardParam />}
      <SitesAnchorRedirect />
      {/* Znak „bez kopii” tylko na tablicy bez kopii: inaczej nazwa atrybutu i tak trafiłaby do danych React w HTML. */}
      <div className="board" data-fetched-at={fetchedAt} {...(keepCopy ? {} : { "data-no-copy": "" })}>
        <div className="board-head">
          <BoardSnapshot fetchedAt={fetchedAt} keepCopy={keepCopy} />
          <h1 className="display page-title">{t("nav.board")}</h1>
        </div>
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
            requestedOperation={operation}
            punchesOthers={canPunchOthers(session)}
            reportTool={
              categories &&
              canReportTools(session) && {
                categories,
                sites: board.sites.filter((site) => site.manager.id === session.userId).map((site) => ({ id: site.id, name: site.name })),
                operationId: randomUUID(),
                noSites: addSiteStep(session),
                noCategories: addCategoryStep(session),
              }
            }
            rentedTool={
              categories &&
              canRentTools(session) && {
                categories,
                places: rentalPlaces(session, board),
                showValue: canSeeValues(session),
                operationId: randomUUID(),
                noCategories: addCategoryStep(session),
              }
            }
          />
          <RecentMovements movements={movements} />
        </aside>

        <div className="board-main">
          <NeedsAttention items={toDo} />
          <Counters counters={boardCounters(board)} />
          <WhereEquipment session={session} places={board.places} />
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
