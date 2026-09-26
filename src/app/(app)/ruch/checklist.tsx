"use client";

import { type FormEvent, useActionState, useRef, useState } from "react";
import { formatDays } from "@/i18n/days";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import { newOperationId } from "@/lib/operation-id";
import { matchesTool } from "@/lib/tool-search";
import type { LocationKind, RegisteredKind } from "@/registry/registry";
import { type ChecklistState, registerMovement } from "./actions";

export interface ChecklistTool {
  id: string;
  code: string;
  name: string;
  daysInPlace: number;
}

/** Lokalizacja z narzędziami, które w niej są. */
export interface ChecklistPlace {
  id: string;
  name: string;
  kind: LocationKind;
  /** Budowa, którą prowadzi aktor. */
  mine: boolean;
  tools: ChecklistTool[];
}

/** Skąd i dokąd aktor może ruszać sprzęt danym rodzajem ruchu (identyfikatory lokalizacji, najpierw jego). */
export interface Route {
  from: string[];
  to: string[];
}

/** Co można ruszać; te same dane dla wszystkich checklist. */
export interface ChecklistData {
  /** Identyfikator pierwszej operacji; każda zmiana zaznaczenia albo lokalizacji to nowa operacja. */
  operationId: string;
  places: ChecklistPlace[];
  /** Tylko rodzaje ruchu, które aktor może rejestrować. */
  routes: Partial<Record<RegisteredKind, Route>>;
}

export interface ChecklistProps {
  kind: RegisteredKind;
  operationId: string;
  places: ChecklistPlace[];
  route: Route;
}

type Step = "from" | "to" | "tools";

/**
 * Kolejność kroków. Lokalizacji bez kroku (baza przy wydaniu, zwrocie i przyjęciu z serwisu) nie trzeba
 * wybierać, bo jest tylko jedna. Przy przeniesieniu najpierw własna budowa, potem ta, z której się zabiera.
 */
const STEPS: Record<RegisteredKind, Step[]> = {
  wydanie: ["tools", "to"],
  zwrot: ["from", "tools"],
  przeniesienie: ["to", "from", "tools"],
  do_serwisu: ["from", "tools", "to"],
  z_serwisu: ["from", "tools"],
};

export function Checklist({ kind, operationId: firstOperationId, places, route }: ChecklistProps) {
  // Ponowne wysłanie tego samego wyboru (np. po zerwanym połączeniu) nie zdubluje ruchu, a zmiana
  // wyboru, także na ekranie przywróconym przyciskiem Wstecz, nie zwróci poprzedniego ruchu.
  const [operationId, setOperationId] = useState(firstOperationId);
  const [chosen, setChosen] = useState<Record<"from" | "to", string>>({ from: "", to: "" });
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Tekst podsumowania z chwili wysłania: po zapisie zaznaczenie się czyści, a komunikat zostaje.
  const submittedSummary = useRef("");
  const [done, setDone] = useState<{ summary: string; notified: string[] } | null>(null);
  const [state, formAction, pending] = useActionState(async (prev: ChecklistState, formData: FormData) => {
    const result = await registerMovement(prev, formData);
    if (result.done) {
      setSelectedIds([]);
      setQuery("");
      setOperationId(newOperationId());
      setDone({ summary: submittedSummary.current, notified: result.done.notified });
    }
    return result;
  }, {});

  const byId = new Map(places.map((place) => [place.id, place]));
  const optionsOf = (ids: string[]) => ids.map((id) => byId.get(id)).filter((place) => place !== undefined);
  // Jedyną możliwą lokalizację wybieramy od razu; wybór spoza listy (np. po odświeżeniu) przepada.
  const pick = (options: ChecklistPlace[], id: string) =>
    options.length === 1 ? options[0] : options.find((option) => option.id === id);
  const toOptions = optionsOf(route.to);
  const to = pick(toOptions, chosen.to);
  const fromOptions = optionsOf(route.from).filter((place) => place.id !== to?.id);
  const from = pick(fromOptions, chosen.from);
  const available = from?.tools ?? [];
  // Po odświeżeniu stanu zaznaczenie zostaje tylko przy narzędziach, które nadal tu są.
  const selected = available.filter((tool) => selectedIds.includes(tool.id));
  const visible = available.filter((tool) => matchesTool(tool, query));

  function toggle(toolId: string, checked: boolean) {
    setSelectedIds((ids) => (checked ? [...ids, toolId] : ids.filter((id) => id !== toolId)));
    setOperationId(newOperationId());
    setDone(null);
  }

  function clear() {
    setSelectedIds([]);
    setOperationId(newOperationId());
  }

  function choose(side: "from" | "to", id: string) {
    setChosen((current) => ({ ...current, [side]: id }));
    setOperationId(newOperationId());
    setDone(null);
  }

  if (route.to.length === 0) return <p className="empty">{t(`checklist.kinds.${kind}.noTo`)}</p>;
  if (route.from.length === 0) return <p className="empty">{t(`checklist.kinds.${kind}.noFrom`)}</p>;

  const placeChoice = (side: "from" | "to", options: ChecklistPlace[], current: ChecklistPlace | undefined) => (
    <fieldset key={side} className="checklist-section">
      <legend className="display section-title">{t(`checklist.kinds.${kind}.${side}`)}</legend>
      {options.length === 0 ? (
        <p className="empty">{t(`checklist.kinds.${kind}.${side === "from" ? "noFrom" : "noTo"}`)}</p>
      ) : (
        <div className="choice-list">
          {options.map((place) => (
            <label key={place.id} className="choice">
              <input
                type="radio"
                name={side}
                value={place.id}
                checked={place.id === current?.id}
                onChange={() => choose(side, place.id)}
              />
              <span className="choice-name">{place.name}</span>
              {place.mine && <span className="choice-tag">{t("checklist.mine")}</span>}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );

  const emptyText = from ? t(`checklist.noToolsAt.${from.kind}`) : t(`checklist.kinds.${kind}.chooseFrom`);
  const toolChoice = (
    <fieldset key="tools" className="checklist-section">
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

      {STEPS[kind].map((step) =>
        step === "tools" ? toolChoice : step === "to" ? placeChoice("to", toOptions, to) : placeChoice("from", fromOptions, from),
      )}

      <div className="checklist-summary">
        {done && !ready && (
          <p className="checklist-done" role="status">
            {t("checklist.done", { summary: done.summary })}
            {done.notified.length > 0 && ` ${t("checklist.notified", { names: done.notified.join(", ") })}`}
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
          {ready ? summary : t(`checklist.kinds.${kind}.summaryEmpty`)}
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
