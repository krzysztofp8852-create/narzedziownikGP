"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { submitKeepingValues } from "@/lib/forms";
import { CONTACT_CONVERSION } from "@/lib/google-tags";
import { type CallbackSource, MAX_CALLBACK_NAME_LENGTH } from "@/registry/callback-requests";

export interface CallbackFormState {
  error?: string;
  /** Zapisane; podziękowanie z numerem, na który oddzwonimy. */
  done?: string;
}

/** Teksty formularza; podaje je serwer (`CallbackForm`), żeby plik tłumaczeń nie trafiał do przeglądarki. */
export type CallbackFormTexts = Record<
  "title" | "lead" | "website" | "phone" | "phonePlaceholder" | "name" | "submit" | "submitting" | "privacy" | "privacyLink" | "unexpected",
  string
>;

/** Odpowiedź `/oddzwonimy` albo `failed`, gdy nie doszła: komunikat o tym ma przeglądarka z `texts.unexpected`. */
type FormState = CallbackFormState & { failed?: true };

/** Wysyła formularz na `/oddzwonimy` (zob. tam, czemu to nie akcja serwera). */
async function requestCallback(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const response = await fetch("/oddzwonimy", { method: "POST", body: formData });
    if (!response.ok) throw new Error(`Formularz „oddzwonimy” odrzucony (${response.status})`);
    return (await response.json()) as CallbackFormState;
  } catch (error) {
    console.error(error);
    return { failed: true };
  }
}

/** Formularz „oddzwonimy” w przeglądarce; zob. `CallbackForm`. */
export function CallbackFormView({ source, texts }: { source: CallbackSource; texts: CallbackFormTexts }) {
  const [state, formAction, pending] = useActionState(requestCallback, {});
  const error = state.failed ? texts.unexpected : state.error;

  useEffect(() => {
    if (!state.done) return;
    window.gtag?.("event", "generate_lead", { lead_source: source });
    window.gtag?.("event", "conversion", CONTACT_CONVERSION);
  }, [state.done, source]);

  if (state.done) {
    return (
      <p className="form-success callback-done" role="status" data-testid="callback-done">
        {state.done}
      </p>
    );
  }

  return (
    <form onSubmit={submitKeepingValues(formAction)} className="callback-form" data-testid="callback-form">
      <h3 className="callback-title">{texts.title}</h3>
      <p>{texts.lead}</p>
      <input type="hidden" name="source" value={source} />
      {/* Pułapka na boty: człowiek tego pola nie widzi i go nie wypełni. */}
      <div className="callback-trap" aria-hidden>
        <label htmlFor={`callback-website-${source}`}>{texts.website}</label>
        <input id={`callback-website-${source}`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor={`callback-phone-${source}`}>{texts.phone}</label>
          <input
            id={`callback-phone-${source}`}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            maxLength={30}
            placeholder={texts.phonePlaceholder}
          />
        </div>
        <div className="field">
          <label htmlFor={`callback-name-${source}`}>{texts.name}</label>
          <input id={`callback-name-${source}`} name="name" type="text" autoComplete="name" maxLength={MAX_CALLBACK_NAME_LENGTH} />
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>
          {pending ? texts.submitting : texts.submit}
        </button>
      </div>
      <p className="callback-privacy">
        {texts.privacy} <Link href="/polityka-prywatnosci#3-dane-za-ktore-odpowiadamy-my">{texts.privacyLink}</Link>
      </p>
    </form>
  );
}
