import { useSyncExternalStore } from "react";

/*
 * Jedyne miejsce, które wie, czy program działa w aplikacji na Androida (ADR 0038) i które wtyczki natywne ma
 * zainstalowana wersja aplikacji. Skorupa Capacitora wstrzykuje mostek `window.Capacitor` przed skryptami strony;
 * w przeglądarce i na serwerze go nie ma. Skorupa i strona wydają się niezależnie, więc przed użyciem wtyczki trzeba
 * zapytać `hasPlugin`, a bez niej użyć wersji webowej albo schować funkcję.
 *
 * Funkcje są samowystarczalne (bez odwołań do reszty modułu poza typami), bo testy e2e wywołują je w stronie przez
 * `page.evaluate`.
 */

/** Część mostka Capacitora, o którą pyta strona (`native-bridge.js` w `@capacitor/android`). */
type Bridge = { isNativePlatform?: () => boolean; isPluginAvailable?: (name: string) => boolean; Plugins?: Record<string, unknown> };

/** Czy strona jest otwarta w aplikacji (mostek Capacitora na platformie natywnej). */
export function isInApp(): boolean {
  const bridge = (globalThis as { Capacitor?: Bridge }).Capacitor;
  return bridge?.isNativePlatform?.() === true;
}

/** Czy zainstalowana wersja aplikacji ma wtyczkę natywną o tej nazwie (np. "BarcodeScanner"). Poza aplikacją nie. */
export function hasPlugin(name: string): boolean {
  const bridge = (globalThis as { Capacitor?: Bridge }).Capacitor;
  return bridge?.isNativePlatform?.() === true && bridge.isPluginAvailable?.(name) === true;
}

/**
 * Wtyczka natywna z mostka, gdy zainstalowana wersja aplikacji ją ma (`hasPlugin`). Metody zwracają obietnice,
 * a `addListener(zdarzenie, funkcja)` daje uchwyt z `remove()`. Typ `T` opisuje wołający: to, czego używa z wtyczki.
 */
export function nativePlugin<T>(name: string): T | undefined {
  const bridge = (globalThis as { Capacitor?: Bridge }).Capacitor;
  return bridge?.isNativePlatform?.() === true && bridge.isPluginAvailable?.(name) === true ? (bridge.Plugins?.[name] as T) : undefined;
}

const noSubscription = () => () => {};

/**
 * `isInApp` dla komponentów. Na serwerze i przy hydracji `false` (serwer nie wie, kto pyta), więc to, co w aplikacji
 * znika, przez chwilę po wczytaniu jest widoczne; to, co ma się w aplikacji pojawić, pojawia się dopiero po hydracji.
 */
export function useInApp(): boolean {
  return useSyncExternalStore(noSubscription, isInApp, () => false);
}

/** `hasPlugin` dla komponentów; na serwerze i przy hydracji `false`, jak w `useInApp`. */
export function useHasPlugin(name: string): boolean {
  return useSyncExternalStore(noSubscription, () => hasPlugin(name), () => false);
}
