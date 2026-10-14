"use client";

import { useActionState, useEffect } from "react";
import { type Locale, LOCALE_NAMES, LOCALES } from "@/i18n/locales";
import { t } from "@/i18n/t";
import { type LanguageFormState, saveLanguage } from "./actions";

/** Wybór języka interfejsu; po zapisie strona wczytuje się od nowa już w nowym języku. */
export function LanguageForm({ locale }: { locale: Locale }) {
  const [state, formAction, pending] = useActionState<LanguageFormState, FormData>(saveLanguage, {});

  useEffect(() => {
    if (state.saved) window.location.reload();
  }, [state]);

  return (
    <form action={formAction} className="stack-form">
      <div className="field">
        <label htmlFor="locale">{t("language.label")}</label>
        <select id="locale" name="locale" defaultValue={locale} data-testid="locale-select">
          {LOCALES.map((option) => (
            <option key={option} value={option} lang={option}>
              {LOCALE_NAMES[option]}
            </option>
          ))}
        </select>
      </div>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending || state.saved}>
          {pending || state.saved ? t("language.submitting") : t("language.submit")}
        </button>
      </div>
    </form>
  );
}
