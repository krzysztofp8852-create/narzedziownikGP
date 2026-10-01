"use client";

import { useActionState, useState } from "react";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import { returnToRental } from "../actions";

/** Zwrot do wypożyczalni z karty sprzętu wynajętego, z potwierdzeniem przed zapisem. */
export function RentalReturnForm({ toolId, code, operationId }: { toolId: string; code: string; operationId: string }) {
  const [state, formAction, pending] = useActionState(returnToRental, {});
  const [confirming, setConfirming] = useState(false);

  return (
    // Po zapisie karta dostaje nowy identyfikator operacji, a nowy `key` czyści formularz.
    <form onSubmit={submitKeepingValues(formAction)} className="stack-form" key={operationId}>
      <input type="hidden" name="toolId" value={toolId} />
      <input type="hidden" name="operationId" value={operationId} />
      <p className="muted">{t("rentals.returnHint")}</p>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {confirming ? (
        <div className="member-confirm">
          <p>{t("rentals.returnConfirm", { code })}</p>
          <div className="form-actions">
            <button className="button" type="submit" disabled={pending}>
              {pending ? t("rentals.submitting") : t("rentals.returnYes")}
            </button>
            <button className="button button-quiet" type="button" disabled={pending} onClick={() => setConfirming(false)}>
              {t("rentals.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="form-actions">
          <button className="button" type="button" onClick={() => setConfirming(true)}>
            {t("rentals.return")}
          </button>
        </div>
      )}
    </form>
  );
}
