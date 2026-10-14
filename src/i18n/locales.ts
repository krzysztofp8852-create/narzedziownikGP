/** Języki interfejsu (ADR 0047). Polski jest pełny i domyślny; brakujący tekst w innym języku pokazuje się po polsku. */
export const LOCALES = ["pl", "uk", "ru", "en", "ka", "be"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "pl";

/** Ciasteczko z językiem tej przeglądarki; u zalogowanego odbija wybór zapisany na jego koncie. */
export const LOCALE_COOKIE = "jezyk";

/** Nazwa języka w nim samym, żeby każdy znalazł swój na liście, w jakimkolwiek języku jest teraz aplikacja. */
export const LOCALE_NAMES: Record<Locale, string> = {
  pl: "Polski",
  uk: "Українська",
  ru: "Русский",
  en: "English",
  ka: "ქართული",
  be: "Беларуская",
};

/** Znacznik dla `Intl` (nazwy miesięcy, odmiana liczebników). Liczby, kwoty i daty liczbowe zostają w zapisie polskim. */
export const INTL_LOCALE: Record<Locale, string> = {
  pl: "pl-PL",
  uk: "uk-UA",
  ru: "ru-RU",
  en: "en-GB",
  ka: "ka-GE",
  be: "be-BY",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
