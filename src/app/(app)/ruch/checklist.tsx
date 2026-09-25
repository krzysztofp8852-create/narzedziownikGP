"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { formatDays } from "@/i18n/days";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import type { RegisteredKind } from "@/registry/registry";
import { registerMovement } from "./actions";

export interface ChecklistTool {
  id: string;
  code: string;
  name: string;
  daysInPlace: number;
}

export interface ChecklistProps {
  kind: RegisteredKind;
  /** Identyfikator pierwszej operacji; każda zmiana zaznaczenia albo budowy to nowa operacja. */
  operationId: string;
  base: { id: string; name: string };
  baseTools: ChecklistTool[];
  /** Budowy, na które aktor może wydawać (i z których zwracać), najpierw jego. */
  sites: { id: string; name: string; mine: boolean; tools: ChecklistTool[] }[];
}

/** Małe litery, bez polskich znaków i bez kresek w kodach: „s01” znajdzie S-01, „szlifierka” Szlifierkę. */
function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l")
    .toLowerCase();
}

/** UUID v4; crypto.randomUUID działa tylko w bezpiecznym kontekście (HTTPS, localhost). */
function newOperationId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function matches(tool: ChecklistTool, query: string) {
  const wanted = normalize(query.trim());
  if (!wanted) return true;
  const bare = (text: string) => text.replace(/[^a-z0-9]/g, "");
  return normalize(tool.name).includes(wanted) || bare(normalize(tool.code)).includes(bare(wanted));
}

export function Checklist({ kind, operationId: firstOperationId, base, baseTools, sites }: ChecklistProps) {
  const [state, formAction, pending] = useActionState(registerMovement, {});
  // Ponowne wysłanie tego samego wyboru (np. po zerwanym połączeniu) nie zdubluje ruchu, a zmiana
  // wyboru, także na ekranie przywróconym przyciskiem Wstecz, nie zwróci poprzedniego ruchu.
  const [operationId, setOperationId] = useState(firstOperationId);
  const [siteId, setSiteIdState] = useState(sites.length === 1 ? sites[0].id : "");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const site = sites.find((candidate) => candidate.id === siteId);
  const isIssue = kind === "wydanie";
  const available = isIssue ? baseTools : (site?.tools ?? []);
  // Po odświeżeniu stanu zaznaczenie zostaje tylko przy narzędziach, które nadal tu są.
  const selected = available.filter((tool) => selectedIds.includes(tool.id));
  const visible = available.filter((tool) => matches(tool, query));
  const from = isIssue ? base : site;
  const to = isIssue ? site : base;

  function toggle(toolId: string, checked: boolean) {
    setSelectedIds((ids) => (checked ? [...ids, toolId] : ids.filter((id) => id !== toolId)));
    setOperationId(newOperationId());
  }

  function setSiteId(id: string) {
    setSiteIdState(id);
    setOperationId(newOperationId());
  }

  if (sites.length === 0) {
    return <p className="empty">{isIssue ? t("checklist.noSites") : t("checklist.noSitesToReturn")}</p>;
  }

  const siteChoice = (
    <fieldset className="checklist-section">
      <legend className="display section-title">{isIssue ? t("checklist.siteTo") : t("checklist.siteFrom")}</legend>
      <div className="choice-list">
        {sites.map((candidate) => (
          <label key={candidate.id} className="choice">
            <input
              type="radio"
              name="site"
              value={candidate.id}
              checked={candidate.id === siteId}
              onChange={() => setSiteId(candidate.id)}
            />
            <span className="choice-name">{candidate.name}</span>
            {candidate.mine && <span className="choice-tag">{t("checklist.mine")}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );

  const emptyText = isIssue ? t("checklist.noToolsAtBase") : site ? t("checklist.noToolsAtSite") : t("checklist.chooseSiteFirst");
  const toolChoice = (
    <fieldset className="checklist-section">
      <legend className="display section-title">{t("checklist.tools")}</legend>
      {available.length === 0 ? (
        <p className="empty">{emptyText}</p>
      ) : (
        <>
          <div className="field">
            <label htmlFor="checklist-search">{t("checklist.search")}</label>
            <input
              id="checklist-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("checklist.searchPlaceholder")}
              autoComplete="off"
            />
          </div>
          {visible.length === 0 ? (
            <p className="empty">{t("checklist.noMatches")}</p>
          ) : (
            <ul className="tool-list">
              {visible.map((tool) => (
                <li key={tool.id}>
                  <label className="tool-row tool-check">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(tool.id)}
                      onChange={(event) => toggle(tool.id, event.target.checked)}
                      aria-label={t("checklist.toolLabel", { code: tool.code, name: tool.name })}
                    />
                    <span className="plate">{tool.code}</span>
                    <span className="tool-row-name">{tool.name}</span>
                    <span className="tool-row-days">{formatDays(tool.daysInPlace)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </fieldset>
  );

  const ready = selected.length > 0 && from && to;
  return (
    <form onSubmit={submitKeepingValues(formAction)} className="checklist">
      <input type="hidden" name="operationId" value={operationId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="fromLocationId" value={from?.id ?? ""} />
      <input type="hidden" name="toLocationId" value={to?.id ?? ""} />
      {selected.map((tool) => (
        <input key={tool.id} type="hidden" name="toolId" value={tool.id} />
      ))}

      {isIssue ? (
        <>
          {toolChoice}
          {siteChoice}
        </>
      ) : (
        <>
          {siteChoice}
          {toolChoice}
        </>
      )}

      <div className="checklist-summary">
        {state.error && (
          <div className="form-error" role="alert">
            <p>{state.error}</p>
            {state.conflicts && (
              <>
                <ul>
                  {state.conflicts.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p>{t("checklist.conflictRefreshed")}</p>
              </>
            )}
          </div>
        )}
        <p className="checklist-summary-text" data-testid="checklist-summary">
          {ready
            ? t("checklist.summary", { codes: selected.map((tool) => tool.code).join(", "), place: to.name })
            : t("checklist.summaryEmpty")}
        </p>
        <div className="form-actions">
          <button className="button" type="submit" disabled={!ready || pending}>
            {pending ? t("checklist.confirming") : t("checklist.confirm")}
          </button>
          <Link className="button button-quiet" href="/">
            {t("checklist.cancel")}
          </Link>
        </div>
      </div>
    </form>
  );
}
