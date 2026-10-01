import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { cache } from "react";
import { SiteManagerLabel } from "@/components/site-manager-label";
import { ToolList } from "@/components/tool-list";
import { VehicleIcon } from "@/components/vehicle-icon";
import { formatCalendarDay, formatDay } from "@/i18n/dates";
import { formatDays } from "@/i18n/days";
import { formatMoney } from "@/i18n/money";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { type CostPeriodChoice, costPeriodSearch, monthPeriod, parseCostPeriod, shiftMonth } from "@/lib/cost-period";
import { historySearch } from "@/lib/history-filters";
import { getRegistry } from "@/lib/registry-instance";
import { canSeeCosts, type LocationCosts, type Session, type Site, type ToolCost } from "@/registry/registry";
import { DailyRatesForm } from "../ustawienia/daily-rates-form";

/** Budowa albo pojazd: lokalizacje z własną stroną i zakładką „Koszty”. */
export type SiteOrVehicleKind = "budowa" | "pojazd";

interface SiteOrVehicle {
  id: string;
  kind: SiteOrVehicleKind;
  name: string;
  address: string | null;
  manager: Site["manager"];
  /** Aktywna budowa albo aktywny pojazd: jest na tablicy i przyjmuje sprzęt. */
  open: boolean;
}

type SearchParams = Record<string, string | string[] | undefined>;

/** Adres strony budowy albo pojazdu, np. /budowy/…/koszty. */
export function locationPagePath(kind: SiteOrVehicleKind, id: string, tab: "" | "/koszty" | "/koszty/eksport" = "") {
  return `${kind === "budowa" ? "/budowy" : "/pojazdy"}/${id}${tab}`;
}

/** Budowa (także zakończona) albo pojazd (także nieaktywny) raz na żądanie; null, gdy nie ma takiej lokalizacji. */
export const loadSiteOrVehicle = cache(async (id: string, kind: SiteOrVehicleKind): Promise<{ session: Session; location: SiteOrVehicle | null }> => {
  const session = await requireSession();
  const { sites, vehicles } = await getRegistry().as(session.userId).locations();
  const site = kind === "budowa" ? sites.find((candidate) => candidate.id === id) : undefined;
  const vehicle = kind === "pojazd" ? vehicles.find((candidate) => candidate.id === id) : undefined;
  const location: SiteOrVehicle | null = site
    ? { id, kind, name: site.name, address: site.address, manager: site.manager, open: site.status === "aktywna" }
    : vehicle
      ? { id, kind, name: vehicle.name, address: null, manager: vehicle.manager, open: vehicle.active }
      : null;
  return { session, location };
});

export async function siteOrVehicleTitle(id: string, kind: SiteOrVehicleKind) {
  return (await loadSiteOrVehicle(id, kind)).location?.name;
}

/** Nagłówek strony budowy albo pojazdu z zakładkami; „Koszty” tylko dla tego, kto widzi koszty. */
function LocationShell({ session, location, tab, children }: { session: Session; location: SiteOrVehicle; tab: "sprzet" | "koszty"; children: ReactNode }) {
  const tabs = [
    { id: "sprzet", href: locationPagePath(location.kind, location.id), label: t("locationPage.equipmentTab") },
    ...(canSeeCosts(session) ? [{ id: "koszty", href: locationPagePath(location.kind, location.id, "/koszty"), label: t("costs.tab") }] : []),
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
          {location.kind === "pojazd" && <VehicleIcon />} {location.kind === "budowa" ? t("locationPage.siteKind") : t("locationPage.vehicleKind")}
        </span>{" "}
        {location.name}
      </h1>
      <div className="location-details site-page-details">
        {location.address && <p className="muted">{location.address}</p>}
        <p>
          <SiteManagerLabel manager={location.manager} />
        </p>
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
export async function EquipmentPage({ id, kind }: { id: string; kind: SiteOrVehicleKind }) {
  const { session, location } = await loadSiteOrVehicle(id, kind);
  if (!location) notFound();
  const board = await getRegistry().as(session.userId).whereIsWhat();
  const onBoard = (kind === "budowa" ? board.sites : board.vehicles).find((candidate) => candidate.id === id);
  const tools = onBoard?.tools ?? [];

  return (
    <LocationShell session={session} location={location} tab="sprzet">
      <section className="board-section" aria-label={t("locationPage.equipmentTab")}>
        {tools.length === 0 ? (
          <p className="empty">{kind === "budowa" ? t("locationPage.siteEmpty") : t("locationPage.vehicleEmpty")}</p>
        ) : (
          <ToolList tools={tools} wide />
        )}
        <p>
          <Link href={`/historia${historySearch({ locationId: id })}`}>{t("locationPage.history")}</Link>
        </p>
      </section>
    </LocationShell>
  );
}

/** Zakładka „Koszty”: koszt sprzętu w wybranym okresie z eksportem do Excela. Tylko dla tego, kto widzi koszty. */
export async function CostsPage({ id, kind, searchParams }: { id: string; kind: SiteOrVehicleKind; searchParams: SearchParams }) {
  const { session, location } = await loadSiteOrVehicle(id, kind);
  if (!location) notFound();
  if (!canSeeCosts(session)) redirect(locationPagePath(kind, id));
  const registry = getRegistry().as(session.userId);
  const choice = parseCostPeriod(searchParams);
  const costs = await registry.locationCosts(id, choice.mode === "cala" ? undefined : choice.period);

  return (
    <LocationShell session={session} location={location} tab="koszty">
      {costs.status === "brak_stawki" ? (
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
        <SiteOrVehicleCosts location={location} costs={costs} choice={choice} />
      )}
    </LocationShell>
  );
}

function SiteOrVehicleCosts({ location, costs, choice }: { location: SiteOrVehicle; costs: Extract<LocationCosts, { status: "koszty" }>; choice: CostPeriodChoice }) {
  const thisMonth = formatDay(new Date()).slice(0, 7);
  const lastMonth = shiftMonth(thisMonth, -1);
  const costsPath = locationPagePath(location.kind, location.id, "/koszty");
  const periods: { id: string; label: string; choice: CostPeriodChoice }[] = [
    { id: "cala", label: location.kind === "budowa" ? t("costs.whole") : t("costs.wholeVehicle"), choice: { mode: "cala" } },
    { id: thisMonth, label: t("costs.thisMonth"), choice: { mode: "miesiac", month: thisMonth, period: monthPeriod(thisMonth) } },
    { id: lastMonth, label: t("costs.lastMonth"), choice: { mode: "miesiac", month: lastMonth, period: monthPeriod(lastMonth) } },
  ];
  const activePeriod = choice.mode === "cala" ? "cala" : choice.mode === "miesiac" ? choice.month : null;
  const search = costPeriodSearch(choice);

  return (
    <>
      <section className="company-card cost-periods" aria-labelledby="cost-period">
        <h2 id="cost-period" className="display section-title">
          {t("costs.periodTitle")}
        </h2>
        <nav className="site-page-tabs" aria-label={t("costs.periodTitle")}>
          {periods.map((period) => (
            <Link
              key={period.id}
              href={`${costsPath}${costPeriodSearch(period.choice)}`}
              className="site-page-tab"
              aria-current={period.id === activePeriod ? "page" : undefined}
            >
              {period.label}
            </Link>
          ))}
        </nav>
        <div className="cost-period-forms">
          <form method="get" action={costsPath} className="cost-period-form" aria-label={t("costs.month")}>
            <div className="field">
              <label htmlFor="cost-month">{t("costs.month")}</label>
              <input id="cost-month" type="month" name="miesiac" defaultValue={choice.mode === "miesiac" ? choice.month : thisMonth} required />
            </div>
            <button className="button button-quiet" type="submit">
              {t("costs.showMonth")}
            </button>
          </form>
          <form method="get" action={costsPath} className="cost-period-form" aria-label={t("costs.range")}>
            <div className="field">
              <label htmlFor="cost-from">{t("costs.from")}</label>
              <input id="cost-from" type="date" name="od" defaultValue={choice.mode === "zakres" ? choice.period.from : ""} required />
            </div>
            <div className="field">
              <label htmlFor="cost-to">{t("costs.to")}</label>
              <input id="cost-to" type="date" name="do" defaultValue={choice.mode === "zakres" ? choice.period.to : ""} required />
            </div>
            <button className="button button-quiet" type="submit">
              {t("costs.showRange")}
            </button>
          </form>
        </div>
      </section>

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
        {costs.tools.some((row) => row.daysWithoutRate > 0) && <p className="muted">{t("costs.noRateHint")}</p>}
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
