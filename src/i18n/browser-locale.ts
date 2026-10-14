import { DEFAULT_LOCALE } from "./locales";
import type { ActiveLocale } from "./t";

/**
 * Język przeglądarki: jeden użytkownik, ustawia go LocaleProvider na samej górze drzewa, zanim wyrenderuje resztę.
 * Osobno od t(), żeby provider w głównym layoucie nie wciągał do każdej strony pliku tłumaczeń.
 */
let browserLocale: ActiveLocale = { locale: DEFAULT_LOCALE, messages: null };

export function setBrowserLocale(active: ActiveLocale) {
  browserLocale = active;
}

export function getBrowserLocale(): ActiveLocale {
  return browserLocale;
}
