"use client";

import { useActionState } from "react";
import { formatCalendarDay } from "@/i18n/dates";
import { decimalText } from "@/i18n/decimal";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import type { Category, DailyRates } from "@/registry/registry";
import { type SettingsFormState, updateDailyRates } from "./actions";

/** Podpowiedź stawki firmy, zanim ją ustawiono. */
const SUGGESTED_PERCENT = 1;

/** Procent w polu formularza w zapisie polskim („1,5”); puste pole bez stawki. */
function percentText(percent: number | null | undefined) {
  return percent == null ? "" : decimalText(percent);
}

/**
 * Stawka firmy (przed pierwszym ustawieniem z podpowiedzią 1%) i stawki podanych kategorii; bez kategorii sama
 * stawka firmy, np. na zakładce „Koszty”.
 */
export function DailyRatesForm({ rates, categories }: { rates: DailyRates; categories: Category[] }) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(updateDailyRates, {});
  const percents = new Map(rates.categories.map(({ category, percent }) => [category.id, percent]));

  return (
    <form onSubmit={submitKeepingValues(formAction)} className="stack-form">
      <div className="field">
        <label htmlFor="companyPercent">{t("dailyRates.companyPercent")}</label>
        <input
          id="companyPercent"
          name="companyPercent"
          inputMode="decimal"
          defaultValue={percentText(rates.companyPercent ?? SUGGESTED_PERCENT)}
          aria-describedby="companyPercent-hint"
          required
        />
        <small id="companyPercent-hint">{t("dailyRates.companyPercentHint")}</small>
      </div>
      {categories.length > 0 && (
        <fieldset className="field-group">
          <legend>{t("dailyRates.categoriesTitle")}</legend>
          <small>{t("dailyRates.categoriesHint")}</small>
          {categories.map((category) => (
            <div className="field" key={category.id}>
              <input type="hidden" name="categoryId" value={category.id} />
              <label htmlFor={`category-${category.id}`}>{t("dailyRates.categoryPercent", { name: category.name })}</label>
              <input id={`category-${category.id}`} name={`category-${category.id}`} inputMode="decimal" defaultValue={percentText(percents.get(category.id))} />
            </div>
          ))}
        </fieldset>
      )}
      <p className="muted">
        {rates.costStartDay ? t("dailyRates.startedHint", { day: formatCalendarDay(rates.costStartDay) }) : t("dailyRates.startHint")}
      </p>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && !pending && <p role="status">{t("dailyRates.saved")}</p>}
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>
          {pending ? t("dailyRates.submitting") : t("dailyRates.submit")}
        </button>
      </div>
    </form>
  );
}
