"use client";

import { type ReactNode, useActionState, useState } from "react";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import { TOOL_STATES, type ToolState } from "@/registry/registry";
import { changeToolRecord } from "../actions";

type Place = { id: string; name: string };

export interface ToolCorrectionsProps {
  tool: { id: string; code: string; state: ToolState; locationId: string };
  places: { base: Place; sites: Place[]; services: Place[] };
  /** Identyfikatory operacji nadane przy wyświetleniu karty, osobno dla każdego formularza. */
  operationIds: { correct: string; lost: string; retire: string };
}

/** Formularze właściciela na karcie narzędzia: korekta, zaginięcie i wycofanie. */
export function ToolCorrections({ tool, places, operationIds }: ToolCorrectionsProps) {
  return (
    <div className="corrections">
      <CorrectionForm command="correct" tool={tool} operationId={operationIds.correct}>
        <h3 className="display">{t("corrections.correctTitle")}</h3>
        <p className="muted">{t("corrections.correctHint")}</p>
        <div className="field">
          <label htmlFor="correct-location">{t("corrections.location")}</label>
          <select id="correct-location" name="locationId" defaultValue={tool.locationId} required>
            <optgroup label={t("corrections.baseGroup")}>
              <option value={places.base.id}>{places.base.name}</option>
            </optgroup>
            {places.sites.length > 0 && (
              <optgroup label={t("corrections.sitesGroup")}>
                {places.sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </optgroup>
            )}
            {places.services.length > 0 && (
              <optgroup label={t("corrections.servicesGroup")}>
                {places.services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <div className="field">
          <label htmlFor="correct-state">{t("toolCard.state")}</label>
          {/* Korekta zaginionego narzędzia to zwykle jego odnalezienie. */}
          <select id="correct-state" name="state" defaultValue={tool.state === "zaginione" ? "w_obiegu" : tool.state}>
            {TOOL_STATES.map((state) => (
              <option key={state} value={state}>
                {t(`toolState.${state}`)}
              </option>
            ))}
          </select>
        </div>
        <ReasonField id="correct-reason" placeholder={t("corrections.reasonPlaceholder")} required />
      </CorrectionForm>

      {tool.state === "w_obiegu" && (
        <CorrectionForm command="lost" tool={tool} operationId={operationIds.lost}>
          <h3 className="display">{t("corrections.lostTitle")}</h3>
          <p className="muted">{t("corrections.lostHint")}</p>
          <ReasonField id="lost-reason" placeholder={t("corrections.lostReasonPlaceholder")} required />
        </CorrectionForm>
      )}

      {tool.state !== "wycofane" && (
        <CorrectionForm command="retire" tool={tool} operationId={operationIds.retire} confirm>
          <h3 className="display">{t("corrections.retireTitle")}</h3>
          <p className="muted">{t("corrections.retireHint")}</p>
          <ReasonField id="retire-reason" placeholder={t("corrections.retireReasonPlaceholder")} />
        </CorrectionForm>
      )}
    </div>
  );
}

const SUBMIT_LABELS = {
  correct: "corrections.submitCorrect",
  lost: "corrections.submitLost",
  retire: "corrections.submitRetire",
} as const;

function CorrectionForm({
  command,
  tool,
  operationId,
  confirm = false,
  children,
}: {
  command: keyof typeof SUBMIT_LABELS;
  tool: ToolCorrectionsProps["tool"];
  operationId: string;
  /** Pyta o potwierdzenie przed wysłaniem. */
  confirm?: boolean;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(changeToolRecord, {});
  const [confirming, setConfirming] = useState(false);

  return (
    // Po zapisie karta dostaje nowy identyfikator operacji, a nowy `key` czyści formularz.
    <form onSubmit={submitKeepingValues(formAction)} className="stack-form correction" key={operationId}>
      <input type="hidden" name="command" value={command} />
      <input type="hidden" name="toolId" value={tool.id} />
      <input type="hidden" name="operationId" value={operationId} />
      {children}
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {confirm && confirming ? (
        <div className="member-confirm">
          <p>{t("corrections.retireConfirm", { code: tool.code })}</p>
          <div className="form-actions">
            <button className="button button-danger" type="submit" disabled={pending}>
              {pending ? t("corrections.submitting") : t("corrections.retireYes")}
            </button>
            <button className="button button-quiet" type="button" disabled={pending} onClick={() => setConfirming(false)}>
              {t("corrections.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="form-actions">
          <button
            className="button button-quiet"
            type={confirm ? "button" : "submit"}
            disabled={pending}
            onClick={confirm ? () => setConfirming(true) : undefined}
          >
            {pending ? t("corrections.submitting") : t(SUBMIT_LABELS[command])}
          </button>
        </div>
      )}
    </form>
  );
}

function ReasonField({ id, placeholder, required = false }: { id: string; placeholder: string; required?: boolean }) {
  return (
    <div className="field">
      <label htmlFor={id}>{required ? t("corrections.reason") : t("corrections.reasonOptional")}</label>
      <input id={id} name="reason" autoComplete="off" required={required} placeholder={placeholder} />
    </div>
  );
}
