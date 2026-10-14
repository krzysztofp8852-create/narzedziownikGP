import { AsyncLocalStorage } from "node:async_hooks";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import be from "../../messages/be.json";
import en from "../../messages/en.json";
import ka from "../../messages/ka.json";
import ru from "../../messages/ru.json";
import uk from "../../messages/uk.json";
import { DEFAULT_LOCALE, isLocale, type Locale, LOCALE_COOKIE } from "./locales";
import { type PartialMessages, registerServerLocale } from "./t";

/**
 * Język po stronie serwera (ADR 0047). t() jest synchroniczne i wołane w całym kodzie, także poza komponentami, więc
 * język żądania czytamy z ciasteczka w magazynie żądania Next.js (to samo, z czego czyta `cookies()`), a nie
 * przekazujemy go w parametrach. Powiadomienie dla innej osoby renderuje się w jej języku przez `withLocale`.
 */

const MESSAGES: Record<Locale, PartialMessages | null> = { pl: null, uk, ru, en, ka, be };

const forced = new AsyncLocalStorage<Locale>();

/** Wykonuje `fn` w danym języku niezależnie od żądania: e-mail i push w języku adresata, plakat i e-mail do supportu po polsku. */
export function withLocale<T>(locale: Locale, fn: () => T): T {
  return forced.run(locale, fn);
}

/** Język z ciasteczka tego żądania; poza żądaniem (skrypt, test, zadanie w tle) i bez ciasteczka: polski. */
export function requestLocale(): Locale {
  const store = workUnitAsyncStorage.getStore();
  const value = store?.type === "request" ? store.cookies.get(LOCALE_COOKIE)?.value : undefined;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function messagesFor(locale: Locale): PartialMessages | null {
  return MESSAGES[locale];
}

registerServerLocale(() => {
  const locale = forced.getStore() ?? requestLocale();
  return { locale, messages: MESSAGES[locale] };
});
