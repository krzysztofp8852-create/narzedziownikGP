"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { requestCallback } from "@/app/actions";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import { type CallbackSource, MAX_CALLBACK_NAME_LENGTH } from "@/registry/callback-requests";

export interface CallbackFormState {
  error?: string;
  /** Zapisane; numer, na który oddzwonimy, do podziękowania. */
  done?: string;
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * „Zostaw numer, oddzwonimy” obok telefonu i e-maila działu handlowego. Prośba trafia do panelu super-admina
 * i e-mailem do GP Engineering, a do Google Analytics (jeśli się wczytała) jako zdarzenie `generate_lead`.
 */
export function CallbackForm({ source }: { source: CallbackSource }) {
  const [state, formAction, pending] = useActionState(requestCallback, {});

  useEffect(() => {
    if (state.done) window.gtag?.("event", "generate_lead", { lead_source: source });
  }, [state.done, source]);

  if (state.done) {
    return (
      <p className="form-success callback-done" role="status" data-testid="callback-done">
        {t("callback.done", { phone: state.done })}
      </p>
    );
  }

  return (
    <form onSubmit={submitKeepingValues(formAction)} className="callback-form" data-testid="callback-form">
      <h3 className="callback-title">{t("callback.title")}</h3>
      <p>{t("callback.lead")}</p>
      <input type="hidden" name="source" value={source} />
      {/* Pułapka na boty: człowiek tego pola nie widzi i go nie wypełni. */}
      <div className="callback-trap" aria-hidden>
        <label htmlFor={`callback-website-${source}`}>{t("callback.website")}</label>
        <input id={`callback-website-${source}`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor={`callback-phone-${source}`}>{t("callback.phone")}</label>
          <input
            id={`callback-phone-${source}`}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            maxLength={30}
            placeholder={t("callback.phonePlaceholder")}
          />
        </div>
        <div className="field">
          <label htmlFor={`callback-name-${source}`}>{t("callback.name")}</label>
          <input id={`callback-name-${source}`} name="name" type="text" autoComplete="name" maxLength={MAX_CALLBACK_NAME_LENGTH} />
        </div>
      </div>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>
          {pending ? t("callback.submitting") : t("callback.submit")}
        </button>
      </div>
      <p className="callback-privacy">
        {t("callback.privacy")} <Link href="/polityka-prywatnosci#3-dane-za-ktore-odpowiadamy-my">{t("callback.privacyLink")}</Link>
      </p>
    </form>
  );
}
