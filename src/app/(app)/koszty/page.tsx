import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatCalendarDay } from "@/i18n/dates";
import { formatMoney } from "@/i18n/money";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { costPeriodSearch, parseSummaryPeriod } from "@/lib/cost-period";
import { getRegistry } from "@/lib/registry-instance";
import { canManageRates, canSeeCosts, type CostedKind, type CostSummary } from "@/registry/registry";
import { CostPeriodPicker } from "../lokalizacje/cost-period-picker";
import { locationPagePath } from "../lokalizacje/location-page";

export const metadata: Metadata = { title: t("costSummary.title") };

/**
 * Zestawienie kosztów sprzętu: każda budowa i pojazd z kwotą za wybrany okres (bez okresu: ten miesiąc), z eksportem
 * do Excela. Właściciel widzi całą firmę, kierownik swoje lokalizacje, gdy właściciel mu na to pozwolił.
 */
export default async function CostSummaryPage(props: PageProps<"/koszty">) {
  const session = await requireSession();
  if (!canSeeCosts(session)) redirect("/");
  const choice = parseSummaryPeriod(await props.searchParams);
  const summary = await getRegistry().as(session.userId).costSummary(choice.period);
  const owner = canManageRates(session);

  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("costSummary.back")}
        </Link>
      </p>
      <h1 className="display page-title">{t("costSummary.title")}</h1>
      <p className="muted">{owner ? t("costSummary.intro") : t("costSummary.introManager")}</p>
      {summary.status === "brak_stawki" ? (
        owner ? (
          <section className="company-card cost-start" aria-labelledby="cost-start">
            <h2 id="cost-start" className="display section-title">
              {t("costs.startTitle")}
            </h2>
            <p>{t("costs.startHint")}</p>
            <p>
              <Link className="button" href="/ustawienia#stawki">
                {t("costSummary.startSettings")}
              </Link>
            </p>
          </section>
        ) : (
          <p className="empty">{t("costs.startManager")}</p>
        )
      ) : (
        <>
          <CostPeriodPicker path="/koszty" choice={choice} />
          <Summary summary={summary} search={costPeriodSearch(choice)} />
        </>
      )}
    </>
  );
}

function Summary({ summary, search }: { summary: Extract<CostSummary, { status: "koszty" }>; search: string }) {
  const groups: { kind: CostedKind; label: string }[] = [
    { kind: "budowa", label: t("costSummary.sites") },
    { kind: "pojazd", label: t("costSummary.vehicles") },
  ];
  return (
    <section className="board-section" aria-labelledby="cost-total">
      <div className="page-head">
        <div className="cost-total">
          <h2 id="cost-total" className="muted cost-total-label">
            {t("costs.totalLabel")}
          </h2>
          <p className="display cost-total-amount" data-testid="cost-total">
            {formatMoney(summary.total)}
          </p>
          <p className="muted">{t("costs.period", { from: formatCalendarDay(summary.period.from), to: formatCalendarDay(summary.period.to) })}</p>
        </div>
        {summary.locations.length > 0 && (
          <div className="export-link">
            {/* Zwykły odnośnik: plik ma się pobrać, a nie otworzyć jako strona. */}
            <a className="button" href={`/koszty/eksport${search}`} download>
              {t("costs.export")}
            </a>
            <small className="muted">{t("costSummary.exportHint")}</small>
          </div>
        )}
      </div>
      {summary.locations.length === 0 && <p className="empty">{t("costSummary.empty")}</p>}
      {groups.map(({ kind, label }) => {
        const rows = summary.locations.filter((row) => row.location.kind === kind);
        return (
          rows.length > 0 && (
            <div key={kind} className="cost-summary-group">
              <h3 className="section-title">{label}</h3>
              <ul className="tool-list tool-list-wide" aria-label={label}>
                {rows.map((row) => (
                  <li key={row.location.id}>
                    <Link href={`${locationPagePath(kind, row.location.id, "/koszty")}${search}`} className="tool-row cost-summary-row">
                      <span className="tool-row-name">
                        {row.location.name}
                        {!row.location.open && (
                          <span className="tag">{kind === "budowa" ? t("locationPage.finished") : t("locationPage.inactive")}</span>
                        )}
                      </span>
                      <span className="tool-row-meta">
                        <span className="tool-row-days">{t("board.toolCount", { count: row.toolCount })}</span>
                        <span className="tool-row-value">{formatMoney(row.amount)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )
        );
      })}
      <p className="muted">{t("costs.rule")}</p>
    </section>
  );
}
