import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { cache } from "react";
import { SiteManagerLabel } from "@/components/site-manager-label";
import { ToolList } from "@/components/tool-list";
import { VehicleIcon } from "@/components/vehicle-icon";
import { formatCalendarDay } from "@/i18n/dates";
import { formatDays } from "@/i18n/days";
import { formatMoney } from "@/i18n/money";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { type CostPeriodChoice, costPeriodSearch, parseCostPeriod } from "@/lib/cost-period";
import { historySearch } from "@/lib/history-filters";
import { getRegistry } from "@/lib/registry-instance";
import { canManageRates, canSeeCostsOf, type LocationCosts, type Session, type Site, type ToolCost } from "@/registry/registry";
import { DailyRatesForm } from "../ustawienia/daily-rates-form";
import { CostPeriodPicker } from "./cost-period-picker";

/** Budowa albo pojazd: lokalizacje z zakładką „Koszty”. */
export type SiteOrVehicleKind = "budowa" | "pojazd";
/** Lokalizacje z własną stroną: budowa, pojazd i baza. Budowa i baza mają też zakładkę „Ludzie”. */
export type PlacePageKind = SiteOrVehicleKind | "baza";

export interface PlacePage {
  id: string;
  kind: PlacePageKind;
  name: string;
  address: string | null;
  /** Kierownik budowy albo pojazdu; baza go nie ma. */
  manager: Site["manager"] | null;
  /** Aktywna budowa albo aktywny pojazd (baza zawsze): jest na tablicy i przyjmuje sprzęt. */
  open: boolean;
}

type SearchParams = Record<string, string | string[] | undefined>;

export type PlacePageTab = "" | "/koszty" | "/koszty/eksport" | "/ludzie";

/** Adres strony budowy, pojazdu albo bazy, np. /budowy/…/koszty albo /baza/ludzie. */
export function locationPagePath(kind: PlacePageKind, id: string, tab: PlacePageTab = "") {
  if (kind === "baza") return `/baza${tab}`;
  return `${kind === "budowa" ? "/budowy" : "/pojazdy"}/${id}${tab}`;
}

/**
 * Budowa (także zakończona), pojazd (także nieaktywny) albo baza (bez `id`) raz na żądanie; null, gdy nie ma takiej
 * lokalizacji.
 */
export const loadPlacePage = cache(async (id: string | null, kind: PlacePageKind): Promise<{ session: Session; location: PlacePage | null }> => {
  const session = await requireSession();
  const { base, sites, vehicles } = await getRegistry().as(session.userId).locations();
  if (kind === "baza") {
    return { session, location: { id: base.id, kind, name: base.name, address: base.address, manager: null, open: true } };
  }
  const site = kind === "budowa" ? sites.find((candidate) => candidate.id === id) : undefined;
  const vehicle = kind === "pojazd" ? vehicles.find((candidate) => candidate.id === id) : undefined;
  const location: PlacePage | null = site
    ? { id: site.id, kind, name: site.name, address: site.address, manager: site.manager, open: site.status === "aktywna" }
    : vehicle
      ? { id: vehicle.id, kind, name: vehicle.name, address: null, manager: vehicle.manager, open: vehicle.active }
      : null;
  return { session, location };
});

export async function siteOrVehicleTitle(id: string, kind: SiteOrVehicleKind) {
  return (await loadPlacePage(id, kind)).location?.name;
}

/** Czy aktor widzi koszty tej budowy albo pojazdu: właściciel, a kierownik swojej, gdy właściciel na to pozwolił. */
function seesCostsOf(session: Session, location: PlacePage) {
  return location.kind !== "baza" && location.manager !== null && canSeeCostsOf(session, { managerId: location.manager.id });
}

const KIND_LABELS = { budowa: "locationPage.siteKind", pojazd: "locationPage.vehicleKind", baza: "locationPage.baseKind" } as const;

/**
 * Nagłówek strony budowy, pojazdu albo bazy z zakładkami: „Koszty” tylko dla tego, kto widzi koszty tej lokalizacji,
 * „Ludzie na budowie” przy budowie i bazie (każdy widzi tam to, co mu wolno).
 */
export function LocationShell({
  session,
  location,
  tab,
  children,
}: {
  session: Session;
  location: PlacePage;
  tab: "sprzet" | "koszty" | "ludzie";
  children: ReactNode;
}) {
  const tabs = [
    { id: "sprzet", href: locationPagePath(location.kind, location.id), label: t("locationPage.equipmentTab") },
    ...(seesCostsOf(session, location) ? [{ id: "koszty", href: locationPagePath(location.kind, location.id, "/koszty"), label: t("costs.tab") }] : []),
    ...(location.kind !== "pojazd"
      ? [
          {
            id: "ludzie",
            href: locationPagePath(location.kind, location.id, "/ludzie"),
            label: location.kind === "baza" ? t("punches.tabBase") : t("punches.tab"),
          },
        ]
      : []),
  ];
  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("locationPage.back")}
        </Link>
      </p>
      <h1 className="display page-title">
        <span className="location-kind">
          {location.kind === "pojazd" && <VehicleIcon />} {t(KIND_LABELS[location.kind])}
        </span>{" "}
        {location.name}
      </h1>
      <div className="location-details site-page-details">
        {location.address && <p className="muted">{location.address}</p>}
        {location.manager && (
          <p>
            <SiteManagerLabel manager={location.manager} />
          </p>
        )}
        {!location.open && <p className="tag">{location.kind === "budowa" ? t("locationPage.finished") : t("locationPage.inactive")}</p>}
      </div>
      {tabs.length > 1 && (
        <nav className="site-page-tabs" aria-label={t("locationPage.tabs")}>
          {tabs.map((item) => (
            <Link key={item.id} href={item.href} className="site-page-tab" aria-current={item.id === tab ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
      )}
      {children}
    </>
  );
}

/** Zakładka „Sprzęt”: narzędzia, które są tu teraz (jak na tablicy), i odnośnik do historii ruchów lokalizacji. */
export async function EquipmentPage({ id, kind }: { id: string | null; kind: PlacePageKind }) {
  const { session, location } = await loadPlacePage(id, kind);
  if (!location) notFound();
  const board = await getRegistry().as(session.userId).whereIsWhat();
  const onBoard = kind === "baza" ? board.base : (kind === "budowa" ? board.sites : board.vehicles).find((candidate) => candidate.id === id);
  const tools = onBoard?.tools ?? [];
  const empty = { budowa: "locationPage.siteEmpty", pojazd: "locationPage.vehicleEmpty", baza: "locationPage.baseEmpty" } as const;

  return (
    <LocationShell session={session} location={location} tab="sprzet">
      <section className="board-section" aria-label={t("locationPage.equipmentTab")}>
        {tools.length === 0 ? (
          <p className="empty">{t(empty[kind])}</p>
        ) : (
          <ToolList tools={tools} wide atBase={kind === "baza"} />
        )}
        <p>
          <Link href={`/historia${historySearch({ locationId: location.id })}`}>{t("locationPage.history")}</Link>
        </p>
      </section>
    </LocationShell>
  );
}

/** Zakładka „Koszty”: koszt sprzętu w wybranym okresie z eksportem do Excela. Tylko dla tego, kto widzi koszty tej lokalizacji. */
export async function CostsPage({ id, kind, searchParams }: { id: string; kind: SiteOrVehicleKind; searchParams: SearchParams }) {
  const { session, location } = await loadPlacePage(id, kind);
  if (!location) notFound();
  if (!seesCostsOf(session, location)) redirect(locationPagePath(kind, id));
  const registry = getRegistry().as(session.userId);
  const choice = parseCostPeriod(searchParams);
  const costs = await registry.locationCosts(id, choice.mode === "cala" ? undefined : choice.period);

  return (
    <LocationShell session={session} location={location} tab="koszty">
      {costs.status === "brak_stawki" && !canManageRates(session) ? (
        <p className="empty">{t("costs.startManager")}</p>
      ) : costs.status === "brak_stawki" ? (
        <section className="company-card cost-start" aria-labelledby="cost-start">
          <h2 id="cost-start" className="display section-title">
            {t("costs.startTitle")}
          </h2>
          <p>{t("costs.startHint")}</p>
          <DailyRatesForm rates={await registry.dailyRates()} categories={[]} />
          <p>
            <Link href="/ustawienia#stawki">{t("costs.startSettings")}</Link>
          </p>
        </section>
      ) : (
        <SiteOrVehicleCosts location={{ ...location, kind }} costs={costs} choice={choice} owner={canManageRates(session)} />
      )}
    </LocationShell>
  );
}

function SiteOrVehicleCosts({
  location,
  costs,
  choice,
  owner,
}: {
  location: PlacePage & { kind: SiteOrVehicleKind };
  costs: Extract<LocationCosts, { status: "koszty" }>;
  choice: CostPeriodChoice;
  /** Właściciel sam dopisuje wartość albo kwotę narzędzia; kierownikowi mówimy, że robi to właściciel. */
  owner: boolean;
}) {
  const search = costPeriodSearch(choice);

  return (
    <>
      <CostPeriodPicker
        path={locationPagePath(location.kind, location.id, "/koszty")}
        choice={choice}
        wholeLabel={location.kind === "budowa" ? t("costs.whole") : t("costs.wholeVehicle")}
      />

      <section className="board-section" aria-labelledby="cost-total">
        <div className="page-head">
          <div className="cost-total">
            <h2 id="cost-total" className="muted cost-total-label">
              {t("costs.totalLabel")}
            </h2>
            <p className="display cost-total-amount" data-testid="cost-total">
              {formatMoney(costs.total)}
            </p>
            {costs.period && (
              <p className="muted">
                {t("costs.summary", {
                  from: formatCalendarDay(costs.period.from),
                  to: formatCalendarDay(costs.period.to),
                  tools: t("board.toolCount", { count: costs.tools.length }),
                })}
              </p>
            )}
          </div>
          {costs.tools.length > 0 && (
            <div className="export-link">
              {/* Zwykły odnośnik: plik ma się pobrać, a nie otworzyć jako strona. */}
              <a className="button" href={`${locationPagePath(location.kind, location.id, "/koszty/eksport")}${search}`} download>
                {t("costs.export")}
              </a>
              <small className="muted">{t("costs.exportHint")}</small>
            </div>
          )}
        </div>
        {costs.tools.length === 0 ? (
          <p className="empty">{choice.mode === "cala" ? t("costs.emptyWhole") : t("costs.empty")}</p>
        ) : (
          <ul className="tool-list tool-list-wide" aria-label={t("costs.title")}>
            {costs.tools.map((row) => (
              <li key={row.tool.id}>
                <Link href={`/narzedzia/${row.tool.id}`} className="tool-row">
                  <span className="plate">{row.tool.code}</span>
                  <span className="tool-row-name">
                    {row.tool.name}
                    <small className="muted cost-rates">{ratesText(row)}</small>
                  </span>
                  <span className="tool-row-meta">
                    <span className="tool-row-days">{formatDays(row.days)}</span>
                    <span className="tool-row-value">{formatMoney(row.amount)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {costs.tools.some((row) => row.daysWithoutRate > 0) && <p className="muted">{owner ? t("costs.noRateHint") : t("costs.noRateHintManager")}</p>}
        <p className="muted">{t("costs.rule")}</p>
      </section>
    </>
  );
}

/** „9 dni × 20,00 zł + 3 dni × 40,00 zł”, z dniami bez stawki na końcu. */
function ratesText(row: ToolCost) {
  return [
    ...row.rates.map((rate) => t("costs.rateTimesDays", { days: formatDays(rate.days), rate: formatMoney(rate.amount) })),
    ...(row.daysWithoutRate > 0 ? [t("costs.daysWithoutRate", { days: formatDays(row.daysWithoutRate) })] : []),
  ].join(" + ");
}
