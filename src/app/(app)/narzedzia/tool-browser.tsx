"use client";

import Link from "next/link";
import { useState } from "react";
import { DamagedIcon } from "@/components/damaged-icon";
import { KIND_LABELS } from "@/components/found-tools";
import { Money } from "@/components/tool-list";
import { VehicleIcon } from "@/components/vehicle-icon";
import { formatDays } from "@/i18n/days";
import { formatMoney } from "@/i18n/money";
import { t } from "@/i18n/t";
import { ALL, filterTools, LOST, type ToolListFilters, toolListOptions } from "@/lib/tool-list-filters";
import type { ListedTool } from "@/registry/registry";

/** Lista całego sprzętu z filtrami, które zawężają ją od razu w przeglądarce. Każde narzędzie otwiera swoją kartę. */
export function ToolBrowser({ tools, withValues }: { tools: ListedTool[]; withValues: boolean }) {
  const [filters, setFilters] = useState<ToolListFilters>({ query: "", category: ALL, place: ALL, withRetiredAndReturned: false });
  const change = (changes: Partial<ToolListFilters>) => setFilters((current) => ({ ...current, ...changes }));
  const options = toolListOptions(tools);
  const shown = filterTools(tools, filters);
  // Jak na tablicy: zaginione i wycofane nie wchodzą do sumy sprzętu w obiegu. Sumujemy w groszach.
  const inCirculation = shown.filter((tool) => tool.state === "w_obiegu");
  const totalCents = inCirculation.reduce((sum, tool) => sum + Math.round((tool.value ?? 0) * 100), 0);

  return (
    <div className="tool-browser">
      <form className="company-card" role="search" aria-label={t("toolsPage.filters")} onSubmit={(event) => event.preventDefault()}>
        <div className="filter-grid">
          <div className="field">
            <label htmlFor="tools-query">{t("toolsPage.query")}</label>
            <input
              id="tools-query"
              type="search"
              value={filters.query}
              onChange={(event) => change({ query: event.target.value })}
              placeholder={t("toolsPage.queryPlaceholder")}
              autoComplete="off"
              enterKeyHint="search"
            />
          </div>
          <div className="field">
            <label htmlFor="tools-category">{t("toolsPage.category")}</label>
            <select id="tools-category" value={filters.category} onChange={(event) => change({ category: event.target.value })}>
              <option value={ALL}>{t("toolsPage.any")}</option>
              {options.categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="tools-place">{t("toolsPage.place")}</label>
            <select id="tools-place" value={filters.place} onChange={(event) => change({ place: event.target.value })}>
              <option value={ALL}>{t("toolsPage.any")}</option>
              {options.places.map((place) => (
                <option key={place.id} value={place.id}>
                  {`${t(KIND_LABELS[place.kind])}: ${place.name}`}
                </option>
              ))}
              {options.hasLost && <option value={LOST}>{t("toolsPage.lost")}</option>}
            </select>
          </div>
        </div>
        {options.hasRetiredOrReturned && (
          <label className="checkbox tool-browser-retired">
            <input type="checkbox" checked={filters.withRetiredAndReturned} onChange={(event) => change({ withRetiredAndReturned: event.target.checked })} />
            {t("toolsPage.withRetiredAndReturned")}
          </label>
        )}
      </form>

      <section className="found" aria-live="polite" aria-label={t("toolsPage.title")}>
        <p className="muted" data-testid="tools-count">
          {t("toolsPage.count", { count: shown.length })}
          {withValues && inCirculation.length > 0 && ` · ${t("toolsPage.totalValue", { amount: formatMoney(totalCents / 100) })}`}
        </p>
        {shown.length === 0 ? (
          <p className="empty">{t("toolsPage.noMatches")}</p>
        ) : (
          <ul className="tool-list tool-list-wide" data-testid="tools-list">
            {shown.map((tool) => (
              <li key={tool.id}>
                <ToolRow tool={tool} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ToolRow({ tool }: { tool: ListedTool }) {
  const details = [tool.category, [tool.brand, tool.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  return (
    <Link href={`/narzedzia/${tool.id}`} className="tool-row">
      <span className="plate">{tool.code}</span>
      <span className="tool-row-name">
        {tool.name}
        {tool.registration === "zgloszone" && <span className="tag tag-reported">{t("board.reported")}</span>}
        {tool.damaged && tool.state === "w_obiegu" && (
          <span className="tag tag-damaged">
            <DamagedIcon /> {t("board.damaged")}
          </span>
        )}
        {tool.rented && <span className="tag tag-rented">{t("board.rented")}</span>}
        <span className="tool-row-sub muted">{details}</span>
        <span className="tool-row-sub found-tool-place">
          <Place tool={tool} />
          {tool.responsible && (
            <span className="muted">
              {" · "}
              {tool.state === "zaginione" ? t("toolsPage.lostResponsible", { name: tool.responsible }) : t("search.responsible", { name: tool.responsible })}
            </span>
          )}
        </span>
      </span>
      <span className="tool-row-meta">
        <span className="tool-row-days">
          {tool.state === "w_obiegu"
            ? formatDays(tool.daysInPlace)
            : tool.state === "zaginione"
              ? t("toolsPage.lostFor", { days: formatDays(tool.daysInPlace) })
              : t("toolsPage.stateFor", { days: formatDays(tool.daysInPlace) })}
        </span>
        <Money amount={tool.value} className="tool-row-value" />
      </span>
    </Link>
  );
}

/** Gdzie narzędzie jest, a poza obiegiem: w jakim jest stanie i gdzie było ostatnio. */
function Place({ tool }: { tool: ListedTool }) {
  if (tool.state !== "w_obiegu") {
    const text = t("toolsPage.outOfCirculation", { state: t(`toolState.${tool.state}`), place: tool.location.name });
    return tool.state === "zaginione" ? <strong className="text-danger">{text}</strong> : <span className="muted">{text}</span>;
  }
  return (
    <>
      <span className={tool.location.kind === "baza" ? "location-kind location-kind-base" : "location-kind"}>
        {tool.location.kind === "pojazd" && <VehicleIcon />} {t(KIND_LABELS[tool.location.kind])}
      </span>{" "}
      <strong>{tool.location.name}</strong>
    </>
  );
}
