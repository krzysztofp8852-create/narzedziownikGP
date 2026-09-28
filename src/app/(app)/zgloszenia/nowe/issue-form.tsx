"use client";

import { type FormEvent, startTransition, useActionState, useState } from "react";
import { t } from "@/i18n/t";
import { withShrunkPhoto } from "@/lib/shrink-photo";
import { matchesTool } from "@/lib/tool-search";
import type { IssueKind } from "@/registry/registry";
import { fileIssue, type IssueFormState } from "../actions";

const KINDS: IssueKind[] = ["uszkodzenie", "brak", "inne"];

export interface IssueFormProps {
  operationId: string;
  /** Narzędzia w obiegu z miejscem, gdzie są. */
  tools: { id: string; code: string; name: string; place: string }[];
  /** Lokalizacje, których może dotyczyć zgłoszenie bez narzędzia. */
  places: { id: string; name: string }[];
  kind: IssueKind;
  /** Narzędzie wypełnione z karty narzędzia (np. „Zgłoś uszkodzenie”). */
  toolId: string | null;
  maxLength: number;
}

/** Zgłoszenie do właściciela: rodzaj, narzędzie albo lokalizacja, opis i opcjonalne zdjęcie z telefonu. */
export function IssueForm({ operationId, tools, places, kind: initialKind, toolId: initialToolId, maxLength }: IssueFormProps) {
  const [kind, setKind] = useState<IssueKind>(initialKind);
  const [toolId, setToolId] = useState(initialToolId ?? "");
  const [query, setQuery] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [state, formAction, pending] = useActionState<IssueFormState, FormData>(fileIssue, {});
  // Wybrane narzędzie zostaje na liście także wtedy, gdy nie pasuje do wyszukiwania.
  const visible = tools.filter((tool) => tool.id === toolId || matchesTool(tool, query));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = await withShrunkPhoto(new FormData(event.currentTarget), setPreparing);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={onSubmit} className="stack-form issue-form">
      <input type="hidden" name="operationId" value={operationId} />
      <fieldset className="field">
        <legend>{t("issues.form.kind")}</legend>
        <div className="issue-kinds">
          {KINDS.map((option) => (
            <label key={option} className={option === kind ? "issue-kind-option issue-kind-option-selected" : "issue-kind-option"}>
              <input type="radio" name="kind" value={option} checked={option === kind} onChange={() => setKind(option)} />
              <span>{t(`issues.kind.${option}`)}</span>
            </label>
          ))}
        </div>
        <small>{t(`issues.kindHint.${kind}`)}</small>
      </fieldset>

      <div className="field">
        <label htmlFor="issue-tool">{kind === "uszkodzenie" ? t("issues.form.toolRequired") : t("issues.form.tool")}</label>
        {tools.length > 8 && (
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("checklist.searchPlaceholder")}
            aria-label={t("checklist.searchPlaceholder")}
            autoComplete="off"
          />
        )}
        <select id="issue-tool" name="toolId" value={toolId} onChange={(event) => setToolId(event.target.value)} required={kind === "uszkodzenie"}>
          <option value="" disabled={kind === "uszkodzenie"}>
            {kind === "uszkodzenie" ? t("issues.form.toolPlaceholder") : t("issues.form.toolNone")}
          </option>
          {visible.map((tool) => (
            <option key={tool.id} value={tool.id}>
              {tool.code} {tool.name} · {tool.place}
            </option>
          ))}
        </select>
      </div>

      {kind !== "uszkodzenie" && !toolId && (
        <div className="field">
          <label htmlFor="issue-location">{t("issues.form.location")}</label>
          <select id="issue-location" name="locationId" defaultValue="" aria-describedby="issue-location-hint">
            <option value="">{t("issues.form.locationNone")}</option>
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
          <small id="issue-location-hint">{t("issues.form.subjectHint")}</small>
        </div>
      )}

      <div className="field">
        <label htmlFor="issue-description">{t("issues.form.description")}</label>
        <textarea
          id="issue-description"
          name="description"
          rows={4}
          maxLength={maxLength}
          placeholder={t("issues.form.descriptionPlaceholder")}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="issue-photo">{t("issues.form.photo")}</label>
        <input id="issue-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/*" aria-describedby="issue-photo-hint" />
        <small id="issue-photo-hint">{t("issues.form.photoHint")}</small>
      </div>

      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending || preparing}>
          {preparing ? t("issues.form.photoPreparing") : pending ? t("issues.form.submitting") : t("issues.form.submit")}
        </button>
      </div>
    </form>
  );
}
