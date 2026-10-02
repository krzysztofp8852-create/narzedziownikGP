"use client";

import { useActionState, useState, useTransition } from "react";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import { MAX_PUNCH_CORRECTION_REASON_LENGTH, MAX_PUNCH_EXPLANATION_LENGTH, MAX_PUNCH_RADIUS_M, MIN_PUNCH_RADIUS_M } from "@/registry/registry";
import {
  type CorrectedPunch,
  correctPunch,
  explainPunch,
  explainPunchConflict,
  type PunchFormState,
  renewPosterToken,
  setPunchRadius,
} from "./punch-actions";

function FormError({ state }: { state: PunchFormState }) {
  return (
    state.error && (
      <p className="form-error" role="alert">
        {state.error}
      </p>
    )
  );
}

/** „Nowy kod” z potwierdzeniem: stary plakat (np. ze zdjęcia, które wyciekło) przestaje działać. */
export function RenewPosterForm({ locationId }: { locationId: string }) {
  const [state, setState] = useState<PunchFormState>({});
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="stack-form">
      {confirming ? (
        <div className="member-confirm">
          <p>{t("punches.renewConfirm")}</p>
          <div className="form-actions">
            <button
              className="button button-danger"
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setState(await renewPosterToken(locationId));
                  setConfirming(false);
                })
              }
            >
              {pending ? t("punches.renewing") : t("punches.renewYes")}
            </button>
            <button className="button button-quiet" type="button" disabled={pending} onClick={() => setConfirming(false)}>
              {t("locations.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="form-actions">
          <button className="button button-quiet button-small" type="button" onClick={() => setConfirming(true)}>
            {t("punches.renew")}
          </button>
        </div>
      )}
      <FormError state={state} />
      {state.done && !pending && <p role="status">{t("punches.renewed")}</p>}
    </div>
  );
}

/** Promień odbicia w metrach; zmienia go właściciel. */
export function PunchRadiusForm({ locationId, radiusM }: { locationId: string; radiusM: number }) {
  const [state, formAction, pending] = useActionState<PunchFormState, FormData>(setPunchRadius.bind(null, locationId), {});

  return (
    <form onSubmit={submitKeepingValues(formAction)} className="site-manager-form">
      <div className="field">
        <label htmlFor={`radius-${locationId}`}>{t("punches.radiusLabel")}</label>
        <input
          id={`radius-${locationId}`}
          name="radius"
          type="number"
          inputMode="numeric"
          min={MIN_PUNCH_RADIUS_M}
          max={MAX_PUNCH_RADIUS_M}
          step={1}
          defaultValue={radiusM}
          required
          aria-describedby={`radius-hint-${locationId}`}
        />
        <small id={`radius-hint-${locationId}`}>{t("punches.radiusHint", { min: MIN_PUNCH_RADIUS_M, max: MAX_PUNCH_RADIUS_M })}</small>
      </div>
      <div className="form-actions">
        <button className="button button-quiet" type="submit" disabled={pending}>
          {pending ? t("punches.saving") : t("punches.radiusSave")}
        </button>
      </div>
      <FormError state={state} />
      {state.done && !pending && <p role="status">{t("punches.radiusSaved")}</p>}
    </form>
  );
}

/** „Wyjaśnione” z opcjonalną notatką; po zapisie odbicie znika z listy. */
export function ExplainPunchForm({ punchId }: { punchId: string }) {
  return <ExplainForm id={punchId} action={explainPunch} />;
}

/** „Wyjaśnione” przy skanie z kolejki offline, który się nie zapisał; po zapisie znika z listy. */
export function ExplainPunchConflictForm({ conflictId }: { conflictId: string }) {
  return <ExplainForm id={conflictId} action={explainPunchConflict} />;
}

function ExplainForm({ id, action }: { id: string; action: (id: string, prev: PunchFormState, formData: FormData) => Promise<PunchFormState> }) {
  const [state, formAction, pending] = useActionState<PunchFormState, FormData>(action.bind(null, id), {});

  return (
    <form onSubmit={submitKeepingValues(formAction)} className="undo">
      <div className="field">
        <label htmlFor={`note-${id}`}>{t("punches.explainNote")}</label>
        <input id={`note-${id}`} name="note" maxLength={MAX_PUNCH_EXPLANATION_LENGTH} autoComplete="off" />
      </div>
      <button className="button button-quiet button-small" type="submit" disabled={pending}>
        {pending ? t("punches.saving") : t("punches.explain")}
      </button>
      <FormError state={state} />
    </form>
  );
}

/**
 * „Popraw godziny”: prawdziwa godzina wejścia albo wyjścia (także uzupełnienie wyjścia, którego nie było) z powodem.
 * Formularz z nowymi godzinami po zapisie daje strona (inny `key`).
 */
export function CorrectPunchForm({ punch }: { punch: CorrectedPunch }) {
  const [state, formAction, pending] = useActionState<PunchFormState, FormData>(correctPunch.bind(null, punch), {});
  const id = (field: string) => `correct-${field}-${punch.id}`;

  return (
    <details className="panel">
      <summary className="panel-summary">{t("punches.correctTitle")}</summary>
      <form onSubmit={submitKeepingValues(formAction)} className="stack-form">
        <p className="muted">{t("punches.correctHint")}</p>
        <div className="field">
          <label htmlFor={id("entry")}>{t("punches.correctEntry")}</label>
          <input id={id("entry")} name="entry" type="datetime-local" defaultValue={punch.entry} required />
        </div>
        <div className="field">
          <label htmlFor={id("exit")}>{t("punches.correctExit")}</label>
          <input id={id("exit")} name="exit" type="datetime-local" defaultValue={punch.exit} />
        </div>
        <div className="field">
          <label htmlFor={id("reason")}>{t("punches.correctReason")}</label>
          <input id={id("reason")} name="reason" maxLength={MAX_PUNCH_CORRECTION_REASON_LENGTH} autoComplete="off" required />
        </div>
        <div className="form-actions">
          <button className="button button-quiet button-small" type="submit" disabled={pending}>
            {pending ? t("punches.saving") : t("punches.correctSave")}
          </button>
        </div>
        <FormError state={state} />
        {state.done && !pending && <p role="status">{t("punches.corrected")}</p>}
      </form>
    </details>
  );
}
