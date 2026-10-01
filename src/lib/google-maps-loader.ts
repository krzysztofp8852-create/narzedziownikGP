"use client";

const CALLBACK = "__narzedziownikMapsReady";

declare global {
  interface Window {
    [CALLBACK]?: () => void;
    /** Google woła ją, gdy klucz przeglądarki jest zły albo nie obejmuje tego adresu. */
    gm_authFailure?: () => void;
  }
}

let loading: Promise<void> | undefined;
const authFailures = new Set<() => void>();

/**
 * Wczytuje Maps JavaScript API raz na stronę (po polsku, z Polską jako regionem). Gdy skrypt się nie wczyta (np. bez
 * sieci), następne wywołanie próbuje od nowa. `onAuthFailure`: Google odrzucił klucz już po wczytaniu.
 */
export function loadGoogleMaps(apiKey: string, onAuthFailure: () => void): Promise<void> {
  authFailures.add(onAuthFailure);
  window.gm_authFailure = () => authFailures.forEach((notify) => notify());
  loading ??= new Promise<void>((resolve, reject) => {
    if (typeof window.google?.maps?.importLibrary === "function") return resolve();
    window[CALLBACK] = () => resolve();
    const script = document.createElement("script");
    const params = new URLSearchParams({ key: apiKey, v: "weekly", loading: "async", language: "pl", region: "PL", callback: CALLBACK });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => {
      loading = undefined;
      script.remove();
      reject(new Error("Nie wczytano Google Maps"));
    };
    document.head.append(script);
  });
  return loading;
}

/** Przestaje powiadamiać o odrzuconym kluczu (mapa zniknęła ze strony). */
export function forgetAuthFailure(onAuthFailure: () => void) {
  authFailures.delete(onAuthFailure);
}
