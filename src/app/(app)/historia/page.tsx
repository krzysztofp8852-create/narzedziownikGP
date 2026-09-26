import type { Metadata } from "next";
import Link from "next/link";
import { MovementEntry } from "@/components/movement-entry";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { HISTORY_PARAMS, historySearch, parseHistoryFilters } from "@/lib/history-filters";

export const metadata: Metadata = { title: t("history.title") };

/** Tyle najnowszych ruchów pokazuje strona; eksport zawiera wszystkie pasujące. */
const HISTORY_LIMIT = 200;

/** Historia ruchów firmy z filtrami w adresie strony, żeby dało się ją odświeżyć, wysłać i wyeksportować. */
export default async function HistoryPage(props: PageProps<"/historia">) {
  const session = await requireSession();
  const filters = parseHistoryFilters(await props.searchParams);
  const registry = getRegistry().as(session.userId);
  const [options, { movements, hasMore }] = await Promise.all([
    registry.historyFilterOptions(),
    registry.movementHistory(filters, { limit: HISTORY_LIMIT }),
  ]);
  const search = historySearch(filters);

  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("history.back")}
        </Link>
      </p>
      <div className="page-head">
        <h1 className="display page-title">{t("history.title")}</h1>
        <div className="export-link">
          {/* Zwykły odnośnik: plik ma się pobrać, a nie otworzyć jako strona. */}
          <a className="button" href={`/historia/eksport${search}`} download>
            {t("history.export")}
          </a>
          <small className="muted">{t("history.exportHint")}</small>
        </div>
      </div>

      <form className="company-card history-filters" method="get" action="/historia" aria-label={t("history.filters")}>
        <div className="filter-grid">
          <div className="field">
            <label htmlFor="filter-location">{t("history.location")}</label>
            <select id="filter-location" name={HISTORY_PARAMS.locationId} defaultValue={filters.locationId ?? ""}>
              <option value="">{t("history.any")}</option>
              <optgroup label={t("corrections.baseGroup")}>
                <option value={options.base.id}>{options.base.name}</option>
              </optgroup>
              {options.sites.length > 0 && (
                <optgroup label={t("corrections.sitesGroup")}>
                  {options.sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.status === "aktywna" ? site.name : t("history.finishedSite", { name: site.name })}
                    </option>
                  ))}
                </optgroup>
              )}
              {options.services.length > 0 && (
                <optgroup label={t("corrections.servicesGroup")}>
                  {options.services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div className="field">
            <label htmlFor="filter-person">{t("history.person")}</label>
            <select id="filter-person" name={HISTORY_PARAMS.personId} defaultValue={filters.personId ?? ""}>
              <option value="">{t("history.any")}</option>
              {options.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.active ? person.fullName : t("history.inactivePerson", { name: person.fullName })}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="filter-tool">{t("history.tool")}</label>
            <select id="filter-tool" name={HISTORY_PARAMS.toolId} defaultValue={filters.toolId ?? ""}>
              <option value="">{t("history.any")}</option>
              {options.tools.map((tool) => (
                <option key={tool.id} value={tool.id}>
                  {t("checklist.toolLabel", { code: tool.code, name: tool.name })}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="filter-from">{t("history.from")}</label>
            <input id="filter-from" type="date" name={HISTORY_PARAMS.from} defaultValue={filters.from ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="filter-to">{t("history.to")}</label>
            <input id="filter-to" type="date" name={HISTORY_PARAMS.to} defaultValue={filters.to ?? ""} />
          </div>
        </div>
        <div className="form-actions">
          <button className="button" type="submit">
            {t("history.submit")}
          </button>
          {search && (
            <Link className="button button-quiet" href="/historia">
              {t("history.clear")}
            </Link>
          )}
        </div>
      </form>

      <section className="recent history-results" aria-label={t("history.title")}>
        {movements.length === 0 ? (
          <p className="empty">{t("history.empty")}</p>
        ) : (
          <>
            <p className="muted" data-testid="history-count">
              {hasMore ? t("history.more", { count: HISTORY_LIMIT }) : t("history.count", { count: movements.length })}
            </p>
            <ol className="movements">
              {movements.map((movement) => (
                <MovementEntry key={movement.id} movement={movement} />
              ))}
            </ol>
          </>
        )}
      </section>
    </>
  );
}
