import type { Metadata } from "next";
import Link from "next/link";
import { formatMonth } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { COST_PARAMS, currentMonth, parseMonth, shiftMonth } from "@/lib/cost-period";
import { durationText } from "@/lib/punch-text";
import { getRegistry } from "@/lib/registry-instance";
import { canSeeTimeOnSiteSummary, type OwnTimeOnSite, type TimeOnSiteSummary } from "@/registry/registry";
import { PunchEntry } from "../lokalizacje/people-on-site";

export const metadata: Metadata = { title: t("timeOnSite.title") };

const monthSearch = (month: string) => `?${new URLSearchParams({ [COST_PARAMS.month]: month })}`;

/**
 * Czas na budowie z odbić. Właściciel i kierownik: zestawienie miesięczne osoba × budowa z sumami i eksportem do
 * Excela (właściciel cała firma, kierownik jego budowy). Pracownik i magazynier: własne odbicia i sumy w tym
 * i poprzednim miesiącu.
 */
export default async function TimeOnSitePage(props: PageProps<"/czas">) {
  const session = await requireSession();
  const registry = getRegistry().as(session.userId);
  const summaryViewer = canSeeTimeOnSiteSummary(session);
  const month = parseMonth(await props.searchParams);

  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("timeOnSite.back")}
        </Link>
      </p>
      <h1 className="display page-title">{t("timeOnSite.title")}</h1>
      {summaryViewer ? (
        <>
          <p className="muted">{session.role === "wlasciciel" ? t("timeOnSite.intro") : t("timeOnSite.introManager")}</p>
          <MonthPicker month={month} />
          <Summary summary={await registry.timeOnSiteSummary(month)} />
        </>
      ) : (
        <>
          <p className="muted">{t("timeOnSite.introOwn")}</p>
          {(await registry.ownTimeOnSite()).map((own) => (
            <OwnMonth key={own.month} own={own} />
          ))}
        </>
      )}
      <p className="muted">{t("timeOnSite.rule")}</p>
    </>
  );
}

/** Skróty do tego i poprzedniego miesiąca i wybór dowolnego. */
function MonthPicker({ month }: { month: string }) {
  const thisMonth = currentMonth();
  const shortcuts = [
    { month: thisMonth, label: t("costs.thisMonth") },
    { month: shiftMonth(thisMonth, -1), label: t("costs.lastMonth") },
  ];
  return (
    <section className="company-card cost-periods" aria-labelledby="time-month">
      <h2 id="time-month" className="display section-title">
        {t("timeOnSite.monthTitle")}
      </h2>
      <nav className="site-page-tabs" aria-label={t("timeOnSite.monthTitle")}>
        {shortcuts.map((shortcut) => (
          <Link
            key={shortcut.month}
            href={`/czas${monthSearch(shortcut.month)}`}
            className="site-page-tab"
            aria-current={shortcut.month === month ? "page" : undefined}
          >
            {shortcut.label}
          </Link>
        ))}
      </nav>
      <form method="get" action="/czas" className="cost-period-form" aria-label={t("timeOnSite.monthTitle")}>
        <div className="field">
          <label htmlFor="time-month-input">{t("timeOnSite.monthTitle")}</label>
          <input id="time-month-input" type="month" name={COST_PARAMS.month} defaultValue={month} required />
        </div>
        <button className="button button-quiet" type="submit">
          {t("timeOnSite.showMonth")}
        </button>
      </form>
    </section>
  );
}

/** Suma miesiąca, odnośnik do pliku i tabela: osoby w wierszach, budowy i baza w kolumnach, sumy na końcu. */
function Summary({ summary }: { summary: TimeOnSiteSummary }) {
  const title = t("timeOnSite.sheetTitle", { month: formatMonth(summary.month) });
  return (
    <section className="board-section" aria-labelledby="time-total">
      <div className="page-head">
        <div className="cost-total">
          <h2 id="time-total" className="muted cost-total-label">
            {t("timeOnSite.totalLabel")}
          </h2>
          <p className="display cost-total-amount" data-testid="time-on-site-total">
            {durationText(summary.timeMs)}
          </p>
          <p className="muted">{formatMonth(summary.month)}</p>
        </div>
        {summary.people.length > 0 && (
          <div className="export-link">
            {/* Zwykły odnośnik: plik ma się pobrać, a nie otworzyć jako strona. */}
            <a className="button" href={`/czas/eksport${monthSearch(summary.month)}`} download>
              {t("costs.export")}
            </a>
            <small className="muted">{t("timeOnSite.exportHint")}</small>
          </div>
        )}
      </div>
      {summary.people.length === 0 ? (
        <p className="empty">{t("timeOnSite.empty")}</p>
      ) : (
        <div className="import-table-wrap">
          <table className="import-table time-table" aria-label={title}>
            <thead>
              <tr>
                <th scope="col">{t("timeOnSite.person")}</th>
                {summary.places.map((entry) => (
                  <th key={entry.place.id} scope="col" className="import-number">
                    {entry.place.name}
                  </th>
                ))}
                <th scope="col" className="import-number">
                  {t("timeOnSite.total")}
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.people.map((row) => (
                <tr key={row.person.id}>
                  <th scope="row">
                    {row.person.fullName}
                    {row.withoutExit > 0 && (
                      <small className="muted time-without-exit">{t("timeOnSite.withoutExitNote", { count: row.withoutExit })}</small>
                    )}
                  </th>
                  {row.byPlace.map((timeMs, index) => (
                    <td key={summary.places[index].place.id} className="import-number">
                      {timeMs > 0 ? durationText(timeMs) : "–"}
                    </td>
                  ))}
                  <td className="import-number">
                    <strong>{durationText(row.timeMs)}</strong>
                  </td>
                </tr>
              ))}
              <tr>
                <th scope="row">{t("timeOnSite.total")}</th>
                {summary.places.map((entry) => (
                  <td key={entry.place.id} className="import-number">
                    <strong>{durationText(entry.timeMs)}</strong>
                  </td>
                ))}
                <td className="import-number">
                  <strong>{durationText(summary.timeMs)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Własny miesiąc: suma, czas na każdym miejscu i odbicia, od najnowszego. */
function OwnMonth({ own }: { own: OwnTimeOnSite }) {
  const id = `time-${own.month}`;
  return (
    <section className="board-section" aria-labelledby={id}>
      <h2 id={id} className="display section-title">
        {t("timeOnSite.sheetTitle", { month: formatMonth(own.month) })}
      </h2>
      <p className="display cost-total-amount" data-testid="time-on-site-total">
        {durationText(own.timeMs)}
      </p>
      {own.places.length > 0 && (
        <ul className="tool-list" aria-label={t("timeOnSite.title")}>
          {own.places.map((entry) => (
            <li key={entry.place.id} className="tool-row">
              <span className="tool-row-name">{entry.place.name}</span>
              <span className="tool-row-meta">{durationText(entry.timeMs)}</span>
            </li>
          ))}
        </ul>
      )}
      {own.withoutExit > 0 && <p className="muted">{t("timeOnSite.withoutExitNote", { count: own.withoutExit })}</p>}
      {own.punches.length === 0 ? (
        <p className="empty">{t("timeOnSite.emptyOwn")}</p>
      ) : (
        <ol className="movements" aria-label={t("timeOnSite.punches")}>
          {own.punches.map((punch) => (
            <PunchEntry key={punch.id} punch={punch} showPlace />
          ))}
        </ol>
      )}
    </section>
  );
}
