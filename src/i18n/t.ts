import pl from "../../messages/pl.json";
import { getBrowserLocale } from "./browser-locale";
import { DEFAULT_LOCALE, type Locale } from "./locales";

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<typeof pl>;

export type Messages = typeof pl;

/** Tłumaczenie: te same klucze co polski plik, ale może mu czegoś brakować (wtedy tekst jest po polsku). */
export type PartialMessages = { [K in keyof Messages]?: DeepPartial<Messages[K]> };
type DeepPartial<T> = T extends string ? string : { [K in keyof T]?: DeepPartial<T[K]> };

/** Język i teksty, w których mówi aplikacja w tej chwili; `messages` null to sam polski. */
export interface ActiveLocale {
  locale: Locale;
  messages: PartialMessages | null;
}

/**
 * Na serwerze język zależy od żądania (ciasteczko) albo od adresata powiadomienia, więc podaje go moduł serwerowy
 * (`server-locale`), który rejestruje się tu przy starcie serwera. Przez `globalThis`, bo t() jest też w kodzie
 * przeglądarki, który nie może importować modułów serwera.
 */
const SERVER_SOURCE = Symbol.for("narzedziownik.serverLocale");

type ServerSource = () => ActiveLocale;

export function registerServerLocale(source: ServerSource) {
  (globalThis as { [SERVER_SOURCE]?: ServerSource })[SERVER_SOURCE] = source;
}

export function activeLocale(): ActiveLocale {
  if (typeof window !== "undefined") return getBrowserLocale();
  return (globalThis as { [SERVER_SOURCE]?: ServerSource })[SERVER_SOURCE]?.() ?? { locale: DEFAULT_LOCALE, messages: null };
}

/** Język, w którym aplikacja mówi teraz do tej osoby. */
export function currentLocale(): Locale {
  return activeLocale().locale;
}

function lookup(messages: object, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages);
}

/**
 * Tekst interfejsu w języku tej osoby (polski, gdy tłumaczenia brakuje). `{nazwa}` w tekście zastępuje `params.nazwa`.
 */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const { messages } = activeLocale();
  const translated = messages && lookup(messages, key);
  const text = typeof translated === "string" ? translated : lookup(pl, key);
  if (typeof text !== "string") throw new Error(`Brak tłumaczenia: ${key}`);
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}
