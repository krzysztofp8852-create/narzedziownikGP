import Link from "next/link";
import { t } from "@/i18n/t";
import { type CostPeriodChoice, costPeriodSearch, currentMonth, monthPeriod, shiftMonth } from "@/lib/cost-period";

/**
 * Wybór okresu kosztów na stronie `path`: skróty (z `wholeLabel` także cała budowa), ten i poprzedni miesiąc,
 * dowolny miesiąc i własny zakres.
 */
export function CostPeriodPicker({ path, choice, wholeLabel }: { path: string; choice: CostPeriodChoice; wholeLabel?: string }) {
  const thisMonth = currentMonth();
  const lastMonth = shiftMonth(thisMonth, -1);
  const periods: { id: string; label: string; choice: CostPeriodChoice }[] = [
    ...(wholeLabel ? [{ id: "cala", label: wholeLabel, choice: { mode: "cala" } as const }] : []),
    { id: thisMonth, label: t("costs.thisMonth"), choice: { mode: "miesiac", month: thisMonth, period: monthPeriod(thisMonth) } },
    { id: lastMonth, label: t("costs.lastMonth"), choice: { mode: "miesiac", month: lastMonth, period: monthPeriod(lastMonth) } },
  ];
  const activePeriod = choice.mode === "cala" ? "cala" : choice.mode === "miesiac" ? choice.month : null;

  return (
    <section className="company-card cost-periods" aria-labelledby="cost-period">
      <h2 id="cost-period" className="display section-title">
        {t("costs.periodTitle")}
      </h2>
      <nav className="site-page-tabs" aria-label={t("costs.periodTitle")}>
        {periods.map((period) => (
          <Link
            key={period.id}
            href={`${path}${costPeriodSearch(period.choice)}`}
            className="site-page-tab"
            aria-current={period.id === activePeriod ? "page" : undefined}
          >
            {period.label}
          </Link>
        ))}
      </nav>
      <div className="cost-period-forms">
        <form method="get" action={path} className="cost-period-form" aria-label={t("costs.month")}>
          <div className="field">
            <label htmlFor="cost-month">{t("costs.month")}</label>
            <input id="cost-month" type="month" name="miesiac" defaultValue={choice.mode === "miesiac" ? choice.month : thisMonth} required />
          </div>
          <button className="button button-quiet" type="submit">
            {t("costs.showMonth")}
          </button>
        </form>
        <form method="get" action={path} className="cost-period-form" aria-label={t("costs.range")}>
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
  );
}
