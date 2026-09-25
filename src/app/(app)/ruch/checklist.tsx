"use client";

import { type FormEvent, useActionState, useRef, useState } from "react";
import { formatDays } from "@/i18n/days";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import { newOperationId } from "@/lib/operation-id";
import type { RegisteredKind } from "@/registry/registry";
import { type ChecklistState, registerMovement } from "./actions";

export interface ChecklistTool {
  id: string;
  code: string;
  name: string;
  daysInPlace: number;
}

/** Co można wydać i zwrócić; to samo dla obu checklist. */
export interface ChecklistData {
  /** Identyfikator pierwszej operacji; każda zmiana zaznaczenia albo budowy to nowa operacja. */
  operationId: string;
  base: { id: string; name: string };
  baseTools: ChecklistTool[];
  /** Budowy, na które aktor może wydawać (i z których zwracać), najpierw jego. */
  sites: { id: string; name: string; mine: boolean; tools: ChecklistTool[] }[];
}

export interface ChecklistProps extends ChecklistData {
  kind: RegisteredKind;
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

function matches(tool: ChecklistTool, query: string) {
  const wanted = normalize(query.trim());
  if (!wanted) return true;
  const bare = (text: string) => text.replace(/[^a-z0-9]/g, "");
  return normalize(tool.name).includes(wanted) || bare(normalize(tool.code)).includes(bare(wanted));
}

export function Checklist({ kind, operationId: firstOperationId, base, baseTools, sites }: ChecklistProps) {
  // Ponowne wysłanie tego samego wyboru (np. po zerwanym połączeniu) nie zdubluje ruchu, a zmiana
  // wyboru, także na ekranie przywróconym przyciskiem Wstecz, nie zwróci poprzedniego ruchu.
  const [operationId, setOperationId] = useState(firstOperationId);
  const [siteId, setSiteIdState] = useState(sites.length === 1 ? sites[0].id : "");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Tekst podsumowania z chwili wysłania: po zapisie zaznaczenie się czyści, a komunikat zostaje.
  const submittedSummary = useRef("");
  const [done, setDone] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(async (prev: ChecklistState, formData: FormData) => {
    const result = await registerMovement(prev, formData);
    if (result.done) {
      setSelectedIds([]);
      setQuery("");
      setOperationId(newOperationId());
      setDone(submittedSummary.current);
    }
    return result;
  }, {});

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
    setDone(null);
  }

  function clear() {
    setSelectedIds([]);
    setOperationId(newOperationId());
  }

  function setSiteId(id: string) {
    setSiteIdState(id);
    setOperationId(newOperationId());
    setDone(null);
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
  const summary = ready ? t("checklist.summary", { codes: selected.map((tool) => tool.code).join(", "), place: to.name }) : "";
  const submit = submitKeepingValues(formAction);
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    submittedSummary.current = summary;
    submit(event);
  }

  return (
    <form onSubmit={onSubmit} className="checklist">
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
        {done && !ready && (
          <p className="checklist-done" role="status">
            {t("checklist.done", { summary: done })}
          </p>
        )}
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
          {ready ? summary : t("checklist.summaryEmpty")}
        </p>
        <div className="form-actions">
          <button className="button" type="submit" disabled={!ready || pending}>
            {pending ? t("checklist.confirming") : t("checklist.confirm")}
          </button>
          {selected.length > 0 && (
            <button className="button button-quiet" type="button" onClick={clear} disabled={pending}>
              {t("checklist.clear")}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
