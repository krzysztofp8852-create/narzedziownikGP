import { useSyncExternalStore } from "react";

/*
 * Jedyne miejsce, które wie, czy program działa w aplikacji na Androida (ADR 0038) i które wtyczki natywne ma
 * zainstalowana wersja aplikacji. Skorupa Capacitora wstrzykuje mostek `window.Capacitor` przed skryptami strony;
 * w przeglądarce i na serwerze go nie ma. Skorupa i strona wydają się niezależnie, więc przed użyciem wtyczki trzeba
 * zapytać `hasPlugin`, a bez niej użyć wersji webowej albo schować funkcję. Tu jest też rozpoznanie urządzenia
 * dla propozycji instalacji (`installOffer`): Android, iPhone, komputer, zainstalowana PWA.
 *
 * `isInApp`, `hasPlugin` i `nativePlugin` są samowystarczalne (bez odwołań do reszty modułu poza typami), bo testy e2e
 * wywołują je w stronie przez `page.evaluate`.
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

/** Czy to iPhone albo iPad; iPad od iPadOS 13 przedstawia się jak Mac, zdradza go ekran dotykowy. */
function isIosAgent(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (userAgent.includes("Macintosh") && maxTouchPoints > 1);
}

/** Czy ta przeglądarka działa na iPhonie albo iPadzie. */
export function isIos(): boolean {
  return isIosAgent(navigator.userAgent, navigator.maxTouchPoints);
}

/** Czy program jest otwarty jako zainstalowana PWA (z ekranu głównego), a nie w karcie przeglądarki. */
export function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia("(display-mode: standalone)").matches;
}

/**
 * Co baner „Zainstaluj aplikację” proponuje urządzeniu: Android aplikację z Google Play, iPhone i iPad dodanie do
 * ekranu głównego (w App Store programu nie ma), a komputer nic. W aplikacji i w zainstalowanej PWA nie ma czego
 * instalować.
 */
export type InstallOffer = "google-play" | "ekran-glowny";

export function installOffer(device: { userAgent: string; maxTouchPoints: number; standalone: boolean; inApp: boolean }): InstallOffer | null {
  if (device.inApp || device.standalone) return null;
  if (/Android/i.test(device.userAgent)) return "google-play";
  if (isIosAgent(device.userAgent, device.maxTouchPoints)) return "ekran-glowny";
  return null;
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

/** `installOffer` tego urządzenia dla komponentów; na serwerze i przy hydracji `null`, jak w `useInApp`. */
export function useInstallOffer(): InstallOffer | null {
  return useSyncExternalStore(
    noSubscription,
    () => installOffer({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints, standalone: isStandalone(), inApp: isInApp() }),
    () => null,
  );
}
